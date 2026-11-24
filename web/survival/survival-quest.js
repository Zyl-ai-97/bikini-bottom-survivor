/*
 * R2 v3 比奇堡立足 30 天。浏览器先加载 survival-logic.js，再加载本文件。
 * UI 用 BudgetQuests.addExpense(...) 记账，处理护盾、消费通缉、修正余额和 HP，并返回 feedback.anim。
 * BudgetSurvivor.addExpense 的原有入口仍可用，返回的 feedback 保持原有字段。
 * HUD 余额和 HP 用 BudgetQuests.getDerived()。BudgetSurvivor.getStats / getReport
 * 仍用原来的调用方式，它们会读到修正后的连击和合并后的成就。
 * 营业时间使用 setHour(h) 注入的游戏时间。旧档没有该值时使用浏览器当前本地小时。
 * 通缉和事件按本地日历日刷新，读取即生效，下一次写入时保存。
 * 集成层在海之霸消费后调用 markChumSpent()，在巡逻等事件里按规则调整通缉和声望。
 * 外卖用每次到访的时间戳，在下一次有效到访时判定段间超时。
 *
 * 演示顺序：先 const demo = BudgetSurvivor.generateDemoData()，
 * 再 BudgetQuests.seedDemo(demo) 保存。零参数 seedDemo() 会先生成当天的基础演示。
 *
 * Node 自测：node web/survival/survival-quest.js --self-test
 */
