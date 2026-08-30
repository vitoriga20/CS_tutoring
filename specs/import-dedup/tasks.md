# SPEC-003 实施任务清单

> 里程碑顺序执行；`[P]` 标记可并行。每项验收引用 `spec.md` 第 7 部分覆盖矩阵用例 ID 与 `checklist.md` 分节。实施发现 spec 缺约束时：暂停 → 回补 spec → 重跑自检（`specs/import-dedup/self-check.md`，沿用 SPEC-001 17 题 + SPEC-002 扩 2 题框架）→ 再继续（零自由发挥铁律）。本规范是 SPEC-001 模块级补充、宿主为 SPEC-002 导入链路，数据模型/鉴权/错误码/commit 契约全部沿用，仅实现「疑似重复确认」增量。v0.2.0（M-DEDUP-4）为「重复导入」第三裁决（更新旧单内容），对齐结论见 decisions/010。

## M-DEDUP-0 匹配器（纯函数 + 单测，先做）

- [ ] T-DEDUP-0-1 新建 `bff/src/lib/dedupMatcher.ts`：导出 `extractTitleNo` / `matchSuspects`（签名逐字按 spec §4.1）；纯函数、无 Cloudflare/Env 依赖；信号池 6 项与硬信号、阈值 ≥4、同分取 `created_at` 最新、`duplicate=true` 行跳过（suspect 恒 null），全部按 spec §5.1 实现。
- [ ] T-DEDUP-0-2 信号池实现细节：年级 enum 相同；科目按 `·` 拆集合相等；区县 enum 相同但 other/other 不命中；时薪双方非 null 且 |a−b|≤10；性别 enum 相同但 unknown/unknown 不命中；地址归一化（去空白与标点 `.,，·、-－—（）()`、转小写）后相等或互包含。
- [ ] T-DEDUP-0-3 单测 `bff/tests/dedup-matcher.test.ts`：覆盖 spec §5.1 逐项命中/不命中、边界（3/6 不疑似 vs 4/6 疑似、硬信号字段全变仍疑似、双方无编号硬信号不生效、同分取 created_at 最新、单侧 null 全部不命中、other/other 与 unknown/unknown 不命中、地址互包含）。
- [ ] T-DEDUP-0-4 属性测试 PT-DEDUP-01（手写循环生成器，不新增依赖，遵循红线）：suspect 非空 ⇔ 存在 hard 或 score≥4 的候选；指向最高分/最新；duplicate 行 suspect 恒 null。
- [ ] T-DEDUP-0-5 语料自比对 TC-DEDUP-012：`你好.txt` 解析两遍，第一遍幸存行映射为 openGigs，第二遍全部 `duplicate=false` 行必须 `suspect≠null`（同源全命中 oracle）；打乱字段对照批次记录疑似率作误报上限观测，数值记入 checklist。

验收：`cd bff && npm run typecheck`、`npm run test` 绿（既有 134 用例零回归 + 新增全绿）。

## M-DEDUP-1 BFF 集成（依赖 M-DEDUP-0）

- [ ] T-DEDUP-1-1 `bff/src/lib/db.ts` 新增 `listOpenGigsForDedup(env)`：`select` 匹配与展示所需字段、`status='open'`、`order by created_at desc`、不分页（量级约束 spec §8）。
- [ ] T-DEDUP-1-2 `bff/src/routes/import.ts` preview 集成：`parseImport(raw) → matchSuspects(rows, await db.listOpenGigsForDedup(env))`；库查询失败 → 500 INTERNAL，禁止降级为空匹配返回 200；commit 端点与请求体/鉴权零变更。
- [ ] T-DEDUP-1-3 路由测试 `bff/tests/import-route.test.ts` 扩展：TC-DEDUP-001（宽松匹配命中返回 suspect）、TC-DEDUP-004（matched/closed 不参与比对）、TC-DEDUP-009（批内 duplicate 行 suspect 为 null）、库查询异常 → 500、PT-DEDUP-02；CT-DEDUP-001（提交契约回归：既有用例原样绿）。
- [ ] T-DEDUP-1-4 回写 `specs/openapi.yaml`：`GigImportRow` 增补 `suspect`、新增 `ImportSuspect` schema（`gig` 引用既有 `Gig`）；`drift_lite` 输出 `ok=true`。

验收：preview 返回 suspect 正确、open-only、duplicate 行 null、查询失败 500；commit 行为与 SPEC-002 完全一致；drift_lite ok=true。

## M-DEDUP-2 前端交互（依赖 M-DEDUP-1）

