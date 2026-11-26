# 警察模型解包结论（2026-11-25 研究笔记，未提交）

来源：直接解包本地仓库 `web/underwater/assets/models.json.gz`（14MB，2026-11-24 03:17）
并对照 `web/underwater/imported-renderer.js`、`bikini-layout.js` 核实。DESIGN-v5.md 的
billboard 先行、P3 再攻坚 3D 的分期不变；下面这份结论只修正其中一个前提，并给出
P3 不用 Blender 也能走的路。

## 结论（先说）

1. **原版角色会走路，移动不是原管线之外的扩展。**
   `bikini-layout.js` 里已有 18 条命名巡逻路线 + 3 条海湾路线（`walks`、`bayWalks`，
   第 104–145 行），`walk()`（第 204–240 行）每帧改 `actor.x / z / yaw / pace / walkTime`；
   另有 `promenade()`（第 242–252 行）让路人鱼来回走动，`gatheringPose()`（第 315–342 行）
   让 5 位主角沿路走到广场。渲染器每帧调用 `layout.characters(time, floor)`
   （`imported-renderer.js:1438`）。所以警察追捕的“移动”已有现成写法可抄，
   不需要在桥里另造一套移动系统，只需在 layout 里加一个 actor、按追捕逻辑改它的
   x/z/yaw/pace。
2. **只有 5 位主角有真骨骼走路循环。** `skin.walk` 只在 c01–c05 上：
   41 帧、1.333 秒、骨骼数 15–31（c01 为 31 根）。`skin` 结构为
   `{j, w, walk, frames, duration, bones, greet, head, headPivot}`，
   其中 `greet` 是挥手、`head`/`headPivot` 是头部朝向。
3. **路人鱼（c14–c19）用的是另一套“legacy rig”走法，没有 walk 循环。**
   它们有 `j` + 4 个 `pivots`，渲染器按 `pace * sin(step)` 算摆动幅度
   （`imported-renderer.js:1270–1281`：`stride`、`leftArm`、`rightArm`、`bob`、`lean`），
   靠 layout 每帧给的 `pace/step` 做出走路感。警察复用这套最省事：
   克隆一个 c14–c19 的网格，改顶点色/贴图（警帽、制服蓝），不用新骨骼。
4. **“Blender 建模再导出”在仓库里没有证据。** 全仓库无 `.blend` 文件、无导出脚本；
   `web/underwater/assets/blender/` 里只有一个 JS 文件 `surface-finish.js`（建筑表面
   材质），不是 Blender 工程。不要按“找到作者的 Blender 工程照做”去排工时。
   真要做 3D 警察，实际路径是按下面的自定义格式写脚本生成/改网格数据，
   不是走 Blender → glTF。

## 格式（已验，可直接照着写脚本）

`models.json.gz` 解开是 JSON，共 27 个模型：h01–h08（8 栋建筑）、c01–c19（19 个角色）。
每个模型字段（`imported-renderer.js:105–140` 的 `decodeMesh`）：

| 字段 | 内容 |
|---|---|
| `p` | 顶点坐标，base64 的 Uint16 量化值（0–65535，按 `min`/`extent` 还原） |
| `n` | 法线，base64 的 Int8 |
| `c` | 顶点色，base64 的 Uint8 RGB |
| `i` | 三角形索引，base64 的 Uint16（`wide:true` 时为 Uint32，仅 h01） |
| `m` | 材质编号，Uint8 |
| `a` | 透明度，Uint8（仅部分模型有） |
| `t` + `tex` | UV + 内嵌贴图（`data:image/webp` 或 jpeg 的 base64）；只有 8 个模型带贴图：h01、c01–c05、c11、c18，其余只靠顶点色 |
| `ao` | 接触遮蔽，Uint8 |
| `min` / `extent` | 包围盒（米），渲染时 `authoredHeight = extent[1]` 用于按身高缩放 |
| `j` + `pivots` | legacy rig：`j` 为每顶点关节编号，`pivots` 为 4 个关节点坐标（仅 c14–c19） |
| `skin` | 骨骼蒙皮（仅 c01–c05，见上） |
| `wide` | 索引是否 32 位 |

顶点规模举例：c01 约 12,961 顶点；c14 约 1,688 顶点（最轻的路人鱼模板之一）；
c18 约 3,523 顶点且自带 WebP 贴图。警察模板建议优先看 c14/c15（轻、无贴图、
纯顶点色，好改色）或 c18（有贴图、改贴图可做警服）。

## 对 DESIGN-v5 的影响

- P2 billboard 警察不变，仍是最快能跑通追捕玩法的方案。
- P3 的正确排法不是“研究 Blender 接入”，而是：① 在 `models.json.gz` 里加一个新
  key（如 c20），复用 c14/c15 的 `p/n/c/i/m` 数据改色、加警帽几何；
  ② 在 `bikini-layout.js` 里用 `place()` + 一条巡逻/追击路线注册它；
  ③ 追捕逻辑复用现有 `walk()` 的 pace/step 驱动方式。
- 唯一还没验证的点：新加的模型 key（如 c20）能否被现有加载链认出来并渲染。
  这一步需实测（加 key → 本地跑 → 看警察是否出现），不是“角色能不能动”
  ——动已经证明能动。

## 待用户拍板

- 警察 3D 版是否进 P3 按上面“克隆路人鱼模板”做，还是 P2 的 billboard 就够用到交稿
  （截稿 11-30 18:00，Qoder 复刻 11-28 部署锚点不变，v5 不挡保底提交）。
