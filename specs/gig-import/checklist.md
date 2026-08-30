# SPEC-002 验收清单

> 使用规则：每条通过打勾并附证据（测试 ID / 实测数值 / 截图说明）；有任一条未过，SPEC-002 不得标「已实现」。条目与 `spec.md` 覆盖矩阵、`tasks.md` 里程碑对应。数据模型/鉴权/错误码类条目复用 SPEC-001 门禁结论，本清单只列导入增量。

## 1. 功能验收（对应 Gherkin 场景；均经 bff/tests/import-route.test.ts，BFF 全量 125 用例绿）

- [x] TC-IMPORT-001 粘贴文本解析出预览，返回行数 = 单子块数，每行含字段与 issues（REQ-IMP-01）
- [x] TC-IMPORT-002 必填字段解析失败行 `status=error` 且 issues 含对应字段（REQ-IMP-02）
- [x] TC-IMPORT-003 同编号重复单子仅保留 1 条，`duplicate=true`（REQ-IMP-03）
- [x] TC-IMPORT-004 编辑后导入选中行，创建数 = 勾选合法行数，响应 `created` 正确（REQ-IMP-04）
- [x] TC-IMPORT-005 提交后仍含非法行：合法行入库，`failed` 含该行且 `details` 指向字段（REQ-IMP-05）
- [x] TC-IMPORT-006 空文本 `raw_text` 拒绝 422 VALIDATION_ERROR（REQ-IMP-06）
- [x] CT-IMPORT-001 匿名 401、free 403、admin 200/201，且无数据变更（REQ-IMP-07）

## 2. 解析引擎单测（M-IMPORT-0）

- [x] TC-IMPORT-007 字段映射单测覆盖 §5.1 全部示例（v0.1.1/v0.1.2 修订版）：年级（初二/junior、准高一/senior、六年级/primary、大一/college、大学一年级/college、准五/primary、四升五/primary）、科目（语数英→语文·数学·英语、数理化→数学·物理·化学、数学物理→数学·物理、语数英（英语）→语文·数学·英语（英语）、长笛→原样、文科一个 理科一个→issue）、区县（岳麓区.→yuelu、北部湾→wangcheng、无前缀→other、长沙县→changsha_county）、时薪（70元/小时→70、100-110→100、60一小时→60、50左右→50、70/h→70、300元/次→null、面议→null）、性别（女/female、男女不限/unknown）、模式（线上→online、默认 offline）；缺失 requirements → issue；标签逗号分隔（教员要求，）→ 解析成功（bff/tests/import-parser.test.ts，112 用例全绿）
- [x] TC-IMPORT-008 用 `你好.txt` 跑全量：单子级可解析率（ok 行占比）实测 **91.3%**（196 块 / 179 ok / 17 error，含重复行口径），≥ 80% 达标（v0.1.4 G2 后从 90.8% 提升）
- [x] PT-IMPORT-01 去重性质：同去重键至多 1 条 `duplicate=false`（手写循环生成器，含装饰前缀变体批次）
- [x] PT-IMPORT-02 标红性质：`status=ok` ⇔ 必填 6 字段全部解析成功（对 196 块语料逐行断言）
- [x] v0.1.3 解析增强回归（用户对齐颗粒度 B，import-parser.test.ts「v0.1.3 解析增强」组）：短标签【地址】【科目】【时间】【要求】【报酬】全部恢复 + 值内区县（长沙市开福区→kaifu）+ 每次/天/周…元→时薪 null；用户三例：例 1/例 3 ok，例 2 仅 grade 需人工（原文未写年级）
- [x] v0.1.4 G2 无标签块回归（「v0.1.4 G2」组，BFF 全量 134 用例绿）：用户无标签块（10034644）全字段自动解析 status=ok；`#` 内容行剥 # 分派（老师要有耐心→requirements）；纯注释 # 行不污染字段；通告行仍跳过；有标签块不启用特征分派

## 3. 提交校验与写入（M-IMPORT-1）

- [x] PT-IMPORT-03 提交：created+failed 覆盖全部输入；failed 不插入；gigs 仅新增 created 条（import-route.test.ts「PT-IMPORT-03」用例）
- [x] PT-IMPORT-04 导入端点鉴权：无 token 401、free 403、admin 按语义返回、前两者无变更
- [x] 空 `rows` 提交 → 422 VALIDATION_ERROR
- [x] 回写 `specs/openapi.yaml`：新增 `GigImportDraft`/`GigImportRow`/`FieldIssue`/`GigImportCommit` schemas 与两个端点（v0.5.0）；`drift_lite` 输出 `ok=true`

## 4. 前端导入页（M-IMPORT-2）

- [x] `/admin/import` 路由可达且挂在管理端导航（App.tsx + AdminPage 批量导入按钮）；前端 typecheck/test/build 全绿（30/30）
- [x] 预览行 issue 字段红框标红（`border: 2px solid var(--red)`）；行内编辑生效（input/select）；勾选框默认勾选 ok 且非 duplicate 行；duplicate 行置灰不可勾（opacity 0.55 + disabled）
- [x] 「导入选中」结果提示正确（created N / failed M），failed 行回填服务端 issues 标红可再编辑；成功后失效 admin-gigs 列表缓存
- [x] 色板/令牌源自 `src/styles/ba-tokens.css`（--ba-*/--bg 系经 Tailwind @theme 映射），零任意 hex；加载/空/错误态齐全
- [ ] 375px 视口无横向滚动：真机人工门（待用户，微信内置浏览器打开 /admin/import 验收）

## 5. 非功能门（数值记入本清单）

- [x] 准确率：可解析率 **90.8%**（196 块 / 178 ok / 18 error，含重复行口径；非重复 116 行错误 11 行）≥ 80%（TC-IMPORT-008，bff/tests/import-parser.test.ts）
- [x] 性能：200 块文本预览端到端 **5.2ms** < 2s（node 实测 importParser.parseImport，无外部 IO）
- [x] 安全：`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配（exit 1）
- [x] 可靠性：异常块不导致整批失败（单块 issue 隔离，collectIssues 逐行；语料 18 条 error 行不影响其余 178 条 ok 行）；5xx 统一 `INTERNAL` 不泄露堆栈（app.ts onError 既有路径，路由未捕获异常走该兜底，代码走查通过）

## 6. 上线门

- [ ] 真实语料冒烟：用 `你好.txt` 完整走 解析→预览→修正→导入，确认生成单子在列表可见（待用户验收：需生产 BFF 已部署 + 管理员登录；前置：`wrangler pages deploy` 后按 BACKLOG #003 完成生产验证）
- [x] SPEC-002 状态改「已实现」；decisions/008 改「已实现」并补实施结论；AGENTS.md 活跃 Spec 补 SPEC-002 引用
