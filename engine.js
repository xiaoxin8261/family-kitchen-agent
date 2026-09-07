/// <reference path="./types.js" />
/* 我的家庭厨房 Agent — 推荐引擎（纯前端、可离线运行） */

/** @type {Taboo[]} */
const TABOOS = [
  /* vegetarianMode：只保留 RECIPES 中带「素」标签的菜（含蛋素，如番茄炒蛋）；比单纯挡肉标签更严，避免水蒸蛋/蛋炒饭等漏网 */
  { id: 'veg', label: '素食（含蛋）', vegetarianMode: true, tags: ['猪肉', '牛羊肉', '鸡肉', '海鲜'] },
  { id: 'nopork', label: '不吃猪肉', tags: ['猪肉'] },
  { id: 'nobeef', label: '不吃牛羊肉', tags: ['牛羊肉'] },
  { id: 'nosea', label: '不吃海鲜', tags: ['海鲜'] },
  { id: 'nospicy', label: '不吃辣', tags: ['辣'] },
  { id: 'noegg', label: '忌蛋', tags: ['蛋'] },
  { id: 'nopeanut', label: '忌花生', tags: ['花生'] },
  { id: 'nosoy', label: '忌豆制品', tags: ['豆制品'] },
  { id: 'nocilantro', label: '不吃香菜', omit: ['香菜'] },
  { id: 'noallium', label: '忌葱蒜', omit: ['葱', '蒜'], tags: ['葱蒜'], softAllium: true },
  { id: 'nostaple', label: '不要主食', tags: ['主食'] }
];

const CAT_ORDER = ['凉菜', '炖菜', '汤', '蒸菜', '蒸煮', '炸炒', '炒菜', '主食'];
const SLOW_CATS = ['炖菜', '汤', '蒸菜', '蒸煮'];
const MAIN_CATS = ['炒菜', '炖菜', '蒸菜', '蒸煮', '炸炒'];
const MEAT_TAGS = ['猪肉', '牛羊肉', '鸡肉', '海鲜'];

/* ---------- 食材文本解析 ---------- */
function normalizeName(raw) {
  let s = String(raw).trim();
  s = s.replace(/[（(].*?[)）]/g, '');
  s = s.replace(/^\d+(\.\d+)?\s*(个|根|条|只|把|颗|斤|克|g|kg|两|包|袋|盒|片|块|朵|瓣)?/i, '');
  s = s.replace(/\d+(\.\d+)?\s*(个|根|条|只|把|颗|斤|克|g|kg|两|包|袋|盒|片|块|朵|瓣)?$/i, '');
  s = s.replace(/[\s·、]/g, '');
  if (!s) return '';
  return ALIAS[s] || s;
}

