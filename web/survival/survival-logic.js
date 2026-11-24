(() => {
  "use strict";

  /**
   * @typedef {'食堂餐饮'|'奶茶零食'|'超市日用'|'出行'|'学习打印'|'娱乐社交'} Category
   * @typedef {{id: string, amount: number, category: Category, note?: string, date: string, createdAt: number}} Expense
   * @typedef {{playerName: string, monthlyBudget: number, daysInMonth: number, startDate: string, expenses: Expense[], unlockedAchievements: string[], zeroSpendDays: string[]}} GameState
   */

  const STORAGE_KEY = "budget-survivor-state-v1";
  const CONTENT_PLACEHOLDER = "TODO: content.json";
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
    if (typeof asOf === "string" && !isDateKey(asOf)) throw new RangeError(CONTENT_PLACEHOLDER);
    const date = typeof asOf === "string" ? new Date(`${asOf}T12:00:00`) : new Date(asOf);
    if (!Number.isFinite(date.getTime()) || !isDateKey(localDateKey(date))) {
      throw new RangeError(CONTENT_PLACEHOLDER);
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
      throw new TypeError(CONTENT_PLACEHOLDER);
    }
    const today = localDateKey(evaluationClock(asOf));
    const next = normalizeState(state, today);
    return persist(refreshState(next, summarize(next, today)));
  }

  function createExpense(input, clock) {
    if (!input || typeof input !== "object") throw new TypeError(CONTENT_PLACEHOLDER);
    const createdAt = input.createdAt ?? clock.getTime();
    const id = input.id ?? (window.crypto?.randomUUID?.()
      ?? `${createdAt}-${Math.random().toString(36).slice(2)}`);
    const date = input.date ?? localDateKey(new Date(createdAt));
    const expense = copyExpense({ ...input, id, date, createdAt });
    if (expense === null) throw new TypeError(CONTENT_PLACEHOLDER);
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
      throw new TypeError(CONTENT_PLACEHOLDER);
    }
    state.expenses.push(expense);

    const summary = summarize(state, today);
    refreshState(state, summary);
    const amount = moneyUnits(expense.amount);
    const monetaryCrit = amountCrit(amount, summary.budget);
    const sugarCrit = isSugarCrit(expense.category, amount);
    const crit = monetaryCrit === "none" && sugarCrit ? "sugar" : monetaryCrit;
    const messages = [CONTENT_PLACEHOLDER];
    if (sugarCrit && monetaryCrit !== "none") messages.push(CONTENT_PLACEHOLDER);
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
