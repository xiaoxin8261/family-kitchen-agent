/* 我的家庭厨房 Agent — 交互层 */

const QUICK_ING = [
  '番茄', '鸡蛋', '猪肉', '猪肉末', '排骨', '鸡腿肉', '鸡胸肉', '鸡翅', '牛肉', '牛腩', '羊肉',
  '虾', '虾仁', '鱼', '豆腐', '豆腐干', '土豆', '青椒', '西兰花', '包菜', '白菜', '上海青',
  '生菜', '黄瓜', '茄子', '韭菜', '洋葱', '胡萝卜', '香菇', '黑木耳', '四季豆', '芹菜',
  '玉米', '冬瓜', '南瓜', '紫菜', '花生', '面条', '剩米饭'
];
const TIME_OPTIONS = [20, 30, 45, 60, 90];

const state = {
  people: 2,
  seasonings: new Set(DEFAULT_SEASONINGS),
  taboos: new Set(),
  time: 45,
  lastResult: null
};

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/* ---------- 主题 ---------- */
(function initTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
  });
})();

/* ---------- 构建选择项 ---------- */
function chip(label, pressed, onClick) {
  const b = el('button', 'chip', label);
  b.type = 'button';
  b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  b.addEventListener('click', () => onClick(b));
  return b;
}

function buildIngChips() {
  const box = $('#ingChips');
  box.innerHTML = '';
  QUICK_ING.forEach(name => {
    box.appendChild(chip(name, false, b => {
      const ta = $('#ingredients');
      const list = parseList(ta.value);
      const canonical = normalizeName(name);
      if (list.includes(canonical)) {
        ta.value = list.filter(x => x !== canonical).join('，');
        b.setAttribute('aria-pressed', 'false');
      } else {
        ta.value = (list.concat([canonical])).join('，');
        b.setAttribute('aria-pressed', 'true');
      }
      updateIngCount();
    }));
  });
}

function syncIngChips() {
  const list = parseList($('#ingredients').value);
  [...$('#ingChips').children].forEach(b => {
    b.setAttribute('aria-pressed', list.includes(normalizeName(b.textContent)) ? 'true' : 'false');
  });
}

function updateIngCount() {
  const n = parseList($('#ingredients').value).length;
  $('#ingCount').textContent = n ? `已录入 ${n} 种食材` : '已录入 0 种食材';
  syncIngChips();
}

function buildSeasonChips() {
  const box = $('#seasonChips');
  box.innerHTML = '';
  SEASONINGS.forEach(s => {
    box.appendChild(chip(s, state.seasonings.has(s), b => {
      if (state.seasonings.has(s)) { state.seasonings.delete(s); b.setAttribute('aria-pressed', 'false'); }
      else { state.seasonings.add(s); b.setAttribute('aria-pressed', 'true'); }
    }));
  });
}

function buildTabooChips() {
  const box = $('#tabooChips');
  box.innerHTML = '';
  TABOOS.forEach(t => {
    box.appendChild(chip(t.label, false, b => {
      if (state.taboos.has(t.id)) { state.taboos.delete(t.id); b.setAttribute('aria-pressed', 'false'); }
      else { state.taboos.add(t.id); b.setAttribute('aria-pressed', 'true'); }
    }));
  });
}

function buildTimeChips() {
  const box = $('#timeChips');
  box.innerHTML = '';
  TIME_OPTIONS.forEach(m => {
    box.appendChild(chip(m + ' 分钟', m === state.time, b => {
      state.time = m;
      [...box.children].forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
    }));
  });
}

/* ---------- 人数 ---------- */
function setPeople(n) {
  state.people = Math.max(1, Math.min(12, n));
  $('#peopleVal').textContent = state.people;
}
$('#plus').addEventListener('click', () => setPeople(state.people + 1));
$('#minus').addEventListener('click', () => setPeople(state.people - 1));
$('#ingredients').addEventListener('input', updateIngCount);
$('#moreIng').addEventListener('click', () => {
  const box = $('#ingChips');
  const open = box.classList.toggle('open');
  $('#moreIng').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('#moreIng').textContent = open ? '收起食材标签' : '展开全部常买食材';
});

