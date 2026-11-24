/* 1500 生存季 × bikini-bottom-shawn 融合版 —— R2 任务 UI + v3 追加（父页面专用）
 * 只做界面与接线：数值只从 window.BudgetSurvivor / window.BudgetQuests 读取，
 * 不写玩法计算、不改任何原项目文件。用法：index.html 中在本文件之前引入 survival-logic.js。
 */
(() => {
  'use strict';

  const script = document.currentScript;
  const base = script ? new URL('.', script.src) : new URL('./survival/', location.href);
  const cssUrl = new URL('survival-hud.css', base).href;
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
          </nav>
          <div class="survival-phone__pages">
            <section id="survival-task-panel" class="survival-phone__page" role="tabpanel">
              <h3 class="survival-panel__title">当前主线</h3>
              <div id="survival-main-quest" class="survival-quest"></div>
              <h3 class="survival-panel__title">每日支线</h3>
              <div id="survival-side-list" class="survival-side-list"></div>
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
                <button id="survival-report-demo" type="button">一键填充演示数据</button>
                <button id="survival-report-reset" type="button">重置存档</button>
                <button id="survival-report-close" type="button" class="survival-primary">关闭</button>
              </div>
            </section>
            <section id="survival-phone-achievement" class="survival-phone__page" role="tabpanel" hidden>
              <h3 class="survival-panel__title">成就（24）</h3>
              <div id="survival-achievement-grid" class="survival-achievement-grid"></div>
            </section>
          </div>
          <div class="survival-phone__home"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  const overlays = [$('survival-modal'), $('survival-setup'), $('survival-phone-overlay')];
  const tabs = {
    quest: $('survival-tab-quest'),
    report: $('survival-tab-report'),
    achievement: $('survival-tab-achievement'),
  };
  const pages = {
    quest: $('survival-task-panel'),
    report: $('survival-report'),
    achievement: $('survival-phone-achievement'),
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
    const shield = call(quests, 'getShield') ?? call(api, 'getShield')
      ?? pick(call(quests, 'getReportExtra') ?? {}, ['shield', 'shields'])
      ?? pick(call(api, 'getStats') ?? {}, ['shield', 'shields']) ?? 0;
    text($('survival-shield'), shield);
  }

  function refresh() {
    const stats = api.getStats();
    const hp = $('survival-hp');
    hp.style.width = `${Math.max(0, Math.min(100, Number(stats.hp) || 0))}%`;
    hp.classList.toggle('is-mid', stats.hp <= 50 && stats.hp >= 25);
    hp.classList.toggle('is-low', stats.hp < 25);
    text($('survival-balance'), money(stats.balance));
    text($('survival-today'), `${money(stats.todaySpent)} / ${money(stats.dailyBudget)}`);
    text($('survival-streak'), stats.streak);
    renderWanted(false);
    renderReputation();
    renderShield();
    updateClosedHint();
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
    text($('survival-report-days'), report.dayNumber);
    text($('survival-report-hp'), report.hp);
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
    text($('survival-report-grade'), pick(extra, ['grade', 'rating', 'scoreGrade']));
    text($('survival-report-rep'), pick(extra, ['reputationTier', 'tier', 'reputation']));
    text($('survival-report-wanted'), `${pick(extra, ['wantedStars', 'wanted', 'stars'])} 星`);
    text($('survival-report-main'), pick(extra, ['mainDone', 'mainCompleted', 'main']));
    text($('survival-report-side'), pick(extra, ['sideDone', 'sideCompleted', 'side']));
  }

  function renderQuests() {
    const data = call(quests, 'getQuests') ?? call(api, 'getQuests') ?? {};
    const main = pick(data, ['main', 'current', 'mainQuest']) ?? call(quests, 'getMainQuest');
    const mainBox = $('survival-main-quest');
    mainBox.textContent = '';
    if (!main) {
      mainBox.textContent = '—';
    } else if (typeof main === 'string') {
      mainBox.textContent = main;
    } else {
      const title = document.createElement('b');
      title.textContent = pick(main, ['title', 'name']) || '—';
      const desc = document.createElement('span');
      desc.textContent = pick(main, ['desc', 'description', 'progress']) || '';
      const status = document.createElement('small');
      status.textContent = pick(main, ['status', 'state']) || '';
      mainBox.append(title, desc, status);
    }
    const side = pick(data, ['side', 'sides', 'sideQuests']) ?? call(quests, 'getSide') ?? [];
    const list = $('survival-side-list');
    list.textContent = '';
    const items = Array.isArray(side) ? side : [];
    if (!items.length) list.textContent = '—';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'survival-side-item';
      const name = typeof item === 'string' ? item : pick(item, ['title', 'name']) || '—';
      const status = typeof item === 'string' ? '' : pick(item, ['status', 'state', 'progress']) || '';
      const label = document.createElement('b');
      label.textContent = name;
      const state = document.createElement('small');
      state.textContent = status;
      row.append(label, state);
      list.appendChild(row);
    }
  }

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
    text($('survival-event-title'), pick(event, ['title', 'name']));
    text($('survival-event-desc'), pick(event, ['desc', 'description']));
    const claimable = pick(event, ['claimable', 'canClaim']) === true
      || pick(event, ['status', 'state']) === 'ready';
    banner.classList.toggle('is-claimable', claimable);
    $('survival-event-claim-hint').hidden = !claimable;
    banner.dataset.eventId = pick(event, ['id', 'key']) || '';
    banner.hidden = false;
  }

  function updateClosedHint() {
    const checked = document.querySelector('input[name="survival-category"]:checked');
    const place = checked ? CATEGORY_PLACE[checked.value] : undefined;
    const hour = call(quests, 'getHour') ?? call(api, 'getHour');
    let closed = false;
    if (place && typeof quests.isOpen === 'function' && hour !== undefined) {
      closed = call(quests, 'isOpen', place, hour) === false;
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

  $('survival-form').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('survival-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) { $('survival-amount').focus({ preventScroll: true }); return; }
    const checked = document.querySelector('input[name="survival-category"]:checked');
    const result = api.addExpense({
      amount,
      category: checked ? checked.value : '食堂餐饮',
      note: $('survival-note').value,
    });
    renderWanted(true);
    refresh();
    showFeedback(result.feedback, amount);
    $('survival-form').reset();
    updateClosedHint();
    close($('survival-modal'));
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
  $('survival-report-demo').addEventListener('click', () => {
    api.save(api.generateDemoData());
    refresh();
    renderReport();
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
    call(quests, 'claimEvent', $('survival-event-banner').dataset.eventId || undefined);
    refresh();
    renderEvent();
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

  refresh();
  afterIntro(() => { if (needSetup()) showSetup(); });
})();
