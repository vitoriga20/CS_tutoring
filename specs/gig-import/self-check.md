# Spec 落地前自检（17+2） - SPEC-002 批量导入

> 执行时间: 2026-08-30（v0.1.1 实施前回补后执行）
> 执行人: agent（ZCode）
> 范围: specs/gig-import/spec.md（v0.1.1）+ tasks.md + checklist.md；沿用 SPEC-001 `specs/self-check.md` 17 题框架，另加 Q18/Q19 两题（导入必填集一致性、解析规则示例可执行）。

## 6.1 严格对齐（5 题）

- [x] Q1 字段名: ✅ GigImportDraft 13 字段与 SPEC-001 `GigCreate`/`gig.schema.json`/openapi `Gig` 逐字一致（title/subject/grade_level/mode/region/district/student_gender/student_info/rate/schedule/requirements/contact_wxid/hourly_rate）；FieldIssue 形状 `{field, reason}` 与 SPEC-001 §5.3、错误响应 `details`、前端 `src/services/api.ts` 一致。
- [x] Q2 函数签名: ✅ importParser 五函数签名（segmentText / parseGigBlock / markDuplicates / collectIssues / parseImport）与 spec §4.1 逐字一致；导入端点经 `requireAdmin`（adminAuth.ts）。
- [x] Q3 枚举值: ✅ 本规范不重新定义枚举；grade_level/mode/district/student_gender 成员与顺序引用 SPEC-001 §1（types.ts）。
- [x] Q4 测试用例 ID: ✅ 覆盖矩阵（§7）TC-IMPORT-001..008、CT-IMPORT-001、PT-IMPORT-01..04 与 checklist.md、tasks.md 编号逐字一致；无与 SPEC-001 用例 ID 冲突。
- [x] Q5 默认值/校验器/错误码: ✅ 默认值（mode=offline、district=other、student_gender=unknown、contact_wxid=null、status=open、published_by=当前 admin）与 SPEC-001 §5.2 一致；提交校验直接复用 `validateGigInput`（SPEC-001 §5.3，无第二条规则）；错误码复用 §6 字典（UNAUTHENTICATED/FORBIDDEN/VALIDATION_ERROR/INTERNAL），不新增。

## 6.2 细节遗漏（5 题）

- [x] Q6 10 段结构: ✅ §0..§9 全；§5 含 Properties 附。
- [x] Q7 每段示例: ✅ §1 术语表带示例；§2 Gherkin 7 场景；§3 两端点响应形状；§5.1 每行带示例（v0.1.1 补 subject/hourly_rate 示例）；§8 每行带验证方法。
- [x] Q8 CI 门禁可执行: ✅ §0 五条命令均与仓库脚本一致（bff typecheck/test；前端 typecheck/test/build；grep SERVICE_ROLE_KEY；drift_lite）。
- [x] Q9 假设约束: ✅ §9 假设 3 条、约束 7 条（含 v1 边界：不做 LLM/CSV/全自动/微信提取）。
- [x] Q10 变更日志: ✅ 含 v0.1.0 与 v0.1.1 两行，v0.1.1 注明回补内容与理由。

## 6.3 自由发挥空间（5 题）

- [x] Q11 黑名单模糊词: ✅ `grep -n "待定\|TODO\|TBD\|可酌情\|视情况\|按需\|暂定\|后续补\|后续再定\|类似\|参考\|大概\|通常\|等等\|诸如此类\|简化\|最小版\|简单实现"` 对 specs/gig-import/ 零命中。
- [x] Q12 Optional 触发条件: ✅ §5.2 钉死必填集合（6 项，含 requirements）与永不 issue 集合（4 项 + 4 可空字段）；归一化截断/钳制失败视为缺失。
- [x] Q13 非功能需求验证方法: ✅ §8 每行带验证方法（TC-IMPORT-008 统计、计时、grep、CT、375px 人工门）。
- [x] Q14 类比精确约束: ✅ 无「类比 X / 参考 X」表述；区县手工映射表标注「复用 0003 已核实 8 条，禁止重复核实」。
- [x] Q15 实施必需动作声明: ✅ 提交端点逐元素重校验（不信任前端）声明于 §3.2；解析引擎仅服务端运行声明于 §4.1；`你好.txt` 复制为 fixture 声明于 §9。

## 6.4 Properties（2 题）

- [x] Q16 关键行为有 P-*: ✅ 去重（P-IMPORT-01）、标红（P-IMPORT-02）、提交覆盖（P-IMPORT-03）、鉴权（P-IMPORT-04）四条，量化式均为可判定 ∀ 公式。
- [x] Q17 回链与 PT 行: ✅ 四条性质回链 §5.1/§5.2/§3.2/SPEC-001 §5.4 与 Gherkin 场景；矩阵含 PT-IMPORT-01..04 行且均带里程碑期限（M-IMPORT-0/M-IMPORT-1）；Correctness 变更门写在 §5 附末段（importParser.ts 与 routes/import.ts 进入 dirty diff 时必跑）。

## 6.5 SPEC-002 专属（2 题）

- [x] Q18 导入必填集与 SPEC-001 一致性: ✅ §5.2 必填集合（title/subject/grade_level/region/student_info/requirements）为 SPEC-001 §5.2 必填 8 项中「解析器可产生缺失」的子集（mode/district 由解析器默认兜底恒有值）；`requirements` 与 validator/GigForm/DB 非空 CHECK 三层一致——预览 ok 的行必能通过 `validateGigInput` 提交，无「预览 ok 提交必失败」契约破口（P-IMPORT-02 ⇔ 提交通过）。
- [x] Q19 解析规则示例可执行: ✅ §5.1 每个映射行示例均可由 §5.1 文本规则推导（含 v0.1.1 修订的 subject 分词算法与 hourly_rate「左右」）；TC-IMPORT-007 覆盖全部示例；TC-IMPORT-008 用 `你好.txt` 实测可解析率，首版目标 ≥80%。

## 结论

- 总计 ✅: 19/19
- 总计 ❌: 0/19
- 进入实施阶段: 是 —— 用户批准执行 SPEC-002（v0.1.1）。
