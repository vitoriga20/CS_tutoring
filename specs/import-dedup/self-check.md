# Spec 落地前自检（17+2） - SPEC-003 导入疑似重复确认

> 执行时间: 2026-08-30（v0.1.0 首检 + v0.1.1 一致性回补后复检）
> 执行人: agent（ZCode）
> 范围: specs/import-dedup/spec.md（v0.1.1）+ tasks.md + checklist.md；沿用 SPEC-001 `specs/self-check.md` 17 题框架，另加 Q18/Q19 两题（信号池可判定性、裁决状态机完整性，参照 SPEC-002 扩题方式）。

## 6.1 严格对齐（5 题）

- [x] Q1 字段名: ✅ `GigImportRow` 既有字段与 SPEC-002 §3.1 逐字一致（index/draft/issues/duplicate/status），追加 `suspect`（可空）；`ImportSuspect` 字段（gig/score/hard/matched）与 §3.1 YAML、`specs/openapi.yaml` `ImportSuspect` schema、`src/services/types.ts` 逐字一致；信号名 enum（grade_level/subject/district/hourly_rate/student_gender/region）与 §5.1 信号池一致。
- [x] Q2 函数签名: ✅ `extractTitleNo(title: string | null): string | null`、`matchSuspects(rows: GigImportRow[], openGigs: Gig[]): GigImportRow[]` 与 §4.1 逐字一致；`db.listOpenGigsForDedup(env)` 与 §4.1 一致；preview 管线 `parseImport → matchSuspects` 与 §3.2 一致。
- [x] Q3 枚举值: ✅ 本规范不重新定义枚举；grade_level/mode/district/student_gender/status 成员与顺序引用 SPEC-001 §1（types.ts）；信号名 enum 为本规范新成员，三处（§3.1/§5.1/openapi）一致。
- [x] Q4 测试用例 ID: ✅ 覆盖矩阵（§7）TC-DEDUP-001..012、CT-DEDUP-001、PT-DEDUP-01..04 与 checklist.md、tasks.md 编号逐字一致；与 SPEC-001/002 用例 ID 无冲突。
- [x] Q5 默认值/校验器/错误码: ✅ 错误码零新增（复用 SPEC-001 §6：UNAUTHENTICATED/FORBIDDEN/VALIDATION_ERROR/INTERNAL）；preview 422 语义与 SPEC-002 一致；commit 契约零变更（裁决不回传）；`suspect` 缺省 null 与 §3.1 `type: [object,'null']` 一致。

## 6.2 细节遗漏（5 题）

- [x] Q6 10 段结构: ✅ §0..§9 全；§5 含 Properties 附。
- [x] Q7 每段示例: ✅ §1 术语表带示例（ImportSuspect 示例含 score=5/matched 五项）；§2 Gherkin 10 场景；§3.1 契约 YAML；§5.1 信号池表每行带「命中定义」与「缺失/兜底处理」；§5.2 状态机图；§8 每行带验证方法。
- [x] Q8 CI 门禁可执行: ✅ §0 五条命令均与仓库脚本一致（bff typecheck/test；前端 typecheck/test/build；grep SERVICE_ROLE_KEY；drift_lite）；实施后全部实测通过。
- [x] Q9 假设约束: ✅ §9 假设 4 条（重发常变编号/±10 与集合相等基线/量级 <5000/阈值偏召回）、约束 5 条（零数据层变更/匹配器仅服务端/向后兼容追加/令牌来源/裁决不持久化）。
- [x] Q10 变更日志: ✅ 含 v0.1.0 与 v0.1.1 两行，v0.1.1 注明一致性回补内容与理由（Gherkin 场景地址改「岳麓区观沙岭」使 score=5 与 §5.1 信号池自洽）。

## 6.3 自由发挥空间（5 题）

