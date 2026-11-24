/* 1500 生存季 × bikini-bottom-shawn 融合版 —— A 版（深色 RPG）HUD 与接线
 * 只做界面和数据接线：所有数值来自 window.BudgetSurvivor，不自行计算、不改原项目逻辑。
 * 用法：在 web/index.html 中，于 survival-logic.js 之后引入本文件即可（无需手动引 CSS）。
 */
(() => {
  'use strict';

  const script = document.currentScript;
  const cssUrl = new URL('survival-hud.css', script ? new URL('.', script.src) : location.href).href;
  if (!Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).some(link => link.href === cssUrl)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  const api = window.BudgetSurvivor;
  if (!api) {
    console.error('[survival-hud] window.BudgetSurvivor 未加载：请先在 web/index.html 引入 web/survival/survival-logic.js');
    return;
  }

  const money = value => `¥${Number(value || 0).toFixed(2)}`;
  const $ = id => document.getElementById(id);

  const host = document.createElement('div');
  host.innerHTML = `
    <section id="survival-hud" class="survival-hud" aria-label="生存状态">
      <div class="survival-hud__inner">
        <div class="survival-hp">
          <span class="survival-hud__label">HP</span>
          <div class="survival-hp__track"><div id="survival-hp" class="survival-hp__fill"></div></div>
        </div>
        <div class="survival-stat"><span class="survival-hud__label">余额</span><b id="survival-balance"></b></div>
        <div class="survival-stat"><span class="survival-hud__label">今日已花/日预算</span><b id="survival-today"></b></div>
        <div class="survival-stat"><span class="survival-hud__label">连击</span><b id="survival-streak"></b></div>
        <button id="survival-report-btn" class="survival-mini-btn" type="button">战报</button>
      </div>
    </section>
    <button id="survival-add-btn" type="button">记一笔</button>
    <div id="survival-crit" class="survival-crit" aria-live="polite"></div>

    <div id="survival-modal" class="survival-overlay" hidden>
      <form id="survival-form" class="survival-panel">
        <h2 class="survival-panel__title">记一笔</h2>
        <label class="survival-field">金额
          <input id="survival-amount" type="number" min="0.01" step="0.01" required>
        </label>
        <fieldset class="survival-fieldset">
          <legend>分类</legend>
          <label><input type="radio" name="survival-category" value="食堂餐饮" checked>食堂餐饮</label>
          <label><input type="radio" name="survival-category" value="奶茶零食">奶茶零食</label>
          <label><input type="radio" name="survival-category" value="超市日用">超市日用</label>
          <label><input type="radio" name="survival-category" value="出行">出行</label>
          <label><input type="radio" name="survival-category" value="学习打印">学习打印</label>
          <label><input type="radio" name="survival-category" value="娱乐社交">娱乐社交</label>
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

    <div id="survival-report" class="survival-overlay" hidden>
      <div class="survival-panel survival-panel--report">
        <h2 class="survival-panel__title">战报</h2>
        <dl class="survival-report-list">
          <dt>存活天数</dt><dd id="survival-report-days"></dd>
          <dt>HP</dt><dd id="survival-report-hp"></dd>
          <dt>成就</dt><dd id="survival-report-achievements"></dd>
          <dt>连击</dt><dd id="survival-report-streak"></dd>
          <dt>最常翻车分类</dt><dd id="survival-report-category"></dd>
          <dt>暴击统计</dt><dd id="survival-report-crits"></dd>
        </dl>
        <div class="survival-actions survival-actions--report">
          <button id="survival-report-demo" type="button">一键填充演示数据</button>
          <button id="survival-report-reset" type="button">重置存档</button>
          <button id="survival-report-close" type="button" class="survival-primary">关闭</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  const overlays = [$('survival-modal'), $('survival-setup'), $('survival-report')];
  let setupPending = false;
  let pendingReturn = null;
  let priorCanvasInert = null;
  let critTimer = 0;

  function anyOpen() {
    return overlays.some(overlay => !overlay.hidden);
  }

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

  function open(overlay) {
    overlay.hidden = false;
    syncBlocking();
  }

  function close(overlay) {
    overlay.hidden = true;
    syncBlocking();
  }

  function refresh() {
    const stats = api.getStats();
    const hp = $('survival-hp');
    hp.style.width = `${Math.max(0, Math.min(100, Number(stats.hp) || 0))}%`;
    hp.classList.toggle('is-mid', stats.hp <= 50 && stats.hp >= 25);
    hp.classList.toggle('is-low', stats.hp < 25);
    $('survival-balance').textContent = money(stats.balance);
    $('survival-today').textContent = `${money(stats.todaySpent)} / ${money(stats.dailyBudget)}`;
    $('survival-streak').textContent = String(stats.streak);
  }

  function showFeedback(feedback, amount) {
    const layer = $('survival-crit');
    const crit = feedback && feedback.crit;
    layer.textContent = '';
    layer.classList.remove('is-flash');
    const line = document.createElement('div');
    line.className = 'survival-crit__line';
    line.textContent = crit === 'normal' || crit === 'none'
      ? `-${money(amount)}`
      : Array.isArray(feedback && feedback.messages) ? feedback.messages.join(' ') : '';
    layer.appendChild(line);
    if (crit === 'heavy' || crit === 'lethal') {
      void layer.offsetWidth;
      layer.classList.add('is-flash');
    }
    clearTimeout(critTimer);
    critTimer = setTimeout(() => {
      layer.textContent = '';
      layer.classList.remove('is-flash');
    }, 3200);
  }

  function renderReport() {
    const report = api.getReport();
    $('survival-report-days').textContent = String(report.dayNumber);
    $('survival-report-hp').textContent = String(report.hp);
    $('survival-report-achievements').textContent = report.unlockedAchievements.length
      ? report.unlockedAchievements.join('、') : '—';
    $('survival-report-streak').textContent = `${report.streak} / ${report.longestStreak}`;
    let worst = null;
    for (const item of report.categoryBreakdown) {
      if (item.category === '食堂餐饮') continue;
      if (!worst || item.totalSpent > worst.totalSpent) worst = item;
    }
    $('survival-report-category').textContent = worst && worst.totalSpent > 0
      ? `${worst.category}（${money(worst.totalSpent)}）` : '—';
    $('survival-report-crits').textContent = Object.keys(report.critCounts)
      .map(key => `${key} ${report.critCounts[key]}`).join(' · ');
  }

  function showReport(onClose) {
    pendingReturn = typeof onClose === 'function' ? onClose : null;
    renderReport();
    open($('survival-report'));
    $('survival-report-close').focus({ preventScroll: true });
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
    if (!state.playerName) {
      $('survival-player').focus({ preventScroll: true });
      return;
    }
    api.save(state);
    setupPending = false;
    close($('survival-setup'));
    refresh();
  }

  function afterIntro(callback) {
    const intro = $('studio-intro');
    const done = () => !intro || ['done', 'fading', 'error', 'waiting'].includes(intro.dataset.phase);
    if (done()) {
      callback();
      return;
    }
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

  // 记一笔：只把输入交给 addExpense，反馈文案取 feedback.messages。
  $('survival-form').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('survival-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      $('survival-amount').focus({ preventScroll: true });
      return;
    }
    const checked = document.querySelector('input[name="survival-category"]:checked');
    const result = api.addExpense({
      amount,
      category: checked ? checked.value : '食堂餐饮',
      note: $('survival-note').value,
    });
    refresh();
    showFeedback(result.feedback, amount);
    $('survival-form').reset();
    close($('survival-modal'));
  });

  host.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => close($(button.dataset.close)));
  });
  $('survival-add-btn').addEventListener('click', () => {
    open($('survival-modal'));
    $('survival-amount').focus({ preventScroll: true });
  });
  $('survival-report-btn').addEventListener('click', () => showReport());
  $('survival-start').addEventListener('click', finishSetup);
  $('survival-report-close').addEventListener('click', () => {
    close($('survival-report'));
    const callback = pendingReturn;
    pendingReturn = null;
    if (callback) callback();
  });
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

  // 钩子一：浅海木牌请求回海面时先弹战报，关闭后再把原消息放行给原过渡逻辑。
  let replaying = false;
  window.addEventListener('message', event => {
    if (replaying) {
      replaying = false;
      return;
    }
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

  // 钩子二：无存档时不让海面画布收到点击/回车，开局设置提交后才允许下潜。
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

  // 可选：若把 createDiveTransition 包一层 window.SurvivalHUD.gateDive(...)，
  // 木牌触发 begin('down') 时也会先弹开局设置，设置完成后由调用方再次触发下潜。
  window.SurvivalHUD = {
    refresh,
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
