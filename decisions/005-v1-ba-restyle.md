# v1 · 视觉换皮：grad 工业风 → BA arona 亮蓝（2026-08-29）

- 状态：活跃
- 关键词：视觉换皮、BA、蔚蓝档案、arona、令牌替换、类名不变、logo
- 相关模块：前端、工作区

## 摘要

用户决定将全站视觉从「终末地-莱因科技-明日方舟 工业科研终端感」切换为「蔚蓝档案 BA arona 官方亮蓝」体系。**约束：功能零改动，只动样式层；排版允许微调。**

已对齐的决策：

| 决策点 | 结论 |
|---|---|
| 调性 | arona 官方亮蓝 `#2773e1`（白亮表面 + 中性深灰文字 `#242424`），不用默认深蓝 `#003153` |
| 迁移策略 | 保留现有类名（.btn/.tag/.task-item/.m-head…），新写 `ba-ui.css` 承接实现，TSX 零改动（例外：HomePage m-head 增加 logo img，属排版调整） |
| 覆盖范围 | 全站统一（前台 + /admin） |
| 布局骨架 | 保留现有响应式 H5 骨架（max-width 640 + TabBar），不引入 demo2 的 375u 手机屏容器 |
| 单位 | `--ba-u` 固定 `1px`，脱离 vw 缩放（640 定宽容器内 vw 缩放会失衡） |
| 字号 | 补 12u/14u 档（demo2 验证结论：16u 以下无档是真实移动端硬缺口） |
| Logo | 使用用户用官方生成器制作的 `CS_tutoring_ba-style@nulla.top.png`，按 alpha 包围盒裁剪后入 `public/logo-ba.png`（demo2 实测：生成器画布下方有空白，不裁会偏上） |
| 背景 | AppBackground 保留组件，装饰改为 BA 白亮调性（类名不变，仅 CSS 换实现） |
| 旧样式 | `tokens.css` + `grad-ui.css` 留存停用（main.css 改 import），不删除，可回滚 |

实施分层：

1. `src/styles/ba-tokens.css`：BA 令牌（arona 为默认值）+ 字体 @font-face（HarmonyOS Sans SC 沿用 public/fonts 现有文件；Archivo 可变字体自素材库拷入）+ 兼容旧变量名映射（--bg/--text/--yellow 等映射到 BA 值，保证 main.css @theme inline 与任何残留引用不断链）。
2. `src/styles/ba-ui.css`：翻译 grad-ui.css 全部类名为 BA 语言（白卡 + 圆角 8/6/4、硬投影、按钮平行四边形 clip-path + 按压 scale(.9)、黄下划线标题、浅蓝 chip、navy mono 数值）。
3. `main.css`：import 换为 ba-tokens.css + ba-ui.css。
4. HomePage m-head 加 logo；AdminGate 等其余页面纯 CSS 生效。

来源：素材库 `D:\KB\项目案例\01-软件系统\前端组件\BA\`（tokens.css 体系层 + demo2 实战层 + DESIGN.md 校验清单），只读。

验证证据：`npm run typecheck` 0 错；`npm run test` 28/28 通过；`npm run build` 成功（CSS 18.90 kB）；`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；drift_lite 通过。
