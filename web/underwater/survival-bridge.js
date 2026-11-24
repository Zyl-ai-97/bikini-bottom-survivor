/* 1500 生存季 × 比奇堡 —— 水下集成桥（iframe 内运行）
 * 职责：位置打卡 recordVisit / 停留 recordStay、海螺手机摇杆与观光开关转发、
 * 游戏时段注入 setHour、通缉巡逻事件。玩法数值全部走父页面 window.BudgetQuests，
 * 本文件不写任何玩法计算。地点锚点取自 controls.js viewpoints 与小镇布局坐标。
 */
(() => {
  'use strict';

  // ids: 进入该锚点时依次上报的逻辑地点。school 与 street 共用镇中心锚点；
  // jellyfield 借珊瑚礁锚点；market 为贝壳超市建筑坐标。
  const ANCHORS = [
    { ids: ['diner'], x: -45.3, z: -25.6, r: 10 },
    { ids: ['chum'], x: -44.6, z: -30.2, r: 9 },
    { ids: ['neighbors'], x: 30.7, z: -18.6, r: 10 },
    { ids: ['street', 'school'], x: 1.9, z: -32.8, r: 10 },
    { ids: ['ridge'], x: 22.6, z: -62, r: 12 },
    { ids: ['cove'], x: 43.3, z: -15.7, r: 11 },
    { ids: ['horn'], x: 45.2, z: -25.55, r: 10 },
    { ids: ['conch'], x: 25.1, z: -12.2, r: 10 },
    { ids: ['market'], x: -36, z: -30, r: 10 },
    { ids: ['jellyfield'], x: 33, z: -29.1, r: 13 },
  ];
  const HIDEOUTS = [
    { name: '蟹堡王后巷', x: -45.3, z: -25.6 },
    { name: '海湾礁石后', x: 43.3, z: -15.7 },
    { name: '山脊背阴处', x: 22.6, z: -62 },
    { name: '海螺街屋檐下', x: 25.1, z: -12.2 },
  ];
  const STAY_IDS = ['school', 'jellyfield'];

  const banner = document.createElement('div');
  banner.id = 'survival-bridge-banner';
  banner.hidden = true;
  banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);'
    + 'background:rgba(10,35,45,.88);color:#ffe9a8;border:1px solid rgba(255,183,3,.6);'
    + 'border-radius:999px;padding:8px 18px;font:600 14px/1.4 system-ui,sans-serif;'
    + 'z-index:60;pointer-events:none;max-width:88vw;text-align:center;';
  document.body.appendChild(banner);
  let bannerTimer = 0;
  function showBanner(message, ms = 3600) {
    banner.textContent = message;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
  }

  const quests = () => {
    try { return window.parent && window.parent.BudgetQuests; } catch { return undefined; }
  };

  // —— 任务罗盘（DESIGN-v4 第 1 项）：指向当前任务下一步地点 ——
  const LOC_NAMES = {
    diner: '蟹堡王', chum: '海之霸', neighbors: '邻居区', school: '航船学校',
    market: '贝壳超市', jellyfield: '水母田', cove: '海湾', ridge: '山脊',
    horn: '号角礁', street: '海螺街', conch: '海螺街',
  };
  const MAIN_LOC = { '食堂餐饮': 'diner', '超市日用': 'market', '学习打印': 'school', '娱乐社交': 'chum' };
  const compass = document.createElement('div');
  compass.id = 'survival-compass';
  compass.hidden = true;
  compass.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);'
    + 'background:rgba(10,35,45,.78);color:#e8f4f8;border-radius:999px;padding:5px 14px;'
    + 'font:600 13px/1.5 system-ui,sans-serif;z-index:59;pointer-events:none;'
    + 'display:flex;gap:8px;align-items:center;';
  compass.innerHTML = '<span id="survival-compass-arrow" style="display:inline-block;color:#ffb703;">▲</span><span id="survival-compass-text"></span>';
  document.body.appendChild(compass);

  function currentTarget() {
    const q = quests();
    if (!q) return null;
    try {
      const active = q.getSide().find(s => s.status === 'active');
      if (active) {
        let loc = null;
        if (active.type === 'visit') loc = active.locations[Math.min(active.progress.step || 0, active.locations.length - 1)];
        else if (active.type === 'stay' || active.type === 'purchaseVisit') loc = active.destination;
        else if (active.type === 'choice') loc = active.locId;
        if (loc) return { loc, label: active.title };
      }
      const main = q.getMain && q.getMain();
      if (main && main.current && main.current.type === 'spend' && main.current.category) {
        const loc = MAIN_LOC[main.current.category];
        if (loc) return { loc, label: main.current.title };
      }
    } catch { /* 存档未就绪 */ }
    return null;
  }

  function renderCompass() {
    if (!controls) return;
    const target = currentTarget();
    if (!target) { compass.hidden = true; return; }
    const anchor = ANCHORS.find(a => a.ids.includes(target.loc));
    if (!anchor) { compass.hidden = true; return; }
    const cam = controls.camera;
    const dx = anchor.x - cam.x;
    const dz = anchor.z - cam.z;
    const dist = Math.hypot(dx, dz);
    const name = LOC_NAMES[target.loc] || target.loc;
    compass.hidden = false;
    compass.querySelector('#survival-compass-text').textContent =
      dist <= anchor.r ? `${name} · 已到达` : `${name} · ${Math.round(dist)}m`;
    const f = dx * Math.sin(cam.yaw) + dz * -Math.cos(cam.yaw);
    const r = dx * Math.cos(cam.yaw) + dz * Math.sin(cam.yaw);
    const deg = Math.atan2(r, f) * 180 / Math.PI;
    compass.querySelector('#survival-compass-arrow').style.transform = `rotate(${deg.toFixed(0)}deg)`;
  }

  let controls = null;
  let lastHour = -1;
  const staySeconds = {};
  let sideSnapshot = {};
  let patrol = null;
  let lastPatrolAt = 0;

  function snapshotSides() {
    const q = quests();
    if (!q) return;
    try {
      for (const item of q.getSide()) {
        const prev = sideSnapshot[item.id];
        if (prev === 'active' && item.status === 'done') {
          showBanner(`支线完成：${item.title} —— 打开海螺手机交付领奖`, 4600);
        }
        sideSnapshot[item.id] = item.status;
      }
    } catch { /* 存档未就绪时跳过 */ }
  }

  function syncHour() {
    const q = quests();
    if (!q || typeof q.setHour !== 'function') return;
    // 用父页面的 Date（已按「回家睡觉」偏移），保证营业时段与游戏日期一致。
    let now;
    try { now = new window.parent.Date(); } catch { now = new Date(); }
    const hour = now.getHours();
    if (hour === lastHour) return;
    lastHour = hour;
    try { q.setHour(hour); } catch { /* 忽略单次注入失败 */ }
  }

  function startPatrol() {
    const cam = controls.camera;
    const target = HIDEOUTS
      .map(h => ({ ...h, d: Math.hypot(cam.x - h.x, cam.z - h.z) }))
      .sort((a, b) => b.d - a.d)[0];
    patrol = { ...target, deadline: Date.now() + 60000 };
    showBanner(`巡逻来了！60 秒内躲到${target.name}`, 5000);
  }

  function tickPatrol() {
    const q = quests();
    if (!q) return;
    if (patrol) {
      const cam = controls.camera;
      const left = Math.ceil((patrol.deadline - Date.now()) / 1000);
      if (Math.hypot(cam.x - patrol.x, cam.z - patrol.z) <= 9) {
        patrol = null;
        try {
          q.clearWanted(1);
          q.addReputation(3, 'patrol');
        } catch { /* 忽略 */ }
        showBanner('甩掉巡逻了：通缉 -1 星，声望 +3', 4200);
        lastPatrolAt = Date.now();
      } else if (left <= 0) {
        patrol = null;
        try { q.addReputation(-3, 'patrol'); } catch { /* 忽略 */ }
        showBanner('被巡逻逮个正着：声望 -3', 4200);
        lastPatrolAt = Date.now();
      } else if (left % 10 === 0) {
        showBanner(`巡逻追捕中：${left} 秒内躲到${patrol.name}`, 1600);
      }
      return;
    }
    if (Date.now() - lastPatrolAt < 180000) return;
    try {
      if (q.getWantedEffects && q.getWantedEffects().patrolDue) startPatrol();
    } catch { /* 忽略 */ }
  }

  let currentAnchor = -1;
  function tick() {
    if (!controls) return;
    const q = quests();
    if (!q) return;
    syncHour();
    const cam = controls.camera;
    // 只认最近的锚点：蟹堡王与海之霸隔街相望，避免同 tick 乱序触发顺序任务。
    let nearest = -1;
    let nearestDist = Infinity;
    ANCHORS.forEach((anchor, index) => {
      const dist = Math.hypot(cam.x - anchor.x, cam.z - anchor.z);
      if (dist <= anchor.r && dist < nearestDist) { nearest = index; nearestDist = dist; }
    });
    if (nearest !== currentAnchor) {
      if (currentAnchor >= 0) {
        for (const id of ANCHORS[currentAnchor].ids) if (STAY_IDS.includes(id)) staySeconds[id] = 0;
      }
      currentAnchor = nearest;
      if (nearest >= 0) {
        for (const id of ANCHORS[nearest].ids) {
          try {
            const result = q.recordVisit(id);
            if (result && result.ignored === 'closed') showBanner('这里打烊了，这个时段不计进度');
          } catch { /* 未接取相关任务时逻辑层会自行忽略 */ }
        }
        snapshotSides();
      }
    }
    if (currentAnchor >= 0) {
      for (const id of ANCHORS[currentAnchor].ids) {
        if (!STAY_IDS.includes(id)) continue;
        staySeconds[id] = (staySeconds[id] || 0) + 1;
        try { q.recordStay(id, 1); } catch { /* 忽略 */ }
        if (staySeconds[id] === 3 || staySeconds[id] === 20) snapshotSides();
      }
    }
    tickPatrol();
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const data = event.data || {};
    if (!controls) return;
    if (data.type === 'bikini-tour-toggle') {
      controls.setCruise(Boolean(data.on));
      showBanner(data.on ? '观光巡游已开启' : '观光巡游已关闭，自己游吧', 2200);
    } else if (data.type === 'bikini-joystick') {
      const x = Number(data.x) || 0;
      const y = Number(data.y) || 0;
      controls.setInput('forward', y > 0.3);
      controls.setInput('back', y < -0.3);
      controls.setInput('right', x > 0.3);
      controls.setInput('left', x < -0.3);
    }
  });

  const waitControls = setInterval(() => {
    if (window.__diveControls) {
      controls = window.__diveControls;
      clearInterval(waitControls);
      snapshotSides();
      setInterval(tick, 1000);
      setInterval(renderCompass, 250);
    }
  }, 500);
})();
