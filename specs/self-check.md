# Spec 落地前自检（15+2） - SPEC-001

> 执行时间: 2026-08-29（v0.1.0 首检 + v0.2.0 修订后重检，全量 17 题）
> 执行人: agent（ZCode）
> 范围: specs/spec.md + openapi.yaml + gig/site_config/profile.schema.json + tasks.md + checklist.md

## 6.1 严格对齐（5 题）

- [x] Q1 字段名: ✅ gigs 16 列在 spec §4.1 映射表、openapi `Gig`、`gig.schema.json` 三处逐字一致（id/title/subject/grade_level/mode/region/student_gender/student_info/rate/schedule/requirements/contact_wxid/status/published_by/created_at/updated_at）；site_config、profiles 同法核对；`grep -c student_gender` 三文件均命中。
- [x] Q2 函数签名: ✅ validateGigInput / validateGigPatch / validateSiteConfigPatch / assertTransition 签名钉死在 spec §5.3，返回类型 `{ok:true,value}|{ok:false,details}` 与 tasks T-M2-3 引用一致。
- [x] Q3 枚举值: ✅ GigStatus(open,matched,closed)、LessonMode(online,offline)、GradeLevel(primary,junior,senior,college)、StudentGender(male,female,unknown)、ProfileRole(admin,free) 在 §1 术语表、openapi schemas、schema.json 中成员与顺序逐字一致。
- [x] Q4 测试用例 ID: ✅ 覆盖矩阵（§7）与 checklist.md、tasks.md（T-M2-5、T-M3-4、T-M5-1）中 TC-VIEW-001..006、TC-ADMIN-001..006、CT-ADMIN-001、CT-GIG-001/002、PT-GIG-01..04 编号逐字一致；TC-ADMIN-002/003 描述已随 v0.2.0 同步。
- [x] Q5 默认值/校验器/错误码: ✅ 默认值（status=open、page=1、pageSize=20、role=free、site_config id=1、student_gender=unknown）钉在 §4/§3/§5.2；校验器规则 §5.3；错误码 8 条字典 §6 与 openapi examples 一致。

## 6.2 细节遗漏（5 题）

- [x] Q6 10 段结构: ✅ §0 元数据、§1 术语表、§2 Gherkin、§3 API、§4 数据模型、§5 业务规则+Properties 附、§6 错误处理、§7 覆盖矩阵、§8 非功能、§9 假设约束变更日志，无空段。
- [x] Q7 每段示例: ✅ §0 五条门禁命令；§1 表格示例列（含 Region/StudentGender/StudentInfo 行）；§2 完整 Gherkin（发布成功示例含 region/student_gender/student_info）；§3 契约要点表 + openapi 全端点 example（已更新）；§4 三张映射表 + 3 个 schema；§5 状态机 YAML + §5.2 必填性清单 + 签名块；§6 字典含 429 头细节；§7 矩阵行；§8 每行带验证方法；§9 含提权 SQL 语句。
- [x] Q8 CI 门禁可执行: ✅ `npm run typecheck` / `npm run test` / `npm run build` / `grep -rn "SERVICE_ROLE_KEY" src/` / `powershell -NoProfile -File tools/path_align_hooks/drift_lite.ps1`，前四者 M0 脚手架落地后即可复制执行（scripts 名已在 T-M0-3 钉死），grep 与 drift_lite 当前即可执行。
- [x] Q9 假设约束: ✅ §9 假设 4 条（Supabase/Cloudflare/二维码素材/目标浏览器）、约束 8 条（前缀、技术栈、鉴权形态、提权方式、密钥、设计令牌来源、v1 边界、只读仓库）。
- [x] Q10 变更日志: ✅ §9 表格含 v0.1.0 与 v0.2.0 两行，日期/版本/摘要齐全，关联 Commit 显式标注仓库尚无提交。

## 6.3 自由发挥空间（5 题）

- [x] Q11 黑名单模糊词: ✅ `grep -n "待定\|TODO\|TBD\|可酌情\|视情况\|按需\|暂定\|后续补\|后续再定\|类似\|参考\|大概\|通常\|等等\|诸如此类\|简化\|最小版\|简单实现"` 对 specs/ 全部文件零命中（v0.2.0 后复扫，exit 1）。
- [x] Q12 Optional 触发条件: ✅ §5.2 钉死三类：必填字段清单（含 region、student_info）、student_gender 缺省规则（缺省或显式 null → unknown）、可空字段（rate/schedule/contact_wxid/notice）NULL 触发条件与 notice `""→null` 规范化；PATCH 合并后整体校验规则单列。
- [x] Q13 非功能需求验证方法: ✅ §8 表 8 行均有可执行验证方法（curl P95 计时、Lighthouse 实测、grep、CT 用例、真机清单）。
- [x] Q14 类比精确约束: ✅ 无「类比 X / 参考 X」表述；设计令牌约束为「从素材库 extracted-components/theme/ 逐字移植 + 禁止自创色值」；旧「决策表」表述已随 §5.2 重写移除，残留扫描通过。
- [x] Q15 实施必需动作声明: ✅ JWT 注入规则钉在 §3 要点末条；日期序列化 ISO date-time；二维码上传目标 bucket（site-assets）钉在 §9 假设与 tasks T-M4-4；性别徽标展示规则钉在 tasks T-M3-2/T-M3-3（仅 male/female 显示）。

## 6.4 Properties（2 题）

- [x] Q16 关键行为有 P-*: ✅ 写入（POST/PATCH）、状态迁移、权限冲突、联系回退四类关键行为分别有 P-GIG-01..04，量化式均为可判定 ∀ 公式；v0.2.0 字段变更不影响四条性质的适用性；无 N/A 项。
- [x] Q17 回链与 PT 行: ✅ 四条性质回链 Gherkin/状态机/错误码表；矩阵含 PT-GIG-01..04 行且未自动化项均带里程碑期限；Correctness 变更门写在 §5 部分附末段（本次 gigs 表修订属「写 P-*」，已重检）。

## 结论

- 总计 ✅: 17/17
- 总计 ❌: 0/17
- 进入实施阶段: 是 —— 2026-08-29 用户批准 v0.2.0（decisions/002），实施已启动。

## v0.2.1 复检（2026-08-29，M2 实施回补后）

- 回补内容：§3 要点新增 subject 通配符（* / %）→ 422 规则；§7 矩阵按 BFF 测试落地更新自动化状态（10 条转「已自动化」）。
- 复检范围：黑名单词复扫零命中；Q4 用例 ID 与 bff/tests 两文件逐字一致；Q11/Q12/Q15 证据未受影响。
- 结果：17/17 维持 ✅，spec v0.2.1 与实现一致。