document.querySelectorAll('[data-season]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.season;
    if (mode === 'all') state.seasonings = new Set(SEASONINGS);
    if (mode === 'basic') state.seasonings = new Set(DEFAULT_SEASONINGS);
    if (mode === 'none') state.seasonings = new Set();
    buildSeasonChips();
  });
});

/* ---------- 渲染 ---------- */
function catPill(cat) { return el('span', 'tagpill', cat); }

function renderDish(m, idx) {
  const card = el('section', 'card dish fade');
  const head = el('div', 'dish-title');
  const h3 = el('h3', null, `${idx + 1}. ${m.recipe.name}`);
  head.appendChild(h3);
  head.appendChild(catPill(m.recipe.cat));
  head.appendChild(el('span', 'tagpill green', `约 ${m.recipe.time} 分钟`));
  head.appendChild(el('span', 'tagpill', m.recipe.flavor));
  card.appendChild(head);
  card.appendChild(el('p', 'dish-desc', m.recipe.desc));

  card.appendChild(el('p', 'block-label', `食材用量（${state.people} 人份）`));
  const ul = el('ul', 'ing-list');
  m.portions.forEach(p => {
    const li = el('li');
    const left = el('span');
    left.appendChild(document.createTextNode(p.name));
    if (p.role === 'garnish') left.appendChild(el('span', 'role', '点缀'));
    if (!p.owned) left.appendChild(el('span', 'need', '· 需补'));
    li.appendChild(left);
    li.appendChild(el('span', 'amt', p.amount));
    ul.appendChild(li);
  });
  card.appendChild(ul);

  const seasonTxt = m.seasonList.map(s => s.owned ? s.name : s.name + '（需补）').join('、');
  const optTxt = m.seasonOptList.length ? `　可选：${m.seasonOptList.join('、')}` : '';
  card.appendChild(el('p', 'block-label', '需要的调料'));
  card.appendChild(el('p', 'dish-desc', seasonTxt + optTxt));

  card.appendChild(el('p', 'block-label', '备菜（下锅前完成）'));
  const pl = el('ul', 'prep-list');
  m.recipe.prep.forEach(s => pl.appendChild(el('li', null, s)));
  card.appendChild(pl);

  card.appendChild(el('p', 'block-label', '烹饪步骤'));
  const ol = el('ol', 'steps');
  m.recipe.steps.forEach(s => ol.appendChild(el('li', null, s)));
  card.appendChild(ol);

  if (m.recipe.tip) card.appendChild(el('p', 'tip', '关键点：' + m.recipe.tip));
  return card;
}

function renderTimeline(result) {
  const card = el('section', 'card fade');
  card.appendChild(el('h2', null, '备菜与下锅顺序'));
  card.appendChild(el('p', 'dish-desc', `按这个顺序走，全部菜品约在 ${result.total} 分钟内同时上桌。`));
  const ul = el('ul', 'timeline');
  buildTimeline(result).forEach(row => {
    const li = el('li', row.kind);
    const when = el('span', 't-when', row.at === 0 ? '开始前' : `第 ${row.at} 分钟`);
    li.appendChild(when);
    li.appendChild(el('span', 't-tag', row.tag + (row.dish ? ' · ' + row.dish : '')));
    li.appendChild(el('p', 't-text', row.text));
    ul.appendChild(li);
  });
  card.appendChild(ul);
  return card;
}

