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
    const hour = new Date().getHours();
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
    }
  }, 500);
})();
