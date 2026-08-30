# SPEC-002 实施任务清单

> 里程碑顺序执行；`[P]` 标记可并行。每项验收引用 `spec.md` 第 7 部分覆盖矩阵用例 ID 与 `checklist.md` 分节。实施发现 spec 缺约束时：暂停 → 回补 spec → 重跑自检（`specs/gig-import/self-check.md`，沿用 SPEC-001 17 题 + 扩 2 题）→ 再继续（零自由发挥铁律）。本规范是 SPEC-001 模块级补充，数据模型/鉴权/错误码全部沿用，仅实现「批量导入」增量。v0.1.1 回补已并入 spec §5.1/§5.2/§9。

## M-IMPORT-0 解析引擎（纯函数 + 单测，建议先做）

- [x] T-IMPORT-0-1 新建 `bff/src/lib/importParser.ts`：导出 `segmentText` / `parseGigBlock` / `markDuplicates` / `collectIssues` / `parseImport`（签名逐字按 spec §4.1）；纯函数、无 Cloudflare/Env 依赖，可单测。
- [x] T-IMPORT-0-2 字段映射实现（spec §5.1，v0.1.1/v0.1.2 修订版）：年级→enum、科目归一（纯缩写展开/全称保留/长尾原样/「一个…一个」模糊）、区县正则前缀 + 手工映射表（复用 `0003` 8 条）、时薪取下限+钳制+「左右」、性别、模式默认 offline、region/student_info/rate/schedule/requirements 抽取、contact_wxid 恒 null；必填集含 `requirements`（§5.2）。
- [x] T-IMPORT-0-3 去重：`dedupKey(title)` 归一（剥装饰前缀 + 去`号家教`尾随数字 + 去空格/点/小写）+ `markDuplicates` 首条保留（spec P-IMPORT-01）。
- [x] T-IMPORT-0-4 单测 `bff/tests/import-parser.test.ts`：覆盖 §5.1 每个映射示例 + 边界（区间取下限、`50左右`、模糊科目留 issue、缺失必填 issue 含 requirements）；属性测试 PT-IMPORT-01/02 用手写循环生成器实现（不新增依赖，遵循红线）。112 用例全绿。
- [x] T-IMPORT-0-5 语料 fixture：`你好.txt` → `bff/tests/fixtures/hello.txt`；TC-IMPORT-008 实测单子级可解析率 **90.8%** ≥ 80%，数值已记入 checklist。

验收：`cd bff && npm run typecheck`、`npm run test` 绿；可解析率 ≥ 80% 达标。

## M-IMPORT-1 BFF 端点（依赖 M-IMPORT-0）

- [x] T-IMPORT-1-1 `bff/src/routes/import.ts`：`POST /api/v1/gigs/import/preview`（解析返回 `GigImportRow[]`）+ `POST /api/v1/gigs/import`（逐元素 `validateGigInput` → 插入 `gigs`，返回 `created`/`failed`）；均 `requireAdmin` 门禁（SPEC-001 §5.4 实际实现）。
- [x] T-IMPORT-1-2 空 `raw_text` / 空 `rows` → 422 VALIDATION_ERROR；预览只跑解析不写库；提交逐元素重校验、失败元素不插入（P-IMPORT-03）。
- [x] T-IMPORT-1-3 测试 `bff/tests/import-route.test.ts`：TC-IMPORT-001..006、CT-IMPORT-001（401/403/无变更）、PT-IMPORT-03/04。
- [x] T-IMPORT-1-4 回写 `specs/openapi.yaml`：新增 `GigImportDraft` / `GigImportRow` / `FieldIssue` / `GigImportCommit` schemas 与两个端点（与 spec §3 逐字一致）；drift_lite 输出 `ok=true`。

验收：写端点匿名 401、free 403、admin 200/201；preview 不写库；commit 的 failed 不插入；drift_lite ok=true。（BFF 全量 125 用例绿）

## M-IMPORT-2 前端导入页（依赖 M-IMPORT-1 与 SPEC-001 M3/M4 后台壳）

- [x] T-IMPORT-2-1 新增 `src/pages/admin/AdminImportPage.tsx`（路由 `/admin/import`，挂进管理端导航）：大文本粘贴框 + 「解析」按钮。
- [x] T-IMPORT-2-2 预览行：字段卡片网格，issue 字段红框标红；行内可编辑 input/select；每行勾选框（默认勾选 `status=ok` 且非 `duplicate`）；`duplicate` 行置灰不可勾。
- [x] T-IMPORT-2-3 「导入选中」：收集勾选行（编辑后）→ `POST /api/v1/gigs/import` → 展示结果（created N / failed M，failed 行回填服务端 issues 标红可再编辑）；导入成功后失效 admin-gigs 列表缓存。
- [x] T-IMPORT-2-4 质量门：加载态/空态/错误态；无破坏性操作；色板令牌源自 `src/styles/ba-tokens.css`（--ba-*/--bg 系，经 Tailwind @theme 映射）。

验收：`npm run typecheck`/`npm run test`/`npm run build` 绿（30/30）；SERVICE_ROLE_KEY 零匹配；TC-IMPORT-001..006 经 BFF 测试覆盖。（375px 真机人工门见 checklist §4）

## M-IMPORT-3 验收与上线（依赖 M-IMPORT-0..2）

- [x] T-IMPORT-3-1 覆盖矩阵全部条目转「已自动化」（见 checklist 各节勾选与证据）。
- [x] T-IMPORT-3-2 NFR 实测：可解析率 90.8% ≥ 80%（checklist §2）；200 块预览 5.2ms < 2s（checklist §5）；375px 真机可用→待人工。
- [ ] T-IMPORT-3-3 真实语料冒烟：用 `你好.txt` 完整走 解析→预览→修正→导入，确认生成单子在列表可见（需已部署 BFF + 管理员登录，待用户验收；步骤见 checklist §6）。
- [x] T-IMPORT-3-4 收口：decisions/008 状态改「已实现」并补实施结论；SPEC-002 状态改「已实现」；AGENTS.md 活跃 Spec 补 SPEC-002 引用。