function parseList(text) {
  if (!text) return [];
  return text
    .split(/[,，;；\n\t\/、|]+/)
    .map(normalizeName)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

/* 食材是否被用户拥有（含双向包含匹配，如「猪肉丝」↔「猪肉」） */
function hasIngredient(have, name) {
  if (have.includes(name)) return true;
  return have.some(h => (h.length > 1 && name.includes(h)) || (name.length > 1 && h.includes(name)));
}

/* ---------- 份量缩放 ---------- */
const FRACTION = { 0.5: '半', 1.5: '1 个半' };

function scaleQty(q, unit, factor) {
  let v = q * factor;
  if (unit === 'g' || unit === 'ml') {
    v = v >= 50 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5;
    return v + unit;
  }
  if (unit === '个' && q >= 1 && Number.isInteger(q)) {
    return Math.max(1, Math.round(v)) + unit;
  }
  v = Math.round(v * 2) / 2;
  if (v < 0.5) v = 0.5;
  if (v === 0.5) return '半' + unit;
  const whole = Math.floor(v);
  return (v % 1 === 0 ? whole : whole + '.5') + unit;
}

/* ---------- 忌口处理 ---------- */
/**
 * @param {string[]} ids
 * @returns {TabooFilter}
 */
function buildTabooFilter(ids) {
  const blockTags = new Set();
  const omitNames = new Set();
  let vegetarianMode = false;
  ids.forEach(id => {
    const t = TABOOS.find(x => x.id === id);
    if (!t) return;
    if (t.vegetarianMode) {
      vegetarianMode = true;
      MEAT_TAGS.forEach(x => blockTags.add(x));
    }
    (t.tags || []).forEach(x => blockTags.add(x));
    (t.omit || []).forEach(x => omitNames.add(x));
  });
  // 葱蒜作为点缀时可省略，作为主料时才排除
  const softAllium = ids.includes('noallium');
  if (softAllium) blockTags.delete('葱蒜');
  return { blockTags, omitNames, softAllium, vegetarianMode };
}

/**
 * @param {Recipe} r
 * @param {TabooFilter} f
 */
function recipeAllowed(r, f) {
  // 素食模式：必须带「素」标签（正选），并已通过肉类 tags 负选兜底
  if (f.vegetarianMode && !r.tags.includes('素')) return false;
  for (const tag of r.tags) if (f.blockTags.has(tag)) return false;
  if (f.omitNames.size) {
    for (const i of r.ing) {
      if (i.r === 'main' && [...f.omitNames].some(o => i.n.includes(o))) return false;
    }
  }
  if (f.softAllium) {
    if (r.ing.some(i => i.r === 'main' && (i.n === '葱' || i.n === '蒜'))) return false;
  }
  return true;
}

function visibleIng(r, f) {
  return r.ing.filter(i => {
    if (i.r === 'garnish' && [...f.omitNames].some(o => i.n.includes(o))) return false;
    if (f.softAllium && i.r !== 'main' && (i.n === '葱' || i.n === '蒜')) return false;
    return true;
  });
}

/* ---------- 打分 ---------- */
/* 香辛料（葱姜蒜等）若在「已有调料」里勾选，也算家里有 */
function owns(name, have, seasons) {
  if (hasIngredient(have, name)) return true;
  return SEASONINGS.includes(name) && seasons.includes(name);
}

function scoreRecipe(r, ctx) {
  const { have, seasons, filter, usedSet, usedMains } = ctx;
  const ing = visibleIng(r, filter);
  const mains = ing.filter(i => i.r === 'main');
  const subs = ing.filter(i => i.r === 'sub');

  const matchedMains = mains.filter(i => owns(i.n, have, seasons));
  const matchedSubs = subs.filter(i => owns(i.n, have, seasons));
  const seasonAll = r.season.filter(s => !(filter.softAllium && (s === '葱' || s === '蒜')));
  const missSeason = seasonAll.filter(s => !seasons.includes(s));
  const missIng = [...mains, ...subs].filter(i => !owns(i.n, have, seasons));

  if (!mains.length) return null;
  // 必须真正用到用户今天买的食材（调料里的葱姜蒜不算）
  if (!mains.some(i => hasIngredient(have, i.n))) return null;
  const coverage = matchedMains.length / mains.length;
  if (coverage < 0.5) return null;

  // 优先推荐能消耗尚未使用食材的菜
  const freshUse = matchedMains.concat(matchedSubs).filter(i => !usedSet.has(i.n)).length;

  let score = coverage * 60;
  score += (subs.length ? matchedSubs.length / subs.length : 1) * 12;
  score += Math.min(freshUse * 6, 24);
  score -= missSeason.length * 7;
  score -= missIng.filter(i => i.r === 'main').length * 10;
  score -= missIng.filter(i => i.r === 'sub').length * 4;
  // 避免连续几道菜用同一个主料
  if (usedMains && usedMains.size && mains.every(i => usedMains.has(i.n))) return null;
  if (usedMains) score -= mains.filter(i => usedMains.has(i.n)).length * 24;
  if (typeof window !== 'undefined' && window.__jitter) score += Math.random() * window.__jitter;

  return {
    recipe: r, score, coverage, ing, missSeason,
    missIng, matched: matchedMains.concat(matchedSubs).map(i => i.n)
  };
}

/* ---------- 菜单组合 ---------- */
function dishTarget(people, ingCount) {
  let n = 2;
  if (people >= 3) n = 3;
  if (people >= 5) n = 4;
  if (people >= 7) n = 5;
  if (ingCount >= 5) n += 1;
  if (ingCount >= 9) n += 1;
  return Math.min(5, n);
}

function prepBaseOf(n) { return 3 + n * 1.5; }

function estimateTotal(picked) {
  const slow = picked.filter(p => SLOW_CATS.includes(p.recipe.cat));
  const fast = picked.filter(p => !SLOW_CATS.includes(p.recipe.cat));
  const base = prepBaseOf(picked.length);
  const fastChain = base + fast.reduce((a, p) => a + p.recipe.time * (p.recipe.cat === '凉菜' ? 0.6 : 0.85), 0);
  const slowMax = slow.length ? Math.max(...slow.map((p, i) => base + p.recipe.time + i * 2)) : 0;
  return Math.ceil(Math.max(fastChain, slowMax));
}

/** 对候选按品类/蛋白/荤素平衡微调分数 */
function adjustCandidate(c, picked, catUsed, proteinUsed) {
  let s = c.score;
  const cat = c.recipe.cat;
  if ((catUsed[cat] || 0) >= 1 && ['汤', '主食', '凉菜'].includes(cat)) s -= 60;
  if ((catUsed[cat] || 0) >= 2) s -= 25;
  const prot = c.recipe.tags.find(t => MEAT_TAGS.includes(t));
  if (prot && (proteinUsed[prot] || 0) >= 1) s -= 22;
  const isVeg = c.recipe.tags.includes('素');
  const vegCount = picked.filter(p => p.recipe.tags.includes('素')).length;
  if (isVeg && vegCount === 0 && picked.length >= 1) s += 14;
  return { ...c, adj: s };
}

function rankCandidates(pool, picked, ctx, catUsed, proteinUsed) {
  return pool
    .filter(r => !picked.some(p => p.recipe.id === r.id))
    .map(r => scoreRecipe(r, ctx))
    .filter(Boolean)
    .map(c => adjustCandidate(c, picked, catUsed, proteinUsed))
    .sort((a, b) => b.adj - a.adj);
}

function pickWithinTime(cands, picked, limit) {
  for (const c of cands) {
    if (estimateTotal(picked.concat([c])) <= limit) return c;
  }
  return null;
}

/**
 * 智能饮食推荐入口。
 * 支持忌口过滤、期望菜数、时间上限、现有食材；可选优先「一汤 + 主菜 + 凉菜」。
 * @param {RecommendMenuInput} input
 * @returns {RecommendMenuResult}
 */
function recommendMenu(input) {
  const have = Array.isArray(input.ingredients)
    ? input.ingredients.map(normalizeName).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    : parseList(input.ingredients || '');
  const seasons = (input.seasonings || DEFAULT_SEASONINGS).slice();
  const tabooIds = input.taboos || [];
  const filter = buildTabooFilter(tabooIds);
  const people = Math.max(1, Math.min(12, input.people || 2));
  const limit = input.time != null ? input.time : 45;
  const preferCombo = input.preferCombo !== false;

  const pool = RECIPES.filter(r => recipeAllowed(r, filter) && r.time <= limit);
  const usedSet = new Set();
  const usedMains = new Set();
  const picked = [];
  const autoTarget = dishTarget(people, have.length);
  const target = Math.max(1, Math.min(5, input.dishCount != null ? input.dishCount : autoTarget));

  const catUsed = {};
  const proteinUsed = {};
  const ctx = () => ({ have, seasons, filter, usedSet, usedMains });

  const commit = c => {
    picked.push(c);
    catUsed[c.recipe.cat] = (catUsed[c.recipe.cat] || 0) + 1;
    const pr = c.recipe.tags.find(t => MEAT_TAGS.includes(t));
    if (pr) proteinUsed[pr] = (proteinUsed[pr] || 0) + 1;
    c.matched.forEach(n => usedSet.add(n));
    visibleIng(c.recipe, filter).filter(i => i.r === 'main').forEach(i => usedMains.add(i.n));
  };

  // 优先套餐：一汤 + 一主菜 + 一凉菜（目标 ≥ 3 时）
  if (preferCombo && target >= 3) {
    const slots = [
      { name: '汤', match: r => r.cat === '汤' },
      { name: '主菜', match: r => MAIN_CATS.includes(r.cat) && !r.tags.includes('主食') },
      { name: '凉菜', match: r => r.cat === '凉菜' }
    ];
    for (const slot of slots) {
      if (picked.length >= target) break;
      const cands = rankCandidates(pool.filter(slot.match), picked, ctx(), catUsed, proteinUsed);
      const chosen = pickWithinTime(cands, picked, limit);
      if (chosen) commit(chosen);
    }
  }

  // 贪心补齐至目标道数
  while (picked.length < target) {
    const cands = rankCandidates(pool, picked, ctx(), catUsed, proteinUsed);
    if (!cands.length) break;
    const chosen = pickWithinTime(cands, picked, limit);
    if (!chosen) break;
    commit(chosen);
  }

  const leftover = () => have.filter(h => ![...usedSet].some(u => u.includes(h) || h.includes(u)));

  // 第二轮：还有食材没用完且时间有余，再补一道消耗剩余食材的菜
  let guard = 0;
  while (picked.length < 5 && guard++ < 4) {
    const rest = leftover();
    if (rest.length < 2) break;
    const extra = pool
      .filter(r => !picked.some(p => p.recipe.id === r.id))
      .map(r => scoreRecipe(r, ctx()))
      .filter(Boolean)
      .filter(c => c.missIng.filter(i => i.r === 'main').length === 0)
      .filter(c => c.ing.some(i => i.r === 'main' && rest.some(h => i.n.includes(h) || h.includes(i.n))))
      .sort((a, b) => b.score - a.score);
    const fit = extra.find(c => estimateTotal(picked.concat([c])) <= limit);
    if (!fit) break;
    commit(fit);
  }

  const factor = people / 2;
  const menu = picked
    .sort((a, b) => CAT_ORDER.indexOf(a.recipe.cat) - CAT_ORDER.indexOf(b.recipe.cat))
    .map(p => ({
      ...p,
      portions: visibleIng(p.recipe, filter).map(i => ({
        name: i.n, amount: scaleQty(i.q, i.u, factor), role: i.r,
        owned: owns(i.n, have, seasons)
      })),
      seasonList: p.recipe.season
        .filter(s => !(filter.softAllium && (s === '葱' || s === '蒜')))
        .map(s => ({ name: s, owned: seasons.includes(s) })),
      seasonOptList: (p.recipe.seasonOpt || []).filter(s => !(filter.softAllium && (s === '葱' || s === '蒜')))
    }));

  const total = menu.length ? estimateTotal(menu) : 0;
  const unused = have.filter(h => ![...usedSet].some(u => u.includes(h) || h.includes(u)));

  const buyMap = new Map();
  menu.forEach(m => {
    m.portions.filter(p => !p.owned && p.role !== 'garnish').forEach(p => {
      buyMap.set(p.name, (buyMap.get(p.name) || []).concat(m.recipe.name));
    });
  });
  const buySeason = new Map();
  menu.forEach(m => m.seasonList.filter(s => !s.owned).forEach(s => {
    buySeason.set(s.name, (buySeason.get(s.name) || []).concat(m.recipe.name));
  }));
  const notes = menu.filter(m => m.recipe.extraNote).map(m => `${m.recipe.name}：${m.recipe.extraNote}`);

  return {
    menu, total, people, unused, have,
    buyIng: [...buyMap.entries()].map(([k, v]) => ({ name: k, dishes: v })),
    buySeason: [...buySeason.entries()].map(([k, v]) => ({ name: k, dishes: v })),
    notes,
    omitted: [...filter.omitNames]
  };
}

/** @deprecated 请优先使用 recommendMenu；保留别名以兼容 app.js */
function recommend(input) {
  return recommendMenu(input);
}

/* ---------- 备菜顺序（时间轴） ---------- */
function buildTimeline(result) {
  const menu = result.menu;
  if (!menu.length) return [];
  const T = result.total;
  const rows = [];

  const isAdvance = s => /泡发|腌|浸泡|静置|冷藏|杀水|晾/.test(s);

  // 1. 需要等待的预处理（泡发、腌制等），最先做
  menu.forEach(m => {
    const adv = m.recipe.prep.filter(isAdvance);
    if (adv.length) rows.push({ at: 0, tag: '提前处理', dish: m.recipe.name, text: adv.join('；'), kind: 'prep' });
  });
  // 2. 其余切配，一道菜一条
  menu.forEach(m => {
    const cut = m.recipe.prep.filter(s => !isAdvance(s));
    if (cut.length) rows.push({ at: 1, tag: '切配', dish: m.recipe.name, text: cut.join('；'), kind: 'prep' });
  });

  const prepEnd = Math.round(prepBaseOf(menu.length));
  const slow = menu.filter(m => SLOW_CATS.includes(m.recipe.cat));
  const cold = menu.filter(m => m.recipe.cat === '凉菜');
  const hot = menu.filter(m => !SLOW_CATS.includes(m.recipe.cat) && m.recipe.cat !== '凉菜');

  slow.forEach((m, i) => {
    rows.push({
      at: prepEnd + i * 2, tag: '起锅（长时间）', dish: m.recipe.name,
      text: `开始制作《${m.recipe.name}》，约需 ${m.recipe.time} 分钟，中途基本不用看火，可以同时处理其他菜。`,
      kind: 'cook'
    });
  });

  cold.forEach((m, i) => {
    rows.push({
      at: prepEnd + slow.length * 2 + i, tag: '可提前完成', dish: m.recipe.name,
      text: `拌好《${m.recipe.name}》，装盘后放冰箱冷藏，开饭前直接端上桌。`,
      kind: 'cook'
    });
  });

  const span = m => Math.max(3, Math.round(m.recipe.time * 0.85));
  let cursor = T - hot.reduce((a, m) => a + span(m), 0);
  if (cursor < prepEnd) cursor = prepEnd;
  hot.forEach(m => {
    rows.push({
      at: Math.round(cursor), tag: '下锅', dish: m.recipe.name,
      text: `制作《${m.recipe.name}》，约 ${m.recipe.time} 分钟，做好趁热上桌。`,
      kind: 'cook'
    });
    cursor += span(m);
  });

  rows.push({ at: Math.round(Math.max(cursor, T)), tag: '上桌', dish: '', text: '全部菜品完成，摆盘开饭。', kind: 'done' });
  return rows.sort((a, b) => a.at - b.at);
}