if (typeof window !== "undefined") {
  (() => {
    "use strict";

    const survivor = window.BudgetSurvivor;
    if (!survivor) throw new Error("请先加载 survival-logic.js。");
    if (window.BudgetQuests) return;

    const core = { ...survivor };
    const STORAGE_KEY = "budget-survivor-state-v1";
    const DAILY_INCOME_CAP = 100;
    const DAY_MS = 86_400_000;
    const DELIVERY_ID = "delivery-chain";
    const DELIVERY_REPUTATION = 60;
    const DELIVERY_LEG_MS = 180_000;
    const NO_REWARD = Object.freeze({ income: 0, shield: 0 });
    const STREAK_ACHIEVEMENTS = ["稳住侠", "自律领主", "生存大师"];
    const REPUTATION_TIERS = [
      [0, "无名小卒"], [20, "街坊熟人"], [45, "比奇堡红人"], [70, "小镇传奇"],
    ];
    // 区间包含开门时刻。chum 的 30 指次日 06:00，第 30 小时整已经打烊。
    const BUSINESS_HOURS = Object.freeze({
      diner: Object.freeze([7, 22]),
      chum: Object.freeze([18, 30]),
      school: Object.freeze([8, 18]),
      market: null,
    });
    const EVENT_POOL = Object.freeze([
      {
        id: "jelly-migration", title: "水母迁徙",
        desc: "今天到水母田观察迁徙，交付可领 20 元。",
      },
      {
        id: "market-sale", title: "超市促销",
        desc: "今天超市日用消费累计满 100 元后到超市，返现 10%，最多 30 元。",
      },
      {
        id: "plankton-trap", title: "痞老板的邀约",
        desc: "赴约需要今天在海之霸消费，完成加 8 声望。拒绝立即获得 1 个护盾。",
      },
      {
        id: "tailwind", title: "顺风日",
        desc: "今天支线收入乘 1.5，完成任意一条支线即可完成事件。",
      },
    ].map(Object.freeze));

    const MAIN_QUESTS = Object.freeze([
      {
        id: "first-meal", title: "在蟹堡王吃一顿", desc: "记一笔至少 20 元的食堂餐饮。",
        type: "spend", category: "食堂餐饮", amount: 20,
      },
      {
        id: "snail-food", title: "给小蜗买粮", desc: "记一笔至少 60 元的超市日用。",
        type: "spend", category: "超市日用", amount: 60,
      },
      {
        id: "streak-3", title: "连续三天守住预算", desc: "当前连击达到 3。",
        type: "streak", days: 3,
      },
      {
        id: "first-job", title: "第一份工", desc: "累计完成 1 条支线。",
        type: "sideCount", count: 1,
      },
      {
        id: "jelly-net", title: "买一把水母网", desc: "记一笔至少 80 元的超市日用。",
        type: "spend", category: "超市日用", amount: 80,
      },
      {
        id: "tuition", title: "交航船学校学费", desc: "记一笔至少 200 元的学习打印。",
        type: "spend", category: "学习打印", amount: 200,
      },
      {
        id: "streak-7", title: "守住一周预算", desc: "当前连击达到 7。",
        type: "streak", days: 7,
      },
      {
        id: "birthday", title: "办一场生日聚会", desc: "记一笔至少 120 元的娱乐社交。",
        type: "spend", category: "娱乐社交", amount: 120,
      },
      {
        id: "side-5", title: "比奇堡跑腿五次", desc: "累计完成 5 条支线。",
        type: "sideCount", count: 5,
      },
      {
        id: "roof", title: "给房子修屋顶", desc: "记一笔至少 300 元的超市日用。",
        type: "spend", category: "超市日用", amount: 300,
      },
      {
        id: "frugal-day", title: "过一个节俭日", desc: "有一天的记账总额不高于 30 元，手动确认的零消费日也算。",
        type: "frugalDay", amount: 30,
      },
      {
        id: "rent", title: "付房租", desc: "任一分类记一笔至少 400 元的消费。",
        type: "spend", amount: 400,
      },
    ].map(Object.freeze));

    const SIDE_QUESTS = Object.freeze([
      {
        id: "krabs-secret", npc: "蟹老板", locId: "crab",
        title: "秘方巡查", desc: "先到海之霸，再到餐馆。",
        type: "visit", locations: ["chum", "diner"], reward: { income: 40, shield: 0 },
      },
      {
        id: "patrick-icecream", npc: "派大星", locId: "neighbors",
        title: "要不要来份冰淇淋", desc: "接受花费 15 元，拒绝获得 1 个护盾。",
        type: "choice", reward: NO_REWARD,
      },
      {
        id: "squidward-reed", npc: "章鱼哥", locId: "neighbors",
        title: "帮忙买簧片", desc: "先有一笔至少 20 元的超市日用，再到邻居区。",
        type: "purchaseVisit", destination: "neighbors", category: "超市日用", amount: 20,
        reward: { income: 25, shield: 0 },
      },
      {
        id: "sandy-sampling", npc: "珊迪", locId: "treehouse",
        title: "三站采样", desc: "依次到海湾、山脊和号角处。",
        type: "visit", locations: ["cove", "ridge", "horn"], reward: { income: 0, shield: 1 },
      },
      {
        id: "puff-dock", npc: "泡芙老师", locId: "school",
        title: "码头练习", desc: "在航船学校累计停留 3 秒。",
        type: "stay", destination: "school", seconds: 3, reward: { income: 30, shield: 0 },
      },
      {
        id: "spongebob-jelly", npc: "海绵宝宝", locId: "neighbors",
        title: "水母观察", desc: "在水母田累计停留 20 秒。",
        type: "stay", destination: "jellyfield", seconds: 20, reward: { income: 15, shield: 0 },
      },
      {
        id: DELIVERY_ID, npc: "蟹老板", locId: "diner",
        title: "比奇堡外卖", desc: "依次到餐馆、邻居区和海湾，相邻两站间隔不超过 180 秒。",
        type: "visit", locations: ["diner", "neighbors", "cove"], reward: { income: 60, shield: 0 },
      },
    ].map((quest) => {
      if (quest.locations) Object.freeze(quest.locations);
      Object.freeze(quest.reward);
      return Object.freeze(quest);
    }));
    const SIDE_BY_ID = new Map(SIDE_QUESTS.map((quest) => [quest.id, quest]));

    const CONTENT = Object.freeze({
      achievements: Object.freeze({
        "第一份工": "完成你的第一条支线。",
        "秘方守卫": "替蟹老板完成秘方巡查。",
        "跑腿王": "累计完成五条支线。",
        "好邻居": "为四位不同的比奇堡居民完成任务。",
        "水母大师": "完成水母田的观察任务。",
        "采样专家": "完成珊迪的三站采样。",
        "盛情难却": "接受派大星的冰淇淋邀请。",
        "钢铁意志": "拒绝派大星的冰淇淋邀请。",
        "有房有顶": "完成修屋顶的主线目标。",
        "学有所成": "完成缴纳航船学校学费的主线目标。",
        "寿星快乐": "完成生日聚会的主线目标。",
        "安居乐业": "完成十二个主线目标。",
      }),
    });

    function dateKey(date) {
      return String(date.getFullYear()).padStart(4, "0") + "-"
        + String(date.getMonth() + 1).padStart(2, "0") + "-"
        + String(date.getDate()).padStart(2, "0");
    }

    function isDateKey(value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const time = Date.parse(value + "T00:00:00Z");
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
    }

    function clock(asOf = new Date()) {
      if (typeof asOf === "string" && !isDateKey(asOf)) throw new RangeError("日期无效。");
      const now = new Date(typeof asOf === "string" ? asOf + "T12:00:00" : asOf);
      const date = dateKey(now);
      if (!isDateKey(date)) throw new RangeError("日期无效。");
      return { now, date };
    }

    function beginWrite(asOf) {
      return { ...clock(asOf), previousSave: window.localStorage.getItem(STORAGE_KEY) };
    }

    function list(value) {
      return Array.isArray(value) ? value : [];
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function dayNumber(date) {
      return Date.parse(date + "T00:00:00Z") / DAY_MS;
    }

    function daySeed(date) {
      return Math.imul(dayNumber(date), 0x9e3779b1) >>> 0;
    }

    function nextSeed(seed) {
      return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    }

    function eventOn(date) {
      const roll = nextSeed(daySeed(date) ^ 0xa24baed5) / 2 ** 32;
      return EVENT_POOL[Math.floor(roll * EVENT_POOL.length)];
    }

    function wantedOn(source, date) {
      const last = isDateKey(source?.lastDecayDate) ? source.lastDecayDate : date;
      const elapsed = Math.max(0, dayNumber(date) - dayNumber(last));
      const stars = Number.isInteger(source?.stars) ? source.stars : 0;
      return {
        stars: Math.max(0, clamp(stars, 0, 5) - elapsed),
        lastDecayDate: elapsed > 0 ? date : last,
        dailyFlags: {
          lethal: elapsed === 0 && source?.dailyFlags?.lethal === true,
          overspend: elapsed === 0 && source?.dailyFlags?.overspend === true,
        },
      };
    }

    function dailyEventOn(source, date) {
      const { id } = eventOn(date);
      const sameDay = source?.date === date && source.id === id;
      return {
        id,
        date,
        status: sameDay && ["done", "claimed"].includes(source.status) ? source.status : "active",
        option: sameDay && ["go", "refuse"].includes(source.option) ? source.option : null,
        income: sameDay && Number.isFinite(source.income) && source.income > 0 ? source.income : 0,
      };
    }

    function validHour(hour) {
      return Number.isInteger(hour) && hour >= 0 && hour <= 23;
    }

    function storedState() {
      const json = window.localStorage.getItem(STORAGE_KEY);
      try {
        return json === null ? {} : JSON.parse(json) ?? {};
      } catch (error) {
        if (error instanceof SyntaxError) return {};
        throw error;
      }
    }

    function withExtensions(state, source, time) {
      const input = source?.quests;
      const main = [];
      for (const item of list(input?.main)) {
        const quest = MAIN_QUESTS[main.length];
        if (!quest || item?.id !== quest.id || !isDateKey(item.date)) break;
        main.push({ id: item.id, date: item.date });
      }

      const side = [];
      const seen = new Set();
      for (const item of list(input?.side)) {
        if (!SIDE_BY_ID.has(item?.id) || !isDateKey(item.date)
          || !["active", "done", "failed"].includes(item.status)) continue;
        const key = item.date + ":" + item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        side.push({
          id: item.id,
          date: item.date,
          status: item.status,
          step: Number.isSafeInteger(item.step) && item.step >= 0 ? item.step : 0,
          seconds: Number.isFinite(item.seconds) && item.seconds >= 0 ? item.seconds : 0,
          secondsError: Number.isFinite(item.secondsError) ? item.secondsError : 0,
          claimed: item.status === "done" && item.claimed === true,
          option: ["accept", "reject"].includes(item.option) ? item.option : undefined,
          lastVisitAt: Number.isFinite(item.lastVisitAt) ? item.lastVisitAt : undefined,
        });
      }

      const incomes = list(source?.incomes)
        .filter((item) => item && typeof item.id === "string" && typeof item.source === "string"
          && Number.isFinite(item.amount) && item.amount > 0 && isDateKey(item.date)
          && Number.isFinite(item.createdAt))
        .map(({ id, amount, source, date, createdAt }) => ({ id, amount, source, date, createdAt }));
      const shields = Number.isSafeInteger(source?.shields) && source.shields >= 0 ? source.shields : 0;
      return {
        ...state,
        quests: { main, side, shieldDays: [...new Set(list(input?.shieldDays).filter(isDateKey))] },
        incomes,
        shields,
        mainCleared: main.length === MAIN_QUESTS.length,
        wanted: wantedOn(source?.wanted, time.date),
        totalStarsGained: Number.isSafeInteger(source?.totalStarsGained) && source.totalStarsGained >= 0
          ? source.totalStarsGained : 0,
        reputation: Number.isFinite(source?.reputation) ? clamp(source.reputation, 0, 100) : 0,
        dailyEvent: dailyEventOn(source?.dailyEvent, time.date),
        flags: { date: time.date, chumSpentToday: source?.flags?.date === time.date && source.flags.chumSpentToday === true },
        gameHour: validHour(source?.gameHour) ? source.gameHour : time.now.getHours(),
      };
    }

    function readCurrent(time = clock()) {
      return withExtensions(core.load(), storedState(), time);
    }

    function correctedStreak(stats, state, time) {
      if (state.quests.shieldDays.length === 0) return stats;
      const shieldDays = new Set(state.quests.shieldDays);
      // 仅在连击计算时忽略受保护日的支出，实际账单、消费汇总和暴击统计仍用完整记录。
      const expenses = list(state.expenses)
        .filter((expense) => !shieldDays.has(expense?.date));
      return core.getStats({ ...state, expenses }, time.now);
    }

    function sideCompletions(state, date) {
      return state.quests.side.filter((item) => item.status === "done" && item.date <= date);
    }

    function questAchievements(state, date) {
      const main = new Set(state.quests.main.filter((item) => item.date <= date).map((item) => item.id));
      const side = sideCompletions(state, date);
      const ids = new Set(side.map((item) => item.id));
      const npcs = new Set(side.map((item) => SIDE_BY_ID.get(item.id).npc));
      const earned = {
        "第一份工": side.length >= 1,
        "秘方守卫": ids.has("krabs-secret"),
        "跑腿王": side.length >= 5,
        "好邻居": npcs.size >= 4,
        "水母大师": ids.has("spongebob-jelly"),
        "采样专家": ids.has("sandy-sampling"),
        "盛情难却": side.some((item) => item.id === "patrick-icecream" && item.option === "accept"),
        "钢铁意志": side.some((item) => item.id === "patrick-icecream" && item.option === "reject"),
        "有房有顶": main.has("roof"),
        "学有所成": main.has("tuition"),
        "寿星快乐": main.has("birthday"),
        "安居乐业": main.size === MAIN_QUESTS.length,
      };
      return Object.keys(CONTENT.achievements).filter((name) => earned[name]);
    }

    function mergeAchievements(stats, streakStats, state, date) {
      const streakAchievements = STREAK_ACHIEVEMENTS.filter((name) => streakStats.unlockedAchievements.includes(name));
      return [...new Set([...stats.unlockedAchievements, ...streakAchievements, ...questAchievements(state, date)])];
    }

    function withQuestStats(stats, state, time) {
      const streakStats = correctedStreak(stats, state, time);
      const { streak, longestStreak, level, levelName } = streakStats;
      return {
        ...stats,
        streak,
        longestStreak,
        level,
        levelName,
        unlockedAchievements: mergeAchievements(stats, streakStats, state, time.date),
      };
    }

    function hasExpense(state, goal, date) {
      return state.expenses.some((expense) => expense.date <= date
        && (goal.category === undefined || expense.category === goal.category)
        && expense.amount >= goal.amount);
    }

    function changeReputation(state, delta) {
      state.reputation = clamp(state.reputation + delta, 0, 100);
    }

    function reputationSummary(value) {
      // tier 为从 0 开始的档位索引，value 保留实际声望。
      const tier = REPUTATION_TIERS.filter(([minimum]) => value >= minimum).length - 1;
      return { value, tier, tierName: REPUTATION_TIERS[tier][1] };
    }

    function getReputation() {
      return reputationSummary(readCurrent().reputation);
    }

    function addReputation(delta, reason) {
      if (!Number.isFinite(delta)) throw new TypeError("声望变化必须是有限数值。");
      if (reason !== undefined && typeof reason !== "string") throw new TypeError("声望原因必须是字符串。");
      const time = beginWrite();
      const state = readCurrent(time);
      changeReputation(state, delta);
      return reputationSummary(commit(state, time).reputation);
    }

    function gainWanted(state) {
      if (state.wanted.stars < 5) {
        state.wanted.stars += 1;
        state.totalStarsGained = Math.min(Number.MAX_SAFE_INTEGER, state.totalStarsGained + 1);
      }
    }

    function getWanted() {
      return readCurrent().wanted;
    }

    function wantedEffects(stars) {
      return { sideIncomeMul: stars >= 4 ? 0.5 : 1, canAcceptSide: stars < 5, patrolDue: stars >= 3 };
    }

    function getWantedEffects() {
      return wantedEffects(getWanted().stars);
    }

    function addWanted(reason) {
      if (reason !== "chum" && reason !== "after-hours") throw new RangeError("通缉原因无效。");
      const time = beginWrite();
      const state = readCurrent(time);
      gainWanted(state);
      return commit(state, time).wanted;
    }

    function reduceWanted(state, n) {
      state.wanted.stars = Math.max(0, state.wanted.stars - n);
    }

    function clearWanted(n) {
      if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("消除星数必须是非负整数。");
      const time = beginWrite();
      const state = readCurrent(time);
      reduceWanted(state, n);
      return commit(state, time).wanted;
    }

    function completeEvent(state, { income = 0, reputation = 3, shield = 0 } = {}) {
      if (state.dailyEvent.status !== "active") return;
      state.dailyEvent.status = "done";
      state.dailyEvent.income = income;
      state.shields += shield;
      changeReputation(state, reputation);
    }

    function recordEventVisit(state, locId, time) {
      const event = state.dailyEvent;
      if (event.status !== "active") return;
      if (event.id === "jelly-migration" && locId === "jellyfield") {
        completeEvent(state, { income: 20 });
      }
      if (event.id === "market-sale" && locId === "market") {
        const expenses = state.expenses.filter((expense) => expense.date === time.date && expense.category === "超市日用");
        const spent = core.getStats({ ...state, expenses }, time.now).todaySpent;
        if (spent >= 100) completeEvent(state, { income: Math.min(30, spent / 10) });
      }
    }

    function getDailyEvent() {
      const time = clock();
      const { id, title, desc } = eventOn(time.date);
      return { id, title, status: readCurrent(time).dailyEvent.status, desc };
    }

    function chooseEventOption(option) {
      if (option !== "go" && option !== "refuse") throw new RangeError("事件选项无效。");
      const time = beginWrite();
      const state = readCurrent(time);
      const event = state.dailyEvent;
      if (event.id !== "plankton-trap") throw new Error("今天没有这个抉择事件。");
      if (event.option !== null && event.option !== option) throw new Error("今天的抉择已确定。");
      event.option = option;
      if (option === "refuse") completeEvent(state, { shield: 1 });
      else if (state.flags.chumSpentToday) completeEvent(state, { reputation: 8 });
      return commit(state, time);
    }

    function markChumSpent() {
      const time = beginWrite();
      const state = readCurrent(time);
      state.flags.chumSpentToday = true;
      if (state.dailyEvent.id === "plankton-trap" && state.dailyEvent.option === "go") {
        completeEvent(state, { reputation: 8 });
      }
      return commit(state, time);
    }

    function advanceMain(state, time, streak) {
      // 主线按顺序推进。已有记账与已完成支线也能满足刚解锁的下一条。
      const matches = {
        spend: (goal) => hasExpense(state, goal, time.date),
        streak: (goal) => streak >= goal.days,
        sideCount: (goal) => sideCompletions(state, time.date).length >= goal.count,
        frugalDay: (goal) => core.getReport(state, time.now).dailyBreakdown.some(
          (day) => day.totalSpent <= goal.amount && (day.expenseCount > 0 || day.confirmedZeroSpend),
        ),
      };
      const done = state.quests.main;
      for (const goal of MAIN_QUESTS.slice(done.length)) {
        if (!matches[goal.type](goal)) break;
        done.push({ id: goal.id, date: time.date });
        changeReputation(state, 10);
      }
      state.mainCleared = done.length === MAIN_QUESTS.length;
    }

    function commit(candidate, time) {
      const storage = window.localStorage;
      const previous = time.previousSave;
      if (storage.getItem(STORAGE_KEY) !== previous) throw new Error("存档已变更，请重新读取后重试。");
      // 基线 save 会规范化旧字段并丢弃扩展字段，所以随后补回同一个 key。
      const baseState = core.save(candidate, time.now);
      const intermediate = JSON.stringify(baseState);
      try {
        const state = withExtensions(baseState, candidate, time);
        state.quests.side = state.quests.side.filter((item) => item.status === "done" || item.date >= time.date);
        // 顺风日按目标完成判定。是否已经领取该支线，或是否领取事件奖励，不影响当天的倍率。
        if (state.dailyEvent.id === "tailwind" && state.quests.side.some(
          (item) => item.date === time.date && item.status === "done",
        )) completeEvent(state);
        const stats = core.getStats(state, time.now);
        const streakStats = correctedStreak(stats, state, time);
        advanceMain(state, time, streakStats.streak);
        state.unlockedAchievements = mergeAchievements(stats, streakStats, state, time.date);
        if (storage.getItem(STORAGE_KEY) !== intermediate) throw new Error("存档已变更，请重新读取后重试。");
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return state;
      } catch (error) {
        // 同步补写失败时恢复旧存档。如果另一方已改写存档，就不覆盖它。
        if (storage.getItem(STORAGE_KEY) === intermediate) {
          if (previous === null) storage.removeItem(STORAGE_KEY);
          else storage.setItem(STORAGE_KEY, previous);
        }
        throw error;
      }
    }

    function offeredOn(state, date) {
      let seed = daySeed(date);
      const pool = SIDE_QUESTS.filter((quest) => quest.id !== DELIVERY_ID || state.reputation >= DELIVERY_REPUTATION);
      for (let i = 0; i < 3; i += 1) {
        seed = nextSeed(seed);
        const j = i + Math.floor((seed / 2 ** 32) * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const offered = pool.slice(0, 3);
      const reserved = state.quests.side.filter((item) => item.date === date).map((item) => SIDE_BY_ID.get(item.id));
      // 声望跨过 60 会改变候选池，已接、已完成或已失败的任务仍占当天原有名额。
      if (reserved.every((quest) => offered.includes(quest))) return offered;
      return [...reserved, ...offered.filter((quest) => !reserved.includes(quest))].slice(0, 3);
    }

    function sideRecord(state, date, id) {
      return state.quests.side.find((item) => item.id === id && item.date === date);
    }

    function activeSides(state, date) {
      return state.quests.side.filter((item) => item.date === date && item.status === "active");
    }

    function getMain() {
      const state = readCurrent();
      const doneCount = state.quests.main.length;
      return { current: MAIN_QUESTS[doneCount] ?? null, doneCount, total: MAIN_QUESTS.length, cleared: state.mainCleared };
    }

    function getSide() {
      const time = clock();
      const { date } = time;
      const state = readCurrent(time);
      return offeredOn(state, date).map((quest) => {
        const record = sideRecord(state, date, quest.id);
        return {
          ...quest,
          date,
          status: record?.status ?? "offered",
          claimed: record?.claimed ?? false,
          progress: {
            step: record?.step ?? 0,
            seconds: record?.seconds ?? 0,
            ...(quest.id === DELIVERY_ID && { lastVisitAt: record?.lastVisitAt ?? null }),
          },
          option: record?.option,
        };
      });
    }

    function acceptQuest(id) {
      const time = beginWrite();
      const state = readCurrent(time);
      const entry = sideRecord(state, time.date, id);
      if (entry?.status === "failed") throw new Error("外卖已超时，今天不能再接。");
      if (entry) return commit(state, time);
      if (!wantedEffects(state.wanted.stars).canAcceptSide) throw new Error("五星通缉时无法接取支线。");
      if (!offeredOn(state, time.date).some((quest) => quest.id === id)) throw new RangeError("该任务不在今日清单中。");
      state.quests.side.push({ id, date: time.date, status: "active", step: 0, seconds: 0, claimed: false });
      return commit(state, time);
    }

    function checkLocation(locId) {
      if (typeof locId !== "string" || locId.length === 0) throw new TypeError("地点 ID 必须是非空字符串。");
    }

    function openAt(locId, hour) {
      const hours = BUSINESS_HOURS[locId];
      if (!Array.isArray(hours)) return true;
      const [start, end] = hours;
      const visitHour = end > 24 && hour < start ? hour + 24 : hour;
      return visitHour >= start && visitHour < end;
    }

    function isOpen(locId) {
      checkLocation(locId);
      return openAt(locId, readCurrent().gameHour);
    }

    function setHour(h) {
      if (!validHour(h)) throw new RangeError("小时必须是 0 至 23 的整数。");
      const time = beginWrite();
      const state = readCurrent(time);
      state.gameHour = h;
      return commit(state, time);
    }

    function recordVisit(locId) {
      checkLocation(locId);
      const time = beginWrite();
      const state = readCurrent(time);
      if (!openAt(locId, state.gameHour)) return { ignored: "closed" };
      const visitedAt = time.now.getTime();
      for (const entry of activeSides(state, time.date)) {
        const quest = SIDE_BY_ID.get(entry.id);
        if (entry.id === DELIVERY_ID && entry.lastVisitAt !== undefined
          && visitedAt - entry.lastVisitAt > DELIVERY_LEG_MS) {
          entry.status = "failed";
          continue;
        }
        if (quest.type === "visit" && quest.locations[entry.step] === locId) {
          entry.step += 1;
          if (entry.id === DELIVERY_ID) entry.lastVisitAt = visitedAt;
          if (entry.step === quest.locations.length) entry.status = "done";
        }
        if (quest.type === "purchaseVisit" && quest.destination === locId && hasExpense(state, quest, time.date)) {
          entry.status = "done";
        }
      }
      recordEventVisit(state, locId, time);
      return commit(state, time);
    }

    function recordStay(locId, seconds) {
      checkLocation(locId);
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("停留秒数必须是有限的非负数。");
      const time = beginWrite();
      const state = readCurrent(time);
      for (const entry of activeSides(state, time.date)) {
        const quest = SIDE_BY_ID.get(entry.id);
        if (quest.type !== "stay" || quest.destination !== locId) continue;
        // 补偿加法保留多次小数停留时长的有效精度，例如十次 0.3 秒。
        const increment = seconds - entry.secondsError;
        const total = entry.seconds + increment;
        entry.secondsError = (total - entry.seconds) - increment;
        entry.seconds = Math.min(quest.seconds, total);
        if (entry.seconds >= quest.seconds) entry.status = "done";
      }
      return commit(state, time);
    }

    function grantReward(state, entry, reward, time) {
      if (entry.claimed) return { ...NO_REWARD };
      const id = "quest:" + entry.date + ":" + entry.id;
      const paid = state.incomes.reduce((sum, item) => sum + (item.date === entry.date ? item.amount : 0), 0);
      const income = state.incomes.some((item) => item.id === id)
        ? 0 : Math.min(reward.income, Math.max(0, DAILY_INCOME_CAP - paid));
      if (income > 0) {
        state.incomes.push({ id, amount: income, source: entry.id, date: entry.date, createdAt: time.now.getTime() });
      }
      state.shields += reward.shield;
      entry.claimed = true;
      return { income, shield: reward.shield };
    }

    function grantSideReward(state, entry, time, reward = SIDE_BY_ID.get(entry.id).reward) {
      if (entry.claimed) return { ...NO_REWARD };
      // 用交付前的状态叠乘，再统一四舍五入。收入上限在倍率结算之后处理。
      const reputationMul = state.reputation >= 20 ? 1.2 : 1;
      const tailwindMul = eventOn(time.date).id === "tailwind" ? 1.5 : 1;
      const wantedMul = wantedEffects(state.wanted.stars).sideIncomeMul;
      const income = Math.round(reward.income * reputationMul * tailwindMul * wantedMul);
      const paid = grantReward(state, entry, { income, shield: reward.shield }, time);
      reduceWanted(state, 1);
      changeReputation(state, 5);
      return paid;
    }

    function claimQuest(id) {
      const time = beginWrite();
      const state = readCurrent(time);
      const entry = sideRecord(state, time.date, id);
      if (entry?.status !== "done") throw new Error("该支线尚未完成或已过期。");
      const reward = grantSideReward(state, entry, time);
      commit(state, time);
      return { reward, anim: "quest" };
    }

    function claimEvent() {
      const time = beginWrite();
      const state = readCurrent(time);
      const entry = state.dailyEvent;
      if (entry.status === "active") throw new Error("今日事件尚未完成。");
      if (entry.status === "claimed") return { reward: { ...NO_REWARD }, anim: "quest" };
      // 声望以及拒绝邀约的护盾已在完成当下发放，这里只结算待领取的收入。
      const reward = grantReward(state, entry, { income: entry.income, shield: 0 }, time);
      entry.status = "claimed";
      commit(state, time);
      return { reward, anim: "quest" };
    }

    function derivedFrom(state, stats, date) {
      const totalIncome = state.incomes.reduce((sum, item) => sum + (item.date <= date ? item.amount : 0), 0);
      const balance = stats.balance + totalIncome;
      const scaledBalance = balance * 100;
      const percent = Number.isFinite(scaledBalance)
        ? scaledBalance / stats.monthlyBudget : balance / stats.monthlyBudget * 100;
      const hp = totalIncome === 0 ? stats.hp : Math.round(percent) || 0;
      return { balance, hp, totalIncome };
    }

    function getDerived() {
      const time = clock();
      const state = readCurrent(time);
      return derivedFrom(state, core.getStats(state, time.now), time.date);
    }

    function getReportExtra() {
      const time = clock();
      const state = readCurrent(time);
      const stats = core.getStats(state, time.now);
      const { balance } = derivedFrom(state, stats, time.date);
      const mainDone = state.quests.main.filter((item) => item.date <= time.date).length;
      // 立足评分 = max(0, 主线完成数×8 + 声望×0.5 + clamp(余额/月预算, −0.5, 1)×30 − 累计涨星数×2)。
      const budgetRatio = clamp(balance / stats.monthlyBudget, -0.5, 1);
      const score = Math.max(0, mainDone * 8 + state.reputation * 0.5 + budgetRatio * 30 - state.totalStarsGained * 2);
      const grade = [[85, "S"], [70, "A"], [55, "B"], [40, "C"]].find(([minimum]) => score >= minimum)?.[1] ?? "D";
      return {
        score,
        grade,
        reputationTier: reputationSummary(state.reputation).tier,
        wantedStars: state.wanted.stars,
        mainDone,
        sideDoneTotal: sideCompletions(state, time.date).length,
      };
    }

    function addSpendingWanted(state, feedback, time) {
      const flags = state.wanted.dailyFlags;
      // 两个日限次分别计算。首次同时命中两条时各加一星，最高五颗。
      if (feedback.crit === "lethal" && !flags.lethal) {
        flags.lethal = true;
        gainWanted(state);
      }
      if (!flags.overspend && feedback.todaySpent > core.getStats(state, time.now).dailyBudget * 2) {
        flags.overspend = true;
        gainWanted(state);
      }
    }

    function applyExpense(state, input, time, questEffects) {
      // 显式传 state 让基线 addExpense 只计算，不先写入一份丢了扩展字段的存档。
      const result = core.addExpense(state, input, time.now);
      const next = { ...state, ...result.state };
      const expense = result.state.expenses[result.state.expenses.length - 1];
      // 通缉是当日规则，过往补记和未来账单不消耗当天的触发次数。
      if (!questEffects || expense.date !== time.date) return { state: next, feedback: result.feedback };
      addSpendingWanted(next, result.feedback, time);
      // 只有当天这笔消费把已有连击清成 0 时才耗盾。受保护日保留此前已显示的
      // 连击，同一天继续消费不重复耗盾。补记导致连击缩短但未清零时不耗盾。
      if (next.shields > 0 && result.feedback.streak === 0
        && !next.quests.shieldDays.includes(time.date)
        && correctedStreak(core.getStats(state, time.now), state, time).streak > 0) {
        next.shields -= 1;
        next.quests.shieldDays.push(time.date);
      }
      return { state: next, feedback: result.feedback };
    }

    function expenseFeedback(feedback, state, time, questCompleted) {
      const stats = core.getStats(state, time.now);
      const { balance, hp } = derivedFrom(state, stats, time.date);
      let anim = "coin";
      if (questCompleted) anim = "quest";
      else if (feedback.crit === "heavy" || feedback.crit === "lethal") anim = "crit";
      else if (feedback.crit === "sugar") anim = "sugar";
      return { ...feedback, balance, hp, streak: correctedStreak(stats, state, time).streak, anim };
    }

    function addExpense(stateOrInput, input, asOf = new Date()) {
      const time = beginWrite(asOf);
      // 接受旧的两参数调用形状。已有存档时以最新存档记账，避免 UI 的旧 state
      // 覆盖刚完成的 NPC 任务、自动记账或护盾。首次记账可用传入的 state 初始化。
      const state = input !== undefined && time.previousSave === null
        ? withExtensions(stateOrInput, stateOrInput, time) : readCurrent(time);
      const before = state.quests.main.length;
      const result = applyExpense(state, input === undefined ? stateOrInput : input, time, true);
      const saved = commit(result.state, time);
      return { state: saved, feedback: expenseFeedback(result.feedback, saved, time, saved.quests.main.length > before) };
    }

    function chooseOption(id, option) {
      if (id !== "patrick-icecream" || !["accept", "reject"].includes(option)) {
        throw new RangeError("这个任务或选项无效。");
      }
      const time = beginWrite();
      const state = readCurrent(time);
      const entry = sideRecord(state, time.date, id);
      if (!entry) throw new Error("请先接取今日的冰淇淋任务。");
      if (entry.status === "done") {
        if (entry.option !== option) throw new Error("这项选择已经结束。");
        return { state: load(), reward: { ...NO_REWARD }, anim: "quest" };
      }

      let next = state;
      let feedback;
      if (option === "accept") {
        const result = applyExpense(state, {
          id: "quest:" + time.date + ":" + id + ":expense",
          amount: 15,
          category: "奶茶零食",
        }, time, true);
        next = result.state;
        feedback = result.feedback;
      }
      entry.option = option;
      entry.status = "done";
      // 抉择立即交付，重复选择或再次 claim 不会重复记账或发盾。
      const reward = grantSideReward(next, entry, time, { income: 0, shield: option === "reject" ? 1 : 0 });
      const saved = commit(next, time);
      return {
        state: saved,
        reward,
        anim: "quest",
        ...(feedback && { feedback: expenseFeedback(feedback, saved, time, true) }),
      };
    }

    function seedDemo(demoState = null) {
      const time = beginWrite();
      const state = withExtensions(demoState ?? core.generateDemoData(time.now), {}, time);
      const yesterday = new Date(time.now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);
      const demoTime = clock(yesterday);
      state.quests.main = MAIN_QUESTS.slice(0, 4).map(({ id }) => ({ id, date: time.date }));
      changeReputation(state, state.quests.main.length * 10);
      for (const quest of offeredOn(state, demoTime.date)) {
        const entry = {
          id: quest.id,
          date: demoTime.date,
          status: "done",
          step: quest.locations?.length ?? 0,
          seconds: quest.seconds ?? 0,
          option: quest.type === "choice" ? "reject" : undefined,
          claimed: false,
        };
        state.quests.side.push(entry);
        grantSideReward(state, entry, demoTime);
      }
      state.shields = 1;
      return commit(state, time);
    }

    // 保持基线 API 的入参及返回结构。查询读回扩展字段，保存玩家设置、零消费确认
    // 或使用旧记账入口时也保留任务存档。getReport 合并原成就与任务成就。
    function load() {
      const time = clock();
      const state = readCurrent(time);
      state.unlockedAchievements = withQuestStats(core.getStats(state, time.now), state, time).unlockedAchievements;
      return state;
    }

    function save(state, asOf = new Date()) {
      if (!state || typeof state !== "object" || Array.isArray(state)) return core.save(state, asOf);
      const time = beginWrite(asOf);
      return commit(withExtensions(state, { ...storedState(), ...state }, time), time);
    }

    function legacyAddExpense(stateOrInput, input, asOf = new Date()) {
      if (input !== undefined) return core.addExpense(stateOrInput, input, asOf);
      const time = beginWrite(asOf);
      const result = applyExpense(readCurrent(time), stateOrInput, time, false);
      return { state: commit(result.state, time), feedback: result.feedback };
    }

    function getStats(state, asOf = new Date()) {
      const stats = core.getStats(state, asOf);
      const time = clock(asOf);
      const extensions = state === undefined ? readCurrent(time) : withExtensions(state, state, time);
      return withQuestStats(stats, extensions, time);
    }

    function getReport(state, asOf = new Date()) {
      const report = core.getReport(state, asOf);
      const time = clock(asOf);
      const extensions = state === undefined ? readCurrent(time) : withExtensions(state, state, time);
      return withQuestStats(report, extensions, time);
    }

    Object.assign(survivor, { load, save, addExpense: legacyAddExpense, getStats, getReport });
    window.BudgetQuests = {
      MAIN_QUESTS,
      SIDE_QUESTS,
      EVENT_POOL,
      BUSINESS_HOURS,
      CONTENT,
      getMain,
      getSide,
      acceptQuest,
      recordVisit,
      recordStay,
      chooseOption,
      claimQuest,
      addExpense,
      getDerived,
      getWanted,
      addWanted,
      clearWanted,
      getWantedEffects,
      getReputation,
      addReputation,
      getDailyEvent,
      claimEvent,
      chooseEventOption,
      markChumSpent,
      setHour,
      isOpen,
      getReportExtra,
      getShields: () => readCurrent().shields,
      seedDemo,
    };
  })();
} else if (typeof module !== "undefined" && require.main === module && process.argv[2] === "--self-test") {
  // 自测随唯一交付文件提供，仅当 Node 直接执行并带 --self-test 时运行。
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");

  const baselinePath = process.argv[3] ?? path.join(__dirname, "survival-logic.js");
  const baseline = new vm.Script(fs.readFileSync(baselinePath, "utf8"), { filename: baselinePath });
  const questsScript = new vm.Script(fs.readFileSync(__filename, "utf8"), { filename: __filename });
  const key = "budget-survivor-state-v1";
  const plain = (value) => JSON.parse(JSON.stringify(value));

  function fixture() {
    const now = new Date(2026, 10, 24, 12);
    const values = new Map();
    let failExtendedWrite = false;
    let window;

    class MockDate extends Date {
      constructor(...args) {
        super(...(args.length > 0 ? args : [now.getTime()]));
      }

      static now() {
        return now.getTime();
      }
    }

    const localStorage = {
      getItem: (name) => values.get(name) ?? null,
      setItem(name, value) {
        if (failExtendedWrite && name === key && Object.hasOwn(JSON.parse(value), "quests")) {
          failExtendedWrite = false;
          throw new Error("mock quota exceeded");
        }
        values.set(name, String(value));
      },
      removeItem: (name) => values.delete(name),
    };

    const game = {
      get base() { return window.BudgetSurvivor; },
      get quests() { return window.BudgetQuests; },
      get keys() { return [...values.keys()]; },
      get raw() { return localStorage.getItem(key); },
      reload() {
        window = { localStorage };
        const context = vm.createContext({ window, localStorage, Date: MockDate });
        baseline.runInContext(context);
        questsScript.runInContext(context);
      },
      moveDays(days) {
        now.setDate(now.getDate() + days);
      },
      moveMs(milliseconds) {
        now.setTime(now.getTime() + milliseconds);
      },
      date(offset = 0) {
        const date = new Date(now);
        date.setDate(date.getDate() + offset);
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
          .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
      },
      side(id) {
        return window.BudgetQuests.getSide().find((quest) => quest.id === id);
      },
      findDay(matches, label) {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (matches()) return;
          this.moveDays(1);
        }
        assert.fail("60 天内没有刷新出 " + label);
      },
      findOffer(id, matchesEvent = () => true) {
        this.findDay(() => this.side(id) && matchesEvent(this.quests.getDailyEvent()), id);
      },
      findEvent(id) {
        this.findDay(() => this.quests.getDailyEvent().id === id, id);
      },
      failNextSave() {
        failExtendedWrite = true;
      },
      loadOldSave(state) {
        localStorage.setItem(key, JSON.stringify(state));
        this.reload();
      },
    };
    game.reload();
    return game;
  }

  function finishOffered(game, id) {
    const quests = game.quests;
    const quest = game.side(id);
    if (id === "krabs-secret") quests.setHour(19);
    quests.acceptQuest(id);
    if (quest.type === "choice") return quests.chooseOption(id, "reject");
    if (quest.type === "visit") quest.locations.forEach((locId) => quests.recordVisit(locId));
    if (quest.type === "stay") quests.recordStay(quest.destination, quest.seconds);
    return quests.claimQuest(id);
  }

  let passed = 0;
  function test(name, run) {
    run();
    passed += 1;
    console.log("PASS " + name);
  }

  test("first-meal 分类、20 元边界与 quest 动画", () => {
    const game = fixture();
    const quests = game.quests;
    quests.addExpense({ amount: 20, category: "出行" });
    quests.addExpense({ amount: 19.99, category: "食堂餐饮" });
    assert.equal(quests.getMain().current.id, "first-meal");
    assert.equal(quests.addExpense({ amount: 20, category: "食堂餐饮" }).feedback.anim, "quest");
    assert.equal(quests.getMain().doneCount, 1);
    assert.equal(quests.getMain().current.id, "snail-food");
    assert.equal(quests.getReputation().value, 10);
    assert.deepEqual(game.keys, [key]);
  });

  test("krabs-secret 乱序不完成、单次交付与重载战报", () => {
    const id = "krabs-secret";
    const game = fixture();
    game.findOffer(id, (event) => event.id !== "tailwind");
    const offers = Array.from(game.quests.getSide(), (quest) => quest.id);
    assert.equal(new Set(offers).size, 3);
    game.reload();
    const quests = game.quests;
    assert.deepEqual(Array.from(quests.getSide(), (quest) => quest.id), offers);
    quests.setHour(19);
    quests.acceptQuest(id);
    quests.recordVisit("diner");
    assert.equal(game.side(id).progress.step, 0);
    quests.recordVisit("chum");
    assert.equal(game.side(id).status, "active");
    assert.throws(() => quests.claimQuest(id), /尚未完成/);
    quests.recordVisit("diner");
    assert.equal(game.side(id).status, "done");
    const before = quests.getDerived().balance;
    assert.deepEqual(plain(quests.claimQuest(id)), { reward: { income: 40, shield: 0 }, anim: "quest" });
    assert.equal(quests.getDerived().balance, before + 40);
    assert.equal(quests.claimQuest(id).reward.income, 0);
    game.reload();
    assert.ok(game.base.load().unlockedAchievements.includes("第一份工"));
    assert.ok(game.base.getReport().unlockedAchievements.includes("秘方守卫"));
    assert.ok(JSON.parse(game.raw).unlockedAchievements.includes("秘方守卫"));
    assert.equal(game.quests.getDerived().totalIncome, 40);
  });

  test("patrick reject 发盾、首次清零保护及次日正常断连", () => {
    const id = "patrick-icecream";
    const game = fixture();
    game.findOffer(id);
    game.base.save({ ...game.base.load(), startDate: game.date(-3) });
    const quests = game.quests;
    quests.acceptQuest(id);
    assert.equal(quests.chooseOption(id, "reject").reward.shield, 1);
    assert.equal(quests.getShields(), 1);
    assert.equal(quests.chooseOption(id, "reject").reward.shield, 0);
    assert.equal(quests.claimQuest(id).reward.shield, 0);
    const streak = game.base.getStats().streak;
    assert.equal(streak, 4);
    const { state, feedback } = quests.addExpense({ amount: 150, category: "出行" });
    assert.equal(feedback.streak, streak);
    assert.equal(feedback.anim, "crit");
    assert.equal(state.shields, 0);
    assert.equal(quests.addExpense({ amount: 5, category: "出行" }).feedback.streak, streak);
    const legacy = game.base.addExpense({ amount: 1, category: "出行" });
    assert.equal(Object.hasOwn(legacy.feedback, "anim"), false);
    assert.equal(game.base.getReport().todaySpent, 156);
    game.reload();
    assert.equal(game.base.getReport().streak, streak);
    assert.ok(game.base.load().unlockedAchievements.includes("钢铁意志"));
    game.moveDays(1);
    assert.equal(game.base.getStats().streak, streak + 1);
    assert.equal(game.quests.addExpense({ amount: 60, category: "出行" }).feedback.streak, 0);
  });

  test("每日收入 100 元截断、余额与 HP", () => {
    const game = fixture();
    game.findOffer("krabs-secret");
    game.base.save({
      ...game.base.load(),
      incomes: [{ id: "opening-income", amount: 90, source: "fixture", date: game.date(), createdAt: 0 }],
    });
    assert.equal(game.quests.getDerived().balance, 1590);
    assert.equal(finishOffered(game, "krabs-secret").reward.income, 10);
    assert.deepEqual(plain(game.quests.getDerived()), { balance: 1600, hp: 107, totalIncome: 100 });
    const result = game.quests.addExpense({ amount: 1382.5, category: "出行" });
    assert.equal(result.feedback.balance, 217.5);
    assert.equal(result.feedback.hp, 15);
    assert.equal(game.base.getReport().totalSpent, 1382.5);
  });

  test("12 项主线顺序、零消费确认与 rent 清关", () => {
    const game = fixture();
    game.findOffer("krabs-secret");
    const quests = game.quests;
    game.base.save({ ...game.base.load(), startDate: game.date(-14) });
    quests.addExpense({ amount: 35, category: "食堂餐饮", date: game.date(-13) });
    assert.equal(quests.getMain().current.id, "snail-food");
    quests.addExpense({ amount: 60, category: "超市日用", date: game.date(-12) });
    assert.equal(quests.getMain().current.id, "first-job");
    finishOffered(game, "krabs-secret");
    assert.equal(quests.getMain().current.id, "jelly-net");
    quests.addExpense({ amount: 80, category: "超市日用", date: game.date(-11) });
    quests.addExpense({ amount: 200, category: "学习打印", date: game.date(-10) });
    quests.addExpense({ amount: 120, category: "娱乐社交", date: game.date(-9) });
    assert.equal(quests.getMain().current.id, "side-5");
    for (const id of ["puff-dock", "spongebob-jelly", "sandy-sampling", "patrick-icecream"]) {
      game.moveDays(1);
      game.findOffer(id);
      finishOffered(game, id);
    }
    assert.equal(quests.getMain().current.id, "roof");
    quests.addExpense({ amount: 300, category: "超市日用" });
    assert.equal(quests.getMain().current.id, "frugal-day");
    game.base.save({ ...game.base.load(), zeroSpendDays: [game.date(-1)] });
    assert.equal(quests.getMain().current.id, "rent");
    quests.addExpense({ amount: 399.99, category: "出行" });
    assert.equal(quests.getMain().cleared, false);
    const { state, feedback } = quests.addExpense({ amount: 400, category: "出行" });
    assert.equal(state.mainCleared, true);
    assert.equal(feedback.anim, "quest");
    assert.deepEqual(plain(quests.getMain()), { current: null, doneCount: 12, total: 12, cleared: true });
    game.reload();
    const report = game.base.getReport();
    for (const name of ["一毛不拔", "跑腿王", "好邻居", "水母大师", "采样专家", "有房有顶", "学有所成", "寿星快乐", "安居乐业"]) {
      assert.ok(report.unlockedAchievements.includes(name), name);
    }
    assert.equal(game.base.getReport(undefined, game.date(-1)).unlockedAchievements.includes("安居乐业"), false);
  });

  test("停留累加、消费后到访与跨日失效", () => {
    const game = fixture();
    const ordinary = (event) => event.id !== "tailwind";
    game.findOffer("puff-dock", ordinary);
    const quests = game.quests;
    quests.acceptQuest("puff-dock");
    quests.recordStay("school", 1);
    game.moveDays(1);
    game.findOffer("puff-dock", ordinary);
    assert.equal(game.side("puff-dock").status, "offered");
    assert.throws(() => quests.claimQuest("puff-dock"), /过期/);
    quests.acceptQuest("puff-dock");
    for (let count = 0; count < 9; count += 1) quests.recordStay("school", 0.3);
    quests.recordStay("jellyfield", 20);
    assert.equal(game.side("puff-dock").status, "active");
    quests.recordStay("school", 0.3);
    assert.equal(game.side("puff-dock").status, "done");
    assert.equal(quests.claimQuest("puff-dock").reward.income, 30);
    game.findOffer("squidward-reed", ordinary);
    quests.acceptQuest("squidward-reed");
    quests.recordVisit("neighbors");
    assert.equal(game.side("squidward-reed").status, "active");
    quests.addExpense({ amount: 20, category: "超市日用" });
    assert.equal(game.side("squidward-reed").status, "active");
    quests.recordVisit("neighbors");
    assert.equal(quests.claimQuest("squidward-reed").reward.income, 25);
  });

  test("patrick accept 只记一次 15 元与糖分动画", () => {
    const id = "patrick-icecream";
    const game = fixture();
    game.findOffer(id);
    const quests = game.quests;
    const oldState = game.base.load();
    quests.acceptQuest(id);
    const result = quests.chooseOption(id, "accept");
    assert.equal(result.feedback.anim, "quest");
    assert.equal(result.state.expenses[0].amount, 15);
    assert.equal(result.state.expenses[0].category, "奶茶零食");
    assert.equal(quests.chooseOption(id, "accept").state.expenses.length, 1);
    assert.ok(game.base.getReport().unlockedAchievements.includes("盛情难却"));
    const { state, feedback } = quests.addExpense(oldState, { amount: 25, category: "奶茶零食" });
    assert.equal(feedback.anim, "sugar");
    assert.equal(state.expenses.length, 2);
    assert.ok(game.base.getReport(state).unlockedAchievements.includes("盛情难却"));
  });

  test("演示存档、成就文案及重置兼容", () => {
    const game = fixture();
    const demo = game.base.generateDemoData();
    const seeded = game.quests.seedDemo(demo);
    assert.equal(seeded.expenses.length, demo.expenses.length);
    assert.ok(game.quests.getMain().doneCount >= 4);
    assert.ok(seeded.quests.side.filter((entry) => entry.status === "done").length >= 3);
    assert.equal(game.quests.getShields(), 1);
    assert.equal(Object.keys(game.quests.CONTENT.achievements).length, 12);
    const oldSave = { ...seeded };
    for (const field of ["wanted", "totalStarsGained", "reputation", "dailyEvent", "flags", "gameHour"]) {
      delete oldSave[field];
    }
    game.loadOldSave(oldSave);
    assert.equal(game.base.load().wanted.stars, 0);
    assert.equal(game.base.load().reputation, 0);
    assert.equal(game.base.load().expenses.length, demo.expenses.length);
    assert.equal(game.quests.getReportExtra().sideDoneTotal, 3);
    assert.equal(game.quests.getShields(), 1);
    assert.ok(game.quests.getMain().doneCount >= 4);
    game.base.reset();
    assert.deepEqual(game.keys, []);
    assert.equal(game.quests.getShields(), 0);
    game.base.generateDemoData();
    const freshDemo = game.quests.seedDemo();
    assert.equal(freshDemo.expenses.length, demo.expenses.length);
    assert.ok(game.quests.getMain().doneCount >= 4);
    assert.equal(game.quests.getShields(), 1);
  });

  test("扩展保存失败后恢复，重试仅记一笔", () => {
    const game = fixture();
    game.quests.addExpense({ amount: 10, category: "出行" });
    const previous = game.raw;
    const input = { id: "retry-meal", amount: 20, category: "食堂餐饮" };
    game.failNextSave();
    assert.throws(() => game.quests.addExpense(input), /mock quota exceeded/);
    assert.equal(game.raw, previous);
    assert.equal(game.quests.getMain().current.id, "first-meal");
    const result = game.quests.addExpense(input);
    assert.equal(result.state.expenses.filter((expense) => expense.id === input.id).length, 1);
    assert.equal(game.quests.getMain().doneCount, 1);
    assert.deepEqual(game.keys, [key]);
  });

  test("致命暴击和双倍日预算各涨一星且分别日限一次", () => {
    const game = fixture();
    const quests = game.quests;
    const spend = (amount) => quests.addExpense({ amount, category: "出行" });
    assert.equal(spend(100).state.wanted.stars, 0);
    assert.equal(spend(1).state.wanted.stars, 1);
    const lethal = spend(300);
    assert.equal(lethal.feedback.crit, "lethal");
    assert.equal(lethal.state.wanted.stars, 2);
    assert.deepEqual(plain(lethal.state.wanted.dailyFlags), { lethal: true, overspend: true });
    assert.equal(spend(400).state.wanted.stars, 2);
    quests.clearWanted(1);
    game.reload();
    const again = game.quests.addExpense({ amount: 400, category: "出行" }).state;
    assert.equal(again.wanted.stars, 1);
    assert.equal(again.totalStarsGained, 2);

    const fresh = fixture();
    const both = fresh.quests.addExpense({ amount: 300, category: "出行" }).state;
    assert.equal(both.wanted.stars, 2);
    assert.equal(both.totalStarsGained, 2);
  });

  test("通缉每跨一天衰减一星并重置当日限次", () => {
    const game = fixture();
    const quests = game.quests;
    quests.addExpense({ amount: 300, category: "出行" });
    quests.addWanted("chum");
    quests.addWanted("after-hours");
    assert.equal(quests.getWanted().stars, 4);
    game.moveDays(1);
    const wanted = quests.getWanted();
    assert.deepEqual(plain(wanted), {
      stars: 3, lastDecayDate: game.date(), dailyFlags: { lethal: false, overspend: false },
    });
    assert.equal(quests.getWanted().stars, 3);
    quests.setHour(19);
    game.reload();
    assert.equal(game.quests.getWanted().stars, 3);
    const added = game.quests.addExpense({ amount: 300, category: "出行" }).state;
    assert.equal(added.wanted.stars, 5);
    assert.equal(added.totalStarsGained, 6);
    game.moveDays(2);
    assert.equal(game.quests.getWanted().stars, 3);
    assert.equal(game.base.load().totalStarsGained, 6);
  });

  test("声望达到 20 使支线收入乘 1.2，交付发 5 声望", () => {
    const game = fixture();
    game.findOffer("krabs-secret", (event) => event.id !== "tailwind");
    const quests = game.quests;
    quests.addReputation(15, "fixture");
    assert.equal(quests.addReputation(4, "patrol-escape").value, 19);
    assert.deepEqual(plain(quests.addReputation(1, "fixture")), { value: 20, tier: 1, tierName: "街坊熟人" });
    assert.equal(finishOffered(game, "krabs-secret").reward.income, 48);
    assert.equal(quests.getReputation().value, 25);
    assert.equal(quests.claimQuest("krabs-secret").reward.income, 0);
    assert.equal(quests.getReputation().value, 25);
    assert.equal(quests.addReputation(-5, "patrol-failed").value, 20);
    assert.deepEqual(plain(quests.addReputation(200, "fixture")), { value: 100, tier: 3, tierName: "小镇传奇" });
    assert.deepEqual(plain(quests.addReputation(-200, "fixture")), { value: 0, tier: 0, tierName: "无名小卒" });
  });

  test("四星交付收入减半，五星限制新接取并保留累计涨星", () => {
    const game = fixture();
    game.findOffer("krabs-secret", (event) => event.id !== "tailwind");
    const quests = game.quests;
    for (let count = 0; count < 4; count += 1) quests.addWanted("after-hours");
    assert.deepEqual(plain(quests.getWantedEffects()), { sideIncomeMul: 0.5, canAcceptSide: true, patrolDue: true });
    assert.equal(finishOffered(game, "krabs-secret").reward.income, 20);
    assert.equal(quests.getWanted().stars, 3);
    assert.equal(quests.getReportExtra().sideDoneTotal, 1);
    for (let count = 0; count < 3; count += 1) quests.addWanted("chum");
    assert.deepEqual(plain(quests.getWantedEffects()), { sideIncomeMul: 0.5, canAcceptSide: false, patrolDue: true });
    const offered = quests.getSide().find((quest) => quest.status === "offered");
    assert.throws(() => quests.acceptQuest(offered.id), /五星通缉/);
    assert.equal(game.base.load().totalStarsGained, 6);
    assert.equal(quests.clearWanted(99).stars, 0);
    assert.deepEqual(plain(quests.getWantedEffects()), { sideIncomeMul: 1, canAcceptSide: true, patrolDue: false });
  });

  test("水母迁徙到访完成、领取 20 元与每日事件重置", () => {
    const game = fixture();
    game.findEvent("jelly-migration");
    const quests = game.quests;
    assert.throws(() => quests.claimEvent(), /尚未完成/);
    quests.recordVisit("neighbors");
    assert.equal(quests.getDailyEvent().status, "active");
    quests.recordVisit("jellyfield");
    assert.equal(quests.getDailyEvent().status, "done");
    assert.equal(quests.getReputation().value, 3);
    assert.deepEqual(plain(quests.claimEvent()), { reward: { income: 20, shield: 0 }, anim: "quest" });
    assert.equal(quests.getDerived().balance, 1520);
    assert.equal(quests.claimEvent().reward.income, 0);
    quests.recordVisit("jellyfield");
    assert.equal(quests.getReputation().value, 3);
    const claimed = plain(quests.getDailyEvent());
    game.reload();
    assert.deepEqual(plain(game.quests.getDailyEvent()), claimed);
    game.moveDays(1);
    assert.equal(game.quests.getDailyEvent().status, "active");
    assert.equal(game.quests.getDerived().totalIncome, 20);
  });

  test("超市促销按当日分类累计和到访判定，返现最多 30 元", () => {
    const game = fixture();
    game.findEvent("market-sale");
    const quests = game.quests;
    quests.addExpense({ amount: 400, category: "超市日用", date: game.date(-1) });
    quests.addExpense({ amount: 350, category: "出行" });
    quests.addExpense({ amount: 99, category: "超市日用" });
    quests.recordVisit("market");
    assert.equal(quests.getDailyEvent().status, "active");
    quests.addExpense({ amount: 251, category: "超市日用" });
    assert.equal(quests.getDailyEvent().status, "active");
    quests.recordVisit("market");
    assert.equal(quests.getDailyEvent().status, "done");
    assert.equal(quests.getReputation().value, 3);
    assert.equal(quests.claimEvent().reward.income, 30);

    const boundary = fixture();
    boundary.findEvent("market-sale");
    boundary.quests.addExpense({ amount: 45, category: "超市日用" });
    boundary.quests.addExpense({ amount: 55, category: "超市日用" });
    boundary.quests.recordVisit("market");
    assert.equal(boundary.quests.claimEvent().reward.income, 10);
  });

  test("痞老板邀约的同日消费标记、拒绝发盾和一次性声望", () => {
    const game = fixture();
    game.findEvent("plankton-trap");
    const quests = game.quests;
    assert.equal(quests.chooseEventOption("go").dailyEvent.status, "active");
    assert.equal(quests.getReputation().value, 0);
    assert.equal(quests.markChumSpent().dailyEvent.status, "done");
    assert.equal(quests.getReputation().value, 8);
    quests.markChumSpent();
    quests.chooseEventOption("go");
    quests.claimEvent();
    assert.equal(quests.getReputation().value, 8);
    game.moveDays(1);
    assert.equal(game.base.load().flags.chumSpentToday, false);

    const early = fixture();
    early.findEvent("plankton-trap");
    early.quests.markChumSpent();
    assert.equal(early.quests.chooseEventOption("go").dailyEvent.status, "done");

    const declined = fixture();
    declined.findEvent("plankton-trap");
    const refusal = declined.quests.chooseEventOption("refuse");
    assert.equal(refusal.dailyEvent.status, "done");
    assert.equal(refusal.shields, 1);
    assert.equal(refusal.reputation, 3);
    declined.quests.chooseEventOption("refuse");
    declined.quests.claimEvent();
    assert.equal(declined.quests.getShields(), 1);
  });

  test("顺风日与声望、四星折扣叠乘，交付事件后仍增益", () => {
    const game = fixture();
    game.findOffer("krabs-secret", (event) => event.id === "tailwind"
      && (game.side("puff-dock") || game.side("spongebob-jelly")));
    const quests = game.quests;
    const next = game.side("puff-dock") ?? game.side("spongebob-jelly");
    quests.addReputation(20, "fixture");
    for (let count = 0; count < 4; count += 1) quests.addWanted("chum");
    assert.equal(finishOffered(game, "krabs-secret").reward.income, 36);
    assert.equal(quests.getDailyEvent().status, "done");
    assert.equal(quests.getReputation().value, 28);
    quests.claimEvent();
    assert.equal(finishOffered(game, next.id).reward.income, Math.round(next.reward.income * 1.2 * 1.5));
    assert.equal(quests.getDailyEvent().status, "claimed");
  });

  test("营业开闭边界、跨夜营业和打烊到访无写入", () => {
    const game = fixture();
    const quests = game.quests;
    quests.setHour(5);
    assert.equal(quests.isOpen("chum"), true);
    assert.equal(quests.isOpen("diner"), false);
    quests.setHour(6);
    assert.equal(quests.isOpen("chum"), false);
    quests.setHour(7);
    assert.equal(quests.isOpen("diner"), true);
    assert.equal(quests.isOpen("school"), false);
    quests.setHour(8);
    assert.equal(quests.isOpen("school"), true);
    quests.setHour(18);
    assert.equal(quests.isOpen("school"), false);
    assert.equal(quests.isOpen("chum"), true);
    quests.setHour(22);
    assert.equal(quests.isOpen("market"), true);
    const saved = game.raw;
    assert.deepEqual(plain(quests.recordVisit("diner")), { ignored: "closed" });
    assert.equal(game.raw, saved);
    assert.throws(() => quests.setHour(24), /0 至 23/);
    game.reload();
    assert.equal(game.base.load().gameHour, 22);
  });

  test("外卖声望门槛、第二站超时及当日禁止重接", () => {
    const id = "delivery-chain";
    const game = fixture();
    game.quests.addReputation(60, "fixture");
    game.findOffer(id);
    let quests = game.quests;
    quests.addReputation(-1, "fixture");
    assert.equal(game.side(id), undefined);
    assert.throws(() => quests.acceptQuest(id), /不在今日清单/);
    quests.addReputation(1, "fixture");
    quests.acceptQuest(id);
    quests.setHour(6);
    assert.deepEqual(plain(quests.recordVisit("diner")), { ignored: "closed" });
    quests.setHour(12);
    quests.recordVisit("neighbors");
    assert.equal(game.side(id).progress.step, 0);
    quests.recordVisit("diner");
    assert.equal(game.side(id).progress.step, 1);
    const firstVisit = game.side(id).progress.lastVisitAt;
    game.reload();
    quests = game.quests;
    assert.equal(game.side(id).progress.lastVisitAt, firstVisit);
    game.moveMs(180_001);
    quests.recordVisit("neighbors");
    quests.addReputation(-1, "fixture");
    assert.equal(game.side(id).status, "failed");
    assert.throws(() => quests.claimQuest(id), /尚未完成/);
    assert.throws(() => quests.acceptQuest(id), /不能再接/);
    quests.addReputation(1, "fixture");
    game.moveDays(1);
    game.findOffer(id);
    assert.equal(game.side(id).status, "offered");
  });

  test("外卖相邻站 180 秒边界、奖励和共用收入上限", () => {
    const id = "delivery-chain";
    const game = fixture();
    const quests = game.quests;
    quests.addReputation(60, "fixture");
    game.findOffer(id, (event) => event.id !== "tailwind");
    game.base.save({
      ...game.base.load(),
      incomes: [{ id: "opening-income", amount: 90, source: "fixture", date: game.date(), createdAt: 0 }],
    });
    quests.setHour(12);
    quests.acceptQuest(id);
    game.moveMs(181_000);
    quests.recordVisit("diner");
    game.moveMs(180_000);
    quests.recordVisit("neighbors");
    game.moveMs(180_000);
    quests.recordVisit("cove");
    assert.equal(game.side(id).status, "done");
    assert.equal(quests.claimQuest(id).reward.income, 10);
    assert.equal(game.base.load().incomes.find((item) => item.source === id).amount, 10);
    assert.equal(quests.getDerived().totalIncome, 100);
    assert.equal(quests.getReputation().value, 65);
    assert.equal(quests.getReportExtra().sideDoneTotal, 1);
  });

  test("立足评分计入实收余额、累计涨星和 S 至 D 阈值", () => {
    const rank = fixture().quests;
    for (const [delta, score, grade] of [[0, 30, "D"], [20, 40, "C"], [30, 55, "B"], [30, 70, "A"]]) {
      rank.addReputation(delta, "fixture");
      assert.equal(rank.getReportExtra().score, score);
      assert.equal(rank.getReportExtra().grade, grade);
    }
    rank.addReputation(20, "fixture");
    rank.addExpense({ amount: 20, category: "食堂餐饮" });
    assert.equal(rank.getReportExtra().grade, "S");
    assert.equal(rank.getReportExtra().score, 87.6);

    const game = fixture();
    const quests = game.quests;
    game.base.save({
      ...game.base.load(),
      reputation: 80,
      expenses: [{ id: "past-spend", amount: 830, category: "出行", date: game.date(-1), createdAt: 0 }],
      incomes: [{ id: "paid-income", amount: 100, source: "fixture", date: game.date(), createdAt: 0 }],
    });
    quests.addExpense({ amount: 20, category: "食堂餐饮" });
    quests.addWanted("chum");
    quests.addWanted("after-hours");
    quests.clearWanted(1);
    assert.deepEqual(plain(quests.getReportExtra()), {
      score: 64, grade: "B", reputationTier: 3, wantedStars: 1, mainDone: 1, sideDoneTotal: 0,
    });
    quests.addExpense({ amount: 3000, category: "出行" });
    assert.equal(quests.getReportExtra().score, 30);
    assert.equal(quests.getReportExtra().grade, "D");
    game.base.save({ ...game.base.load(), totalStarsGained: 100 });
    assert.equal(quests.getReportExtra().score, 0);
  });

  console.log(passed + " 组自测通过");
}

/*
 * Node v24.22.3 实跑输出。TZ=Asia/Shanghai 和 TZ=America/Los_Angeles 的结果相同。
 * PASS first-meal 分类、20 元边界与 quest 动画
 * PASS krabs-secret 乱序不完成、单次交付与重载战报
 * PASS patrick reject 发盾、首次清零保护及次日正常断连
 * PASS 每日收入 100 元截断、余额与 HP
 * PASS 12 项主线顺序、零消费确认与 rent 清关
 * PASS 停留累加、消费后到访与跨日失效
 * PASS patrick accept 只记一次 15 元与糖分动画
 * PASS 演示存档、成就文案及重置兼容
 * PASS 扩展保存失败后恢复，重试仅记一笔
 * PASS 致命暴击和双倍日预算各涨一星且分别日限一次
 * PASS 通缉每跨一天衰减一星并重置当日限次
 * PASS 声望达到 20 使支线收入乘 1.2，交付发 5 声望
 * PASS 四星交付收入减半，五星限制新接取并保留累计涨星
 * PASS 水母迁徙到访完成、领取 20 元与每日事件重置
 * PASS 超市促销按当日分类累计和到访判定，返现最多 30 元
 * PASS 痞老板邀约的同日消费标记、拒绝发盾和一次性声望
 * PASS 顺风日与声望、四星折扣叠乘，交付事件后仍增益
 * PASS 营业开闭边界、跨夜营业和打烊到访无写入
 * PASS 外卖声望门槛、第二站超时及当日禁止重接
 * PASS 外卖相邻站 180 秒边界、奖励和共用收入上限
 * PASS 立足评分计入实收余额、累计涨星和 S 至 D 阈值
 * 21 组自测通过
 */
