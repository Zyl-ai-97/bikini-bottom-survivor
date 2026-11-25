/* 1500 生存季 × bikini-bottom-shawn 融合版 —— R2 任务 UI + v3 追加（父页面专用）
 * 只做界面与接线：数值只从 window.BudgetSurvivor / window.BudgetQuests 读取，
 * 不写玩法计算、不改任何原项目文件。用法：index.html 中在本文件之前引入 survival-logic.js。
 */
(() => {
  'use strict';

  const script = document.currentScript;
  const base = script ? new URL('.', script.src) : new URL('./survival/', location.href);
  const cssUrl = new URL('survival-hud.css?v=1125a', base).href;
  if (!Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).some(link => link.href === cssUrl)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  const api = window.BudgetSurvivor;
  if (!api) {
    console.error('[survival-hud] window.BudgetSurvivor 未加载：请先引入 web/survival/survival-logic.js');
    return;
  }
  const quests = window.BudgetQuests || {};
  const $ = id => document.getElementById(id);
  const money = value => `¥${Number(value || 0).toFixed(2)}`;
  const call = (scope, name, ...args) => {
    try {
      return typeof scope?.[name] === 'function' ? scope[name](...args) : undefined;
    } catch (error) {
      console.warn('[survival-hud] ' + name + ' 调用失败', error);
      return undefined;
    }
  };
  const text = (node, value) => { node.textContent = value === undefined || value === null || value === '' ? '—' : String(value); };
  const pick = (obj, keys) => {
    for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
    return undefined;
  };

  // 本轮新增 12 个成就的内置表；前 12 个从 content.json 的 achievements 段读取。
  const BUILTIN_ACHIEVEMENTS = {
    '第一份工': '第一份工。跑腿跑到海之霸门口，也算见过世面。',
    '秘方守卫': '秘方守卫。你探完一眼就回来，痞老板白忙一场。',
    '跑腿王': '跑腿王。今天的鞋底比账本还忙。',
    '好邻居': '好邻居。街坊的门都认得你的敲门声。',
    '水母大师': '水母大师。抓网一挥，海里的灯全归你管。',
    '采样专家': '采样专家。三个点跑齐，珊迪的实验有救了。',
    '盛情难却': '盛情难却。冰淇淋吃了，成就也跟着来了。',
    '钢铁意志': '钢铁意志。你拒绝了冰淇淋，连派大星都愣住。',
    '有房有顶': '有房有顶。修好屋顶，菠萝屋今晚不漏风。',
    '学有所成': '学有所成。航船课过了，泡芙老师终于点头。',
    '寿星快乐': '寿星快乐。生日礼物送到，派大星笑到跳起来。',
    '安居乐业': '安居乐业。房租水电交齐，这个月你站住脚了。',
  };
  const WANTED_WARNINGS = {
    1: '有人注意到你了。',
    3: '海洋巡逻开始留意这片海域。',
    5: '全城通缉：先脱身再说。',
  };
  const CATEGORY_PLACE = {
    '食堂餐饮': 'diner',
    '娱乐社交': 'chum',
    '学习打印': 'school',
    '超市日用': 'market',
  };

  let contentAchievements = {};
  if (typeof fetch === 'function') fetch(new URL('content.json', base).href)
    .then(response => response.json())
    .then(data => { contentAchievements = data && data.achievements ? data.achievements : {}; renderAchievements(); })
    .catch(() => { /* 文案文件缺失时仍用内置表展示成就名 */ });

  // 豆包 R2 任务台词与 v3 文案：只做展示层覆盖（标题/台词），逻辑仍以 BudgetQuests 为准。
  let questLines = {};
  let v3Content = {};
  const REP_TIER_NAMES = ['无名小卒', '街坊熟人', '比奇堡红人', '小镇传奇'];
  if (typeof fetch === 'function') {
    fetch(new URL('content-quests.json', base).href)
      .then(response => response.json())
      .then(data => { questLines = data || {}; renderQuests(); })
      .catch(() => { /* 台词缺失时用逻辑层 desc 兜底 */ });
    fetch(new URL('content-v3.json', base).href)
      .then(response => response.json())
      .then(data => { v3Content = data || {}; renderEvent(); renderQuests(); })
      .catch(() => { /* v3 文案缺失时用逻辑层标题兜底 */ });
  }
  const splitLines = value => typeof value === 'string'
    ? value.split('。').map(part => part.trim()).filter(Boolean).map(part => part + '。')
    : [];

  const host = document.createElement('div');
  host.innerHTML = `
    <section id="survival-hud" class="survival-hud" aria-label="生存状态">
      <div class="survival-hud__inner">
        <div id="survival-wanted" class="survival-wanted" aria-label="通缉星">
          <span class="survival-hud__label">通缉</span>
          <span class="survival-stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></span>
          <span id="survival-wanted-warn" class="survival-wanted-warn" hidden></span>
        </div>
        <div class="survival-hp">
          <span class="survival-hud__label">HP</span>
          <div class="survival-hp__track"><div id="survival-hp" class="survival-hp__fill"></div></div>
        </div>
        <div class="survival-stat"><span class="survival-hud__label">余额</span><b id="survival-balance"></b></div>
        <div class="survival-stat"><span class="survival-hud__label">今日已花/日预算</span><b id="survival-today"></b></div>
        <div class="survival-stat"><span class="survival-hud__label">连击</span><b id="survival-streak"></b></div>
        <div class="survival-stat survival-rep">
          <span class="survival-hud__label">声望 <b id="survival-rep-tier">无名小卒</b></span>
          <div class="survival-rep__track"><div id="survival-rep-bar" class="survival-rep__bar"></div></div>
        </div>
        <div class="survival-stat"><span class="survival-hud__label">护盾</span><b id="survival-shield">0</b></div>
        <div class="survival-stat"><span class="survival-hud__label">立足进度</span><b id="survival-day-badge">第 1/30 天</b></div>
        <button id="survival-sound-btn" class="survival-mini-btn" type="button">声音</button>
        <button id="survival-tour-btn" class="survival-mini-btn" type="button" aria-pressed="false">观光</button>
        <button id="survival-task-btn" class="survival-mini-btn" type="button">任务</button>
        <button id="survival-report-btn" class="survival-mini-btn" type="button">战报</button>
        <button id="survival-phone-btn" class="survival-mini-btn survival-phone-btn" type="button">海螺手机</button>
      </div>
    </section>

    <div id="survival-event-banner" class="survival-event-banner" hidden>
      <button id="survival-event-close" class="survival-event-close" type="button" aria-label="关闭事件横幅">×</button>
      <div class="survival-event-text">
        <b id="survival-event-title"></b>
        <span id="survival-event-desc"></span>
        <small id="survival-event-claim-hint" hidden>点击交付事件</small>
      </div>
    </div>

    <div id="survival-quick" class="survival-quick" aria-label="快捷记账">
      <button type="button" data-quick="食堂餐饮|25|蟹堡套餐">蟹堡套餐 ¥25</button>
      <button type="button" data-quick="奶茶零食|15|冰淇淋">冰淇淋 ¥15</button>
      <button type="button" data-quick="出行|4|公交">公交 ¥4</button>
      <button type="button" data-quick="学习打印|10|打印">打印 ¥10</button>
      <button type="button" data-quick="超市日用|60|日用采购">日用 ¥60</button>
    </div>
    <button id="survival-add-btn" type="button">记一笔</button>
    <div id="survival-crit" class="survival-crit" aria-live="polite"></div>
    <div id="survival-toast" class="survival-toast" hidden></div>

    <div id="survival-joystick" class="survival-joystick" aria-label="移动摇杆">
      <div id="survival-joystick-knob" class="survival-joystick__knob"></div>
    </div>

    <div id="survival-modal" class="survival-overlay" hidden>
      <form id="survival-form" class="survival-panel">
        <h2 class="survival-panel__title">记一笔</h2>
        <label class="survival-field">金额
          <input id="survival-amount" type="number" min="0.01" step="0.01" required>
        </label>
        <fieldset class="survival-fieldset">
          <legend>分类</legend>
          <label><input type="radio" name="survival-category" value="食堂餐饮" checked><img class="survival-cat-icon" src="./survival/img/cat-canteen.png" alt="">食堂餐饮</label>
          <label><input type="radio" name="survival-category" value="奶茶零食"><img class="survival-cat-icon" src="./survival/img/cat-milktea.png" alt="">奶茶零食</label>
          <label><input type="radio" name="survival-category" value="超市日用"><img class="survival-cat-icon" src="./survival/img/cat-market.png" alt="">超市日用</label>
          <label><input type="radio" name="survival-category" value="出行"><img class="survival-cat-icon" src="./survival/img/cat-travel.png" alt="">出行</label>
          <label><input type="radio" name="survival-category" value="学习打印"><img class="survival-cat-icon" src="./survival/img/cat-print.png" alt="">学习打印</label>
          <label><input type="radio" name="survival-category" value="娱乐社交"><img class="survival-cat-icon" src="./survival/img/cat-fun.png" alt="">娱乐社交</label>
          <small id="survival-closed-hint" class="survival-closed-hint" hidden>已打烊，记账会涨通缉星</small>
        </fieldset>
        <label class="survival-field">备注
          <input id="survival-note" type="text">
        </label>
        <div class="survival-actions">
          <button type="button" data-close="survival-modal">关闭</button>
          <button type="submit" class="survival-primary">保存</button>
        </div>
      </form>
    </div>

    <div id="survival-setup" class="survival-overlay" hidden>
      <div class="survival-panel">
        <h2 class="survival-panel__title">开局设置</h2>
        <fieldset class="survival-fieldset">
          <legend>月预算</legend>
          <label><input type="radio" name="survival-budget" value="1000">1000</label>
          <label><input type="radio" name="survival-budget" value="1500" checked>1500</label>
          <label><input type="radio" name="survival-budget" value="2000">2000</label>
        </fieldset>
        <label class="survival-field">角色名
          <input id="survival-player" type="text" autocomplete="off">
        </label>
        <div class="survival-actions">
          <button id="survival-start" type="button" class="survival-primary">开始生存</button>
        </div>
      </div>
    </div>

    <div id="survival-fade" class="survival-fade" hidden></div>

    <div id="survival-summary" class="survival-overlay" hidden>
      <div class="survival-panel">
        <h2 class="survival-panel__title">每日小结</h2>
        <dl class="survival-report-list">
          <dt>昨天花费</dt><dd id="survival-sum-spent"></dd>
          <dt>当前连击</dt><dd id="survival-sum-streak"></dd>
          <dt>通缉</dt><dd id="survival-sum-wanted"></dd>
          <dt>声望</dt><dd id="survival-sum-rep"></dd>
          <dt>今日事件</dt><dd id="survival-sum-event"></dd>
          <dt>今日海况</dt><dd id="survival-sum-sea"></dd>
          <dt>今日支线</dt><dd id="survival-sum-side"></dd>
        </dl>
        <div class="survival-actions">
          <button id="survival-summary-close" type="button" class="survival-primary">开始新的一天</button>
        </div>
      </div>
    </div>

    <div id="survival-intro" class="survival-overlay" hidden>
      <div class="survival-panel survival-intro-panel">
        <img src="./survival/img/poster-main.png" class="survival-intro-img" alt="">
        <p class="survival-intro-text">你带着 ¥1500 生活费，来到比奇堡。</p>
        <p class="survival-intro-text">在这里立足 30 天：记账活下去，接活攒声望，别让通缉星爬满。</p>
        <p class="survival-intro-text">钱、声望、通缉——月底的立足评级，由你自己挣。</p>
        <div class="survival-actions">
          <button id="survival-intro-start" type="button" class="survival-primary">开始立足</button>
        </div>
      </div>
    </div>

    <div id="survival-tutorial" class="survival-overlay" hidden>
      <div class="survival-panel">
        <h2 class="survival-panel__title">新手漫画 <span id="survival-tutorial-step"></span></h2>
        <img id="survival-tutorial-img" class="survival-tutorial-img" alt="">
        <p id="survival-tutorial-cap" class="survival-tutorial-cap"></p>
        <div class="survival-actions">
          <button id="survival-tutorial-skip" type="button">跳过教程</button>
          <button id="survival-tutorial-prev" type="button">上一步</button>
          <button id="survival-tutorial-next" type="button" class="survival-primary">下一步</button>
        </div>
      </div>
    </div>

    <div id="survival-jelly" class="survival-overlay" hidden>
      <div class="survival-panel">
        <h2 class="survival-panel__title">抓水母！剩余 <span id="survival-jelly-time">20</span> 秒 · 已抓 <span id="survival-jelly-count">0</span></h2>
        <div id="survival-jelly-field" class="survival-jelly-field"></div>
        <div class="survival-actions">
          <button id="survival-jelly-quit" type="button">放弃</button>
        </div>
      </div>
    </div>

    <div id="survival-phone-overlay" class="survival-overlay survival-phone-wrap" hidden>
      <div id="survival-phone" class="survival-phone" role="dialog" aria-label="海螺手机">
        <div class="survival-phone__speaker"></div>
        <div class="survival-phone__screen">
          <header class="survival-phone__bar">
            <span>海螺手机</span>
            <button id="survival-phone-close" type="button" aria-label="关闭海螺手机">×</button>
          </header>
          <nav class="survival-phone__tabs" role="tablist">
            <button id="survival-tab-quest" type="button" role="tab" aria-selected="true">任务</button>
            <button id="survival-tab-report" type="button" role="tab" aria-selected="false">战报</button>
            <button id="survival-tab-achievement" type="button" role="tab" aria-selected="false">成就</button>
            <button id="survival-tab-ledger" type="button" role="tab" aria-selected="false">账本</button>
            <button id="survival-tab-map" type="button" role="tab" aria-selected="false">地图</button>
            <button id="survival-tab-atlas" type="button" role="tab" aria-selected="false">图鉴</button>
          </nav>
          <div class="survival-phone__pages">
            <section id="survival-task-panel" class="survival-phone__page" role="tabpanel">
              <div id="survival-debt-box" class="survival-debt-box" hidden></div>
              <h3 class="survival-panel__title">今日事件</h3>
              <div id="survival-event-box" class="survival-event-box"></div>
              <h3 class="survival-panel__title">当前主线</h3>
              <div id="survival-main-quest" class="survival-quest"></div>
              <h3 class="survival-panel__title">每日支线</h3>
              <div id="survival-side-list" class="survival-side-list"></div>
              <div id="survival-dialog" class="survival-dialog" hidden></div>
            </section>
            <section id="survival-report" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">战报</h3>
              <dl class="survival-report-list">
                <dt>存活天数</dt><dd id="survival-report-days"></dd>
                <dt>HP</dt><dd id="survival-report-hp"></dd>
                <dt>成就</dt><dd id="survival-report-achievements"></dd>
                <dt>连击</dt><dd id="survival-report-streak"></dd>
                <dt>最常翻车分类</dt><dd id="survival-report-category"></dd>
                <dt>暴击统计</dt><dd id="survival-report-crits"></dd>
                <dt>立足评级</dt><dd id="survival-report-grade"></dd>
                <dt>声望档位</dt><dd id="survival-report-rep"></dd>
                <dt>通缉星</dt><dd id="survival-report-wanted"></dd>
                <dt>主线完成</dt><dd id="survival-report-main"></dd>
                <dt>支线完成</dt><dd id="survival-report-side"></dd>
              </dl>
              <div class="survival-actions survival-actions--report">
                <button id="survival-sleep" type="button">回家睡觉（推进一天）</button>
                <button id="survival-demo-mode" type="button">演示存档（第12天）</button>
                <button id="survival-report-demo" type="button">一键填充演示数据</button>
                <button id="survival-share-card" type="button">生成战报分享图</button>
                <button id="survival-export" type="button">导出存档码</button>
                <button id="survival-import" type="button">导入存档码</button>
                <button id="survival-report-reset" type="button">重置存档</button>
                <button id="survival-report-tutorial" type="button">新手教程</button>
                <button id="survival-report-close" type="button" class="survival-primary">关闭</button>
              </div>
            </section>
            <section id="survival-phone-achievement" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">成就（24）</h3>
              <div id="survival-achievement-grid" class="survival-achievement-grid"></div>
            </section>
            <section id="survival-phone-ledger" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">账本</h3>
              <div id="survival-ledger-list" class="survival-ledger-list"></div>
            </section>
            <section id="survival-phone-map" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">比奇堡地图</h3>
              <div id="survival-map-box" class="survival-map-box">
                <img src="../docs/images/town-aerial.webp" alt="比奇堡俯瞰图">
              </div>
              <p class="survival-map-hint">金色标记是当前任务目标，跟着水下罗盘走。</p>
            </section>
            <section id="survival-phone-atlas" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">地点图鉴</h3>
              <div id="survival-atlas-grid" class="survival-atlas-grid"></div>
            </section>
          </div>
          <div class="survival-phone__home"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  const overlays = [$('survival-modal'), $('survival-setup'), $('survival-phone-overlay'), $('survival-summary'), $('survival-intro'), $('survival-jelly'), $('survival-tutorial')];
  const tabs = {
    quest: $('survival-tab-quest'),
    report: $('survival-tab-report'),
    achievement: $('survival-tab-achievement'),
    ledger: $('survival-tab-ledger'),
    map: $('survival-tab-map'),
    atlas: $('survival-tab-atlas'),
  };
  const pages = {
    quest: $('survival-task-panel'),
    report: $('survival-report'),
    achievement: $('survival-phone-achievement'),
    ledger: $('survival-phone-ledger'),
    map: $('survival-phone-map'),
    atlas: $('survival-phone-atlas'),
  };
  let setupPending = false;
  let pendingReturn = null;
  let priorCanvasInert = null;
  let critTimer = 0;
  let toastTimer = 0;
  let warnTimer = 0;
  let lastStars = null;
  let lastTier = null;
  let activeTab = 'quest';

  function anyOpen() { return overlays.some(overlay => !overlay.hidden); }
  function syncBlocking() {
    document.body.classList.toggle('survival-locked', anyOpen());
    const canvas = $('ocean');
    if (!canvas) return;
    if (anyOpen() && priorCanvasInert === null) {
      priorCanvasInert = canvas.inert;
      canvas.inert = true;
    } else if (!anyOpen() && priorCanvasInert !== null) {
      canvas.inert = priorCanvasInert;
      priorCanvasInert = null;
    }
  }
  function open(overlay) { overlay.hidden = false; syncBlocking(); }
  function close(overlay) { overlay.hidden = true; syncBlocking(); }
  function toast(message) {
    const node = $('survival-toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  function showTab(name) {
    activeTab = name;
    for (const key of Object.keys(tabs)) {
      tabs[key].setAttribute('aria-selected', String(key === name));
      pages[key].hidden = key !== name;
    }
    if (name === 'report') renderReport();
    if (name === 'achievement') renderAchievements();
    if (name === 'quest') renderQuests();
    if (name === 'ledger') renderLedger();
    if (name === 'map') renderMap();
    if (name === 'atlas') renderAtlas();
  }

  // —— 账本（DESIGN-v4 第 9 项）：按日倒序的收支明细 ——
  function renderLedger() {
    const box = $('survival-ledger-list');
    box.textContent = '';
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('budget-survivor-state-v1') || 'null'); } catch { /* 忽略 */ }
    const expenses = (raw && raw.expenses) || [];
    const incomes = (raw && raw.incomes) || [];
    const rows = [
      ...expenses.map(e => ({ date: e.date, label: `${e.category}${e.note ? ' · ' + e.note : ''}`, amount: -Number(e.amount) || 0 })),
      ...incomes.map(i => ({ date: i.date, label: i.note || i.source || '任务收入', amount: Number(i.amount) || 0 })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!rows.length) {
      box.textContent = '还没有记录，去记第一笔吧。';
      return;
    }
    let currentDate = '';
    for (const row of rows.slice(0, 80)) {
      if (row.date !== currentDate) {
        currentDate = row.date;
        const head = document.createElement('h4');
        head.className = 'survival-ledger-date';
        head.textContent = currentDate;
        box.appendChild(head);
      }
      const line = document.createElement('div');
      line.className = 'survival-ledger-row';
      const label = document.createElement('span');
      label.textContent = row.label;
      const amount = document.createElement('b');
      amount.textContent = (row.amount >= 0 ? '+' : '−') + '¥' + Math.abs(row.amount);
      amount.className = row.amount >= 0 ? 'is-in' : 'is-out';
      line.append(label, amount);
      box.appendChild(line);
    }
  }

  // —— 地图（DESIGN-v4 第 13 项）：俯瞰底图 + 锚点标记 + 目标高亮 ——
  const MAP_POINTS = {
    diner: [-45.3, -25.6, '蟹堡王'], chum: [-44.6, -30.2, '海之霸'], neighbors: [30.7, -18.6, '邻居区'],
    street: [1.9, -32.8, '镇中心·学校'], ridge: [22.6, -62, '山脊'], cove: [43.3, -15.7, '海湾'],
    horn: [45.2, -25.55, '号角礁'], conch: [25.1, -12.2, '海螺街'], market: [-36, -30, '贝壳超市'],
    jellyfield: [33, -29.1, '水母田'],
  };
  function renderMap() {
    const box = $('survival-map-box');
    box.querySelectorAll('.survival-map-dot').forEach(d => d.remove());
    let targetLoc = null;
    const sides = call(quests, 'getSide') ?? [];
    const active = sides.find(s => s.status === 'active');
    if (active) targetLoc = sideTargetLoc(active);
    if (!targetLoc) {
      const main = call(quests, 'getMain');
      if (main && main.current && main.current.type === 'spend') targetLoc = MAIN_PLACE[main.current.category];
    }
    for (const [loc, [x, z, name]] of Object.entries(MAP_POINTS)) {
      const dot = document.createElement('span');
      dot.className = 'survival-map-dot' + (loc === targetLoc ? ' is-target' : '');
      dot.style.left = `${((x + 60) / 120) * 100}%`;
      dot.style.top = `${(1 - (z + 70) / 105) * 100}%`;
      dot.title = name;
      dot.textContent = name;
      box.appendChild(dot);
    }
  }
  function sideTargetLoc(item) {
    if (item.type === 'visit' && Array.isArray(item.locations)) return item.locations[Math.min((item.progress || {}).step || 0, item.locations.length - 1)];
    if (item.type === 'stay' || item.type === 'purchaseVisit') return item.destination;
    if (item.type === 'choice') return item.locId;
    return null;
  }

  // —— 图鉴（DESIGN-v4 第 14 项）：到访解锁 ——
  const ATLAS = {
    diner: '蟹堡王——全镇最香的地方，蟹老板的算盘比收银机还快。',
    chum: '海之霸——痞老板的店，半价的东西，吃之前先想想为什么半价。',
    neighbors: '邻居区——菠萝屋、石头屋和复活节石像，热闹的源头。',
    street: '镇中心——学校和大家的生活交汇的地方。',
    school: '航船学校——泡芙老师的课堂，靠岸先深呼吸。',
    market: '贝壳超市——日用百货一应俱全，特价日要趁早。',
    jellyfield: '水母田——粉色水母成群，抓水母爱好者的天堂。',
    cove: '海湾——珊迪采样的地方，水质清澈见底。',
    ridge: '山脊——视野最好的地方，能望见大半个比奇堡。',
    horn: '号角礁——形状像号角的礁石群。',
    conch: '海螺街——镇上最安静的街道，适合散步。',
  };
  function renderAtlas() {
    const grid = $('survival-atlas-grid');
    grid.textContent = '';
    const visited = window.BSSocial ? window.BSSocial.getVisited() : {};
    for (const [loc, intro] of Object.entries(ATLAS)) {
      const card = document.createElement('div');
      const on = Boolean(visited[loc]);
      card.className = 'survival-atlas-card' + (on ? ' is-on' : '');
      const title = document.createElement('b');
      title.textContent = on ? (LOC_NAMES[loc] || loc) : '？？？';
      const desc = document.createElement('p');
      desc.textContent = on ? intro : '还没去过，游过去看看。';
      card.append(title, desc);
      grid.appendChild(card);
    }
  }

  function openPhone(name) {
    showTab(name || 'quest');
    open($('survival-phone-overlay'));
    tabs[name || 'quest'].focus({ preventScroll: true });
  }

  function closePhone() {
    close($('survival-phone-overlay'));
    const callback = pendingReturn;
    pendingReturn = null;
    if (callback) callback();
  }

  function showReport(onClose) {
    pendingReturn = typeof onClose === 'function' ? onClose : null;
    openPhone('report');
  }

  function readWanted() {
    const wanted = call(quests, 'getWanted') ?? call(api, 'getWanted');
    if (typeof wanted === 'number') return Math.max(0, Math.min(5, wanted));
    return Math.max(0, Math.min(5, Number(pick(wanted, ['stars', 'value', 'count']) || 0)));
  }

  function renderWanted(animate) {
    const stars = readWanted();
    const nodes = $('survival-wanted').querySelectorAll('.survival-stars i');
    nodes.forEach((node, index) => node.classList.toggle('is-on', index < stars));
    if (animate && lastStars !== null && stars > lastStars) {
      $('survival-wanted').classList.remove('is-bump');
      void $('survival-wanted').offsetWidth;
      $('survival-wanted').classList.add('is-bump');
      const warning = WANTED_WARNINGS[5] && stars >= 5 ? WANTED_WARNINGS[5]
        : stars >= 3 ? WANTED_WARNINGS[3] : WANTED_WARNINGS[1];
      const line = $('survival-wanted-warn');
      line.textContent = warning;
      line.hidden = false;
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => { line.hidden = true; }, 4200);
    }
    lastStars = stars;
    return stars;
  }

  function renderReputation() {
    const rep = call(quests, 'getReputation') ?? call(api, 'getReputation') ?? {};
    const tier = pick(rep, ['tier', 'name', 'tierName']) || '无名小卒';
    text($('survival-rep-tier'), tier);
    $('survival-rep-bar').style.width = `${Math.max(0, Math.min(100, Number(pick(rep, ['value', 'progress']) || 0)))}%`;
    if (lastTier !== null && tier !== lastTier) toast(`声望升到${tier}。`);
    lastTier = tier;
    return { tier, value: pick(rep, ['value', 'progress']) || 0 };
  }

  function renderShield() {
    const shield = call(quests, 'getShields') ?? call(quests, 'getShield') ?? call(api, 'getShield')
      ?? pick(call(quests, 'getReportExtra') ?? {}, ['shield', 'shields'])
      ?? pick(call(api, 'getStats') ?? {}, ['shield', 'shields']) ?? 0;
    text($('survival-shield'), shield);
  }

  // —— 每日海况（DESIGN-v4 第 15 项）：与水下桥同一算法 ——
  const SEA_NAMES = { sunny: '晴（一切正常）', current: '暗流（停留任务耗时翻倍）', jelly: '水母潮（拾取刷新翻倍）' };
  function seaToday() {
    const d = new Date();
    const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ['sunny', 'current', 'jelly'][h % 3];
  }

  // —— 日期推进（DESIGN-v4 第 2、3 项）：起始日记录在 bs-start-date，偏移在 bs-day-offset ——
  const dayKeyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function dayIndex() {
    try {
      const today = dayKeyOf(new Date());
      let start = localStorage.getItem('bs-start-date');
      if (!start) { start = today; localStorage.setItem('bs-start-date', start); }
      const diff = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
      return Math.max(1, diff + 1);
    } catch { return 1; }
  }
  function renderDayBadge() {
    const extra = call(quests, 'getReportExtra') ?? {};
    const grade = pick(extra, ['grade']);
    const idx = dayIndex();
    text($('survival-day-badge'), idx <= 30 ? `第 ${idx}/30 天${grade ? ' · ' + grade : ''}` : `第 ${idx} 天${grade ? ' · ' + grade : ''}`);
  }

  function showSummary() {
    const report = api.getReport();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = dayKeyOf(yesterday);
    const yDay = (report.dailyBreakdown || []).find(day => day.date === yKey);
    text($('survival-sum-spent'), yDay ? `${money(yDay.totalSpent)}（${yDay.expenseCount} 笔）` : '无消费');
    text($('survival-sum-streak'), `${report.streak} 天`);
    text($('survival-sum-wanted'), `${readWanted()} 星`);
    const rep = call(quests, 'getReputation') ?? {};
    text($('survival-sum-rep'), `${pick(rep, ['tierName', 'tier']) || '无名小卒'}（${pick(rep, ['value']) || 0}）`);
    const event = call(quests, 'getDailyEvent');
    const v3event = event ? (v3Content.events || {})[event.id] || {} : {};
    text($('survival-sum-event'), event ? (v3event.title || event.title) : '—');
    text($('survival-sum-sea'), SEA_NAMES[seaToday()]);
    const sides = call(quests, 'getSide') ?? [];
    text($('survival-sum-side'), sides.length ? sides.map(s => (questLines.sideQuests || {})[s.id]?.title || s.title).join('、') : '—');
    open($('survival-summary'));
  }

  function sleepToNextDay() {
    const fade = $('survival-fade');
    const advance = () => {
      try {
        const off = (parseInt(localStorage.getItem('bs-day-offset') || '0', 10) || 0) + 1;
        localStorage.setItem('bs-day-offset', String(off));
        localStorage.setItem('bs-just-slept', '1');
      } catch { /* 存储不可用时仍重载 */ }
      try { location.reload(); } catch { fade.classList.remove('is-on'); fade.hidden = true; }
    };
    if (window.BSCutscene) {
      window.BSCutscene.play('sleep');
      setTimeout(advance, 1500);
      return;
    }
    fade.hidden = false;
    requestAnimationFrame(() => fade.classList.add('is-on'));
    setTimeout(advance, 420);
  }

  function refresh() {
    const stats = api.getStats();
    const derived = call(quests, 'getDerived');
    const hpValue = derived && Number.isFinite(derived.hp) ? derived.hp : stats.hp;
    const balanceValue = derived && Number.isFinite(derived.balance) ? derived.balance : stats.balance;
    const hp = $('survival-hp');
    hp.style.width = `${Math.max(0, Math.min(100, Number(hpValue) || 0))}%`;
    hp.classList.toggle('is-mid', hpValue <= 50 && hpValue >= 25);
    hp.classList.toggle('is-low', hpValue < 25);
    text($('survival-balance'), money(balanceValue));
    text($('survival-today'), `${money(stats.todaySpent)} / ${money(stats.dailyBudget)}`);
    text($('survival-streak'), stats.streak);
    renderWanted(false);
    renderReputation();
    renderShield();
    renderDayBadge();
    renderDebt();
    updateClosedHint();
  }

  // —— 破产紧急支线（DESIGN-v4 第 12 项）：余额 <0 后，完成任意 2 条支线解除 ——
  function renderDebt() {
    const box = $('survival-debt-box');
    if (!box) return;
    const derived = typeof quests.getDerived === 'function' ? call(quests, 'getDerived') : null;
    const extra = call(quests, 'getReportExtra') ?? {};
    const sideDone = extra.sideDoneTotal || 0;
    let debt = null;
    try { debt = JSON.parse(localStorage.getItem('bs-debt') || 'null'); } catch { /* 忽略 */ }
    if (derived && derived.balance < 0) {
      if (!debt) {
        debt = { since: sideDone };
        try { localStorage.setItem('bs-debt', JSON.stringify(debt)); } catch { /* 忽略 */ }
      }
      const done = sideDone - debt.since;
      if (done >= 2) {
        try { localStorage.removeItem('bs-debt'); } catch { /* 忽略 */ }
        box.hidden = true;
        toast('打工还债完成，债务状态解除！');
      } else {
        box.hidden = false;
        box.textContent = `破产了（余额 ${money(derived.balance)}）：打工还债中，完成任意支线 ${done}/2 后解除，期间别再大额消费。`;
      }
    } else {
      if (debt) { try { localStorage.removeItem('bs-debt'); } catch { /* 忽略 */ } }
      box.hidden = true;
    }
  }

  function showFeedback(feedback, amount) {
    const layer = $('survival-crit');
    const crit = feedback && feedback.crit;
    const anim = feedback && feedback.anim;
    layer.textContent = '';
    layer.classList.remove('is-flash', 'is-coin', 'is-sugar', 'is-income', 'is-quest');
    const line = document.createElement('div');
    line.className = 'survival-crit__line';
    line.textContent = crit === 'normal' || crit === 'none'
      ? `-${money(amount)}`
      : Array.isArray(feedback && feedback.messages) ? feedback.messages.join(' ') : '';
    layer.appendChild(line);
    if (crit === 'heavy' || crit === 'lethal' || anim === 'crit') layer.classList.add('is-flash');
    if (anim && anim !== 'none' && ['coin', 'sugar', 'income', 'quest'].includes(anim)) layer.classList.add('is-' + anim);
    if (anim === 'income') {
      $('survival-hp').classList.add('is-income');
      setTimeout(() => $('survival-hp').classList.remove('is-income'), 1200);
    }
    clearTimeout(critTimer);
    critTimer = setTimeout(() => {
      layer.textContent = '';
      layer.classList.remove('is-flash', 'is-coin', 'is-sugar', 'is-income', 'is-quest');
    }, 3200);
  }

  function renderReport() {
    const report = api.getReport();
    const derived = call(quests, 'getDerived');
    text($('survival-report-days'), report.dayNumber);
    text($('survival-report-hp'), derived && Number.isFinite(derived.hp) ? derived.hp : report.hp);
    text($('survival-report-achievements'), report.unlockedAchievements.length ? report.unlockedAchievements.join('、') : '—');
    text($('survival-report-streak'), `${report.streak} / ${report.longestStreak}`);
    let worst = null;
    for (const item of report.categoryBreakdown) {
      if (item.category === '食堂餐饮') continue;
      if (!worst || item.totalSpent > worst.totalSpent) worst = item;
    }
    text($('survival-report-category'), worst && worst.totalSpent > 0 ? `${worst.category}（${money(worst.totalSpent)}）` : '—');
    text($('survival-report-crits'), Object.keys(report.critCounts).map(key => `${key} ${report.critCounts[key]}`).join(' · '));

    const extra = call(quests, 'getReportExtra') ?? {};
    const grade = pick(extra, ['grade', 'rating', 'scoreGrade']);
    const score = pick(extra, ['score']);
    text($('survival-report-grade'), grade ? (score !== undefined ? `${grade}（${Math.round(Number(score))} 分）` : grade) : undefined);
    const tierRaw = pick(extra, ['reputationTier', 'tier', 'reputation']);
    text($('survival-report-rep'), typeof tierRaw === 'number' ? REP_TIER_NAMES[tierRaw] : tierRaw);
    text($('survival-report-wanted'), `${pick(extra, ['wantedStars', 'wanted', 'stars'])} 星`);
    text($('survival-report-main'), pick(extra, ['mainDone', 'mainCompleted', 'main']));
    text($('survival-report-side'), pick(extra, ['sideDoneTotal', 'sideDone', 'sideCompleted', 'side']));
  }

  function showDialog(npc, lines) {
    const box = $('survival-dialog');
    if (!box) return;
    box.textContent = '';
    if (!lines || !lines.length) { box.hidden = true; return; }
    const name = document.createElement('b');
    name.textContent = npc || '';
    box.appendChild(name);
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      box.appendChild(p);
    }
    box.hidden = false;
  }

  function questButton(action, id, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'survival-quest-btn';
    button.dataset.action = action;
    if (id) button.dataset.id = id;
    button.textContent = label;
    return button;
  }

  const LOC_NAMES = {
    diner: '蟹堡王', chum: '海之霸', neighbors: '邻居区', school: '航船学校',
    market: '贝壳超市', jellyfield: '水母田', cove: '海湾', ridge: '山脊',
    horn: '号角礁', street: '海螺街', conch: '海螺街',
  };
  function sideTargetName(item) {
    if (item.type === 'visit' && Array.isArray(item.locations)) {
      const loc = item.locations[Math.min((item.progress || {}).step || 0, item.locations.length - 1)];
      return LOC_NAMES[loc];
    }
    if (item.type === 'stay' || item.type === 'purchaseVisit') return LOC_NAMES[item.destination];
    if (item.type === 'choice') return LOC_NAMES[item.locId];
    return undefined;
  }

  function sideStatusText(item) {
    const progress = item.progress || {};
    switch (item.status) {
      case 'offered': return '未接取';
      case 'failed': return '已失败';
      case 'done': return item.claimed ? '已交付' : '已完成，待交付';
      case 'active': {
        const target = sideTargetName(item);
        const targetText = target ? ` · 去${target}` : '';
        if (item.type === 'visit' && Array.isArray(item.locations)) return `进行中 · 到访 ${progress.step || 0}/${item.locations.length}${targetText}`;
        if (item.type === 'stay') return `进行中 · 已停留 ${Math.floor(progress.seconds || 0)}/${item.seconds || 0} 秒${targetText}`;
        if (item.type === 'purchaseVisit') return `进行中 · 先消费再到访交付点${targetText}`;
        if (item.type === 'choice') return '进行中 · 等你抉择';
        return '进行中';
      }
      default: return item.status || '';
    }
  }

  function renderEventBox() {
    const box = $('survival-event-box');
    if (!box) return;
    box.textContent = '';
    const event = call(quests, 'getDailyEvent');
    if (!event) { box.textContent = '—'; return; }
    const v3event = (v3Content.events || {})[event.id] || {};
    const title = document.createElement('b');
    title.textContent = v3event.title || event.title || '—';
    const desc = document.createElement('span');
    desc.textContent = v3event.desc || event.desc || '';
    box.append(title, desc);
    const actions = document.createElement('div');
    actions.className = 'survival-quest-actions';
    if (event.id === 'plankton-trap' && event.status === 'active') {
      actions.append(
        questButton('event-go', null, v3event.goOption || '赴约'),
        questButton('event-refuse', null, v3event.refuseOption || '拒绝'),
      );
    } else if (event.status === 'done') {
      actions.append(questButton('event-claim', null, '领取奖励'));
    } else if (event.status === 'claimed') {
      const done = document.createElement('small');
      done.textContent = '今日已领取';
      actions.append(done);
    } else {
      const hint = document.createElement('small');
      hint.textContent = '进行中 · 在小镇里完成它';
      actions.append(hint);
    }
    box.appendChild(actions);
  }

  function renderQuests() {
    renderEventBox();
    const mainBox = $('survival-main-quest');
    mainBox.textContent = '';
    const main = call(quests, 'getMain');
    if (!main) {
      mainBox.textContent = '—';
    } else if (main.cleared || !main.current) {
      mainBox.textContent = `主线全清 ${main.doneCount}/${main.total} · 安居乐业`;
    } else {
      const title = document.createElement('b');
      title.textContent = main.current.title || '—';
      const desc = document.createElement('span');
      desc.textContent = main.current.desc || '';
      const status = document.createElement('small');
      const flavor = (questLines.mainQuests || {})[main.current.id];
      status.textContent = `进度 ${main.doneCount}/${main.total}` + (flavor ? ` · ${flavor}` : '');
      mainBox.append(title, desc, status);
    }

    const list = $('survival-side-list');
    list.textContent = '';
    const items = call(quests, 'getSide') ?? [];
    if (!items.length) list.textContent = '—';
    for (const item of items) {
      const lines = (questLines.sideQuests || {})[item.id] || {};
      const row = document.createElement('div');
      row.className = 'survival-side-item';
      const label = document.createElement('b');
      label.textContent = `${item.npc || lines.npc || ''} · ${lines.title || item.title || '—'}`;
      const state = document.createElement('small');
      state.textContent = sideStatusText(item);
      row.append(label, state);
      const desc = document.createElement('span');
      desc.textContent = item.status === 'active' && lines.progress ? lines.progress : (item.desc || '');
      row.appendChild(desc);
      const actions = document.createElement('div');
      actions.className = 'survival-quest-actions';
      if (item.status === 'offered') {
        actions.append(questButton('accept', item.id, '接取'));
      } else if (item.status === 'active' && item.type === 'choice') {
        actions.append(
          questButton('choice-accept', item.id, lines.acceptOption || '吃一支'),
          questButton('choice-reject', item.id, lines.rejectOption || '改天吧'),
        );
      } else if (item.status === 'done' && !item.claimed) {
        actions.append(questButton('claim', item.id, '交付'));
      }
      if (actions.childNodes.length) row.appendChild(actions);
      list.appendChild(row);
    }
  }

  function afterQuestAction() {
    refresh();
    renderQuests();
    renderEvent();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest ? event.target.closest('.survival-quest-btn') : null;
    if (!button) return;
    const { action, id } = button.dataset;
    const lines = (questLines.sideQuests || {})[id] || {};
    try {
      if (action === 'accept') {
        quests.acceptQuest(id);
        showDialog(lines.npc, splitLines(lines.accept));
      } else if (action === 'claim') {
        const result = quests.claimQuest(id);
        showDialog(lines.npc, splitLines(lines.done));
        sfx('quest');
        if (window.BSCutscene) window.BSCutscene.play('prize');
        const income = result && result.reward ? result.reward.income : 0;
        const shield = result && result.reward ? result.reward.shield : 0;
        if (income > 0) toast(`任务交付：+${money(income)}`);
        else if (shield > 0) toast(`任务交付：护盾 +${shield}`);
      } else if (action === 'choice-accept' || action === 'choice-reject') {
        quests.chooseOption(id, action === 'choice-accept' ? 'accept' : 'reject');
        showDialog(lines.npc, splitLines(lines.done));
      } else if (action === 'event-go' || action === 'event-refuse') {
        quests.chooseEventOption(action === 'event-go' ? 'go' : 'refuse');
        toast(action === 'event-go' ? '已赴约：今天在海之霸消费一次即可完成。' : '已拒绝：护盾 +1。');
      } else if (action === 'event-claim') {
        const result = quests.claimEvent();
        const income = result && result.reward ? result.reward.income : 0;
        toast(income > 0 ? `事件奖励：+${money(income)}` : '事件奖励已领取。');
      }
    } catch (error) {
      toast(error && error.message ? error.message : '操作失败');
    }
    afterQuestAction();
  });

  function renderAchievements() {
    const unlocked = new Set((call(api, 'getReport')?.unlockedAchievements) || (call(api, 'getStats')?.unlockedAchievements) || []);
    const all = [...Object.keys(contentAchievements), ...Object.keys(BUILTIN_ACHIEVEMENTS)];
    const names = [...new Set(all)].slice(0, 24);
    const grid = $('survival-achievement-grid');
    grid.textContent = '';
    for (const name of names) {
      const cell = document.createElement('div');
      const on = unlocked.has(name);
      cell.className = 'survival-achievement' + (on ? ' is-unlocked' : '');
      cell.title = on ? (contentAchievements[name] || BUILTIN_ACHIEVEMENTS[name] || name) : '未解锁';
      const mark = document.createElement('span');
      mark.className = 'survival-achievement__mark';
      mark.textContent = on ? '★' : '☆';
      const label = document.createElement('span');
      label.textContent = name;
      cell.append(mark, label);
      grid.appendChild(cell);
    }
  }

  function renderEvent() {
    const event = call(quests, 'getDailyEvent');
    const banner = $('survival-event-banner');
    if (!event) { banner.hidden = true; return; }
    const v3event = (v3Content.events || {})[event.id] || {};
    text($('survival-event-title'), v3event.title || pick(event, ['title', 'name']));
    text($('survival-event-desc'), v3event.desc || pick(event, ['desc', 'description']));
    const status = pick(event, ['status', 'state']);
    const claimable = status === 'done';
    banner.classList.toggle('is-claimable', claimable);
    $('survival-event-claim-hint').hidden = !claimable;
    $('survival-event-claim-hint').textContent = status === 'claimed' ? '今日奖励已领取' : '点击交付事件';
    banner.dataset.eventId = pick(event, ['id', 'key']) || '';
    banner.hidden = false;
  }

  function updateClosedHint() {
    const checked = document.querySelector('input[name="survival-category"]:checked');
    const place = checked ? CATEGORY_PLACE[checked.value] : undefined;
    let closed = false;
    if (place && typeof quests.isOpen === 'function') {
      closed = call(quests, 'isOpen', place) === false;
    }
    $('survival-closed-hint').hidden = !closed;
  }

  function needSetup() {
    const state = api.load();
    return !state.playerName && state.expenses.length === 0;
  }
  function showSetup() {
    if (!$('survival-setup').hidden) return;
    setupPending = true;
    open($('survival-setup'));
    $('survival-player').focus({ preventScroll: true });
  }
  function finishSetup() {
    const state = api.load();
    const checked = document.querySelector('input[name="survival-budget"]:checked');
    state.monthlyBudget = Number(checked ? checked.value : 1500);
    state.playerName = $('survival-player').value.trim();
    if (!state.playerName) { $('survival-player').focus({ preventScroll: true }); return; }
    api.save(state);
    setupPending = false;
    close($('survival-setup'));
    let introSeen = false;
    try { introSeen = localStorage.getItem('bs-intro-seen') === '1'; } catch { /* 忽略 */ }
    if (!introSeen) open($('survival-intro'));
    refresh();
  }
  function afterIntro(callback) {
    const intro = $('studio-intro');
    const done = () => !intro || ['done', 'fading', 'error', 'waiting'].includes(intro.dataset.phase);
    if (done()) { callback(); return; }
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      observer.disconnect();
      clearTimeout(timer);
      callback();
    };
    const observer = new MutationObserver(() => { if (done()) finish(); });
    observer.observe(intro, { attributes: true, attributeFilter: ['data-phase'] });
    observer.observe(document.body, { childList: true });
    const timer = setTimeout(finish, 6000);
  }

  // —— 声音：BGM（片尾曲循环）+ WebAudio 合成轻音效，共用一个开关 ——
  let soundOn = true;
  try { soundOn = localStorage.getItem('bs-sound') !== 'off'; } catch { /* 忽略 */ }
  const bgm = new Audio('./survival/audio/bgm.mp3');
  bgm.loop = true;
  bgm.volume = 0.32;
  let bgmStarted = false;
  function syncSoundBtn() { $('survival-sound-btn').textContent = soundOn ? '声音：开' : '声音：关'; }
  function startBgm() {
    if (bgmStarted || !soundOn) return;
    bgmStarted = true;
    bgm.play().catch(() => { bgmStarted = false; });
  }
  window.addEventListener('pointerdown', startBgm, { once: false });
  let audioCtx = null;
  function tone(freq, delay, dur, type = 'sine', vol = 0.045) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch { /* 音效失败不影响玩法 */ }
  }
  function sfx(name) {
    if (name === 'coin') { tone(880, 0, 0.12); tone(1318, 0.09, 0.18); }
    else if (name === 'crit') { tone(220, 0, 0.25, 'sawtooth', 0.05); tone(110, 0.05, 0.3, 'sawtooth', 0.04); }
    else if (name === 'quest') { tone(659, 0, 0.12); tone(880, 0.1, 0.12); tone(990, 0.2, 0.2); }
  }
  $('survival-sound-btn').addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('bs-sound', soundOn ? 'on' : 'off'); } catch { /* 忽略 */ }
    if (soundOn) startBgm();
    else bgm.pause();
    syncSoundBtn();
  });
  syncSoundBtn();

  const CUTSCENE_BY_CATEGORY = { '食堂餐饮': 'eat', '奶茶零食': 'ice', '超市日用': 'shop' };
  const MAIN_PLACE = { '食堂餐饮': 'diner', '超市日用': 'market', '学习打印': 'school', '娱乐社交': 'chum' };

  // 统一记账入口：表单与快捷按钮共用。到店记账（主线）在这一层拦截。
  function recordExpense({ amount, category, note }) {
    const main = call(quests, 'getMain');
    if (main && main.current && main.current.type === 'spend'
      && main.current.category === category && amount >= main.current.amount) {
      const needLoc = MAIN_PLACE[category];
      const near = window.__bsNearPlace;
      if (needLoc && !(near && near.loc === needLoc && Date.now() - near.at < 90000)) {
        toast(`主线要到店消费：先游到${LOC_NAMES[needLoc]}附近，再记这笔`);
        return null;
      }
    }
    const place = CATEGORY_PLACE[category];
    const wasClosed = place && typeof quests.isOpen === 'function' ? call(quests, 'isOpen', place) === false : false;
    const addExpense = typeof quests.addExpense === 'function' ? quests.addExpense : api.addExpense;
    const result = addExpense({ amount, category, note });
    if (place === 'chum' && typeof quests.markChumSpent === 'function') {
      call(quests, 'markChumSpent');
      call(quests, 'addWanted', 'chum');
    } else if (wasClosed && typeof quests.addWanted === 'function') {
      call(quests, 'addWanted', 'after-hours');
    }
    renderWanted(true);
    refresh();
    renderQuests();
    showFeedback(result.feedback, amount);
    const anim = result.feedback && result.feedback.anim;
    const crit = result.feedback && result.feedback.crit;
    if (anim === 'income' || anim === 'coin') sfx('coin');
    else if (crit === 'heavy' || crit === 'lethal' || anim === 'crit' || anim === 'sugar') sfx('crit');
    const scene = CUTSCENE_BY_CATEGORY[category];
    if (scene && window.BSCutscene) window.BSCutscene.play(scene);
    return result;
  }

  $('survival-form').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('survival-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) { $('survival-amount').focus({ preventScroll: true }); return; }
    const checked = document.querySelector('input[name="survival-category"]:checked');
    const result = recordExpense({
      amount,
      category: checked ? checked.value : '食堂餐饮',
      note: $('survival-note').value,
    });
    if (!result) return;
    $('survival-form').reset();
    updateClosedHint();
    close($('survival-modal'));
  });
  $('survival-quick').addEventListener('click', event => {
    const button = event.target.closest ? event.target.closest('[data-quick]') : null;
    if (!button) return;
    const [category, amount, note] = button.dataset.quick.split('|');
    recordExpense({ amount: Number(amount), category, note });
  });
  host.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => close($(button.dataset.close)));
  });
  $('survival-add-btn').addEventListener('click', () => {
    open($('survival-modal'));
    updateClosedHint();
    $('survival-amount').focus({ preventScroll: true });
  });
  host.querySelectorAll('input[name="survival-category"]').forEach(radio => {
    radio.addEventListener('change', updateClosedHint);
  });

  $('survival-task-btn').addEventListener('click', () => openPhone('quest'));
  $('survival-report-btn').addEventListener('click', () => openPhone('report'));
  $('survival-phone-btn').addEventListener('click', () => openPhone(activeTab));
  $('survival-phone-close').addEventListener('click', closePhone);
  $('survival-report-close').addEventListener('click', closePhone);
  for (const key of Object.keys(tabs)) tabs[key].addEventListener('click', () => showTab(key));
  $('survival-start').addEventListener('click', finishSetup);
  $('survival-sleep').addEventListener('click', sleepToNextDay);
  $('survival-summary-close').addEventListener('click', () => close($('survival-summary')));
  $('survival-demo-mode').addEventListener('click', () => {
    api.reset();
    const demo = api.generateDemoData();
    if (typeof quests.seedDemo === 'function') call(quests, 'seedDemo', demo);
    try {
      const d = new Date();
      d.setDate(d.getDate() - 11);
      localStorage.setItem('bs-start-date', dayKeyOf(d));
    } catch { /* 忽略 */ }
    refresh();
    renderQuests();
    renderReport();
    toast('已载入第 12 天演示存档');
  });
  // —— 存档导出/导入码（DESIGN-v4 第 20 项）——
  $('survival-export').addEventListener('click', () => {
    try {
      const payload = {
        main: localStorage.getItem('budget-survivor-state-v1'),
        social: localStorage.getItem('budget-survivor-social-v1'),
        offset: localStorage.getItem('bs-day-offset'),
        start: localStorage.getItem('bs-start-date'),
      };
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      window.prompt('复制你的存档码（换设备时用「导入存档码」粘贴）：', code);
    } catch { toast('导出失败'); }
  });
  $('survival-import').addEventListener('click', () => {
    const code = window.prompt('粘贴存档码：');
    if (!code) return;
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (payload.main) localStorage.setItem('budget-survivor-state-v1', payload.main);
      if (payload.social) localStorage.setItem('budget-survivor-social-v1', payload.social);
      if (payload.offset) localStorage.setItem('bs-day-offset', payload.offset);
      if (payload.start) localStorage.setItem('bs-start-date', payload.start);
      location.reload();
    } catch { toast('存档码无效，导入失败'); }
  });

  // —— 战报分享卡（DESIGN-v4 第 19 项）：canvas 合成海报 + 评级 ——
  $('survival-share-card').addEventListener('click', () => {
    const extra = call(quests, 'getReportExtra') ?? {};
    const derived = typeof quests.getDerived === 'function' ? call(quests, 'getDerived') : {};
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 840;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d2b38';
    ctx.fillRect(0, 0, 640, 840);
    const poster = new Image();
    poster.onload = () => {
      ctx.drawImage(poster, 0, 0, 640, 470);
      drawCardText();
    };
    poster.onerror = drawCardText;
    poster.src = './survival/img/poster-main.png';
    function drawCardText() {
      ctx.fillStyle = '#ffb703';
      ctx.font = '700 92px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`立足评级 ${extra.grade || 'D'}`, 320, 590);
      ctx.fillStyle = '#e8f4f8';
      ctx.font = '28px sans-serif';
      ctx.fillText(`第 ${dayIndex()} 天 · 声望 ${extra.score != null ? Math.round(extra.score) : 0} 分`, 320, 650);
      ctx.fillText(`主线 ${extra.mainDone || 0}/12 · 支线累计 ${extra.sideDoneTotal || 0} · 通缉 ${extra.wantedStars || 0} 星`, 320, 700);
      ctx.fillText(`余额 ${money((derived && derived.balance) || 0)}`, 320, 750);
      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#8fb8c8';
      ctx.fillText('1500 生存季 × 比奇堡', 320, 805);
      const link = document.createElement('a');
      link.download = 'survival-report-card.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('分享图已生成');
    }
  });

  // —— 新手教程（可跳过、可重看：战报页有「新手教程」按钮） ——
  const TUTORIAL_STEPS = [
    { img: './survival/img/tutorial/comic-1.png', fb: './survival/img/npc/spongebob-normal.png', cap: '欢迎来到比奇堡！带 ¥1500，立足 30 天，月底评级冲 S！' },
    { img: './survival/img/tutorial/town-street.webp', cap: '点木牌下潜进小镇：摇杆 / WASD 移动，跟着金色箭头找任务。' },
    { img: './survival/img/tutorial/comic-2.png', fb: './survival/img/npc/krabs-normal.png', cap: '花一笔记一笔：余额就是 HP，大额消费会暴击！' },
    { img: './survival/img/tutorial/comic-3.png', fb: './survival/img/npc/patrick-normal.png', cap: '靠近 NPC 点「聊天」，接支线、攒声望、赚外快。' },
    { img: './survival/img/tutorial/comic-5.png', fb: './survival/img/anim/phone-2.png', cap: '海螺手机里有任务、账本、地图、图鉴和战报。' },
    { img: './survival/img/anim/sleep-2.png', cap: '回菠萝屋睡觉推进一天。别破产，破产有紧急支线！' },
  ];
  let tutorialIndex = 0;
  function renderTutorial() {
    const step = TUTORIAL_STEPS[tutorialIndex];
    $('survival-tutorial-step').textContent = `第 ${tutorialIndex + 1} 格 / ${TUTORIAL_STEPS.length}`;
    const img = $('survival-tutorial-img');
    img.onerror = () => { img.onerror = null; if (step.fb) img.src = step.fb; };
    img.src = step.img;
    $('survival-tutorial-cap').textContent = step.cap;
    $('survival-tutorial-prev').disabled = tutorialIndex === 0;
    $('survival-tutorial-next').textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? '开始游戏' : '下一格';
  }
  function openTutorial() { tutorialIndex = 0; renderTutorial(); open($('survival-tutorial')); }
  function closeTutorial() {
    try { localStorage.setItem('bs-tutorial-done', '1'); } catch { /* 忽略 */ }
    close($('survival-tutorial'));
  }
  $('survival-tutorial-next').addEventListener('click', () => {
    if (tutorialIndex < TUTORIAL_STEPS.length - 1) { tutorialIndex += 1; renderTutorial(); }
    else closeTutorial();
  });
  $('survival-tutorial-prev').addEventListener('click', () => {
    if (tutorialIndex > 0) { tutorialIndex -= 1; renderTutorial(); }
  });
  $('survival-tutorial-skip').addEventListener('click', closeTutorial);
  $('survival-report-tutorial').addEventListener('click', openTutorial);

  $('survival-intro-start').addEventListener('click', () => {
    try { localStorage.setItem('bs-intro-seen', '1'); } catch { /* 忽略 */ }
    close($('survival-intro'));
    let tutorialDone = false;
    try { tutorialDone = localStorage.getItem('bs-tutorial-done') === '1'; } catch { /* 忽略 */ }
    if (!tutorialDone) openTutorial();
    else if (window.BSCutscene) window.BSCutscene.play('phone');
  });
  $('survival-report-demo').addEventListener('click', () => {
    const demo = api.generateDemoData();
    if (typeof quests.seedDemo === 'function') quests.seedDemo(demo);
    else api.save(demo);
    refresh();
    renderReport();
    renderQuests();
  });
  $('survival-report-reset').addEventListener('click', () => {
    api.reset();
    refresh();
    renderReport();
  });

  $('survival-event-close').addEventListener('click', event => {
    event.stopPropagation();
    $('survival-event-banner').hidden = true;
  });
  $('survival-event-banner').addEventListener('click', () => {
    if (!$('survival-event-banner').classList.contains('is-claimable')) return;
    if (typeof quests.claimEvent !== 'function') return;
    try {
      const result = quests.claimEvent();
      const income = result && result.reward ? result.reward.income : 0;
      if (income > 0) toast(`事件奖励：+${money(income)}`);
    } catch (error) {
      toast(error && error.message ? error.message : '事件尚未完成');
    }
    refresh();
    renderEvent();
    renderQuests();
  });
  const scene = document.querySelector('.seascape');
  if (scene) {
    const observer = new MutationObserver(() => {
      const shallow = scene.dataset.scene === 'shallow';
      document.body.classList.toggle('survival-underwater', shallow);
      if (shallow) renderEvent();
      else $('survival-event-banner').hidden = true;
    });
    observer.observe(scene, { attributes: true, attributeFilter: ['data-scene'] });
  }

  $('survival-tour-btn').addEventListener('click', () => {
    const button = $('survival-tour-btn');
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    const frame = $('dive-view');
    frame?.contentWindow?.postMessage({ type: 'bikini-tour-toggle', on }, location.origin);
  });

  const joystick = $('survival-joystick');
  const knob = $('survival-joystick-knob');
  let pointerId = null;
  function postJoystick(x, y) {
    const frame = $('dive-view');
    frame?.contentWindow?.postMessage({ type: 'bikini-joystick', x, y }, location.origin);
  }
  function resetJoystick() {
    pointerId = null;
    knob.style.transform = '';
    postJoystick(0, 0);
  }
  joystick.addEventListener('pointerdown', event => {
    pointerId = event.pointerId;
    joystick.setPointerCapture(pointerId);
    event.preventDefault();
  });
  joystick.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    const rect = joystick.getBoundingClientRect();
    const dx = Math.max(-36, Math.min(36, event.clientX - rect.left - rect.width / 2));
    const dy = Math.max(-36, Math.min(36, event.clientY - rect.top - rect.height / 2));
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    postJoystick(Number((dx / 36).toFixed(2)), Number((-dy / 36).toFixed(2)));
  });
  joystick.addEventListener('pointerup', resetJoystick);
  joystick.addEventListener('pointercancel', resetJoystick);

  let replaying = false;
  window.addEventListener('message', event => {
    if (replaying) { replaying = false; return; }
    if (event.origin !== location.origin) return;
    const frame = $('dive-view');
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === 'bikini-dive-return') {
      event.stopImmediatePropagation();
      showReport(() => {
        replaying = true;
        window.dispatchEvent(new MessageEvent('message', {
          data: event.data,
          origin: event.origin,
          source: event.source,
          lastEventId: event.lastEventId,
          ports: event.ports,
        }));
      });
    }
  }, true);

  const canvas = $('ocean');
  if (canvas) {
    ['pointerdown', 'keydown'].forEach(type => {
      canvas.addEventListener(type, event => {
        if (!setupPending && !anyOpen()) return;
        event.stopImmediatePropagation();
        event.preventDefault();
      }, true);
    });
  }

  window.SurvivalHUD = {
    refresh,
    openPhone,
    openReport: showReport,
    openSetup: showSetup,
    canDive: () => !setupPending && $('survival-setup').hidden,
    gateDive(factory) {
      return (...args) => {
        const transition = factory(...args);
        if (!transition || typeof transition.begin !== 'function') return transition;
        const begin = transition.begin.bind(transition);
        transition.begin = direction => {
          if ((!direction || direction === 'down') && !window.SurvivalHUD.canDive()) {
            if (needSetup()) showSetup();
            return false;
          }
          return begin(direction);
        };
        return transition;
      };
    },
  };

  // —— 拾取与抓水母（DESIGN-v4 第 16、17 项）：桥触发，父页结算 ——
  let jellyTimer = null;
  let jellySpawn = null;
  function endJellyGame(finished) {
    if (jellyTimer) clearInterval(jellyTimer);
    if (jellySpawn) clearInterval(jellySpawn);
    jellyTimer = jellySpawn = null;
    close($('survival-jelly'));
    if (!finished) return;
    const count = Number($('survival-jelly-count').textContent) || 0;
    try { localStorage.setItem('bs-jelly-day', dayKeyOf(new Date())); } catch { /* 忽略 */ }
    if (count >= 8) { call(quests, 'addReputation', 3, 'jelly-game'); toast(`抓到 ${count} 只水母！声望 +3`); }
    else if (count >= 4) { call(quests, 'addReputation', 1, 'jelly-game'); toast(`抓到 ${count} 只水母，声望 +1`); }
    else toast(`抓到 ${count} 只水母，下次加油`);
    sfx('quest');
    refresh();
  }
  function startJellyGame() {
    try {
      if (localStorage.getItem('bs-jelly-day') === dayKeyOf(new Date())) return;
    } catch { /* 忽略 */ }
    if (anyOpen()) return;
    const field = $('survival-jelly-field');
    field.textContent = '';
    $('survival-jelly-count').textContent = '0';
    $('survival-jelly-time').textContent = '20';
    open($('survival-jelly'));
    let remain = 20;
    jellyTimer = setInterval(() => {
      remain -= 1;
      $('survival-jelly-time').textContent = String(Math.max(0, remain));
      if (remain <= 0) endJellyGame(true);
    }, 1000);
    const spawn = () => {
      if (field.childNodes.length >= 5) return;
      const jelly = document.createElement('button');
      jelly.type = 'button';
      jelly.className = 'survival-jelly-item';
      jelly.setAttribute('aria-label', '水母');
      jelly.style.left = `${5 + Math.random() * 85}%`;
      jelly.style.top = `${5 + Math.random() * 75}%`;
      jelly.addEventListener('click', () => {
        $('survival-jelly-count').textContent = String((Number($('survival-jelly-count').textContent) || 0) + 1);
        tone(1200, 0, 0.08, 'sine', 0.03);
        jelly.remove();
      });
      field.appendChild(jelly);
      setTimeout(() => jelly.remove(), 2600);
    };
    spawn();
    jellySpawn = setInterval(spawn, 650);
  }
  $('survival-jelly-quit').addEventListener('click', () => endJellyGame(false));

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const frame = $('dive-view');
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'bikini-pickup') {
      try {
        const key = 'budget-survivor-social-v1';
        const social = JSON.parse(localStorage.getItem(key) || '{}');
        social.pickups = social.pickups || {};
        const day = dayKeyOf(new Date());
        social.pickups[day] = (social.pickups[day] || 0) + 1;
        localStorage.setItem(key, JSON.stringify(social));
        if (social.pickups[day] <= 5) {
          call(quests, 'addReputation', 1, 'pickup');
          toast('拾取成功：声望 +1');
        } else {
          toast('拾取成功（今日声望已达上限）');
        }
        sfx('coin');
        refresh();
      } catch { /* 忽略 */ }
    } else if (data.type === 'bikini-jellygame') {
      startJellyGame();
    }
  });


  // —— v5 任务引导：目标卡 + 给水下桥发导航（光路/感叹号/提示框）+ 任务动画 ——
  const CLIP_FOR = {
    'side:krabs-secret': 'clip-d', 'side:patrick-icecream': 'clip-e', 'side:squidward-reed': 'clip-g',
    'faction:k6': 'clip-b', 'faction:p6': 'clip-c',
  };
  const NPC_ANCHOR = { crab: 'diner', diner: 'diner', neighbors: 'neighbors', treehouse: 'cove', school: 'school' };
  const PLACE_CN = { diner: '蟹堡王', chum: '海之霸', neighbors: '邻居区', street: '镇中心', school: '航船学校', market: '贝壳超市', cove: '海湾', ridge: '山脊', horn: '号角礁', conch: '菠萝屋', jellyfield: '水母田' };
  const MAIN_GUIDE = { 'first-meal': 'diner', 'snail-food': 'market', 'jelly-net': 'market', 'tuition': 'school', 'roof': 'market' };
  const objectiveCard = document.createElement('div');
  objectiveCard.id = 'survival-objective';
  objectiveCard.hidden = true;
  objectiveCard.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:55;'
    + 'background:rgba(10,35,45,.85);color:#ffe9a8;border:1px solid rgba(255,183,3,.55);border-radius:999px;'
    + 'padding:6px 16px;font:600 13px/1.5 system-ui,sans-serif;pointer-events:none;max-width:92vw;text-align:center;';
  document.body.appendChild(objectiveCard);
  const clipOverlay = document.createElement('div');
  clipOverlay.hidden = true;
  clipOverlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:#000;display:flex;align-items:center;justify-content:center;';
  clipOverlay.innerHTML = '<video id="survival-clip-video" style="width:100%;height:100%;object-fit:contain" playsinline></video>'
    + '<button type="button" id="survival-clip-skip" style="position:absolute;right:18px;bottom:18px;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:8px 18px;font:600 14px system-ui">跳过 ▸</button>';
  document.body.appendChild(clipOverlay);
  const clipVideo = clipOverlay.querySelector('#survival-clip-video');
  let clipPlaying = false;
  function endClip() {
    if (!clipPlaying) return;
    clipPlaying = false;
    try { clipVideo.pause(); } catch { /* 忽略 */ }
    clipOverlay.hidden = true;
    clipVideo.removeAttribute('src');
    try { clipVideo.load(); } catch { /* 忽略 */ }
  }
  function playClip(file) {
    if (clipPlaying) return;
    clipPlaying = true;
    clipOverlay.hidden = false;
    clipVideo.src = `survival/video/${file}.mp4`;
    try {
      const p = clipVideo.play();
      if (p && p.catch) p.catch(() => endClip());
    } catch { endClip(); }
  }
  clipVideo.addEventListener('ended', endClip);
  clipVideo.addEventListener('error', endClip);
  clipOverlay.querySelector('#survival-clip-skip').addEventListener('click', endClip);
  function todayKeyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function computeGuide() {
    try {
      const sg = window.BSSocial && window.BSSocial.getGuide && window.BSSocial.getGuide();
      if (sg) return { ...sg, source: 'faction' };
      const q = window.BudgetQuests;
      if (!q || !q.getSide) return null;
      const sides = q.getSide();
      for (const item of sides) {
        if (item.status === 'done') {
          return { source: 'side', kind: 'claim', id: item.id, questName: item.title, loc: NPC_ANCHOR[item.locId] || 'neighbors', label: `回去找${item.npc}交付` };
        }
      }
      for (const item of sides) {
        if (item.status !== 'active') continue;
        if (item.type === 'visit') {
          const loc = item.locations[item.progress.step];
          if (loc) return { source: 'side', kind: 'go', id: item.id, questName: item.title, loc, label: `前往${PLACE_CN[loc] || loc}（第 ${item.progress.step + 1}/${item.locations.length} 站）` };
        } else if (item.type === 'stay') {
          return { source: 'side', kind: 'go', id: item.id, questName: item.title, loc: item.destination, label: `在${PLACE_CN[item.destination] || item.destination}停留 ${item.seconds} 秒（已 ${Math.floor(item.progress.seconds)} 秒）` };
        } else if (item.type === 'purchaseVisit') {
          let bought = false;
          try {
            const raw = JSON.parse(localStorage.getItem('budget-survivor-state-v1') || '{}');
            bought = (raw.expenses || []).some(e => e.date === todayKeyLocal() && e.category === item.category && Number(e.amount) >= item.amount);
          } catch { /* 忽略 */ }
          return bought
            ? { source: 'side', kind: 'go', id: item.id, questName: item.title, loc: item.destination, label: `去${PLACE_CN[item.destination] || item.destination}找${item.npc}` }
            : { source: 'side', kind: 'go', id: item.id, questName: item.title, loc: 'market', label: `先去超市买一份 ≥¥${item.amount} 的${item.category}并记账` };
        }
      }
      const main = q.getMain && q.getMain();
      if (main && main.current) {
        return { source: 'main', kind: 'info', id: main.current.id, questName: main.current.title, loc: MAIN_GUIDE[main.current.id] || null, label: main.current.desc };
      }
    } catch { /* 忽略 */ }
    return null;
  }
  let lastGuideJson = '';
  let lastMainDone = null;
  function guideTick() {
    try {
      const sp = window.BSSocial && window.BSSocial.consumeSpecial && window.BSSocial.consumeSpecial();
      if (sp === 'squidward-max') playClip('clip-f');
    } catch { /* 忽略 */ }
    try {
      const q = window.BudgetQuests;
      if (q && q.getMain && q.MAIN_QUESTS) {
        const dc = q.getMain().doneCount;
        if (lastMainDone === null) lastMainDone = dc;
        else if (dc > lastMainDone) {
          const doneQuest = q.MAIN_QUESTS[dc - 1];
          lastMainDone = dc;
          if (doneQuest && doneQuest.id === 'first-meal') playClip('clip-a');
        }
      }
    } catch { /* 忽略 */ }
    const guide = computeGuide();
    const json = JSON.stringify(guide);
    if (json !== lastGuideJson) {
      lastGuideJson = json;
      const frame = $('dive-view');
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'bikini-guide', guide }, location.origin);
    }
    if (guide) {
      objectiveCard.hidden = false;
      objectiveCard.textContent = `当前目标 · ${guide.questName}：${guide.label}`;
    } else objectiveCard.hidden = true;
  }
  setInterval(guideTick, 1500);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const frame = $('dive-view');
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.type !== 'bikini-quest-action') return;
    const guide = computeGuide();
    if (!guide) return;
    if (data.action === 'arrive') {
      const clip = CLIP_FOR[`${guide.source}:${guide.questId || guide.id}`];
      if (clip) playClip(clip);
    } else if (data.action === 'claim') {
      if (guide.source === 'side' && guide.kind === 'claim') {
        try { window.BudgetQuests.claimQuest(guide.id); } catch { /* 忽略 */ }
        refresh();
      } else if (guide.source === 'faction' && guide.kind === 'claim' && window.BSSocial) {
        window.BSSocial.openNpc(guide.boss);
      }
    }
  });

  refresh();
  afterIntro(() => {
    if (needSetup()) { showSetup(); return; }
    let justSlept = false;
    try {
      justSlept = localStorage.getItem('bs-just-slept') === '1';
      if (justSlept) localStorage.removeItem('bs-just-slept');
    } catch { /* 忽略 */ }
    if (justSlept) showSummary();
  });
})();
