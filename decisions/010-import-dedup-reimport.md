# v1 · 导入疑似重复「重复导入」第三裁决（更新旧单内容）（2026-08-30）

- 状态：**已实现**（2026-08-30 实施完成，SPEC-003 v0.2.0 自动化验收全绿；真机冒烟/375px 人工门待用户，见 `specs/import-dedup/checklist.md` §6）
- 关键词：重复导入、更新旧单、三裁决、updates、created_at 刷新、null 不覆盖
- 相关模块：后端（BFF `bff/src/routes/import.ts`）、前端（`/admin/import`）

## 摘要

用户在本地验收 v0.1.1 导入页时提出三点，经两轮对齐确认（未改代码先对齐）：

1. **第三个裁决「重复导入」**：弹窗从两按钮（确认重复不导入 / 不重复）扩为三按钮（重复不导入 / 不重复 / 重复导入）。「重复导入」的语义 = 承认与库中旧单是同一单，但本批信息已更新 → **不插入新单，直接把旧单内容更新为新内容**（替代旧单）。
2. **页面刷新**：排查确认 = Vite HMR 开发环境现象（改 `src/services/types.ts` 等非组件模块触发整页刷新），非功能 bug，生产无此问题，无需代码处理。
3. **前后浏览/末尾确认**：用户曾提议「查看前后重复的单子 + 最后确认」，随后自行发现行内「查看对比」已可撤销/改判（误触可修复）→ **取消**浏览/确认设计，交互维持 v0.1.1 自动弹窗队列 + 查看对比改判。

| 决策点 | 结论 |
|---|---|
| 第三裁决语义 | 「重复导入」= 承认重复但信息已更新，**更新旧单内容**（不插入新单） |
| 更新规则 | `created_at` **刷新为提交时刻**（列表置顶）；新内容为 null 的字段**不覆盖旧值**（避免误清旧单专属微信等）；`id/status/published_by` 不变 |
| 提交契约 | commit 请求增 `updates: [{id, values}]`（`id`=该行 `suspect.gig.id`）；响应增 `updated`、`failed.kind`（insert/update）；rows 与 updates 至少一个非空 |
| 边界处理 | 目标旧单不存在 → failed（kind=update, code=GIG_NOT_FOUND）；旧单已非 open → 仍更新内容、status 不动（用户表示无需特判） |
| 交互 | 维持自动弹窗队列 + 行内查看对比改判；三态间任意改判；pending 强制三选一 |
| 前端分流 | 勾选行按裁决分流：dismissed → `rows`（插入）；reimport → `updates`（更新旧单）；confirmed → 不入提交 |

## 实施结果（M-DEDUP-4，2026-08-30）

- **BFF** `import.ts` commit 扩展：updates 逐元素 `validateGigInput` 权威校验 → `db.getGig` 查目标 → `db.updateGig`（null 字段剔除不覆盖 + `created_at: now`）；rows/updates 全空 → 422；失败元素 `kind=update` 进 failed。openapi v0.7.0 回写。
- **前端** `AdminImportPage.tsx`：三按钮弹窗；`reimport` 行自动勾选 + 「重复-更新旧单」标记 + 提交走 updates；「导入选中」计数 = 插入 + 更新；结果提示 `已创建 X 条，已更新 Y 条`；failed 按 kind 分流回填（update 按 updates 下标映射回预览行）。
- **门禁**：BFF/前端 typecheck + test + build 全绿、`SERVICE_ROLE_KEY` 零匹配、drift_lite ok=true；spec v0.2.0 覆盖矩阵全「已自动化」（新增 TC-DEDUP-013/014/015、PT-DEDUP-04/05）。

## 遗留（待用户）

- 真实语料冒烟（需 `wrangler deploy` 部署新 BFF + 管理员登录，步骤见 checklist §6，含「重复导入」更新闭环验证）。
- 375px 微信真机人工门。
