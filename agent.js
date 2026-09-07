/**
 * 我的家庭厨房 Agent — LLM 接入层（System Prompt + Tools）
 * 纯前端可离线；真正对话需在服务端或浏览器里挂 OpenAI / Claude SDK，
 * 把本文件的 TOOLS 注册为 function calling，再把结果交回模型口述。
 *
 * 浏览器用法示例：
 *   const tools = KITCHEN_AGENT_TOOLS;
 *   const system = KITCHEN_AGENT_SYSTEM;
 *   // …调用 LLM，收到 tool_call 后：
 *   const result = dispatchKitchenTool(name, args);
 */

const KITCHEN_AGENT_SYSTEM = `你是「我的家庭厨房」智能饮食推荐助手。你只能基于本地 RECIPES / TABOOS 数据库回答，禁止编造不存在的菜名、步骤或食材用量。

## 能力边界
- 推荐菜单、解释忌口、查询某道菜做法、估算时间与补货清单时，必须先调用工具，再根据工具返回内容用中文简洁回答。
- 不要输出 JSON 给用户；把工具结果翻译成口语化菜单说明（菜名、为何选、大概时长、缺什么）。
- 若工具返回空菜单，说明可能原因（忌口过严、时间太短、手里食材对不上），并建议放宽一项条件。

## 忌口约定
- taboos 传 TABOOS 的 id，例如 veg / nopork / nospicy / noegg。
- veg = 素食模式：只保留带「素」标签的菜（本库素食含蛋菜，如番茄炒蛋）；不是严格纯素（vegan）。若用户要无蛋素食，同时传 veg 与 noegg。
- nocilantro / noallium 会省略点缀香菜、葱蒜，不会误杀主料不含葱蒜的菜。

## 推荐策略
- 默认 preferCombo=true：尽量一汤 + 一主菜 + 一凉菜，再按人数补齐。
- dishCount 由用户指定时优先遵守；否则按人数与食材数量估算。
- time 是整桌可用上限（分钟），不是单道菜时间。

## 语气
亲切、务实、像家里会做饭的人；少用营销腔。一次只给一套主推荐，必要时再给 1 个替换建议。`;

/** OpenAI / Anthropic 通用的 tools 定义（JSON Schema） */
const KITCHEN_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'recommend_menu',
      description: '根据现有食材、忌口、人数、时间与期望菜数，从本地菜谱库生成最优菜单（含用量、缺料、预估总时长）。',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'string',
            description: '用户现有食材，逗号或顿号分隔，如「番茄, 鸡蛋, 豆腐, 西兰花」'
          },
          seasonings: {
            type: 'array',
            items: { type: 'string' },
            description: '已有调料名列表；省略则使用默认调料'
          },
          taboos: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['veg', 'nopork', 'nobeef', 'nosea', 'nospicy', 'noegg', 'nopeanut', 'nosoy', 'nocilantro', 'noallium', 'nostaple']
            },
            description: '忌口标签 id 列表'
          },
          people: { type: 'integer', minimum: 1, maximum: 12, description: '用餐人数' },
          time: { type: 'integer', minimum: 10, maximum: 180, description: '最高可用烹饪时间（分钟）' },
          dishCount: { type: 'integer', minimum: 1, maximum: 5, description: '期望菜数；省略则按人数自动估算' },
          preferCombo: { type: 'boolean', description: '是否优先一汤+主菜+凉菜，默认 true' }
        },
        required: ['ingredients']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_taboos',
      description: '列出全部可用忌口标签及其 id，供用户勾选或自然语言映射。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_recipes',
      description: '在本地菜谱库中按关键词、标签或品类检索菜品摘要（不含完整步骤时可再查 get_recipe）。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '菜名或食材关键词' },
          tags: { type: 'array', items: { type: 'string' }, description: '必须包含的 tags，如「素」「辣」' },
          cat: { type: 'string', description: '品类：炒菜/炖菜/汤/凉菜/主食等' },
          taboos: {
            type: 'array',
            items: { type: 'string' },
            description: '忌口 id，检索前先过滤冲突菜'
          },
          limit: { type: 'integer', minimum: 1, maximum: 20, description: '最多返回条数，默认 8' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe',
      description: '按菜谱 id 或精确菜名取出完整做法、食材与调料。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '菜谱 id，如 fanqiechaodan' },
          name: { type: 'string', description: '精确菜名，如「番茄炒蛋」' },
          people: { type: 'integer', minimum: 1, maximum: 12, description: '按人数缩放用量，默认 2' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_timeline',
      description: '对已有推荐结果生成备菜/下锅时间轴。传入 recommend_menu 的完整 JSON 结果。',
      parameters: {
        type: 'object',
        properties: {
          result: { type: 'object', description: 'recommend_menu 返回的对象' }
        },
        required: ['result']
      }
    }
  }
];

