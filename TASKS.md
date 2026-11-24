# TASKS — 任务板（状态只由 Muse 更新）

状态：待领 / 进行中 / 待集成 / 已合并

## 已完成

- [x] Fork 原仓库到 Zyl-ai-97/bikini-bottom-survivor（Muse 经浏览器完成，Public）
- [x] 本地 clone 并验证原版可运行：Node v24、`node serve.mjs`、http://127.0.0.1:8846 返回 200（Muse）
- [x] 打回滚 tag `v0-original-runnable`（本地，待随首次推送同步）
- [x] 建立 PROJECT.md / CONTRACT.md / TASKS.md 与 fusion/ 四层目录（本地，待推送）
- [x] 规格对齐（2026-11-24）：实测原项目代码后，把接口定版为 `web/survival/` + `window.BudgetSurvivor`（见 CONTRACT.md 头部依据），删掉不被 serving 的 `fusion/` 目录；旧版 `calcDerived / 'fatal'` 接口作废

## 第一轮（待派发，派活包见《四方配合包-按GitHub原项目.md》第 4 节）

- [ ] T1 GPT：实现 `web/survival/survival-logic.js`，暴露 `window.BudgetSurvivor` 全部接口 + 自测数据（配合包 4.1）
- [ ] T2 HY：`web/survival/survival-hud.js` + `survival-hud.css`，父页面 HUD、记一笔弹窗、暴击层、战报层、两个钩子（配合包 4.2）
- [ ] T3 豆包：`web/survival/content.json`，暴击/连击文案与 12 成就文案（配合包 4.3）
- [ ] T4 Muse：集成层（把 `web/survival/` 接进 `web/index.html`、开局设置与回程战报钩子），等 T1–T3 合入后联调
- [ ] T5 GPT 生图：HUD 图标、成就图标、战报底图（优先 GPT 生图，Muse/豆包补位），成品放 `web/survival/img/`

## 待办

- [ ] 首次推送：把本地提交与 tag 推回 GitHub（需要 Git 推送授权，见 Muse 汇报）
- [ ] Qoder 复刻：原型跑通后，按 PROJECT.md 规格在 Qoder 复刻并部署 Qoder Sites