- [x] Q11 黑名单模糊词: ✅ `grep -n "待定\|TODO\|TBD\|可酌情\|视情况\|按需\|暂定\|后续补\|后续再定\|类似\|参考\|大概\|通常\|等等\|诸如此类\|简化\|最小版\|简单实现"` 对 **spec.md / tasks.md / checklist.md** 零命中（self-check.md 自身 Q11/Q14 行引用了模式词，属自引用不计入）。
- [x] Q12 Optional 触发条件: ✅ 逐信号钉死缺失/兜底处理（任一侧 null 不命中；district other/other 不命中；gender unknown/unknown 不命中；时薪 null 不命中；地址归一后空串不命中）；硬信号双方无编号不生效；阈值 4 与信号定义为基线，调整须走决策。
- [x] Q13 非功能需求验证方法: ✅ §8 每行带验证方法（200×5000 fixture 计时、量级记录、grep、注入异常 smoke + 代码走查、375px 人工门）。
- [x] Q14 类比精确约束: ✅ 无「类比 X / 参考 X」表述；「重复行」定义与 SPEC-002 P-IMPORT-01 逐字一致不重新定义；设计令牌约束「复用 ba-tokens.css 既有强调黄 token，禁任意 hex」。
- [x] Q15 实施必需动作声明: ✅ 匹配器仅 BFF 服务端运行（§4.1，前端不内联逻辑）；库查询失败 500 不静默降级（§3.2/§6）；`GigImportRow` 向后兼容追加（§3.1）；阈值调优走决策后升版本（§5.1）。

## 6.4 Properties（2 题）

- [x] Q16 关键行为有 P-*: ✅ P-DEDUP-01（候选阈值/指向）、P-DEDUP-02（只比 open）、P-DEDUP-03（裁决状态机）、P-DEDUP-04（提交契约不变，复用 P-IMPORT-03）四条性质，量化式均为可判定 ∀ 公式。
- [x] Q17 回链与 PT 行: ✅ 四条性质回链 §5.1/§3.2/§5.2/§3.3；矩阵含 PT-DEDUP-01..04 行；Correctness 变更门写在 §5 部分附末段（dedupMatcher.ts 与 import.ts 进 dirty diff 时跑 PT-DEDUP-01..04）。

## 6.5 模块级扩展（2 题，参照 SPEC-002）

- [x] Q18 信号池可判定性: ✅ 六项信号「命中定义」均为可判定二元谓词（enum 相同/集合相等/±10/归一相等互包含），无模糊表述；匹配器实现与 §5.1 逐字对应，TC-DEDUP-010 逐项单测 + PT-DEDUP-01 300 轮属性复算。
- [x] Q19 裁决状态机完整性: ✅ §5.2 覆盖全迁移（pending→confirmed/dismissed、confirmed↔dismissed 改判、非疑似行不进入）；「裁决不持久化」「不影响 issues/status」显式声明；前端 PT-DEDUP-03 三组序列属性测试验证「勾选 ⇔ dismissed」「存在 pending ⇔ 导入禁用」。

## 结论

- 总计 ✅: 19/19
- 总计 ❌: 0/19
- 进入实施阶段: 是 —— 2026-08-30 用户指示执行 SPEC-003（三件套已建），实施完成 M-DEDUP-0..3，自动化验收全绿（BFF 188 用例、前端 43 用例），见 checklist.md。

## v0.1.1 复检（2026-08-30，实施中回补后）

- 回补内容：Gherkin「宽松匹配标记疑似重复」场景行地址改为「岳麓区观沙岭」（同区不同址、区县仍 yuelu），使 score=5 与 §5.1 信号池自洽（原稿双方地址相同按信号池应命中 6/6）；§9 变更日志补 v0.1.1 行。
- 复检范围：Q1/Q4/Q10/Q11/Q18 证据未受影响；实现侧（匹配器/路由/前端）与回补后场景一致（TC-DEDUP-001 断言 matched 五项、不含 region）。
- 结果：19/19 维持 ✅，spec v0.1.1 与实现一致。

## v0.2.0 复检（2026-08-30，用户验收新增「重复导入」第三裁决）

- 回补内容：① 裁决状态机四态（pending/confirmed/dismissed/**reimport**），「重复导入」= 不插入新单、更新旧单内容（created_at 刷新置顶、null 不覆盖旧值、id/status/published_by 不变）；② commit 契约扩展（请求 `updates`、响应 `updated`/`failed.kind`）；③ Gherkin 增「重复导入更新旧单」「更新不覆盖旧值」「提交契约扩展」三场景；④ Properties 增 P-DEDUP-04（提交分流全覆盖）、P-DEDUP-05（更新合并性质）；⑤ 对齐过程中用户取消「前后浏览/末尾确认」（行内查看对比已可撤销），交互维持 v0.1.1。
- 复检范围：Q1（契约字段三处一致）、Q2（commit 处理 updates）、Q4（TC-DEDUP-013/014/015、PT-DEDUP-04/05 编号一致）、Q10（变更日志 v0.2.0 行）、Q11（spec 三件套黑名单词零命中）、Q18/Q19（更新合并可判定、四态状态机完整）均复核通过。
- 结果：19/19 维持 ✅，spec v0.2.0 与实现一致（对齐结论全文见 decisions/010）。
