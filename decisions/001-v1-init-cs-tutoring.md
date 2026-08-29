# v1 · 项目初始化与基线决策（2026-08-29）

- 状态：活跃
- 关键词：bootstrap、敏捷迭代、supabase-独立新建、免登录、终末地审美、requireRole
- 相关模块：工作区、数据层、前端、鉴权

## 摘要

用 Agent-Harness-Skills 的 bootstrap-agent-workspace（敏捷迭代套餐：核心文档 + 排期 + path-align 钩子）初始化工作区。

基线决策（用户 2026-08-29 确认）：

1. **Supabase 新建独立项目**，不与 CourseCore 共用实例。「后端不变」指架构模式不变（Supabase Auth+Postgres / Hono BFF / Cloudflare Pages 同域 /api/v1），复用的是代码骨架而非数据库。
2. **v1 学生免登录**，仅管理员登录发单；匿名只读 open 单子，申请/报名记录留到 v2。
3. **审美弃用 CourseCore 黑白墨绿**，改用终末地-莱因科技-明日方舟「工业科研终端感」（近黑/冷灰底 + 安全黄 + 冰蓝光）；素材库与规范见 AGENTS.md P1 索引。
4. 单子（gig）字段与 BFF 路由按 `调研报告.md` 草案执行，不另行增删。

教训 L-001（CourseCore requireRole 坑，本项目 admin 鉴权必须服务端查 profiles.role）记录于 AGENTS.md 踩坑教训章节。
