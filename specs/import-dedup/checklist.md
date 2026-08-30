# SPEC-003 验收清单

> 使用规则：每条通过打勾并附证据（测试 ID / 实测数值 / 截图说明）；有任一条未过，SPEC-003 不得标「已实现」。条目与 `spec.md` 覆盖矩阵、`tasks.md` 里程碑对应。数据模型/鉴权/错误码/commit 契约类条目复用 SPEC-001/002 门禁结论，本清单只列疑似重复确认增量。
>
> **结论：自动化验收全绿（2026-08-30 v0.2.0 实施完成，SPEC-003 状态 v0.2.0「已实现」）；§6 真机/部署人工门待用户。**

## 1. 功能验收（对应 Gherkin 场景）

- [x] TC-DEDUP-001 宽松匹配：5/6 命中行返回 suspect（score=5、matched 含五项、gig 指向库中 G1），行默认不勾选（REQ-DED-01）——证据：`bff/tests/import-route.test.ts`「TC-DEDUP-001」+ `tests/admin-import-dedup.test.tsx`「TC-DEDUP-005」（默认不勾选）
- [x] TC-DEDUP-002 编号硬信号：双方标题含相同 ≥6 位编号、其余字段全不同 → suspect.hard=true（REQ-DED-02）——证据：`bff/tests/dedup-matcher.test.ts`「TC-DEDUP-002」
- [x] TC-DEDUP-003 阈值边界：3/6 不疑似（suspect=null）；4/6 疑似（REQ-DED-03）——证据：`dedup-matcher.test.ts`「TC-DEDUP-003」
- [x] TC-DEDUP-004 只比 open：matched/closed 单子 6 项全命中 + 编号相同也不疑似（REQ-DED-04）——证据：`import-route.test.ts`「TC-DEDUP-004 / PT-DEDUP-02」
- [x] TC-DEDUP-005 自动弹窗：解析后按 index 升序自动弹首个 pending；裁决完自动弹下一个；全部裁决完「导入选中」恢复可用（REQ-DED-05，v0.2.0 三按钮）——证据：`tests/admin-import-dedup.test.tsx`「TC-DEDUP-005」（pending 强制三选一：无关闭按钮、遮罩不关）
- [x] TC-DEDUP-006 阻断导入：存在 pending → 「导入选中」禁用；confirmed/dismissed/reimport 不禁用（REQ-DED-06）——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-006」
- [x] TC-DEDUP-007 改判：dismissed → 重开弹窗改 confirmed 后取消勾选并置灰；反向同理；reimport ⇄ dismissed 互改只换通道（REQ-DED-07）——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-007」（三态双向改判 + error 行两维度独立）
- [x] TC-DEDUP-008 裁决不持久化：同文本再次解析仍疑似、需重新裁决（REQ-DED-08）——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-008」
- [x] TC-DEDUP-009 批内重复行 suspect=null，幸存行才参与库比对（REQ-DED-09）——证据：`import-route.test.ts`「TC-DEDUP-009」+ `dedup-matcher.test.ts`「TC-DEDUP-009（匹配器级）」
- [x] CT-DEDUP-001 提交契约（v0.2.0 双通道）：rows 插入 + updates 更新分流，failed 元素不写入；请求体无多余裁决字段（REQ-DED-10）——证据：`import-route.test.ts`「CT-DEDUP-001」+ 既有 TC-IMPORT-004/005/PT-IMPORT-03 原样绿（insert 通道向后兼容）
- [x] TC-DEDUP-013 更新单子（更新旧单内容）：updated 含替换后的旧单、created 不含该行、旧单 created_at 刷新置顶、status/published_by 不变（REQ-DED-14，v0.2.0）——证据：`import-route.test.ts`「TC-DEDUP-013」+ `admin-import-dedup.test.tsx`「TC-DEDUP-013」（前端 payload 分流）
- [x] TC-DEDUP-014 更新不覆盖旧值：旧单 contact_wxid/schedule 等在新内容为 null 时保留（REQ-DED-15，v0.2.0）——证据：`import-route.test.ts`「TC-DEDUP-014」

## 2. 匹配器单测（M-DEDUP-0）