function renderShopping(result) {
  if (!result.buyIng.length && !result.buySeason.length && !result.notes.length && !result.unused.length) return null;
  const card = el('section', 'card fade');
  card.appendChild(el('h2', null, '补货与剩余提醒'));

  if (result.buyIng.length) {
    card.appendChild(el('p', 'block-label', '还需要买的食材'));
    const ul = el('ul', 'buy-list');
    result.buyIng.forEach(b => {
      const li = el('li');
      li.appendChild(document.createTextNode(b.name + ' '));
      li.appendChild(el('small', null, `用于 ${[...new Set(b.dishes)].join('、')}`));
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  if (result.buySeason.length) {
    card.appendChild(el('p', 'block-label', '缺少的调料'));
    const ul = el('ul', 'buy-list');
    result.buySeason.forEach(b => {
      const li = el('li');
      li.appendChild(document.createTextNode(b.name + ' '));
      li.appendChild(el('small', null, `用于 ${[...new Set(b.dishes)].join('、')}`));
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  if (result.notes.length) {
    card.appendChild(el('p', 'block-label', '额外说明'));
    result.notes.forEach(n => card.appendChild(el('p', 'dish-desc', n)));
  }
  if (result.unused.length) {
    card.appendChild(el('p', 'block-label', '今天没用上的食材'));
    card.appendChild(el('p', 'dish-desc', result.unused.join('、') + ' —— 可以放冰箱明天用，或点「换一批菜谱」看看别的组合。'));
  }
  return card;
}

function resultText(result) {
  let t = `今天的菜单（${result.people} 人份 · 约 ${result.total} 分钟）\n`;
  t += result.menu.map((m, i) => `${i + 1}. ${m.recipe.name}`).join('  ') + '\n';
  result.menu.forEach((m, i) => {
    t += `\n【${i + 1}. ${m.recipe.name}】${m.recipe.cat} · 约${m.recipe.time}分钟\n`;
    t += '食材：' + m.portions.map(p => `${p.name} ${p.amount}`).join('，') + '\n';
    t += '调料：' + m.seasonList.map(s => s.name).join('、') + '\n';
    t += '备菜：' + m.recipe.prep.map((s, j) => `${j + 1})${s}`).join(' ') + '\n';
    t += '步骤：\n' + m.recipe.steps.map((s, j) => `  ${j + 1}. ${s}`).join('\n') + '\n';
    if (m.recipe.tip) t += '关键点：' + m.recipe.tip + '\n';
  });
  t += '\n【备菜顺序】\n';
  buildTimeline(result).forEach(r => {
    t += `${r.at === 0 ? '开始前' : '第' + r.at + '分钟'} · ${r.tag}${r.dish ? '（' + r.dish + '）' : ''}：${r.text}\n`;
  });
  if (result.buyIng.length) t += '\n还需购买：' + result.buyIng.map(b => b.name).join('、') + '\n';
  if (result.buySeason.length) t += '缺少调料：' + result.buySeason.map(b => b.name).join('、') + '\n';
  return t;
}

function renderResult(result) {
  const out = $('#output');
  out.innerHTML = '';
  state.lastResult = result;

  if (!result.menu.length) {
    const card = el('section', 'card empty fade');
    card.appendChild(el('h2', null, '暂时没有匹配的菜谱'));
    card.appendChild(el('p', null, '试试这些调整：多填 1–2 样常见食材（如鸡蛋、土豆、青菜）、把可用时间放宽到 45 分钟以上，或减少忌口条件。'));
    out.appendChild(card);
    return;
  }

  const head = el('section', 'result-head fade');
  head.appendChild(el('h2', null, `今天这样吃：${result.menu.length} 道菜`));
  const stats = el('div', 'stats');
  [[result.people + ' 人', '用餐人数'], [result.total + ' 分钟', '预计总用时'],
   [result.menu.length + ' 道', '菜品数量'], [(result.have.length - result.unused.length) + '/' + result.have.length, '食材利用']]
    .forEach(([v, l]) => {
      const s = el('div', 'stat');
      s.appendChild(el('b', null, v));
      s.appendChild(el('span', null, l));
      stats.appendChild(s);
    });
  head.appendChild(stats);
  const strip = el('div', 'menu-strip');
  result.menu.forEach(m => strip.appendChild(el('span', 'tagpill green', m.recipe.name)));
  head.appendChild(strip);
  if (result.omitted.length) {
    head.appendChild(el('p', 'dish-desc', `已按忌口省略：${result.omitted.join('、')}`));
  }
  out.appendChild(head);

  result.menu.forEach((m, i) => out.appendChild(renderDish(m, i)));
  out.appendChild(renderTimeline(result));
  const shop = renderShopping(result);
  if (shop) out.appendChild(shop);

  const acts = el('div', 'actions');
  const again = el('button', 'primary', '换一批菜谱');
  again.type = 'button';
  again.addEventListener('click', () => generate(true));
  const copy = el('button', 'ghost wide', '复制全部菜谱文字');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const text = resultText(result);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = '已复制到剪贴板';
    } catch (e) {
      const ta = el('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); copy.textContent = '已复制到剪贴板'; }
      catch (_) { copy.textContent = '复制失败，请长按选择文字'; }
      ta.remove();
    }
    setTimeout(() => { copy.textContent = '复制全部菜谱文字'; }, 2200);
  });
  acts.appendChild(again);
  acts.appendChild(copy);
  out.appendChild(acts);
}

/* ---------- 生成 ---------- */
function generate(shuffle) {
  const raw = $('#ingredients').value.trim();
  if (!raw) {
    const out = $('#output');
    out.innerHTML = '';
    const card = el('section', 'card empty fade');
    card.appendChild(el('h2', null, '先告诉我今天买了什么'));
    card.appendChild(el('p', null, '在第 1 个板块里填上今天买到的食材，或直接点下方的常买食材标签。'));
    out.appendChild(card);
    $('#sec-ing').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#ingredients').focus();
    return;
  }

  window.__jitter = shuffle ? 26 : 0;

  const out = $('#output');
  out.innerHTML = '';
  const sk = el('div', 'skeleton');
  sk.appendChild(el('div', 'sk-line'));
  sk.appendChild(el('div', 'sk-line'));
  sk.appendChild(el('div', 'sk-line'));
  out.appendChild(sk);

  setTimeout(() => {
    const result = recommendMenu({
      ingredients: raw,
      seasonings: [...state.seasonings],
      taboos: [...state.taboos],
      people: state.people,
      time: state.time,
      preferCombo: true
    });
    renderResult(result);
    $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 320);
}

$('#form').addEventListener('submit', e => { e.preventDefault(); generate(false); });
$('#resetBtn').addEventListener('click', () => {
  $('#ingredients').value = '';
  state.people = 2; state.time = 45;
  state.taboos = new Set();
  state.seasonings = new Set(DEFAULT_SEASONINGS);
  setPeople(2);
  buildSeasonChips(); buildTabooChips(); buildTimeChips();
  updateIngCount();
  $('#output').innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Agent API 闭环（OpenAI / DeepSeek 兼容） ---------- */
const LS_API_BASE = 'kitchen_api_base';
const LS_API_KEY = 'kitchen_api_key';
const LS_API_MODEL = 'kitchen_api_model';
const DEFAULT_API_BASE = 'https://api.deepseek.com';
const DEFAULT_API_MODEL = 'deepseek-chat';
const AGENT_MAX_ROUNDS = 6;

function loadAgentSettings() {
  $('#apiBase').value = localStorage.getItem(LS_API_BASE) || DEFAULT_API_BASE;
  $('#apiKey').value = localStorage.getItem(LS_API_KEY) || '';
  $('#apiModel').value = localStorage.getItem(LS_API_MODEL) || DEFAULT_API_MODEL;
}

function saveAgentSettings() {
  localStorage.setItem(LS_API_BASE, ($('#apiBase').value || DEFAULT_API_BASE).trim());
  localStorage.setItem(LS_API_KEY, ($('#apiKey').value || '').trim());
  localStorage.setItem(LS_API_MODEL, ($('#apiModel').value || DEFAULT_API_MODEL).trim());
}

function chatCompletionsUrl(base) {
  const b = String(base || DEFAULT_API_BASE).trim().replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v1$/i.test(b)) return b + '/chat/completions';
  return b + '/v1/chat/completions';
}

function setAgentStatus(text) {
  $('#agentStatus').textContent = text || '';
}

function showAgentReply(text) {
  const box = $('#agentReply');
  box.hidden = !text;
  box.textContent = text || '';
}

function pageContextForAgent() {
  const ing = $('#ingredients').value.trim();
  const tabooLabels = [...state.taboos].map(id => {
    const t = TABOOS.find(x => x.id === id);
    return t ? `${t.label}(${t.id})` : id;
  });
  return [
    '【页面当前表单状态，可供工具参数参考；若用户口述有冲突以口述为准】',
    `食材：${ing || '（未填）'}`,
    `调料：${[...state.seasonings].join('、') || '（无）'}`,
    `人数：${state.people}`,
    `忌口：${tabooLabels.length ? tabooLabels.join('、') : '无'}`,
    `可用时间：${state.time} 分钟`
  ].join('\n');
}

function parseToolArgs(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

/** 工具调用前用页面表单补全缺省参数（不改 engine） */
function enrichToolArgs(name, args) {
  const a = Object.assign({}, args || {});
  if (name === 'recommend_menu') {
    if (!a.ingredients) a.ingredients = $('#ingredients').value.trim();
    if (!a.seasonings) a.seasonings = [...state.seasonings];
    if (a.people == null) a.people = state.people;
    if (a.time == null) a.time = state.time;
    if (!a.taboos || !a.taboos.length) a.taboos = [...state.taboos];
  }
  return a;
}

function toolPayloadForModel(name, rawResult) {
  if (name === 'recommend_menu' && typeof summarizeMenuForLLM === 'function') {
    return summarizeMenuForLLM(rawResult);
  }
  return rawResult;
}

async function callChatCompletions(messages) {
  saveAgentSettings();
  const base = ($('#apiBase').value || DEFAULT_API_BASE).trim();
  const key = ($('#apiKey').value || '').trim();
  const model = ($('#apiModel').value || DEFAULT_API_MODEL).trim();
  if (!key) throw new Error('请先填写 API Key');

  const res = await fetch(chatCompletionsUrl(base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model,
      messages,
      tools: KITCHEN_AGENT_TOOLS,
      tool_choice: 'auto'
    })
  });

  let data = null;
  try { data = await res.json(); } catch (_) { /* ignore */ }
  if (!res.ok) {
    const msg = (data && (data.error && data.error.message || data.message)) || ('HTTP ' + res.status);
    throw new Error(msg);
  }
  if (!data || !data.choices || !data.choices[0]) throw new Error('接口返回异常：缺少 choices');
  return data;
}

async function runAgentAsk() {
  const question = ($('#agentAsk').value || '').trim();
  if (!question) {
    setAgentStatus('请先输入问题');
    $('#agentAsk').focus();
    return;
  }

  const btn = $('#agentAskBtn');
  btn.disabled = true;
  showAgentReply('');
  setAgentStatus('正在请求模型…');

  const messages = [
    { role: 'system', content: KITCHEN_AGENT_SYSTEM },
    { role: 'user', content: pageContextForAgent() + '\n\n用户问题：' + question }
  ];

  let lastMenuResult = null;

  try {
    for (let round = 0; round < AGENT_MAX_ROUNDS; round++) {
      const data = await callChatCompletions(messages);
      const msg = data.choices[0].message;
      if (!msg) throw new Error('模型未返回 message');

      const toolCalls = msg.tool_calls;
      if (toolCalls && toolCalls.length) {
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls
        });

        for (const tc of toolCalls) {
          const name = (tc.function && tc.function.name) || '';
          const args = enrichToolArgs(name, parseToolArgs(tc.function && tc.function.arguments));
          setAgentStatus('正在执行工具：' + name + '…');
          let raw;
          try {
            raw = dispatchKitchenTool(name, args);
          } catch (err) {
            raw = { error: String(err && err.message || err) };
          }
          if (name === 'recommend_menu' && raw && raw.menu) lastMenuResult = raw;
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolPayloadForModel(name, raw))
          });
        }
        setAgentStatus('工具已执行，正在生成回复…');
        continue;
      }

      const reply = (msg.content || '').trim() || '（模型未返回文字内容）';
      showAgentReply(reply);
      setAgentStatus('完成');
      if (lastMenuResult) {
        renderResult(lastMenuResult);
        $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        $('#agentReply').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }
    throw new Error('工具调用轮次过多，已中止。请简化问题后重试。');
  } catch (err) {
    setAgentStatus('出错：' + (err && err.message ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
}

loadAgentSettings();
['apiBase', 'apiKey', 'apiModel'].forEach(id => {
  $('#' + id).addEventListener('change', saveAgentSettings);
  $('#' + id).addEventListener('blur', saveAgentSettings);
});
$('#agentAskBtn').addEventListener('click', () => { runAgentAsk(); });
$('#agentAsk').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runAgentAsk();
  }
});

buildIngChips();
buildSeasonChips();
buildTabooChips();
buildTimeChips();
setPeople(2);
updateIngCount();