- [ ] T-DEDUP-2-1 `src/pages/admin/AdminImportPage.tsx` 预览表扩展：疑似行黄色「疑似重复」徽标（token 取自 `src/styles/ba-tokens.css` 既有强调黄，禁任意 hex）、默认不勾选、行内「查看对比」按钮；`suspect=null` 与 `duplicate=true` 行为与现状零回归。
- [ ] T-DEDUP-2-2 对比弹窗组件：字段逐项上下对照（本批行 vs 库中单子含 `created_at`）、顶部命中摘要「命中 N/6 + 信号名」、命中字段黄色高亮；pending 态只有两个裁决按钮（无关闭路径、遮罩不关）；已裁决行重开可改判可关闭。
- [ ] T-DEDUP-2-3 自动弹窗队列 + 状态机联动：预览到达后按 index 升序自动弹首个 pending，裁决完自动弹下一个；confirmed → 取消勾选 + 置灰不可勾；dismissed → 自动勾选 + 恢复可编辑；改判按 spec §5.2 双向流转；存在任一 pending → 「导入选中」禁用。
- [ ] T-DEDUP-2-4 质量门：加载/空/错误态齐全；弹窗队列异常不静默吞并（控制台报错 + 行内「查看对比」兜底可用）；色板令牌源自 ba-tokens.css；375px 视口弹窗单列可读、按钮键盘可达。

验收：`npm run typecheck`/`npm run test`/`npm run build` 绿；TC-DEDUP-005/006/007/008 与 PT-DEDUP-03 前端测试覆盖；SERVICE_ROLE_KEY 零匹配。

## M-DEDUP-3 验收与上线（依赖 M-DEDUP-0..2）

- [ ] T-DEDUP-3-1 覆盖矩阵全部条目转「已自动化」（见 checklist 各节勾选与证据）。
- [ ] T-DEDUP-3-2 NFR 实测：200 行 × 5000 open 单子 fixture 全链路计时 < 2s；语料自比对数值回填 checklist。
- [ ] T-DEDUP-3-3 真实语料冒烟：库中已有 `你好.txt` 导入的单子的前提下，再次粘贴同文本 → 全部行疑似 → 逐个裁决（确认重复）→ 无可导入行；含改判、误判决后成功导入的完整闭环（需已部署 BFF + 管理员登录，步骤见 checklist §6）。
- [ ] T-DEDUP-3-4 收口：SPEC-003 状态改「已实现」；新建 `decisions/009-import-dedup-alignment.md` 记录本次对齐 8 项结论与实施结果并更新 `decisions/_INDEX.md`；AGENTS.md 活跃 Spec 补 SPEC-003 引用。

## M-DEDUP-4 v0.2.0「重复导入」第三裁决（依赖 M-DEDUP-0..3；对齐 decisions/010）

- [ ] T-DEDUP-4-1 契约回写：`specs/openapi.yaml` 升 v0.7.0——commit 请求增 `updates: [{id, values}]`（rows 可为空数组）、`GigImportCommit` 增 `updated` 与 `failed.kind`（enum insert/update，缺省 insert，code enum 增 GIG_NOT_FOUND）；`drift_lite` 输出 `ok=true`。
- [ ] T-DEDUP-4-2 BFF commit 扩展（`bff/src/routes/import.ts`）：处理 `updates`——逐元素 `validateGigInput` 权威校验；目标旧单 `db.getGig` 不存在 → failed（`kind=update`, `code=GIG_NOT_FOUND`）；更新 = `db.updateGig(id, {…非 null 字段, created_at: now})`（**null 不覆盖旧值**、`created_at` 刷新、id/status/published_by 不变）；`rows` 与 `updates` 至少一个非空（全空 422）；响应 `{ created, updated, failed }`；rows 失败 `kind` 缺省 insert（向后兼容）。
- [ ] T-DEDUP-4-3 路由测试扩展（`bff/tests/import-route.test.ts`）：TC-DEDUP-013（重复导入 → updated、旧单内容替换、created_at 刷新、status/published_by 不变、created 不含该行）、TC-DEDUP-014（null 不覆盖：旧单 contact_wxid/schedule 保留）、TC-DEDUP-015（updates 校验失败 kind=update / 目标不存在 GIG_NOT_FOUND → failed）、PT-DEDUP-04（created+updated+failed 覆盖全部元素，failed 不写入）、PT-DEDUP-05（更新合并性质：null 不覆盖 + id/status/published_by 不变）；rows+updates 混合与全空 422；CT-DEDUP-001 重写为双通道契约回归（既有 insert 用例原样绿）。
- [ ] T-DEDUP-4-4 前端（`src/pages/admin/AdminImportPage.tsx`）：三裁决按钮（「重复不导入」/「不重复」/「重复导入」）；`reimport` 行自动勾选 + 行标「重复-更新旧单」、提交走 `updates`（`id`=该行 `suspect.gig.id`、`values`=编辑后内容），`dismissed` 走 `rows` 插入；弹窗队列/查看对比改判三态（§5.2）；「导入选中」计数 = 插入 + 更新；结果提示 `已创建 X 条，已更新 Y 条`；failed 回填（kind=update 按 updates 下标映射回预览行）。
- [ ] T-DEDUP-4-5 前端测试（`tests/admin-import-dedup.test.tsx`）：TC-DEDUP-005/006/007/008 适配三按钮与三态改判；TC-DEDUP-013 前端侧（reimport 行提交 payload：rows 不含该行、updates 含 {id, values}、行标「重复-更新旧单」）；PT-DEDUP-03 属性改三态（最终勾选 ⇔ 裁决 ∈ {dismissed, reimport}）。

验收：BFF/前端 typecheck+test+build 全绿；`grep SERVICE_ROLE_KEY src/` 零匹配；drift_lite ok=true；spec v0.2.0 覆盖矩阵全「已自动化」。
