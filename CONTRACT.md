# CONTRACT — 接口契约（写代码前先看，交付时按此验收）

> 定版依据：2026-11-24 实测原项目代码后对齐。运行期文件必须放在 `web/survival/` —— `serve.mjs` 只对外提供 `./web` 目录，仓库根目录的 `fusion/` 不会被 serving，放那里运行时 404；且浅海页的 `.hud` 在合并模式下会被隐藏（`web/underwater/app.js`：`surfaceHost` 为真时 `hud.style.visibility = 'hidden'`），所以生存 HUD 必须做在父页面 `web/index.html` 里。旧版 `fusion/logic|wiring|content|integrate` 分层与 `calcDerived / classifyCrit / 'fatal'` 接口已作废，以本文件为准。

## 文件归属

| 文件 | 负责人 | 职责 |
|---|---|---|
| `web/survival/survival-logic.js` | GPT | 生存系统纯逻辑，无 DOM、无样式、不碰 WebGL |
| `web/survival/survival-hud.js`、`web/survival/survival-hud.css` | WorkBuddy HY4Flash | HUD、记账弹窗、暴击反馈、战报层、钩子接线 |
| `web/survival/content.json` | 豆包（文案）/ GPT（生图定版） | 全部文本、图片素材 |
| `web/index.html`（只加生存层引用与钩子） | Muse | 集成点；别人不碰 |
| `PROJECT.md / CONTRACT.md / TASKS.md` | Muse | 规格与任务板维护 |
| 原游戏 `web/surface/`、`web/transition/`、`web/underwater/` | 谁都不改 | 只读；需改先在 TASKS.md 提需求，Muse 批了才动 |

分支：`main` 只有 Muse 合入；工作分支 `gpt/survival-logic`、`hy/scene-wiring`、`doubao/content`。

## 数据结构

```ts
interface Expense { id: string; amount: number; category: '食堂餐饮'|'奶茶零食'|'超市日用'|'出行'|'学习打印'|'娱乐社交'; note?: string; date: string; createdAt: number; }
interface GameState { playerName: string; monthlyBudget: number; daysInMonth: number; startDate: string; expenses: Expense[]; unlockedAchievements: string[]; zeroSpendDays: string[]; }
```

localStorage key：`budget-survivor-state-v1`。全部数值由 expenses 实时计算，不单独存储。

## 逻辑层接口（`web/survival/survival-logic.js`，GPT 实现）

逻辑层只暴露一个全局对象，HUD 只调它，不自己算数：

```js
window.BudgetSurvivor = {
  load(), save(state),
  addExpense({ amount, category, note }) -> { state, feedback }, // feedback: { crit: 'none'|'normal'|'heavy'|'lethal'|'sugar', lines: string[], hp, balance, todaySpent, streak }
  getStats() -> { hp, balance, todaySpent, dailyBudget, streak, level, unlockedAchievements, biggestCrit, topCategory, bestStreak },
  getReport() -> { survivalDays, hp, biggestCrit, topCategory, bestStreak, unlockedCount, tip },
  generateDemoData() -> GameState, // 14 天，能触发连击、至少 4 个成就、1 次重度暴击
  reset()
}
```

规则（定版）：月预算默认 1500，日预算 = 月预算 / 30；HP = 剩余余额 / 月预算 × 100 取整；单笔 ≥ 日预算 1.5 倍普通暴击，≥ 3 倍重度暴击，≥ 6 倍致命一击（crit 取值用 `'lethal'`，不是 `'fatal'`）；奶茶零食单笔 ≥ 25 元追加糖分暴击文案（不另扣 HP）；当日消费 ≤ 日预算连击 +1，超了清零；等级 Lv.1 新生勇者（0 天）/ Lv.2 食堂熟客（3 天）/ Lv.3 钱包守卫（7 天）/ Lv.4 预算骑士（12 天）/ Lv.5 自律领主（20 天）/ Lv.6 生存大师（27 天）；12 个成就：第一滴血、稳住侠（连击 3 天）、自律领主（连击 7 天）、生存大师（连击 14 天）、大出血（单笔 ≥300 元）、糖分爱好者（奶茶零食累计 5 笔）、食堂常驻（食堂餐饮累计 10 笔）、一毛不拔（某日消费 0 元，需手动确认）、夜猫子（22:00 后记一笔）、早起的鸟（08:00 前记一笔）、月底活下来了（剩余 >0 且到第 30 天）、精准打击（某日消费 = 日预算 ±1 元）。

## HUD 元素 id（HY 按这个写，Muse 按这个验）

`#survival-hud`（顶部：`#survival-hp` 血条、`#survival-balance` 余额、`#survival-today` 今日已花/日预算、`#survival-streak` 连击）、`#survival-add-btn`（记一笔）、`#survival-modal`（金额 + 6 分类 + 备注 + 保存）、`#survival-crit`（暴击全屏闪烁层）、`#survival-report`（战报页）。

## 钩子（只用已有的，不改水下代码）

- 回程结算：父页面监听 `postMessage`，收到 `bikini-dive-return` 时，先调 `BudgetSurvivor.getReport()` 在父页面弹出战报，再放行回海面。
- 开局：点海鸥木牌下潜前，若无存档，父页面先弹出开局设置（月预算 1000/1500/2000、角色名），点了“开始生存”才下潜。
- 移动端 390px 宽无横向溢出；HUD 不能挡住 WebGL 画布的拖动和触屏游动，弹窗打开时才拦截画布操作。

## 内容层格式（`web/survival/content.json`，豆包交付）

```json
{ "crit": { "normal": ["...×10"], "heavy": ["...×10"], "lethal": ["...×5"], "sugar": ["...×5"] },
  "streak": { "3": "...", "7": "...", "broken": "..." },
  "achievements": { "第一滴血": "...", "稳住侠": "...", "自律领主": "...", "生存大师": "...", "大出血": "...", "糖分爱好者": "...", "食堂常驻": "...", "一毛不拔": "...", "夜猫子": "...", "早起的鸟": "...", "月底活下来了": "...", "精准打击": "..." },
  "npc": ["...×10"], "reportTips": ["...×6"], "onboarding": { "title": "...", "startButton": "开始生存" } }
```

键名一个字都不改。定版文案原样保留：普通暴击“这一笔花掉了 1.5 天的命。”、重度暴击“重度暴击！这一笔顶得上 3 天生活费。”、致命一击“致命一击。你不是在消费，你是在给月底挖坑。”、糖分暴击“糖分暴击。一杯奶茶的钱，够在食堂吃一荤一素。”。生图成品统一放 `web/survival/img/`，生图优先 GPT，Muse/豆包补位。

## 交付格式

每方交带文件路径的完整文件，不是片段。交接固定写清 4 句：做了什么 / 文件在哪 / 怎么测的、结果 / 还有什么问题。闭环只走 Muse：产出 → Muse 集成 → Muse 实机跑 → Muse 出修改单 → 原作者改自己那层 → 再集成。各方之间不互相传话、不改对方的文件。

## 技术红线

原生 HTML/CSS/JS + 原生 WebGL 2 静态站，无 React、无构建、无后端，启动是 `npm start` 或 `python -m http.server`。不许转 React，不许重写渲染层，不许改文件结构。
