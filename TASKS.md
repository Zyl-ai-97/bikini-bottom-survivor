# TASKS — 任务板（状态只由 Muse 更新）

状态：待领 / 进行中 / 待集成 / 已合并

## 已完成

- [x] Fork 原仓库到 Zyl-ai-97/bikini-bottom-survivor（Muse 经浏览器完成，Public）
- [x] 本地 clone 并验证原版可运行：Node v24、`node serve.mjs`、http://127.0.0.1:8846 返回 200（Muse）
- [x] 打回滚 tag `v0-original-runnable`（本地，待随首次推送同步）
- [x] 建立 PROJECT.md / CONTRACT.md / TASKS.md 与 fusion/ 四层目录（本地，待推送）
- [x] 规格对齐（2026-11-24）：实测原项目代码后，把接口定版为 `web/survival/` + `window.BudgetSurvivor`（见 CONTRACT.md 头部依据），删掉不被 serving 的 `fusion/` 目录；旧版 `calcDerived / 'fatal'` 接口作废

## 第一轮（待派发，派活包见《四方配合包-按GitHub原项目.md》第 4 节）

- [x] T1 GPT：实现 `web/survival/survival-logic.js`，暴露 `window.BudgetSurvivor` 全部接口 + 自测数据（配合包 4.1）——已合并（提交 d9d0ee1），Muse 实测全过；注意 feedback 文案目前是 TODO 占位符，等 T3 文案到位后替换
- [x] T2 HY：`web/survival/survival-hud.js` + `survival-hud.css`，父页面 HUD、记一笔弹窗、暴击层、战报层、两个钩子（配合包 4.2）——已交付 A（深色 RPG）/B（简洁）两版，JS 相同仅 CSS 不同；A 版已定为正式版 `survival-hud.js/css`，两版原件同存仓库备选
- [x] T3 豆包：`web/survival/content.json`，暴击/连击文案与 12 成就文案（配合包 4.3）——已交付并校验全过（条数、12 成就键名、4 条定版文案原文无改动），content.json 与 content-prompts.txt 已合入 web/survival/
- [x] T4 Muse：集成层（把 `web/survival/` 接进 `web/index.html`、开局设置与回程战报钩子）——已接入并通过本地 DOM 联调：开局设置弹出、记 150 元奶茶后余额 ¥1350/HP 90%/重度暴击红闪、战报数值正确；T3 合入后最终联调通过：暴击显示真实文案（重度+糖分双行），TODO 占位符已清零
- [ ] T5 GPT 生图：HUD 图标、成就图标、战报底图（优先 GPT 生图，Muse/豆包补位），成品放 `web/survival/img/`

## 待办

- [x] 首次推送：PROJECT/CONTRACT/TASKS 与 survival-logic.js 已推回 GitHub（提交 824c3f7、d9d0ee1）
- [ ] Qoder 复刻：原型跑通后，按 PROJECT.md 规格在 Qoder 复刻并部署 Qoder Sites
