/* 1500 生存季 × 比奇堡 —— 社交扩展模块（DESIGN-v4 第 5、6 项）
 * NPC 对话 + 好感度 + 路人遭遇。状态存独立 key（quest 存档会清洗未知字段）：
 * budget-survivor-social-v1。数值效果只走公开 API：BudgetQuests.addExpense /
 * addReputation / addWanted / clearWanted，不改任务逻辑与存档。
 */
(() => {
  'use strict';

  const api = window.BudgetSurvivor;
  const quests = window.BudgetQuests;
  if (!api || !quests) return;

  const KEY = 'budget-survivor-social-v1';
  const NPCS = {
    krabs: {
      name: '蟹老板', img: 'krabs',
      greet: ['生面孔？进店先看看菜单，站着不花钱也行，别挡道。', '哦，是你啊。今天吃点什么？先说好，不赊账。', '贵客来了！你的专座留着呢，消费满五十送海带丝！'],
      chat: ['秘方保险柜我又加了把锁，这事你知我知。', '痞老板今天在对面探头探脑，你路过帮我留意一眼。', '钱不是省出来的，是算出来的。记账这习惯，你比我强。', '海之霸的招牌越擦越亮，我这心里就越不踏实。', '蟹黄堡的秘方，是我这辈子唯一没算过成本的东西。', '员工价？你要是来上班，第一天就给你打九折。'],
      story: ['跟你说句掏心窝的：我年轻时也月光，月底啃海带根。', '后来我给自己定了条规矩——每天先记账，再花钱。你现在的样子，像极了当年的我。', '这张贵宾卡你拿着。以后在比奇堡，报我蟹老板的名字。'],
    },
    patrick: {
      name: '派大星', img: 'patrick',
      greet: ['咦，你是谁来着……哦哦哦，是你！', '嘿嘿，你来啦。我刚在数我的石头，它有三颗了。', '我最好的朋友来了！今天我们玩什么？先说好，不能跑太快。'],
      chat: ['我把钱藏在石头下面，这样我就花不了它。我是不是很聪明？', '冰淇淋车的声音一响，我的腿就自己走过去了。', '你知道吗，睡觉不用花钱。所以我睡得特别多。', '我昨天梦见自己变成了一块石头。醒来发现，差不多。', '省钱的秘诀就是——等我想吃的时候，先睡一觉。', '你要是没钱了，就来我家，我家石头下面有……哦，那是我的全部家当，不能动。'],
      story: ['其实我记性不好，经常忘了你是谁。', '但每次你来，我肚子就暖暖的。妈妈说，那是朋友的感觉。', '这颗石头送你。它是我第二喜欢的。第一喜欢的我要留着当枕头。'],
    },
    squidward: {
      name: '章鱼哥', img: 'squidward',
      greet: ['……如果是推销，请把传单塞门缝里就好。', '哦，是你。进来吧，脚步轻点，我在练音阶。', '难得有个不吵的人。坐吧，茶在柜子上，自己倒。'],
      chat: ['我的单簧管又跑音了。邻居们居然说是我吹得不好。', '安静是最贵的奢侈品，可惜这条街没人买账。', '你记账的样子很认真。这年头，认真的人不多了。', '收银台站久了，看人比看谱子准。谁大方谁抠门，一眼的事。', '我的愿望很小：一间没人敲门的屋子，和一把不跑音的单簧管。', '蟹老板昨天又数钱数到半夜。钱这东西，数着比花着开心，也是种本事。'],
      story: ['你知道我为什么总躲着大家吗？热闹过后，耳朵会嗡嗡响一整晚。', '但你不一样。你来的时候，世界好像把音量调低了两格。', '下周我的独奏会，你来听。票……算了，你的那张我请。'],
    },
    sandy: {
      name: '珊迪', img: 'sandy',
      greet: ['新面孔？报上名来，顺便帮我扶一下这个培养皿。', '来得正好，我的氧气循环实验刚进第二阶段。', '搭档！今天的数据我预感要爆表，快进来。'],
      chat: ['德州的规矩：欠账不过夜，实验数据不过周。', '我的预算表精确到小数点后两位，误差只允许来自水母。', '陆地上的橡子真贵。好在知识不要钱，只要时间。', '实验日志和账本是一个道理：先记录，再结论。', '我算过，比奇堡的平均月开销是 1427.5。你比平均线省。', '头盔里的氧气要钱，但好奇心免费。这买卖划算。'],
      story: ['我离家这么远，有时候夜里会想德州的风。', '但比奇堡有你们，数据也一天天变好。科学和朋友，我都要。', '这个防水笔记本送你。记账、采样、写日记都行——别再弄丢预算了。'],
    },
    puff: {
      name: '泡芙老师', img: 'puff',
      greet: ['站住。先深呼吸，再告诉我你今天闯了几个红灯。', '是你呀。坐吧，茶几上有冷静糖，先吃一颗。', '我最省心的学生来了。今天想学点什么？'],
      chat: ['教了这么多年，我的气球都换了好几打。', '靠岸练习的要领就一个：慢。花钱也一样，慢一点。', '你的账本我看过，条理清楚。难得。', '考试不怕慢，就怕慌。花钱也一样。', '我这辈子最大的开销，是给学生们准备的冷静糖。', '靠岸的时候别松舵。月底冲刺的时候，也一样。'],
      story: ['每个老师都有几个记一辈子的学生。', '你不是最有天赋的，但你是最肯回头看路的。开船也好，过日子也好，这点最要紧。', '这枚靠岸徽章给你。以后在比奇堡的每片水域，你都停得稳。'],
    },
    spongebob: {
      name: '海绵宝宝', img: 'spongebob',
      greet: ['嗨！！！你来啦！！今天也是元气满满的一天对吧！', '我就知道你会来！小蜗刚刚还提起你！', '最——好——的朋友驾到！蟹堡已经在锅上给你留了位置！'],
      chat: ['我煎蟹堡的时候会哼歌，歌词全是今天的特价。', '抓水母要诀：网要轻，心要诚，跑得要比水母快一点点。', '我的工资都存进罐子里了，罐子上面写着“梦想基金”。', '蟹老板说秘方比命重要。我觉得，朋友比秘方还重要一点点。', '今天的特价是微笑，免费续杯！', '小蜗的口粮我都记在账上了，它是我家人，家人不算外快。'],
      story: ['你知道吗，我刚来比奇堡的时候，口袋里只有三枚硬币。', '是蟹老板给了我第一份工作，是大家让我留了下来。', '现在轮到你了。这个月，咱们一起把日子过成招牌菜！'],
    },
    plankton: {
      name: '痞老板', img: 'plankton',
      greet: ['嘘——小声点。海之霸的门，只为有眼光的人开。', '又是你。说吧，是带了“货”，还是带了耳朵？', '合伙人！你可算来了。对面那只螃蟹的好日子，我看快到头了。'],
      chat: ['蟹老板把秘方锁了三层。锁再多，也锁不住人心，你说对吧？', '巡逻最近查得紧，你我都低调点。有“货”随时来找我。', '我这辈子就输在一点：起步太晚。你不一样，你还年轻，站队要趁早。', '对面排队买堡的人，有一半是冲着秘方去的。配料表上写着呢——人心。'],
      story: ['我和那只螃蟹，以前是合伙人。这事没几个人知道。', '散伙那天他说：秘方是命。我说：命是拿来改的。', '总有一天，我会让你亲眼看见，海之霸的招牌比蟹堡王亮。'],
    },
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* 忽略 */ }
    return null;
  }
  function freshState() {
    return {
      affinity: { krabs: 0, patrick: 0, squidward: 0, sandy: 0, puff: 0, spongebob: 0, plankton: 0 },
      faction: null, fq: null, fqStep: { krabs: 0, plankton: 0 }, factionDone: null,
      flags: {}, giftCount: {}, lastSpendDay: null, lastSeenDay: null,
      loot: 0, visited: {}, pickups: {}, chatDay: {}, giftDay: {}, storyDone: {}, metIntro: {},
    };
  }
  let state = load() || freshState();
  // v5 迁移：老存档补痞老板好感与阵营字段，补完立即落盘
  let migrated = false;
  if (!('plankton' in state.affinity)) { state.affinity.plankton = 0; migrated = true; }
  if (!('faction' in state)) { state.faction = null; migrated = true; }
  if (!('fq' in state)) { state.fq = null; migrated = true; }
  if (!state.fqStep) { state.fqStep = { krabs: 0, plankton: 0 }; migrated = true; }
  if (!state.flags) { state.flags = {}; migrated = true; }
  if (!state.giftCount) { state.giftCount = {}; migrated = true; }
  if (migrated) save();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 忽略 */ } }
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const clampAffinity = v => Math.max(0, Math.min(100, v));
  const BOSS_OF = { krabs: 'plankton', plankton: 'krabs' };
  let justLocked = null; // 本次操作刚锁定的阵营（供对话播报）
  function addAffinity(npc, delta) {
    if (!(npc in state.affinity)) return;
    // 已站队后，敌对老板的好感冻结
    if (state.faction && BOSS_OF[state.faction] === npc && delta > 0) return;
    const affBefore = state.affinity[npc];
    state.affinity[npc] = clampAffinity(state.affinity[npc] + delta);
    if (npc === 'squidward' && affBefore < 100 && state.affinity[npc] >= 100 && !state.flags.squidMaxPlayed) {
      state.flags.squidMax = 'pending';
    }
    // 阵营锁定：两位老板谁先到 60，自动入营，对方清零转敌对
    if (!state.faction && BOSS_OF[npc] && state.affinity[npc] >= 60) {
      state.faction = npc;
      state.affinity[BOSS_OF[npc]] = 0;
      justLocked = npc;
    }
    save();
  }

  // —— v5 阵营任务链（真主线）：接取/交付都在老板对话里，进度靠地点/消费/聊天/送礼事件推进 ——
  const FACTION_QUESTS = {
    krabs: [
      { id: 'k1', name: '夜巡蟹堡王', desc: '21 点后去蟹堡王巡一圈，看看有没有可疑的人。', type: 'visit', loc: 'diner', hourFrom: 21, hourTo: 24 },
      { id: 'k2', name: '秘方护送', desc: '先到蟹堡王取“秘方”，3 分钟内送到菠萝屋。', type: 'chain', seq: ['diner', 'conch'], within: 180 },
      { id: 'k3', name: '揪内鬼', desc: '和 3 位不同的邻居聊聊，打听最近的风声。', type: 'chats', count: 3 },
      { id: 'k4', name: '加固后厨', desc: '在蟹堡王吃一顿好的：食堂餐饮单笔 ≥¥30。', type: 'spend', category: '食堂餐饮', min: 30 },
      { id: 'k5', name: '假秘方诱饵', desc: '去海之霸放出“秘方要转移”的风声，再回蟹堡王复命。', type: 'chain', seq: ['chum', 'diner'] },
      { id: 'k6', name: '决战·营业夜', desc: '19–22 点先守在蟹堡王，再去镇中心巡逻，最后回蟹堡王。', type: 'chain', seq: ['diner', 'street', 'diner'], hourFrom: 19, hourTo: 22, final: true },
    ],
    plankton: [
      { id: 'p1', name: '踩点', desc: '白天（7–18 点）去蟹堡王摸清布局。', type: 'visit', loc: 'diner', hourFrom: 7, hourTo: 18 },
      { id: 'p2', name: '收买人心', desc: '给任意邻居送 2 次礼，嘴要甜，手要快。', type: 'gifts', count: 2 },
      { id: 'p3', name: '调虎离山', desc: '先去超市逛一圈，再晃到蟹堡王门口。', type: 'chain', seq: ['market', 'diner'] },
      { id: 'p4', name: '偷钥匙', desc: '深夜 0–5 点摸到蟹堡王后门。', type: 'visit', loc: 'diner', hourFrom: 0, hourTo: 5 },
      { id: 'p5', name: '风口交货', desc: '带着至少 2 颗通缉星回到海之霸交货。', type: 'wantedVisit', loc: 'chum', minStars: 2 },
      { id: 'p6', name: '决战·潜入后厨', desc: '18 点后潜入蟹堡王，2 分钟内撤回海之霸。', type: 'chain', seq: ['diner', 'chum'], within: 120, hourFrom: 18, hourTo: 24, final: true },
    ],
  };
  const hourNow = () => new Date().getHours();
  const hourIn = (h, from, to) => from == null ? true : (from <= to ? (h >= from && h < to) : (h >= from || h < to));
  function currentQuestDef() {
    if (!state.faction) return null;
    const chain = FACTION_QUESTS[state.faction];
    const idx = state.fqStep[state.faction] || 0;
    return idx < chain.length ? chain[idx] : null;
  }
  function activeDef() {
    if (!state.fq || !state.faction) return null;
    return FACTION_QUESTS[state.faction].find(q => q.id === state.fq.id) || null;
  }
  function questProgressText(def) {
    const sub = (state.fq && state.fq.sub) || {};
    if (sub.met) return '已完成，回去交任务！';
    if (def.type === 'chain') return `进度 ${(sub.idx || 0)}/${def.seq.length} 段`;
    if (def.type === 'chats') return `已打听 ${Object.keys(sub.set || {}).length}/${def.count}`;
    if (def.type === 'gifts') return `已送礼 ${sub.n || 0}/${def.count}`;
    return '尚未完成';
  }
  function fqOnPlace(loc) {
    // 隐藏任务 H1：深夜在海之霸听痞老板说漏嘴
    if (loc === 'chum' && hourNow() >= 23 && !state.flags.leakHeard && !state.faction) {
      state.flags.leakHeard = true;
      addAffinity('plankton', 10);
      save();
    }
    const def = activeDef();
    if (!def || !state.fq) return;
    const sub = state.fq.sub;
    if (sub.met) return;
    if (def.type === 'visit') {
      if (loc === def.loc && hourIn(hourNow(), def.hourFrom, def.hourTo)) sub.met = true;
    } else if (def.type === 'wantedVisit') {
      const stars = ((quests.getWanted && quests.getWanted()) || {}).stars || 0;
      if (loc === def.loc && stars >= def.minStars) sub.met = true;
    } else if (def.type === 'chain') {
      if (sub.deadline && Date.now() > sub.deadline) { sub.idx = 0; sub.deadline = null; }
      const expect = def.seq[sub.idx || 0];
      if (loc === expect) {
        if ((sub.idx || 0) === 0 && def.hourFrom != null && !hourIn(hourNow(), def.hourFrom, def.hourTo)) return;
        sub.idx = (sub.idx || 0) + 1;
        if (def.within && sub.idx === 1) sub.deadline = Date.now() + def.within * 1000;
        if (sub.idx >= def.seq.length) sub.met = true;
      }
    }
    save();
  }
  function fqOnSpend(exp) {
    state.lastSpendDay = todayKey();
    const def = activeDef();
    if (def && state.fq && !state.fq.sub.met && def.type === 'spend'
      && exp.category === def.category && Number(exp.amount) >= def.min) {
      state.fq.sub.met = true;
    }
    // 隐藏任务 H3：章鱼哥的单簧管配件
    if (state.flags.clarinetStage === 1 && exp.category === '超市日用' && Number(exp.amount) >= 15) {
      state.flags.clarinetBought = true;
    }
    save();
  }
  function fqOnChat(npc) {
    const def = activeDef();
    if (def && state.fq && !state.fq.sub.met && def.type === 'chats') {
      state.fq.sub.set = state.fq.sub.set || {};
      state.fq.sub.set[npc] = true;
      if (Object.keys(state.fq.sub.set).length >= def.count) state.fq.sub.met = true;
      save();
    }
  }
  function fqOnGift(npc) {
    state.giftCount[npc] = (state.giftCount[npc] || 0) + 1;
    // 隐藏任务 H2：给派大星累计送礼 5 次
    if (npc === 'patrick' && state.giftCount.patrick >= 5 && !state.flags.patGift) {
      state.flags.patGift = true;
      try { quests.addReputation(5, 'hidden-pat-gift'); } catch { /* 忽略 */ }
    }
    const def = activeDef();
    if (def && state.fq && !state.fq.sub.met && def.type === 'gifts') {
      state.fq.sub.n = (state.fq.sub.n || 0) + 1;
      if (state.fq.sub.n >= def.count) state.fq.sub.met = true;
    }
    save();
  }
  // 观察消费（不改 quest.js：包一层它已 patch 过的 addExpense）
  if (quests.addExpense && !quests.__bsObserved) {
    const origAdd = quests.addExpense.bind(quests);
    quests.addExpense = (exp) => { const r = origAdd(exp); try { fqOnSpend(exp || {}); } catch { /* 忽略 */ } return r; };
    quests.__bsObserved = true;
  }

  function factionAnnouncement(npc) {
    if (npc === 'krabs') return '蟹老板一把攥住你的手：「好！从今天起，你就是蟹堡王的人。秘方要是出事，我第一个找你——开玩笑的。……不是开玩笑。」（你已站到蟹老板这边，痞老板与你敌对）';
    return '痞老板跳上柜台与你平视：「明智的选择，合伙人。蟹堡王的秘方，迟早是我们的。对面那只螃蟹，从此是敌人了。」（你已站到痞老板这边，蟹老板与你敌对）';
  }
  function tierOf(npc) {
    const v = state.affinity[npc] || 0;
    return v >= 60 ? 2 : v >= 25 ? 1 : 0;
  }

  // —— DOM ——
  const style = document.createElement('style');
  style.textContent = `
    #survival-social-btn{position:fixed;right:14px;bottom:150px;z-index:120;background:#ffb703;color:#14313d;
      border:none;border-radius:999px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;
      box-shadow:0 4px 14px rgba(0,0,0,.35);}
    .survival-npc-overlay{position:fixed;inset:0;background:rgba(4,20,28,.55);z-index:150;
      display:flex;align-items:flex-end;justify-content:center;}
    .survival-npc-overlay[hidden]{display:none !important;}
    .survival-npc-card{background:#0d2b38;color:#e8f4f8;width:min(560px,94vw);border-radius:18px 18px 0 0;
      padding:16px;display:flex;gap:14px;border:1px solid rgba(255,183,3,.35);border-bottom:none;}
    .survival-npc-card img{width:104px;height:104px;object-fit:cover;border-radius:12px;background:#123542;flex:none;}
    .survival-npc-main{flex:1;min-width:0;}
    .survival-npc-head{display:flex;justify-content:space-between;align-items:baseline;}
    .survival-npc-head b{font-size:17px;color:#ffb703;}
    .survival-npc-aff{font-size:12px;color:#ff9db1;}
    .survival-npc-line{margin:8px 0 12px;font-size:14px;line-height:1.6;min-height:44px;}
    .survival-npc-opts{display:flex;flex-wrap:wrap;gap:8px;}
    .survival-npc-opts button{background:#17465a;color:#e8f4f8;border:1px solid rgba(255,255,255,.18);
      border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer;}
    .survival-npc-opts button.survival-npc-primary{background:#ffb703;color:#14313d;font-weight:700;border:none;}
    .survival-npc-note{font-size:12px;color:#8fd0a8;margin-top:8px;min-height:16px;}
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'survival-social-btn';
  btn.type = 'button';
  btn.hidden = true;
  document.body.appendChild(btn);

  const overlay = document.createElement('div');
  overlay.className = 'survival-npc-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="survival-npc-card">
      <img id="survival-npc-img" alt="">
      <div class="survival-npc-main">
        <div class="survival-npc-head"><b id="survival-npc-name"></b><span id="survival-npc-aff" class="survival-npc-aff"></span></div>
        <p id="survival-npc-line" class="survival-npc-line"></p>
        <div id="survival-npc-opts" class="survival-npc-opts"></div>
        <div id="survival-npc-note" class="survival-npc-note"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = id => overlay.querySelector('#' + id);
  let pending = null; // { kind: 'npc'|'passerby', npc }
  let storyStep = null;

  function portrait(npc, expr) {
    const def = NPCS[npc];
    const img = $('survival-npc-img');
    img.style.display = '';
    if (!def || !def.img) { img.src = './survival/img/anim/rob-1.png'; return; }
    img.onerror = () => {
      img.onerror = () => { img.style.display = 'none'; };
      img.src = `./survival/img/npc/${def.img}-normal.png?v=1125b`;
    };
    img.src = `./survival/img/npc/${def.img}-${expr}.png?v=1125b`;
  }
  function refreshHud() { if (window.SurvivalHUD) window.SurvivalHUD.refresh(); }
  function setLine(text) { $('survival-npc-line').textContent = text; }
  function setNote(text) { $('survival-npc-note').textContent = text || ''; }
  function setAff(npc) {
    $('survival-npc-aff').textContent = npc in state.affinity ? `好感 ${state.affinity[npc]}` : '';
  }
  function setOptions(list) {
    const box = $('survival-npc-opts');
    box.textContent = '';
    for (const item of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      if (item.primary) b.className = 'survival-npc-primary';
      b.addEventListener('click', item.onClick);
      box.appendChild(b);
    }
  }
  function closeDialog() {
    overlay.hidden = true;
    storyStep = null;
    document.body.classList.remove('survival-locked');
  }

  function openNpc(npc) {
    const def = NPCS[npc];
    if (!def) return;
    const tday = todayKey();
    if (state.lastSeenDay !== tday) {
      state.lastSeenDay = tday;
      if (state.lastSpendDay && !state.flags.ascetic) {
        const diff = Math.round((new Date(tday) - new Date(state.lastSpendDay)) / 86400000);
        if (diff >= 3) {
          state.flags.ascetic = true;
          state.flags.asceticJust = true;
          try { quests.addReputation(5, 'hidden-ascetic'); } catch { /* 忽略 */ }
        }
      }
      save();
    }
    pending = null;
    btn.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('survival-locked');
    $('survival-npc-name').textContent = def.name;
    setAff(npc);
    setNote('');
    portrait(npc, 'normal');

    // 已站队后，敌对老板直接翻脸（痞老板敌对时连赃也不收）
    if (state.faction && BOSS_OF[state.faction] === npc) {
      setLine(npc === 'plankton'
        ? '叛徒的味道，老远就闻到了。海之霸不欢迎你——滚回对面吃你的蟹黄堡去！'
        : '哼，我都听说了。你现在是海之霸的人了？蟹堡王的门，你以后绕着走！');
      portrait(npc, 'angry');
      setOptions([{ label: '离开', onClick: closeDialog }]);
      return;
    }

    setLine(def.greet[tierOf(npc)]);
    if (state.flags.asceticJust) { state.flags.asceticJust = false; save(); setNote('隐藏成就：苦行者（连续 3 天零消费）· 声望 +5'); }
    const opts = [];
    const day = todayKey();
    if (state.chatDay[npc] !== day) {
      opts.push({
        label: '聊聊天', primary: true,
        onClick: () => {
          state.chatDay[npc] = day;
          addAffinity(npc, 5);
          fqOnChat(npc);
          if (justLocked) {
            setLine(factionAnnouncement(justLocked));
            setNote(`好感 +5 · 你已加入${justLocked === 'krabs' ? '蟹老板' : '痞老板'}阵营`);
            justLocked = null;
          } else {
            setLine(def.chat[Math.floor(Math.random() * def.chat.length)]);
            setNote('好感 +5');
          }
          setAff(npc);
          portrait(npc, 'happy');
          openNpcOptions(npc);
        },
      });
    }
    opts.push({
      label: '送个小礼物（¥10）',
      onClick: () => {
        try {
          quests.addExpense({ amount: 10, category: '娱乐社交', note: `给${def.name}的小礼物` });
          addAffinity(npc, 8);
          fqOnGift(npc);
          if (justLocked) {
            setLine(factionAnnouncement(justLocked));
            setNote(`好感 +8 · 你已加入${justLocked === 'krabs' ? '蟹老板' : '痞老板'}阵营`);
            justLocked = null;
          } else {
            setLine('这……这怎么好意思。下次你来，我给你留好的。');
            setNote('好感 +8 · 已记账 ¥10');
          }
          portrait(npc, 'happy');
        } catch (error) {
          setLine('（礼物没送出去：' + (error.message || '记账失败') + '）');
          portrait(npc, 'angry');
        }
        setAff(npc);
        refreshHud();
        openNpcOptions(npc);
      },
    });
    if (npc === 'plankton' && state.loot >= 20) {
      opts.push({
        label: `销赃 ¥${state.loot}（每¥20 消 1 星）`, primary: true,
        onClick: () => {
          const curStars = (quests.getWanted() || {}).stars || 0;
          const rate = (curStars >= 5 && !state.flags.fenceDeal) ? 15 : 20;
          const stars = Math.min(Math.floor(state.loot / rate), curStars);
          if (stars <= 0) { setLine('你现在一星都没有，拿钱来换空气吗？走走走。'); setOptions([{ label: '离开', onClick: closeDialog }]); return; }
          if (rate === 15) state.flags.fenceDeal = true;
          state.loot -= stars * rate;
          save();
          quests.clearWanted(stars);
          setLine(`成交。${stars} 颗星，从记录上抹掉了。你我都没见过面。${rate === 15 ? '（五星贵宾价，下不为例。）' : ''}`);
          setNote(`赃款 -¥${stars * rate} · 通缉 -${stars} 星`);
          portrait(npc, 'happy');
          refreshHud();
          setOptions([{ label: '离开', onClick: closeDialog }]);
        },
      });
    }
    if (state.faction === npc) {
      const qdef = currentQuestDef();
      if (qdef && !state.fq) {
        opts.push({
          label: `接任务：${qdef.name}`, primary: true,
          onClick: () => {
            state.fq = { id: qdef.id, sub: {} };
            save();
            setLine(`${qdef.desc}（做完回来找我。）`);
            setNote(`已接取阵营任务：${qdef.name}`);
            setOptions([{ label: '离开', onClick: closeDialog }]);
          },
        });
      } else if (qdef && state.fq && state.fq.id === qdef.id) {
        if (state.fq.sub && state.fq.sub.met) {
          opts.push({
            label: `交付任务：${qdef.name}`, primary: true,
            onClick: () => {
              const rep = qdef.final ? 20 : 10;
              try { quests.addReputation(rep, 'faction-quest'); } catch { /* 忽略 */ }
              state.fqStep[npc] = (state.fqStep[npc] || 0) + 1;
              state.fq = null;
              if (qdef.final) state.factionDone = npc;
              save();
              addAffinity(npc, 6);
              setLine(qdef.final
                ? (npc === 'krabs' ? '秘方，守住了。这个月，比奇堡还是老样子——而你，是自己人了。' : '秘方到手了！！合伙人，我们改写比奇堡的历史了！')
                : '干得漂亮。这事办得，我心里有数。');
              setNote(`阵营任务完成 · 声望 +${rep} · 好感 +6`);
              portrait(npc, 'happy');
              refreshHud();
              setOptions([{ label: '离开', onClick: closeDialog }]);
            },
          });
        } else {
          opts.push({
            label: '任务进展',
            onClick: () => { setLine(`${qdef.desc}`); setNote(questProgressText(qdef)); },
          });
        }
      }
    }
    if (npc === 'squidward' && (state.affinity.squidward || 0) >= 80 && !state.flags.clarinetDone) {
      if (!state.flags.clarinetStage) {
        opts.push({
          label: '听听他的单簧管', primary: true,
          onClick: () => {
            state.flags.clarinetStage = 1;
            save();
            setLine('我的单簧管……音孔垫坏了。听说超市有替换件，十五块上下。你要是顺路……算了，当我没说。（他把脸别过去，耳朵却竖着。）');
            setNote('隐藏任务：去超市买一份 ≥¥15 的日用，回来交给他');
            setOptions([{ label: '离开', onClick: closeDialog }]);
          },
        });
      } else if (state.flags.clarinetBought) {
        opts.push({
          label: '把单簧管配件交给他', primary: true,
          onClick: () => {
            state.flags.clarinetDone = true;
            save();
            try { quests.addReputation(10, 'hidden-clarinet'); } catch { /* 忽略 */ }
            addAffinity('squidward', 5);
            setLine('……你真买了。（他沉默了很久，吹了一个完整的音阶，一个音都没跑。）下周的独奏会，头排中间，给你留着。');
            setNote('隐藏任务完成 · 声望 +10 · 好感 +5');
            portrait('squidward', 'happy');
            refreshHud();
            setOptions([{ label: '离开', onClick: closeDialog }]);
          },
        });
      }
    }
    if ((state.affinity[npc] || 0) >= 60 && state.giftDay[npc] !== day) {
      opts.push({
        label: '收下回礼',
        onClick: () => {
          state.giftDay[npc] = day;
          save();
          quests.addReputation(2, 'npc-gift');
          setLine('拿着，老朋友之间不兴客气。出门在外，名声比钱经花。');
          setNote('声望 +2');
          portrait(npc, 'happy');
          refreshHud();
          openNpcOptions(npc);
        },
      });
    }
    if ((state.affinity[npc] || 0) >= 80 && !state.storyDone[npc]) {
      opts.push({
        label: '听听他的故事', primary: true,
        onClick: () => playStory(npc),
      });
    }
    opts.push({ label: '离开', onClick: closeDialog });
    setOptions(opts);
  }
  function openNpcOptions(npc) {
    // 动作之后保留可继续操作的选项（简化：只留离开与故事入口）
    const def = NPCS[npc];
    const opts = [];
    if ((state.affinity[npc] || 0) >= 80 && !state.storyDone[npc]) {
      opts.push({ label: '听听他的故事', primary: true, onClick: () => playStory(npc) });
    }
    opts.push({ label: '离开', onClick: closeDialog });
    setOptions(opts);
    void def;
  }
  function playStory(npc) {
    const def = NPCS[npc];
    storyStep = 0;
    const next = () => {
      if (storyStep >= def.story.length) {
        state.storyDone[npc] = true;
        save();
        quests.addReputation(10, 'npc-story');
        setNote('专属剧情完成 · 声望 +10');
        portrait(npc, 'happy');
        setOptions([{ label: '离开', onClick: closeDialog }]);
        refreshHud();
        return;
      }
      setLine(def.story[storyStep]);
      storyStep += 1;
      setOptions([{ label: '继续', primary: true, onClick: next }]);
    };
    next();
  }

  function openPasserby() {
    pending = null;
    btn.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('survival-locked');
    $('survival-npc-name').textContent = '路过的邻居';
    $('survival-npc-aff').textContent = '';
    setNote('');
    const img = $('survival-npc-img');
    img.onerror = null;
    img.src = './survival/img/anim/passerby.png?v=1125a';
    setLine('哎，你也是住这片的吧？这片水域最近可不太平。');
    setOptions([
      {
        label: '打个招呼', primary: true,
        onClick: () => {
          if (Math.random() < 0.6) {
            quests.addReputation(2, 'passerby');
            setLine('哈哈，你这人真热络。拿着，路上小心点。');
            setNote('声望 +2');
          } else {
            setLine('嗯。（对方点点头，游走了。）');
          }
          refreshHud();
          setOptions([{ label: '继续赶路', onClick: closeDialog }]);
        },
      },
      {
        label: '抢劫！',
        onClick: () => {
          const gain = 10 + Math.floor(Math.random() * 21);
          state.loot += gain;
          for (const id of Object.keys(state.affinity)) state.affinity[id] = clampAffinity(state.affinity[id] - 2);
          save();
          try { quests.addWanted('after-hours'); } catch { /* 已满星 */ }
          quests.addReputation(-5, 'robbery');
          setLine('你、你要干什么！来人啊——！（对方丢下钱包游走了）');
          setNote(`抢到 ¥${gain}（赃款，去海之霸找痞老板销赃）· 通缉 +1 · 声望 -5 · 全员好感 -2`);
          img.src = './survival/img/anim/rob-1.png';
          refreshHud();
          setOptions([{ label: '赶紧溜', onClick: closeDialog }]);
        },
      },
      { label: '假装没看见', onClick: closeDialog },
    ]);
  }

  btn.addEventListener('click', () => {
    if (!pending) return;
    if (pending.kind === 'npc') openNpc(pending.npc);
    else openPasserby();
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const frame = document.getElementById('dive-view');
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'bikini-place' && data.loc) {
      try { fqOnPlace(data.loc); } catch { /* 忽略 */ }
      window.__bsNearPlace = { loc: data.loc, at: Date.now() };
      const day = todayKey();
      if (!state.visited[data.loc]) {
        state.visited[data.loc] = day;
        save();
      }
    } else if (data.type === 'bikini-npc-near' && NPCS[data.npc]) {
      pending = { kind: 'npc', npc: data.npc };
      btn.textContent = `和${NPCS[data.npc].name}聊聊`;
      btn.hidden = false;
      setTimeout(() => { if (pending && pending.npc === data.npc) { pending = null; btn.hidden = true; } }, 20000);
    } else if (data.type === 'bikini-passerby') {
      if (pending) return;
      pending = { kind: 'passerby' };
      btn.textContent = '有个路人……';
      btn.hidden = false;
      setTimeout(() => { if (pending && pending.kind === 'passerby') { pending = null; btn.hidden = true; } }, 15000);
    }
  });

  // 当前阵营任务的导航目标（给 HUD 算引导光路用）
  function getGuide() {
    if (!state.faction) return null;
    const bossName = NPCS[state.faction].name;
    const bossLoc = state.faction === 'krabs' ? 'diner' : 'chum';
    const def = currentQuestDef();
    if (!def) return null;
    if (!state.fq) {
      return { loc: bossLoc, kind: 'info', questId: def.id, questName: def.name, label: `去找${bossName}接阵营任务` };
    }
    if (state.fq.sub && state.fq.sub.met) {
      return { loc: bossLoc, kind: 'claim', boss: state.faction, questId: def.id, questName: def.name, label: `回去找${bossName}交付任务` };
    }
    if (def.type === 'visit' || def.type === 'wantedVisit') {
      return { loc: def.loc, kind: 'go', questId: def.id, questName: def.name, label: def.desc };
    }
    if (def.type === 'chain') {
      const idx = (state.fq.sub && state.fq.sub.idx) || 0;
      return { loc: def.seq[idx], kind: 'go', questId: def.id, questName: def.name, label: `${def.desc}（第 ${idx + 1}/${def.seq.length} 站）` };
    }
    return { loc: null, kind: 'info', questId: def.id, questName: def.name, label: def.desc };
  }
  function consumeSpecial() {
    if (state.flags.squidMax === 'pending') {
      state.flags.squidMaxPlayed = true;
      delete state.flags.squidMax;
      save();
      return 'squidward-max';
    }
    return null;
  }

  window.BSSocial = {
    getAffinity: npc => state.affinity[npc] || 0,
    getFaction: () => state.faction,
    getVisited: () => ({ ...state.visited }),
    getState: () => state,
    getGuide,
    consumeSpecial,
    openNpc,
  };
})();
