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
      chat: ['秘方保险柜我又加了把锁，这事你知我知。', '痞老板今天在对面探头探脑，你路过帮我留意一眼。', '钱不是省出来的，是算出来的。记账这习惯，你比我强。'],
      story: ['跟你说句掏心窝的：我年轻时也月光，月底啃海带根。', '后来我给自己定了条规矩——每天先记账，再花钱。你现在的样子，像极了当年的我。', '这张贵宾卡你拿着。以后在比奇堡，报我蟹老板的名字。'],
    },
    patrick: {
      name: '派大星', img: 'patrick',
      greet: ['咦，你是谁来着……哦哦哦，是你！', '嘿嘿，你来啦。我刚在数我的石头，它有三颗了。', '我最好的朋友来了！今天我们玩什么？先说好，不能跑太快。'],
      chat: ['我把钱藏在石头下面，这样我就花不了它。我是不是很聪明？', '冰淇淋车的声音一响，我的腿就自己走过去了。', '你知道吗，睡觉不用花钱。所以我睡得特别多。'],
      story: ['其实我记性不好，经常忘了你是谁。', '但每次你来，我肚子就暖暖的。妈妈说，那是朋友的感觉。', '这颗石头送你。它是我第二喜欢的。第一喜欢的我要留着当枕头。'],
    },
    squidward: {
      name: '章鱼哥', img: 'squidward',
      greet: ['……如果是推销，请把传单塞门缝里就好。', '哦，是你。进来吧，脚步轻点，我在练音阶。', '难得有个不吵的人。坐吧，茶在柜子上，自己倒。'],
      chat: ['我的单簧管又跑音了。邻居们居然说是我吹得不好。', '安静是最贵的奢侈品，可惜这条街没人买账。', '你记账的样子很认真。这年头，认真的人不多了。'],
      story: ['你知道我为什么总躲着大家吗？热闹过后，耳朵会嗡嗡响一整晚。', '但你不一样。你来的时候，世界好像把音量调低了两格。', '下周我的独奏会，你来听。票……算了，你的那张我请。'],
    },
    sandy: {
      name: '珊迪', img: 'sandy',
      greet: ['新面孔？报上名来，顺便帮我扶一下这个培养皿。', '来得正好，我的氧气循环实验刚进第二阶段。', '搭档！今天的数据我预感要爆表，快进来。'],
      chat: ['德州的规矩：欠账不过夜，实验数据不过周。', '我的预算表精确到小数点后两位，误差只允许来自水母。', '陆地上的橡子真贵。好在知识不要钱，只要时间。'],
      story: ['我离家这么远，有时候夜里会想德州的风。', '但比奇堡有你们，数据也一天天变好。科学和朋友，我都要。', '这个防水笔记本送你。记账、采样、写日记都行——别再弄丢预算了。'],
    },
    puff: {
      name: '泡芙老师', img: 'puff',
      greet: ['站住。先深呼吸，再告诉我你今天闯了几个红灯。', '是你呀。坐吧，茶几上有冷静糖，先吃一颗。', '我最省心的学生来了。今天想学点什么？'],
      chat: ['教了这么多年，我的气球都换了好几打。', '靠岸练习的要领就一个：慢。花钱也一样，慢一点。', '你的账本我看过，条理清楚。难得。'],
      story: ['每个老师都有几个记一辈子的学生。', '你不是最有天赋的，但你是最肯回头看路的。开船也好，过日子也好，这点最要紧。', '这枚靠岸徽章给你。以后在比奇堡的每片水域，你都停得稳。'],
    },
    spongebob: {
      name: '海绵宝宝', img: 'spongebob',
      greet: ['嗨！！！你来啦！！今天也是元气满满的一天对吧！', '我就知道你会来！小蜗刚刚还提起你！', '最——好——的朋友驾到！蟹堡已经在锅上给你留了位置！'],
      chat: ['我煎蟹堡的时候会哼歌，歌词全是今天的特价。', '抓水母要诀：网要轻，心要诚，跑得要比水母快一点点。', '我的工资都存进罐子里了，罐子上面写着“梦想基金”。'],
      story: ['你知道吗，我刚来比奇堡的时候，口袋里只有三枚硬币。', '是蟹老板给了我第一份工作，是大家让我留了下来。', '现在轮到你了。这个月，咱们一起把日子过成招牌菜！'],
    },
    plankton: {
      name: '痞老板（幕后）', img: null,
      greet: ['嘘——小声点。你手里那些“货”，我这儿价格公道。', '嘘——小声点。你手里那些“货”，我这儿价格公道。', '嘘——小声点。你手里那些“货”，我这儿价格公道。'],
      chat: ['蟹堡秘方拿不到，收点二手钱包也不错。', '巡逻最近查得紧，你我都低调点。'],
      story: [],
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
      affinity: { krabs: 0, patrick: 0, squidward: 0, sandy: 0, puff: 0, spongebob: 0 },
      loot: 0, visited: {}, pickups: {}, chatDay: {}, giftDay: {}, storyDone: {}, metIntro: {},
    };
  }
  let state = load() || freshState();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 忽略 */ } }
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const clampAffinity = v => Math.max(0, Math.min(100, v));
  function addAffinity(npc, delta) {
    if (!(npc in state.affinity)) return;
    state.affinity[npc] = clampAffinity(state.affinity[npc] + delta);
    save();
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
      img.src = `./survival/img/npc/${def.img}-normal.png?v=1124d`;
    };
    img.src = `./survival/img/npc/${def.img}-${expr}.png?v=1124d`;
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
    pending = null;
    btn.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('survival-locked');
    $('survival-npc-name').textContent = def.name;
    setAff(npc);
    setNote('');
    portrait(npc, 'normal');

    if (npc === 'plankton') {
      setLine(def.greet[0]);
      const opts = [];
      if (state.loot >= 20) {
        opts.push({
          label: `销赃 ¥${state.loot}（每¥20 消 1 星）`, primary: true,
          onClick: () => {
            const stars = Math.min(Math.floor(state.loot / 20), (quests.getWanted() || {}).stars || 0);
            if (stars <= 0) { setLine('你现在一星都没有，拿钱来换空气吗？走走走。'); return; }
            state.loot -= stars * 20;
            save();
            quests.clearWanted(stars);
            setLine(`成交。${stars} 颗星，从记录上抹掉了。你我都没见过面。`);
            setNote(`赃款 -¥${stars * 20} · 通缉 -${stars} 星`);
            portrait(npc, 'happy');
            refreshHud();
            setOptions([{ label: '离开', onClick: closeDialog }]);
          },
        });
      }
      opts.push({ label: '打听行情', onClick: () => { setLine(def.chat[Math.floor(Math.random() * def.chat.length)]); } });
      opts.push({ label: '离开', onClick: closeDialog });
      setOptions(opts);
      return;
    }

    setLine(def.greet[tierOf(npc)]);
    const opts = [];
    const day = todayKey();
    if (state.chatDay[npc] !== day) {
      opts.push({
        label: '聊聊天', primary: true,
        onClick: () => {
          state.chatDay[npc] = day;
          addAffinity(npc, 5);
          setLine(def.chat[Math.floor(Math.random() * def.chat.length)]);
          setNote('好感 +5');
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
          setLine('这……这怎么好意思。下次你来，我给你留好的。');
          setNote('好感 +8 · 已记账 ¥10');
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

  window.BSSocial = {
    getAffinity: npc => state.affinity[npc] || 0,
    getVisited: () => ({ ...state.visited }),
    getState: () => state,
    openNpc,
  };
})();
