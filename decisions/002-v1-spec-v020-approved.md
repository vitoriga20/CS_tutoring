# v1 · SPEC-001 v0.2.0 获批与实施启动（2026-08-29）

- 状态：活跃
- 关键词：spec、v0.2.0、已批准、闭环排期#001、 gigs-region、student-info
- 相关模块：工作区、数据层、前端、鉴权

## 摘要

用户于 2026-08-29 批准 SPEC-001 v0.2.0（根级三件套 + openapi.yaml + 3 实体 schema，17 题自检通过），规范状态由「提议」改为「已批准」，进入实施阶段（tasks.md M0 起步）。

**闭环：排期清单 #001**（Spec 三件套用户确认）。

v0.2.0 关键契约（相对调研草案的修订）：gigs.region 无条件必填；新增 student_gender（male/female/unknown，缺省 unknown）与 student_info（必填，1..500 字）；requirements 定位为「对老师的要求」。字段级事实源：`specs/spec.md` §4/§5 与 `specs/openapi.yaml`，后续变更必须走 spec 修订 + 重检，不得在代码侧即兴。
