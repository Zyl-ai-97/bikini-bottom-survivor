(() => {
  "use strict";

  /**
   * @typedef {'食堂餐饮'|'奶茶零食'|'超市日用'|'出行'|'学习打印'|'娱乐社交'} Category
   * @typedef {{id: string, amount: number, category: Category, note?: string, date: string, createdAt: number}} Expense
   * @typedef {{playerName: string, monthlyBudget: number, daysInMonth: number, startDate: string, expenses: Expense[], unlockedAchievements: string[], zeroSpendDays: string[]}} GameState
   */

  const STORAGE_KEY = "budget-survivor-state-v1";
  const CONTENT = {"crit": {"normal": ["这一笔花掉了 1.5 天的命。", "血条少了一截。屏幕没红，你心里红了一下。", "小口放血，最容易让人忘记自己在流血。", "消费成功。生存难度上调一格，没有提示音。", "这一下不疼。第三十天才疼。", "你以为只是顺手，系统记成了一记劈砍。", "余额退了半步，你假装没看见，它可一直看着你。", "记账本翻页的声音很轻，跟掉血一样轻。", "又少一顿饭的距离。你现在不饿，月底会。", "这次伤害不大，但它不打算只来一次。"], "heavy": ["重度暴击！这一笔顶得上 3 天生活费。", "血条裂了一道口子。这次你真听见了。", "三天口粮，换一次「就这一次」。你说了几遍了。", "暴击生效。从今晚起，你的敌人叫下半月。", "钱包闪了一下，存档点又远了一步。", "这一笔下去，你从「还行」掉到「有点悬」。", "系统提示：本次消费造成结构性缺钱。", "你不是付了钱，你是提前预支了三天的命。", "屏幕泛红。不是你眼睛的问题，是血条的问题。", "爽了三秒，疼三天半。这笔交易不太划算。"], "lethal": ["致命一击。你不是在消费，你是在给月底挖坑。", "血条见底。这不是花钱，这是提前退场。", "存档损坏。剩下的日子，你只剩食堂和硬扛。", "你把自己打进了贫困剧情线，这一集没有复活点。", "这一笔落下，月底的你已经提前饿了一顿。"], "sugar": ["糖分暴击。一杯奶茶的钱，够在食堂吃一荤一素。", "糖分回蓝，血条打折。甜的进嘴，空的留给月底。", "快乐即时到账，账单分批回收。", "一口甜，三天咸。口味是你自己选的。", "奶茶不解渴。它解的是你不敢看余额的那口气。"]}, "streak": {"3": "连守 3 天。血条还有形状，人也还有样子。", "7": "连守 7 天。这个月你是传说，别急着把自己活成笑话。", "broken": "连守断了。墙上那句「这次一定」，先撕下来吧。"}, "achievements": {"第一滴血": "第一滴血。开局就掉血，说明你确实进场了。", "稳住侠": "稳住侠。你没多花，在这个月已经算超能力。", "自律领主": "自律领主。你把欲望按在地上，它今天没敢动。", "生存大师": "生存大师。别人月底找饭，你月底还有余粮。", "大出血": "大出血。你不是在买东西，你是在给钱包做开颅。", "糖分爱好者": "糖分爱好者。你的血条里，一半是水，一半是奶茶。", "食堂常驻": "食堂常驻。阿姨已经不用再问你要几两饭了。", "一毛不拔": "一毛不拔。你把穷过成了一门手艺，还挺体面。", "夜猫子": "夜猫子。凌晨两点你还在线，余额也没睡。", "早起的鸟": "早起的鸟。早饭吃到热的，这天开局就算赢。", "月底活下来了": "月底活下来了。没有史诗，但你是真通关了。", "精准打击": "精准打击。这一笔花得准，连账本都点了头。"}, "npc": ["今日任务：消费不超过 50 元。做到了我记你一功，做不到明天再来。", "帮我瞄一眼你余额。过了三位数，我今天给你发个称号。", "镇上奶茶今天买一送一。我知道，我是故意的。", "任务：三餐都在食堂解决，一顿外卖都不许。奖品是我替你骄傲一晚上。", "今天只花现金。你试试，手会抖。", "任务：从超市门口走过去，不进去。走过去就算赢。", "把购物车清空一次。不是付款，是删掉。", "今日悬赏：找到一顿 10 块以内的晚饭。找到了，回来领赏。", "任务：今天不打开任何购物 App。开一次，血条掉一格。", "月底之前攒下 30 块。攒到了，我陪你在镇口坐一会儿。"], "reportTips": ["奶茶翻车多半不是喝多了，是喝得太随意。下月先定杯数，再定心情。", "把奶茶从「想喝就喝」改成「一周两杯」。糖分不替你交学费。", "娱乐暴击都挤在周末。下月娱乐钱先锁死额度，超了就从下周饭钱里扣。", "娱乐花销连开两晚就能打穿预算。玩之前先算一句：玩完还剩几天。", "其余花销基本是临时起意。下月留 100 块机动钱，动了就算超支。", "每天睡前看一眼余额。比月底哭一场便宜得多。"], "onboarding": {"title": "1500 生存季：你只剩一条血条", "startButton": "开始生存"}};
  const pickLine = (lines, seed) => lines[Math.abs(seed) % lines.length];
  const SEASON_DAYS = 30;
  const BUDGET_DAYS = BigInt(SEASON_DAYS);
  const DAY_MS = 86_400_000;
  const HOUR_MS = 3_600_000;
  const CATEGORIES = ["食堂餐饮", "奶茶零食", "超市日用", "出行", "学习打印", "娱乐社交"];
  const LEVELS = [
    { days: 27, level: 6, levelName: "生存大师" },
    { days: 20, level: 5, levelName: "自律领主" },
    { days: 12, level: 4, levelName: "预算骑士" },
    { days: 7, level: 3, levelName: "钱包守卫" },
    { days: 3, level: 2, levelName: "食堂熟客" },
    { days: 0, level: 1, levelName: "新生勇者" },
  ];

  // 覆盖 number 的十进制指数和小数位，以整数比较金额阈值和日汇总边界。
  const MONEY_DECIMALS = 324 + 16;
  const YUAN = 10n ** BigInt(MONEY_DECIMALS);
  const PRECISION_TOLERANCE = YUAN * BUDGET_DAYS;

  function moneyUnits(value) {
    const [mantissa, exponent = "0"] = String(value).split("e");
    const [integer, fraction = ""] = mantissa.split(".");
    const shift = MONEY_DECIMALS + Number(exponent) - fraction.length;
    return BigInt(integer + fraction) * 10n ** BigInt(shift);
  }

  function yuan(units) {
    return Number(`${units}e-${MONEY_DECIMALS}`);
  }

  function roundedHp(balance, budget) {
    const percent = balance * 100n;
    const whole = percent / budget;
    const twiceRemainder = (percent % budget) * 2n;
    if (twiceRemainder >= budget) return Number(whole + 1n);
    if (twiceRemainder < -budget) return Number(whole - 1n);
    return Number(whole);
  }

  function localDateKey(date) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 使用 UTC 日序相减，日历日跨度不受夏令时或本地时区偏移影响。
  function dayIndex(date) {
    return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
  }

  function dayKey(index) {
    return new Date(index * DAY_MS).toISOString().slice(0, 10);
  }

  function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const index = dayIndex(value);
    return Number.isFinite(index) && dayKey(index) === value;
  }

  function evaluationClock(asOf) {
    if (typeof asOf === "string" && !isDateKey(asOf)) throw new RangeError("invalid date");
    const date = typeof asOf === "string" ? new Date(`${asOf}T12:00:00`) : new Date(asOf);
    if (!Number.isFinite(date.getTime()) || !isDateKey(localDateKey(date))) {
      throw new RangeError("invalid date");
    }
    return date;
  }

  /** @returns {GameState} */
  function newState(today) {
    return {
      playerName: "",
      monthlyBudget: 1500,
      daysInMonth: SEASON_DAYS,
      startDate: today,
      expenses: [],
      unlockedAchievements: [],
      zeroSpendDays: [],
    };
  }

  function copyExpense(value) {
    if (!value || typeof value.id !== "string" || value.id.length === 0
      || !Number.isFinite(value.amount) || value.amount < 0
      || !CATEGORIES.includes(value.category) || !isDateKey(value.date)
      || !Number.isFinite(value.createdAt) || !Number.isFinite(new Date(value.createdAt).getTime())
      || (value.note !== undefined && typeof value.note !== "string")) {
      return null;
    }
    const { id, amount, category, note, date, createdAt } = value;
    const expense = { id, amount, category, date, createdAt };
    if (note !== undefined) expense.note = note;
    return expense;
  }

  function normalizeState(value, today) {
    const state = newState(today);
    if (!value || typeof value !== "object") return state;

    if (typeof value.playerName === "string") state.playerName = value.playerName;
    if (Number.isFinite(value.monthlyBudget) && value.monthlyBudget > 0) {
      state.monthlyBudget = value.monthlyBudget;
    }
    if (Number.isSafeInteger(value.daysInMonth) && value.daysInMonth > 0) {
      state.daysInMonth = value.daysInMonth;
    }
    if (isDateKey(value.startDate)) state.startDate = value.startDate;
    if (Array.isArray(value.expenses)) state.expenses = value.expenses.map(copyExpense).filter(Boolean);
    if (Array.isArray(value.zeroSpendDays)) {
      state.zeroSpendDays = [...new Set(value.zeroSpendDays.filter(isDateKey))];
    }
    return state;
  }

  function amountCrit(amount, budget) {
    const scaledAmount = amount * BUDGET_DAYS;
    if (scaledAmount >= budget * 6n) return "lethal";
    if (scaledAmount >= budget * 3n) return "heavy";
    if (scaledAmount * 2n >= budget * 3n) return "normal"; // 1.5 = 3 / 2
    return "none";
  }

  function isSugarCrit(category, amount) {
    return category === "奶茶零食" && amount >= 25n * YUAN;
  }

  function summarize(state, today) {
    const budget = moneyUnits(state.monthlyBudget);
    const start = dayIndex(state.startDate);
    const end = dayIndex(today);
    const dayNumber = Math.max(0, end - start + 1);
    const days = new Map();
    const categories = new Map(CATEGORIES.map((category) => [category, { amount: 0n, count: 0 }]));
    const critCounts = { normal: 0, heavy: 0, lethal: 0, sugar: 0 };
    let total = 0n;
    let expenseCount = 0;
    let bigExpense = false;
    let nightOwl = false;
    let earlyBird = false;

    for (const expense of state.expenses) {
      const amount = moneyUnits(expense.amount);
      if (!days.has(expense.date)) days.set(expense.date, { amount: 0n, count: 0 });
      const day = days.get(expense.date);
      day.amount += amount;
      day.count += 1;
      if (expense.date > today) continue;

      total += amount;
      expenseCount += 1;
      const category = categories.get(expense.category);
      category.amount += amount;
      category.count += 1;
      const crit = amountCrit(amount, budget);
      if (crit !== "none") critCounts[crit] += 1;
      if (isSugarCrit(expense.category, amount)) critCounts.sugar += 1;
      if (amount >= 300n * YUAN) bigExpense = true;

      const created = new Date(expense.createdAt);
      const time = created.getHours() * HOUR_MS + created.getMinutes() * 60_000
        + created.getSeconds() * 1000 + created.getMilliseconds();
      if (time > 22 * HOUR_MS) nightOwl = true;
      if (time < 8 * HOUR_MS) earlyBird = true;
    }

    const recordedDates = [...days.keys()].filter((date) => date <= today).sort();
    const zeroSpendDays = state.zeroSpendDays.filter((date) => (days.get(date)?.amount ?? 0n) === 0n);
    let lastOverBudget = start - 1;
    let longestStreak = 0;
    let recordedSeasonDays = 0;
    let preciseDay = false;

    for (const date of recordedDates) {
      const amount = days.get(date).amount * BUDGET_DAYS;
      if (amount >= budget - PRECISION_TOLERANCE && amount <= budget + PRECISION_TOLERANCE) {
        preciseDay = true;
      }
      if (date < state.startDate) continue;
      recordedSeasonDays += 1;
      if (amount > budget) {
        const index = dayIndex(date);
        longestStreak = Math.max(longestStreak, index - lastOverBudget - 1);
        lastOverBudget = index;
      }
    }

    // 无记录的日历日合计为 0 元。跨过多日时按日历日差计算连击。
    const streak = Math.max(0, end - lastOverBudget);
    longestStreak = Math.max(longestStreak, streak);
    if (recordedSeasonDays < dayNumber && budget <= PRECISION_TOLERANCE) preciseDay = true;

    const balance = budget - total;
    const { level, levelName } = LEVELS.find((entry) => streak >= entry.days);
    const achievements = [
      ["第一滴血", expenseCount >= 1],
      ["稳住侠", longestStreak >= 3],
      ["自律领主", longestStreak >= 7],
      ["生存大师", longestStreak >= 14],
      ["大出血", bigExpense],
      ["糖分爱好者", categories.get("奶茶零食").count >= 5],
      ["食堂常驻", categories.get("食堂餐饮").count >= 10],
      ["一毛不拔", zeroSpendDays.some((date) => date <= today)],
      ["夜猫子", nightOwl],
      ["早起的鸟", earlyBird],
      ["月底活下来了", balance > 0n && dayNumber >= SEASON_DAYS],
      ["精准打击", preciseDay],
    ];
    const unlockedAchievements = achievements.filter(([, unlocked]) => unlocked).map(([name]) => name);

    return {
      stats: {
        monthlyBudget: state.monthlyBudget,
        dailyBudget: state.monthlyBudget / SEASON_DAYS,
        daysInMonth: state.daysInMonth,
        dayNumber,
        expenseCount,
        totalSpent: yuan(total),
        balance: yuan(balance),
        hp: roundedHp(balance, budget),
        todaySpent: yuan(days.get(today)?.amount ?? 0n),
        streak,
        longestStreak,
        level,
        levelName,
        unlockedAchievements,
      },
      zeroSpendDays,
      recordedDates,
      days,
      categories,
      critCounts,
      budget,
    };
  }

  function refreshState(state, summary) {
    state.unlockedAchievements = summary.stats.unlockedAchievements;
    state.zeroSpendDays = summary.zeroSpendDays;
    return state;
  }

  function persist(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function readState(today) {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return newState(today);

    try {
      return normalizeState(JSON.parse(saved), today);
    } catch (error) {
      if (error instanceof SyntaxError) return newState(today);
      throw error;
    }
  }

  /** @returns {GameState} */
  function load() {
    const today = localDateKey(new Date());
    const state = readState(today);
    return refreshState(state, summarize(state, today));
  }

  /** 手动确认零消费日时，把 YYYY-MM-DD 加入 state.zeroSpendDays 后调用 save。 */
  function save(state, asOf = new Date()) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new TypeError("invalid state");
    }
    const today = localDateKey(evaluationClock(asOf));
    const next = normalizeState(state, today);
    return persist(refreshState(next, summarize(next, today)));
  }

  function createExpense(input, clock) {
    if (!input || typeof input !== "object") throw new TypeError("invalid expense input");
    const createdAt = input.createdAt ?? clock.getTime();
    const id = input.id ?? (window.crypto?.randomUUID?.()
      ?? `${createdAt}-${Math.random().toString(36).slice(2)}`);
    const date = input.date ?? localDateKey(new Date(createdAt));
    const expense = copyExpense({ ...input, id, date, createdAt });
    if (expense === null) throw new TypeError("invalid expense");
    return expense;
  }

  /** addExpense(input) 使用并保存本地状态。addExpense(state, input, asOf?) 返回新状态。 */
  function addExpense(stateOrInput, input, asOf = new Date()) {
    const useStorage = input === undefined;
    const clock = evaluationClock(asOf);
    const today = localDateKey(clock);
    const state = useStorage ? readState(today) : normalizeState(stateOrInput, today);
    const expense = createExpense(useStorage ? stateOrInput : input, clock);
    if (state.expenses.some((item) => item.id === expense.id)) {
      throw new TypeError("duplicate expense id");
    }
    state.expenses.push(expense);

    const summary = summarize(state, today);
    refreshState(state, summary);
    const amount = moneyUnits(expense.amount);
    const monetaryCrit = amountCrit(amount, summary.budget);
    const sugarCrit = isSugarCrit(expense.category, amount);
    const crit = monetaryCrit === "none" && sugarCrit ? "sugar" : monetaryCrit;
    const messages = [];
    if (monetaryCrit !== "none") messages.push(pickLine(CONTENT.crit[monetaryCrit], state.expenses.length));
    if (sugarCrit) messages.push(pickLine(CONTENT.crit.sugar, state.expenses.length));
    if (messages.length === 0) messages.push("已记账");
    const { hp, balance, todaySpent, streak } = summary.stats;

    if (useStorage) persist(state);
    return { state, feedback: { crit, hp, balance, todaySpent, streak, messages } };
  }

  /** asOf 可传 Date、毫秒时间戳或 YYYY-MM-DD。 */
  function getStats(state, asOf = new Date()) {
    const today = localDateKey(evaluationClock(asOf));
    const current = state === undefined ? readState(today) : normalizeState(state, today);
    return summarize(current, today).stats;
  }

  /** 汇总口径与 getStats 一致，另返回分类、记账日和暴击统计。 */
  function getReport(state, asOf = new Date()) {
    const today = localDateKey(evaluationClock(asOf));
    const current = state === undefined ? readState(today) : normalizeState(state, today);
    const summary = summarize(current, today);
    const confirmed = new Set(summary.zeroSpendDays.filter((date) => date <= today));
    const dates = [...new Set([...summary.recordedDates, ...confirmed])].sort();

    return {
      ...summary.stats,
      categoryBreakdown: [...summary.categories].map(([category, item]) => ({
        category,
        totalSpent: yuan(item.amount),
        expenseCount: item.count,
      })),
      dailyBreakdown: dates.map((date) => ({
        date,
        totalSpent: yuan(summary.days.get(date)?.amount ?? 0n),
        expenseCount: summary.days.get(date)?.count ?? 0,
        confirmedZeroSpend: confirmed.has(date),
      })),
      critCounts: summary.critCounts,
    };
  }

  /** 返回截至 asOf 的 14 天示例状态，由调用方决定何时保存。 */
  function generateDemoData(asOf = new Date()) {
    const clock = evaluationClock(asOf);
    const today = localDateKey(clock);
    const demoDays = 14;
    const start = dayIndex(today) - demoDays + 1;
    const state = newState(dayKey(start));

    state.expenses.push(createExpense({
      id: "demo-0",
      date: state.startDate,
      createdAt: new Date(`${state.startDate}T22:30:00`).getTime(),
      amount: 150,
      category: "超市日用",
    }, clock));

    for (let offset = 1; offset < demoDays; offset += 1) {
      const date = dayKey(start + offset);
      state.expenses.push(createExpense({
        id: `demo-food-${offset}`,
        date,
        createdAt: date === today ? clock.getTime() : new Date(`${date}T07:15:00`).getTime(),
        amount: 25,
        category: "食堂餐饮",
      }, clock));
      if (offset <= 5) {
        state.expenses.push(createExpense({
          id: `demo-sugar-${offset}`,
          date,
          createdAt: new Date(`${date}T15:30:00`).getTime(),
          amount: 25,
          category: "奶茶零食",
        }, clock));
      }
    }

    return refreshState(state, summarize(state, today));
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    return newState(localDateKey(new Date()));
  }

  window.BudgetSurvivor = { load, save, addExpense, getStats, getReport, generateDemoData, reset };
})();