- [x] TC-DEDUP-010 信号池逐项：年级/科目集合/区县（other/other 不命中）/时薪（|a−b|≤10 命中、11 不命中、null 不命中）/性别（unknown/unknown 不命中）/地址归一（相等与互包含命中、归一后不同不命中）；单侧 null 全部不命中（REQ-DED-11）——证据：`dedup-matcher.test.ts`「TC-DEDUP-010」
- [x] TC-DEDUP-011 同分取 created_at 最新：两条候选 score 相同 → suspect 指向较新者（REQ-DED-12）——证据：`dedup-matcher.test.ts`「TC-DEDUP-011」
- [x] TC-DEDUP-012 语料自比对：同源第二遍全部幸存行 suspect 非 null；打乱字段对照批次疑似率数值记录（REQ-DED-13）——证据：`dedup-matcher.test.ts`「TC-DEDUP-012」，实测 **总行=196 幸存=115 全量疑似率=100.0%（115/115）打乱疑似率=0.0%（0/115）**（误报上限观测：同源内容含编号硬信号兜底全命中；打乱 region/年级/编号后零误报）
- [x] PT-DEDUP-01 属性：suspect 非空 ⇔ 存在 hard 或 score≥4 候选；指向最高分/最新；duplicate 行恒 null——证据：`dedup-matcher.test.ts`「PT-DEDUP-01」（300 轮确定性 LCG 随机，独立 oracle 复算）

## 3. BFF 集成（M-DEDUP-1）

- [x] PT-DEDUP-02 属性：status ∈ {matched, closed} 的单子不出现在任何 suspect.gig——证据：`import-route.test.ts`「TC-DEDUP-004 / PT-DEDUP-02」（种子 matched/closed 全命中+同编号，断言任何行 suspect.gig.status=open、id ∉ {matched,closed}）
- [x] 库查询失败 → 500 INTERNAL（不降级为空匹配 200）；单行匹配异常按无候选处理且不影响其他行——证据：`import-route.test.ts`「库查询失败 → 500 INTERNAL」（fake 注入 failGigsQuery）；`dedup-matcher.test.ts`「spec §8 可靠性」（Proxy draft 抛错行 suspect=null、正常行不受影响）
- [x] preview 请求体/鉴权/422 语义与 SPEC-002 一致（既有用例回归）——证据：CT-IMPORT-001（401/403/422）+ TC-IMPORT-006 原样全绿
- [x] 回写 `specs/openapi.yaml`：`GigImportRow.suspect` + `ImportSuspect` schema；`drift_lite` 输出 `ok=true`——证据：`specs/openapi.yaml`（info v0.6.0）+ `drift_lite.ps1` 实测 `ok=true`（spec_side=4, code_side=5）

## 4. 前端交互（M-DEDUP-2）

- [x] 预览表：疑似行黄徽标（ba-tokens.css 既有强调黄 token，零任意 hex）、默认不勾、行内「查看对比」；非疑似/duplicate 行为零回归——证据：`src/pages/admin/AdminImportPage.tsx`（`.tag.medium` 复用既有黄系标签 + 新增 `.compare-field.hit` 用 `var(--yellow)` color-mix，零任意 hex）+ `admin-import-dedup.test.tsx`「TC-DEDUP-005」（默认不勾）
- [x] 对比弹窗：字段上下对照 + 命中摘要（N/6 + 信号名）+ 命中字段黄高亮 + 库中单子发布时间；pending 态无关闭路径（无 X、遮罩不关）——证据：`SuspectDialog` 组件（COMPARE_FIELDS 含 created_at；`onMouseDown` 遮罩仅在非 pending 关闭）+「TC-DEDUP-005」pending 强制二选一用例
- [x] 状态机：confirmed → 取消勾选 + 置灰不可勾；dismissed → 自动勾选 + 恢复可编辑；改判双向流转正确；error 行裁决后仍可编辑修正（红标与裁决两维度独立）——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-007」（双向改判 + error 行用例）+「PT-DEDUP-03」
- [x] 「导入选中」禁用联动：存在 pending 即禁用；弹窗队列异常不静默吞并（控制台报错 + 行内入口兜底）——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-006」；行内「查看对比」常驻兜底
- [x] `npm run typecheck`/`npm run test`/`npm run build` 绿；前端测试覆盖 TC-DEDUP-005/006/007/008 与 PT-DEDUP-03——证据：typecheck 0 错；vitest 43/43（基线 34 + 新增 9）；`vite build` 成功；`grep -rn "SERVICE_ROLE_KEY" src/` = 0
- [ ] 375px 视口弹窗单列可读、裁决按钮键盘可达：真机人工门（待用户）——**待用户**（微信内置浏览器 375px 实测；布局已按单列设计：字段行 flex 单列、`max-width: 92vw` 卡片）

## 5. 非功能门（数值记入本清单）