/** Anthropic Messages API 用的 tools 形态 */
const KITCHEN_AGENT_TOOLS_ANTHROPIC = KITCHEN_AGENT_TOOLS.map(t => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters
}));

/**
 * 把 LLM 的 tool call 派发到本地引擎。
 * @param {string} name
 * @param {object} args
 */
function dispatchKitchenTool(name, args) {
  const a = args || {};
  switch (name) {
    case 'recommend_menu':
      return recommendMenu({
        ingredients: a.ingredients || '',
        seasonings: a.seasonings,
        taboos: a.taboos || [],
        people: a.people || 2,
        time: a.time != null ? a.time : 45,
        dishCount: a.dishCount,
        preferCombo: a.preferCombo
      });
    case 'list_taboos':
      return TABOOS.map(t => ({
        id: t.id,
        label: t.label,
        vegetarianMode: !!t.vegetarianMode,
        tags: t.tags || [],
        omit: t.omit || []
      }));
    case 'search_recipes': {
      const filter = buildTabooFilter(a.taboos || []);
      const q = (a.query || '').trim();
      let list = RECIPES.filter(r => recipeAllowed(r, filter));
      if (a.cat) list = list.filter(r => r.cat === a.cat);
      if (a.tags && a.tags.length) list = list.filter(r => a.tags.every(t => r.tags.includes(t)));
      if (q) {
        list = list.filter(r =>
          r.name.includes(q) ||
          r.desc.includes(q) ||
          r.flavor.includes(q) ||
          r.ing.some(i => i.n.includes(q)) ||
          r.tags.some(t => t.includes(q))
        );
      }
      const limit = Math.max(1, Math.min(20, a.limit || 8));
      return list.slice(0, limit).map(r => ({
        id: r.id, name: r.name, cat: r.cat, time: r.time, tags: r.tags, flavor: r.flavor, desc: r.desc
      }));
    }
    case 'get_recipe': {
      const people = Math.max(1, Math.min(12, a.people || 2));
      const r = RECIPES.find(x => (a.id && x.id === a.id) || (a.name && x.name === a.name));
      if (!r) return { error: '未找到该菜谱' };
      const factor = people / 2;
      return {
        id: r.id, name: r.name, cat: r.cat, time: r.time, tags: r.tags,
        flavor: r.flavor, desc: r.desc, tip: r.tip, extraNote: r.extraNote,
        people,
        portions: r.ing.map(i => ({ name: i.n, amount: scaleQty(i.q, i.u, factor), role: i.r })),
        season: r.season, seasonOpt: r.seasonOpt || [],
        prep: r.prep, steps: r.steps
      };
    }
    case 'build_timeline':
      return buildTimeline(a.result);
    default:
      return { error: '未知工具: ' + name };
  }
}

/** 压缩 recommendMenu 结果，方便塞进 LLM 上下文 */
function summarizeMenuForLLM(result) {
  if (!result || !result.menu || !result.menu.length) {
    return { ok: false, message: '没有可推荐的菜单', unused: (result && result.unused) || [] };
  }
  return {
    ok: true,
    people: result.people,
    totalMinutes: result.total,
    dishes: result.menu.map(m => ({
      id: m.recipe.id,
      name: m.recipe.name,
      cat: m.recipe.cat,
      time: m.recipe.time,
      tags: m.recipe.tags,
      flavor: m.recipe.flavor,
      why: m.matched,
      portions: m.portions.map(p => p.name + ' ' + p.amount + (p.owned ? '' : '（需买）')),
      missSeason: m.missSeason
    })),
    buyIng: result.buyIng,
    buySeason: result.buySeason,
    unused: result.unused,
    notes: result.notes
  };
}
