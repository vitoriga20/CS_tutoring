# v1 · 导入疑似重复确认（宽松匹配 + 人工裁决）（2026-08-30）

- 状态：**已实现**（2026-08-30 实施完成，SPEC-003 v0.1.1 自动化验收全绿：BFF 188 用例、前端 43 用例；真机冒烟/375px 人工门待用户，见 `specs/import-dedup/checklist.md` §6）
- 关键词：导入、疑似重复、宽松匹配、信号池、编号硬信号、人工裁决、弹窗队列、dedupMatcher
- 相关模块：后端（BFF `bff/src/lib/dedupMatcher.ts`、`bff/src/routes/import.ts`、`bff/src/lib/db.ts`）、前端（`/admin/import`）

## 摘要

管理员批量导入（SPEC-002）存在重复发布风险：同一单子被再次粘贴时，系统无感知。SPEC-003 在 preview 阶段把本批幸存行与库中 open 单子做宽松匹配，命中疑似时逐条人工裁决，默认不导入、由管理员确认。沿用决策 008 的四问对齐方法，2026-08-30 用户对齐颗粒度，8 项结论全文记录于 `specs/import-dedup/spec.md` §9 变更日志 v0.1.0。

| 决策点 | 结论 |
|---|---|
| 匹配信号 | **关键字段组合 + 编号硬信号**：6 项信号池（年级/科目集合/区县/时薪 ±10/性别/地址归一互包含）≥4 项命中，或双方标题 ≥6 位编号相同（无条件）→ 疑似 |
| 阈值 | **≥4/6 偏召回**（宁可误报看一眼，不可漏放重复单入库）；调整必须走决策后升版本，不得改代码常量 |
| 比对范围 | **只比 status=open** 的库中单子（matched/closed 不再在招，无重复发布风险） |
| 疑似行默认态 | **默认不勾选**，与普通 ok 行区分 |
| 交互流程 | 解析后**自动逐个弹窗**（index 升序），展示**最像的一条**（含命中数与命中字段）；pending 强制二选一无关闭路径 |
| 误判处理 | 「不是重复」→ **自动勾选**、恢复可编辑，等同普通 ok 行 |
| 确认重复 | → **置灰不可勾**、排除出导入集合，视觉等同批内 duplicate 行 |
| 导入阻断 | **存在任一未裁决（pending）→ 「导入选中」禁用**，全部裁决后恢复 |

**两个对齐时明示的默认**：① 编辑不重算（疑似以解析时为准）；② 裁决不持久化（前端会话态，不回传 BFF、不落库，同文本下次仍需重新裁决）。

## 实施结果（M-DEDUP-0..3，2026-08-30）

- **匹配器** `bff/src/lib/dedupMatcher.ts`：`extractTitleNo` / `matchSuspects` 纯函数，无 CF/Env 依赖；单行异常按无候选处理不影响其他行（spec §8 可靠性）；42 个匹配器单测含 PT-DEDUP-01（300 轮属性）。
- **BFF 集成**：`db.listOpenGigsForDedup`（status=open、created_at desc、不分页，量级约束 <5000）；preview 管线 `parseImport → matchSuspects`，**库查询失败 → 500 INTERNAL 不静默降级**；commit 契约零变更（裁决不回传）。路由测试扩展 5 用例（TC-DEDUP-001/004/009、500、CT-DEDUP-001）。
- **前端** `AdminImportPage.tsx`：疑似黄徽标（既有 token，零任意 hex）、默认不勾、行内「查看对比」、对比弹窗（字段上下对照 + 命中 N/6 摘要 + 命中字段黄高亮 + created_at）、自动弹窗队列 + 裁决状态机、pending 阻断「导入选中」；前端测试 9 用例（TC-DEDUP-005/006/007/008 + PT-DEDUP-03 三组序列）。
- **契约**：`specs/openapi.yaml` v0.6.0 增补 `GigImportRow.suspect` + `ImportSuspect` schema；`drift_lite` ok=true。
- **实测数值**：TC-DEDUP-012 语料自比对全量疑似率 **100.0%**（115/115 同源全命中）、打乱对照 **0.0%**；NFR 匹配器 200 行 × 5000 open 单子 **946.3ms < 2s**；当前库 open ≈ 97 条（< 5000 假设成立）。
- **门禁**：BFF 188 用例、前端 43 用例全绿；`SERVICE_ROLE_KEY` 零匹配；`npm run build` 成功。

## 遗留（待用户）

- 真实语料冒烟（需 `wrangler deploy` 部署新 BFF + 管理员登录，步骤见 checklist §6）。
- 375px 微信真机人工门（弹窗单列可读、按钮键盘可达）。
