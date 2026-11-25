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
  function postToParent(data) {
    try { window.parent.postMessage(data, location.origin); } catch { /* 忽略 */ }
  }

  // —— NPC 与路人（DESIGN-v4 第 5、6 项）：只负责触发，交互在父页 social 模块 ——
  const NPC_BY_LOC = { diner: 'krabs', school: 'puff', cove: 'sandy', chum: 'plankton' };
  const NEIGHBOR_NPCS = ['patrick', 'squidward', 'spongebob'];
  let neighborCycle = 0;
  function npcAt(ids) {
    for (const id of ids) if (NPC_BY_LOC[id]) return NPC_BY_LOC[id];
    if (ids.includes('neighbors')) {
      const q = quests();
      try {
        const active = q && q.getSide().find(s => s.status === 'active' && NEIGHBOR_NPCS.includes(
          { 'patrick-icecream': 'patrick', 'squidward-reed': 'squidward', 'spongebob-jelly': 'spongebob' }[s.id]));
        if (active) return { 'patrick-icecream': 'patrick', 'squidward-reed': 'squidward', 'spongebob-jelly': 'spongebob' }[active.id];
      } catch { /* 忽略 */ }
      neighborCycle = (neighborCycle + 1) % NEIGHBOR_NPCS.length;
      return NEIGHBOR_NPCS[neighborCycle];
    }
    return null;
  }
  // —— 每日海况（DESIGN-v4 第 15 项）：与父页同一算法，按父页偏移后的日期取种子 ——
  function seaToday() {
    let d;
    try { d = new window.parent.Date(); } catch { d = new Date(); }
    const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ['sunny', 'current', 'jelly'][h % 3];
  }

  // —— 路上拾取（DESIGN-v4 第 16 项）：随机刷点，罗盘指引，靠近收集 ——
  let pickup = null;
  let lastPickupSpawn = 0;
  function updatePickup() {
    const cam = controls.camera;
    const now = Date.now();
    if (pickup) {
      if (Math.hypot(pickup.x - cam.x, pickup.z - cam.z) < 6) {
        postToParent({ type: 'bikini-pickup', kind: pickup.kind });
        showBanner(pickup.kind === 'shell' ? '捡到一枚漂亮贝壳！' : '抓住一只小水母！');
        pickup = null;
        lastPickupSpawn = now;
      }
      return;
    }
    const interval = seaToday() === 'jelly' ? 22000 : 45000;
    if (now - lastPickupSpawn < interval) return;
    if (Math.random() > 0.3) return;
    const anchor = ANCHORS[Math.floor(Math.random() * ANCHORS.length)];
    pickup = {
      x: anchor.x + (Math.random() * 24 - 12),
      z: anchor.z + (Math.random() * 24 - 12),
      kind: Math.random() < 0.5 ? 'shell' : 'jelly',
      r: 6,
    };
    lastPickupSpawn = now;
    showBanner('罗盘有反应——附近有可拾取的东西');
  }

  // —— 抓水母小游戏触发（DESIGN-v4 第 17 项）：在水母田停留时概率触发 ——
  let lastJellyGameAt = 0;
  function maybeJellyGame() {
    if (currentAnchor < 0) return;
    if (!ANCHORS[currentAnchor].ids.includes('jellyfield')) return;
    const now = Date.now();
    if (now - lastJellyGameAt < 300000) return;
    if (Math.random() > 0.05) return;
    lastJellyGameAt = now;
    postToParent({ type: 'bikini-jellygame' });
  }

  let lastPasserbyAt = 0;
  function maybePasserby() {
    if (currentAnchor < 0) return;
    const ids = ANCHORS[currentAnchor].ids;
    if (!ids.includes('street') && !ids.includes('conch') && !ids.includes('neighbors')) return;
    const now = Date.now();
    if (now - lastPasserbyAt < 120000) return;
    if (Math.random() > 0.02) return;
    lastPasserbyAt = now;
    postToParent({ type: 'bikini-passerby' });
  }

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
    if (guideNow && guideNow.loc && !pickup) { compass.hidden = true; return; }
    if (pickup) {
      const cam0 = controls.camera;
      const dx0 = pickup.x - cam0.x;
      const dz0 = pickup.z - cam0.z;
      const dist0 = Math.hypot(dx0, dz0);
      compass.hidden = false;
      compass.querySelector('#survival-compass-text').textContent =
        dist0 <= 6 ? '就在附近，低头看看' : `${pickup.kind === 'shell' ? '贝壳' : '小水母'} · ${Math.round(dist0)}m`;
      const f0 = dx0 * Math.sin(cam0.yaw) + dz0 * -Math.cos(cam0.yaw);
      const r0 = dx0 * Math.cos(cam0.yaw) + dz0 * Math.sin(cam0.yaw);
      compass.querySelector('#survival-compass-arrow').style.transform =
        `rotate(${(Math.atan2(r0, f0) * 180 / Math.PI).toFixed(0)}deg)`;
      return;
    }
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

  let tickCount = 0;
  let currentAnchor = -1;
  let tickTalkNpc = null;
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
        postToParent({ type: 'bikini-place', loc: ANCHORS[nearest].ids[0] });
      }
    }
    // NPC 对话范围：4.5 米（独立于地点锚点半径）
    {
      let talkNpc = null;
      for (const anchor of ANCHORS) {
        const d = Math.hypot(cam.x - anchor.x, cam.z - anchor.z);
        if (d <= 4.5) { talkNpc = npcAt(anchor.ids); if (talkNpc) break; }
      }
      if (talkNpc !== tickTalkNpc) {
        tickTalkNpc = talkNpc;
        if (talkNpc) postToParent({ type: 'bikini-npc-near', npc: talkNpc });
        else postToParent({ type: 'bikini-npc-far' });
      }
    }
    maybePasserby();
    tickCount += 1;
    if (currentAnchor >= 0) {
      const roughSea = seaToday() === 'current';
      for (const id of ANCHORS[currentAnchor].ids) {
        if (!STAY_IDS.includes(id)) continue;
        if (roughSea && tickCount % 2 === 1) continue;
        staySeconds[id] = (staySeconds[id] || 0) + 1;
        try { q.recordStay(id, 1); } catch { /* 忽略 */ }
        if (staySeconds[id] === 3 || staySeconds[id] === 20) snapshotSides();
      }
    }
    updatePickup();
    maybeJellyGame();
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


  // —— v5 P2 警察追捕：按原项目管线克隆 c17 并重涂顶点色得到巡警 c20，
  //    包裹 bikiniLayout.characters 逐帧驱动巡逻/追捕（不改原作者文件） ——
  const POLICE_WAYPOINTS = [
    { x: -50, z: -28.5 }, { x: -36, z: -27.4 }, { x: -20, z: -27.3 },
    { x: -4, z: -29.5 }, { x: 2, z: -32.5 }, { x: -4, z: -29.5 },
    { x: -20, z: -27.3 }, { x: -36, z: -27.4 },
  ];
  const police = { x: -50, z: -28.5, yaw: 0, step: 0, dist: 0, mode: 'patrol', wp: 1, lose: 0, cooldownUntil: 0, lastT: null };
  function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function bytesToB64(bytes) { let bin = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(bin); }
  function injectPoliceModel() {
    const meshes = window.bikiniMeshes;
    if (!meshes || !meshes.c17) return false;
    if (meshes.c20) return true;
    const src = meshes.c17;
    const pos = b64ToBytes(src.p);
    const col = b64ToBytes(src.c);
    const nv = Math.floor(pos.length / 6);
    const view = new DataView(pos.buffer, pos.byteOffset, pos.byteLength);
    const mny = src.min[1], exy = src.extent[1];
    const is = (k, r, g, b) => col[k] === r && col[k + 1] === g && col[k + 2] === b;
    const paint = (k, c) => { col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2]; };
    for (let v = 0; v < nv; v++) {
      const y = mny + (view.getUint16(v * 6 + 2, true) / 65535) * exy;
      const k = v * 3;
      if (is(k, 36, 44, 42)) paint(k, [30, 40, 95]); // 头顶深色 → 警帽
      else if (is(k, 186, 172, 179) || is(k, 184, 170, 177)) paint(k, (y >= 1.30 && y < 1.42) ? [150, 180, 220] : [40, 55, 110]); // 帽檐银蓝 / 制服藏青
      else if (is(k, 149, 137, 147)) paint(k, [33, 45, 90]);
      else if (is(k, 60, 91, 103)) paint(k, [26, 28, 44]);
      else if (is(k, 44, 53, 48)) paint(k, [20, 22, 34]);
    }
    meshes.c20 = { ...src, c: bytesToB64(col) };
    return true;
  }
  function nearestWp() {
    let best = 0, bd = Infinity;
    POLICE_WAYPOINTS.forEach((w, i) => { const d = Math.hypot(w.x - police.x, w.z - police.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function policePose(t) {
    const ctrl = window.__diveControls;
    if (!ctrl || !ctrl.camera) return null;
    if (police.lastT == null) police.lastT = t;
    const dt = Math.min(0.1, Math.max(0, t - police.lastT));
    police.lastT = t;
    const cam = ctrl.camera;
    const q = quests();
    let stars = 0;
    try { stars = (q && q.getWanted && q.getWanted().stars) || 0; } catch { /* 忽略 */ }
    const distP = Math.hypot(cam.x - police.x, cam.z - police.z);
    const now = performance.now();
    if (police.mode !== 'chase' && stars >= 3 && distP < 34 && now > police.cooldownUntil) {
      police.mode = 'chase';
      police.lose = 0;
      showBanner('巡警盯上你了！快跑，或者躲进建筑！', 3000);
    }
    let target = null, speed = 0;
    if (police.mode === 'chase') {
      target = { x: cam.x, z: cam.z };
      speed = 5.3;
      if (distP < 2.2) {
        police.mode = 'patrol';
        police.cooldownUntil = now + 20000;
        police.wp = nearestWp();
        try {
          q.addExpense({ amount: 50, category: '娱乐社交', note: '被巡警抓住罚款' });
          q.clearWanted(5);
          q.addReputation(-5, 'caught');
        } catch { /* 忽略 */ }
        showBanner('被巡警抓住了！罚款 ¥50，通缉清空，声望 -5', 4200);
        target = null;
      } else if (distP > 38) {
        police.lose += dt;
        if (police.lose > 8) {
          police.mode = 'patrol';
          police.wp = nearestWp();
          try { q.clearWanted(1); } catch { /* 忽略 */ }
          showBanner('甩掉巡警了！通缉 -1 星', 3600);
          target = null;
        }
      } else police.lose = 0;
    }
    if (police.mode === 'patrol' && !target) {
      target = POLICE_WAYPOINTS[police.wp];
      speed = 2.0;
      if (target && Math.hypot(target.x - police.x, target.z - police.z) < 1.2) {
        police.wp = (police.wp + 1) % POLICE_WAYPOINTS.length;
        target = POLICE_WAYPOINTS[police.wp];
      }
    }
    let pace = 0;
    if (target && dt > 0) {
      const dx = target.x - police.x, dz = target.z - police.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const stepLen = Math.min(d, speed * dt);
        police.x += (dx / d) * stepLen;
        police.z += (dz / d) * stepLen;
        police.yaw = Math.atan2(dx, dz);
        police.dist += stepLen;
        police.step = police.dist * 9.3;
        pace = Math.min(1, speed / 5.3) * 0.89;
      }
    }
    return {
      id: 'c20', instanceId: 'c20-police', x: police.x, z: police.z,
      yaw: police.yaw, heading: police.yaw, height: 1.57,
      bob: 0.012 * pace * Math.sin(police.step) ** 2, lean: 0.022 * pace * Math.sin(police.step),
      pace, step: police.step, walkTime: police.dist / 0.7,
      greet: false, canGreet: false, leftArm: 0, rightArm: 0,
    };
  }
  const waitPolice = setInterval(() => {
    const layout = window.bikiniLayout;
    if (!layout || typeof layout.characters !== 'function' || layout.__bsPoliceWrapped) return;
    if (!injectPoliceModel()) return;
    const orig = layout.characters.bind(layout);
    layout.characters = (t, floor) => {
      const list = orig(t, floor);
      try {
        const pose = policePose(t);
        if (pose && Array.isArray(list)) return [...list, pose];
      } catch { /* 忽略 */ }
      return list;
    };
    layout.__bsPoliceWrapped = true;
    clearInterval(waitPolice);
  }, 500);


  // —— v5 任务引导渲染：脚下光路 + 地点浮动感叹号 + 到达提示框 ——
  let guideNow = null;
  let guideDismissed = '';
  const VIEWPOINT_OF = { diner: 'diner', chum: 'chum', neighbors: 'neighbors', street: 'street', school: 'street', ridge: 'ridge', cove: 'cove', horn: 'horn', conch: 'conch', jellyfield: 'reef' };
  let autoSteer = null;
  function stopAutoSteer() { if (autoSteer) { clearInterval(autoSteer.timer); autoSteer = null; } }
  window.addEventListener('keydown', stopAutoSteer);
  window.addEventListener('pointerdown', stopAutoSteer);
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data || {};
    if (data.type === 'bikini-guide') guideNow = data.guide || null;
    if (data.type === 'bikini-autopath' && data.loc) {
      const ctrl = window.__diveControls;
      const anchor = ANCHORS.find(a => a.ids.includes(data.loc));
      if (!ctrl || !anchor) return;
      stopAutoSteer();
      showBanner(`正在前往：${LOC_NAMES[data.loc] || data.loc}`, 2600);
      const view = VIEWPOINT_OF[data.loc];
      if (view && ctrl.goto && ctrl.goto(view)) return; // 原生镜头滑行到该地点
      // 没有对应观点的地点（如超市）：桥直接驾驶相机过去
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const cam = ctrl.camera;
        if (!cam || Date.now() - startedAt > 45000) { stopAutoSteer(); return; }
        const dx = anchor.x - cam.x, dz = anchor.z - cam.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= anchor.r * 0.55) { stopAutoSteer(); return; }
        const step = Math.min(dist - anchor.r * 0.4, 5.5 * 0.05);
        cam.x += (dx / dist) * step;
        cam.z += (dz / dist) * step;
        const targetYaw = Math.atan2(dx, -dz);
        let diff = targetYaw - cam.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cam.yaw += diff * 0.3;
      }, 50);
      autoSteer = { timer };
    }
  });
  const guideCanvas = document.createElement('canvas');
  guideCanvas.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;';
  document.body.appendChild(guideCanvas);
  const guideMarker = document.createElement('div');
  guideMarker.hidden = true;
  guideMarker.style.cssText = 'position:fixed;z-index:56;pointer-events:none;transform:translate(-50%,-100%);text-align:center;';
  guideMarker.innerHTML = '<div style="width:52px;height:52px;margin:0 auto;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a8,#ffb703);'
    + 'color:#7a4d00;font:900 34px/52px system-ui;text-align:center;box-shadow:0 0 22px rgba(255,183,3,.85),0 0 0 3px rgba(255,233,168,.5)">!</div>'
    + '<div class="guide-marker-label" style="margin-top:6px;background:rgba(10,35,45,.85);color:#ffe9a8;border-radius:999px;'
    + 'padding:3px 10px;font:600 12px/1.5 system-ui;white-space:nowrap"></div>';
  document.body.appendChild(guideMarker);
  const guidePrompt = document.createElement('div');
  guidePrompt.hidden = true;
  guidePrompt.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:57;'
    + 'background:rgba(10,35,45,.92);border:1px solid rgba(255,183,3,.65);border-radius:16px;padding:12px 16px;'
    + 'color:#eaf6ff;font:500 14px/1.5 system-ui;max-width:86vw;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.45)';
  guidePrompt.innerHTML = '<div class="guide-prompt-text" style="margin-bottom:9px"></div>'
    + '<button type="button" class="guide-prompt-btn" style="background:#ffb703;color:#231600;border:0;border-radius:999px;'
    + 'padding:9px 26px;font:700 15px system-ui;cursor:pointer"></button>';
  document.body.appendChild(guidePrompt);
  guidePrompt.querySelector('.guide-prompt-btn').addEventListener('click', () => {
    if (!guideNow) return;
    guideDismissed = guideSignature();
    guidePrompt.hidden = true;
    window.parent.postMessage({ type: 'bikini-quest-action', action: guideNow.kind === 'claim' ? 'claim' : 'arrive', loc: guideNow.loc }, '*');
  });
  function guideSignature() {
    if (!guideNow) return '';
    return `${guideNow.kind}|${guideNow.questId || guideNow.id || ''}|${guideNow.loc || ''}|${guideNow.label || ''}`;
  }
  function projectPoint(px, pz, cam, W, H) {
    const dx = px - cam.x, dz = pz - cam.z;
    const f = dx * Math.sin(cam.yaw) + dz * -Math.cos(cam.yaw);
    const r = dx * Math.cos(cam.yaw) + dz * Math.sin(cam.yaw);
    const aspect = W / Math.max(1, H);
    const fovV = 1.08, fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const angH = Math.atan2(r, Math.max(0.001, f));
    const angDown = Math.atan2(2.0, Math.max(0.5, f));
    const sx = W / 2 + (angH / (fovH / 2)) * (W / 2);
    const sy = H / 2 + ((angDown - (cam.pitch || 0)) / (fovV / 2)) * (H / 2);
    return { sx, sy, f, angH, fovH };
  }
  function renderGuide(now) {
    requestAnimationFrame(renderGuide);
    const ctx = guideCanvas.getContext('2d');
    const W = window.innerWidth, H = window.innerHeight;
    if (guideCanvas.width !== W || guideCanvas.height !== H) { guideCanvas.width = W; guideCanvas.height = H; }
    ctx.clearRect(0, 0, W, H);
    const ctrl = window.__diveControls;
    if (!guideNow || !guideNow.loc || !ctrl || !ctrl.camera) { guideMarker.hidden = true; guidePrompt.hidden = true; return; }
    const anchor = ANCHORS.find(a => a.ids.includes(guideNow.loc));
    if (!anchor) { guideMarker.hidden = true; guidePrompt.hidden = true; return; }
    const cam = ctrl.camera;
    const dist = Math.hypot(anchor.x - cam.x, anchor.z - cam.z);
    // 光路：从脚下向目标每 2.2 米一个光点
    if (dist > 4) {
      const ux = (anchor.x - cam.x) / dist, uz = (anchor.z - cam.z) / dist;
      const pulse = 0.65 + 0.35 * Math.sin(now / 280);
      for (let d = 2.2; d < dist - 1; d += 2.2) {
        const pt = projectPoint(cam.x + ux * d, cam.z + uz * d, cam, W, H);
        if (pt.f < 0.6 || pt.sx < -30 || pt.sx > W + 30 || pt.sy < -30 || pt.sy > H + 30) continue;
        const radius = Math.max(3, Math.min(15, 120 / pt.f));
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 205, 80, ${(0.75 * pulse).toFixed(3)})`;
        ctx.shadowColor = 'rgba(255,183,3,.9)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    // 地点范围圈：锚点半径投影成地面金圈
    {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const pt = projectPoint(anchor.x + Math.cos(a) * anchor.r, anchor.z + Math.sin(a) * anchor.r, cam, W, H);
        if (pt.f < 0.6) { started = false; continue; }
        if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; } else ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.strokeStyle = 'rgba(255, 205, 80, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(255,183,3,.8)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // 感叹号标记（浮动）
    const tp = projectPoint(anchor.x, anchor.z, cam, W, H);
    const bob = Math.sin(now / 380) * 9;
    guideMarker.hidden = false;
    if (tp.f < 0.6 || Math.abs(tp.angH) > tp.fovH / 2 * 1.1) {
      guideMarker.style.left = `${Math.max(46, Math.min(W - 46, tp.sx))}px`;
      guideMarker.style.top = `${H * 0.38 + bob}px`;
    } else {
      guideMarker.style.left = `${tp.sx}px`;
      guideMarker.style.top = `${Math.max(70, tp.sy - 64 + bob)}px`;
    }
    guideMarker.querySelector('.guide-marker-label').textContent =
      `${LOC_NAMES[guideNow.loc] || guideNow.loc} · ${Math.round(dist)}m`;
    // 到达提示框
    const actionable = guideNow.kind === 'go' || guideNow.kind === 'claim';
    if (actionable && dist <= anchor.r && guideSignature() !== guideDismissed) {
      guidePrompt.hidden = false;
      guidePrompt.querySelector('.guide-prompt-text').textContent = `${guideNow.questName}：${guideNow.label}`;
      guidePrompt.querySelector('.guide-prompt-btn').textContent = guideNow.kind === 'claim' ? '交付任务' : '▶ 开始任务';
    } else guidePrompt.hidden = true;
  }
  requestAnimationFrame(renderGuide);

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