- [x] 性能：200 行 × 5000 open 单子 fixture，preview 全链路端到端 < 2s（实测数值回填）——证据：`dedup-matcher.test.ts`「spec §8 性能」实测 **matchSuspects 200×5000 ≈ 946–1027ms**（v0.1.1 测 946.3ms，v0.2.0 回归重跑 1016.6ms，均 < 2s；匹配器为 preview 新增成本，解析基线 SPEC-002 纯解析 ~5ms；DB 查询不计入纯函数测试，量级约束见下）
- [x] 量级：`listOpenGigsForDedup` 全量拉取，当前库 open 单子数记录（假设 < 5000，超出需重开决策）——证据：**当前库 open ≈ 97 条**（117 条真实单中 97 open/19 matched/1 closed），远低于 5000 假设
- [x] 安全：`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；匹配器仅在 BFF 服务端（src/ 无匹配逻辑）——证据：实测 0 匹配；匹配器只存在于 `bff/src/lib/dedupMatcher.ts`，前端仅消费 suspect 结果
- [x] 可靠性：查询失败 500 不静默降级（§3 用例）；异常行隔离不炸整批——证据：`import-route.test.ts`「库查询失败 → 500」+ `dedup-matcher.test.ts`「spec §8 可靠性」

## 6. 上线门

- [ ] 真实语料冒烟（依赖已部署 BFF + 管理员登录）：库中已有 `你好.txt` 导入单子 → 同文本再次粘贴 → 全部幸存行疑似 → 逐个「完全重复」→ 无可导入行；再验一条「不重复」成功导入 + 一条「更新单子」更新旧单（内容替换 + 置顶）；完整闭环截图/记录——**待用户**（需 `wrangler deploy` 部署新 BFF 后人工验证，步骤见下）
- [x] SPEC-003 状态改「已实现」；decisions/009/010 落盘并更新 `_INDEX.md`；AGENTS.md 活跃 Spec 补 SPEC-003 引用——证据：spec.md 头部 v0.2.0「已实现」；`decisions/009-import-dedup-alignment.md`、`decisions/010-import-dedup-reimport.md`；`decisions/_INDEX.md`；AGENTS.md 活跃 Spec 补 SPEC-003

## 7. v0.2.0 增量验收（M-DEDUP-4）

- [x] 契约：openapi v0.7.0——commit 请求 `updates: [{id, values}]`、`GigImportCommit` 增 `updated`/`failed.kind`（insert/update 缺省 insert）；`drift_lite` ok=true——证据：`specs/openapi.yaml` + drift_lite 实测
- [x] BFF 更新通道：TC-DEDUP-015 updates 校验失败 → failed（kind=update、details 指向字段）；目标旧单不存在 → failed（kind=update、code=GIG_NOT_FOUND）；rows/updates 全空 → 422——证据：`import-route.test.ts`「TC-DEDUP-015」
- [x] PT-DEDUP-04：created+updated+failed 覆盖全部提交元素（无静默丢弃），failed 不写入——证据：`import-route.test.ts`「PT-DEDUP-04」
- [x] PT-DEDUP-05：更新合并性质——null 字段保持旧值、非 null 覆盖、id/status/published_by 不变、created_at 刷新——证据：`import-route.test.ts`「PT-DEDUP-05」
- [x] 前端三按钮 + 分流：reimport 行自动勾选、行标「重复-更新旧单」、提交 payload `{ rows: [...], updates: [{id, values}] }`；确认前「导入选中」禁用——证据：`admin-import-dedup.test.tsx`「TC-DEDUP-013/PT-DEDUP-03」
- [x] `npm run typecheck`/`npm run test`/`npm run build` 绿；`SERVICE_ROLE_KEY` 零匹配——证据：typecheck 0 错、vitest 全绿、build 成功、grep 0

### 真实语料冒烟操作步骤（供用户执行）

1. 部署新 BFF：仓库根 `npx wrangler deploy`（或按既有部署流程），确认 preview 端点已带 suspect。
2. 登录管理员账号（对外发单小助手号 `3435718204@qq.com`，wxid=Lin130219042207Sen），进入 `/admin/import`。
3. 粘贴 `你好.txt` 原文 → 点「解析」→ 断言全部幸存行显示黄色「疑似重复」徽标并逐个弹窗。
4. 逐个点「完全重复」→ 全部裁决后「导入选中」无勾选行。
5. 再解析一次 → 任选一条点「不重复」→ 确认自动勾选 → 「导入选中」提交 → 提示已创建 1 条（验证误判放行闭环）。
6. 再解析一次 → 对某条已存在单子点「更新单子」→ 提交 → 提示已更新 1 条；到管理列表核对：该旧单内容已替换为新内容、created_at 刷新置顶、status 仍 open（验证更新旧单闭环）。
