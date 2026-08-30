# CS_tutoring · 家教平台 — Agent 工作区宪法

> 由 bootstrap-agent-workspace（敏捷迭代套餐）初始化于 2026-08-29。

## 目录

- [项目定位](#项目定位)
- [当前入口](#当前入口)
- [真实验证命令](#真实验证命令)
- [协作原则](#协作原则)
- [红线](#红线)
- [踩坑教训](#踩坑教训)
- [Spec 工具（可选）](#spec-工具可选)
- [P1 / P2 索引](#p1--p2-索引)
- [文档职责](#文档职责)
- [Agent 工具适配](#agent-工具适配)
- [AGENTS.md 变更日志](#agentsmd-变更日志)

## 项目定位

面向大学生的家教接单平台：管理员发布家教单，大学生免登录浏览、通过微信联系管理员接单。后端沿用 CourseCore 的架构模式（Supabase + Hono BFF + Cloudflare Pages），前端为 React 移动端优先 H5。

- **Scope（v1）**：单子列表/详情/筛选、联系管理员（微信二维码 + 复制 wxid）、管理员发布后台（/admin）、BFF API、独立新建的 Supabase 项目。
- **Non-goals（v1）**：学生账号体系、报名/申请记录、在线聊天、在线支付、微信 JS-SDK 自定义分享、企业微信客服（v2 预留）。
- **协作语言**：中文。
- **协作模式**：单人。
- **审美基准**（2026-08-29 换皮，决策 005）：蔚蓝档案 BA「arona 官方亮蓝」（`#2773e1` 骨架蓝、白亮表面、中性深灰文字、强调黄 `#ffe433`、斜切 -10°、圆角三档 8/6/4、硬投影 + 按压回弹），**不是** CourseCore 的黑白墨绿，也不是已弃用的 grad 工业暗黑风。素材与规范见 P1 索引。

## 当前入口

| 入口 | 用途 |
|---|---|
| `调研报告.md` | 需求背景、架构结论、字段/路由草案、已确认决策 |
| `BACKLOG.md` | 排期看板：只放未完成事项 |
| `decisions/_INDEX.md` | 决策索引（P2：先按关键词定位，再读单文件） |
| `specs/` | 待创建：根级三件套 spec.md + tasks.md + checklist.md |
| 审美素材库（外部，只读） | `D:\KB\项目案例\01-软件系统\前端组件\BA\`：根 `tokens.css` 是令牌唯一源，`demo2/DESIGN.md` 是工具类产品实战层（组件组合 + 校验清单）；根 `DESIGN.md` 是体系层 |

活跃 Spec：SPEC-001（`specs/spec.md`，状态「已批准」v0.2.0；三件套 + openapi.yaml + 3 个实体 schema + self-check 均在 `specs/`，实施按 `specs/tasks.md` 里程碑推进）；SPEC-002 模块级补充（`specs/gig-import/`，状态「已实现」v0.1.3，管理员批量导入/自动生成家教单，实施按 `specs/gig-import/tasks.md`，对齐稿 decisions/008；真机冒烟/375px 人工门待用户，见 checklist §4/§6）。

## 真实验证命令

> 业务行为契约见 `specs/spec.md`；以下命令从仓库根执行（2026-08-29 M0 脚手架落地后回填）。

```bash
npm run typecheck   # tsc --noEmit，必须通过
npm run test        # vitest run，必须通过
npm run build       # vite build，必须通过
npm run dev         # 本地开发（Vite）
npm run build:bff   # esbuild 打包 Pages Function（产物 functions/api/[[route]].js）
```

```bash
# BFF（Hono，目录 bff/）
cd bff && npm run typecheck   # BFF tsc --noEmit
cd bff && npm run test        # BFF Vitest（31 用例：validators + gigs 路由）
cd bff && npm run dev         # 独立 Worker 开发（需 bff/.dev.vars）
```

```powershell
# 前端 service_role 泄露门禁（必须零匹配）
grep -rn "SERVICE_ROLE_KEY" src/
# path-align 手动检查（L0 路径成对）
powershell -NoProfile -File tools/path_align_hooks/drift_lite.ps1
```

## 协作原则

- 不猜多问、先对齐后行动、最小改动。
- 文档先于代码：业务代码/接口/数据模型变更前，先改 Spec/文档并经用户确认；Spec 是唯一事实源。
- 专用工具优先于终端命令；终端仅用于 Git、依赖、构建和测试。
- Bug 先报告、确认后修复。
- 每次会话从本文件获取当前入口；P1 按任务命中读取，P2 先读 `decisions/_INDEX.md` 按关键词定位，不整目录预读。
- 路径成对（L0）：契约侧（specs/、schema、API 契约）与实现侧（src/、bff/）的改动应同轮成对出现，由轮末钩子或手动 drift_lite 检查。

## 红线

- Git：未经明确要求不 commit/push；禁止 force push、硬重置、清理或覆盖已有改动。
- 依赖：先核对 package.json；未经确认不新增、升级或全局安装依赖。
- 删除：删文件、迁移脚本、破坏性数据操作必须先确认并说明影响。
- 临时文件：统一 `temp_*` 前缀，用后即删；不提交缓存、日志、密钥。
- `SUPABASE_SERVICE_ROLE_KEY` 只进 BFF 服务端（Cloudflare Secrets / `.dev.vars`），不进 `VITE_*`、前端 bundle 或仓库。
- CourseCore 仓库（`C:\Users\vitoriga\OneDrive\Desktop\CourseCore`）只读参考，禁止任何改动。
- 审美素材库（BA 蔚蓝档案，`D:\KB\项目案例\01-软件系统\前端组件\BA\`）只读；取令牌以根 `tokens.css` 为唯一源，组件组合参照 `demo2/DESIGN.md` 校验清单（尺寸用 `calc(N*var(--ba-u))`、换色只改 token、斜切容器内容回正、`z-index:-1` 父级 `isolation:isolate`）。
- 管理员鉴权必须在 BFF 服务端查 `profiles.role`（教训 L-001），不得依赖 Supabase Auth 自带 role 字段。

## 踩坑教训

<!-- 格式：L-NNN 一句话：错误做法 → 正确做法；只追加，不重排。 -->

- L-001 CourseCore 的 BFF `requireRole` 检查 auth.users.role（默认 `authenticated`）而非 profiles.role，服务端拦不住普通用户 → 本项目 admin 接口一律在服务端查 `profiles.role` 后放行。

## Spec 工具（可选）

| 工具 | 启用 | 探测路径 | 用法 Skill |
|---|---|---|---|
| path-align | yes | `tools/path_align_hooks/drift_lite.ps1` | bootstrap `path-align-hooks` |
| verify-matrix | no | `specs/verification/matrix.yaml` | spec-writing `tools/verify-matrix.md` |
| drift-inventory | no | `specs/drift/drift_inventory.py` | spec-writing `tools/drift-inventory.md` |

## P1 / P2 索引

| 级别 | 路径 | 读取条件 |
|---|---|---|
| P1 | `调研报告.md` | 需要需求/架构/字段草案背景时 |
| P1 | `BACKLOG.md` | 排期与待办 |
| P1 | `specs/`（按需创建） | 任务命中对应模块/功能时读对应节点三件套，不整树预读；层级约定：小项目只建根级三件套，展开模块级需新决策。已建模块级：`specs/gig-import/`（SPEC-002 批量导入，已实现 v0.1.3） |
| P1 | 审美素材库（外部路径，见当前入口） | 实现任何 UI 时读根 `tokens.css` 令牌 + `demo2/DESIGN.md` 组件组合与校验清单 |
| P2 | `decisions/_INDEX.md` | 追溯决策时按关键词定位 |

## 文档职责

- `AGENTS.md`（本文件）：P0 唯一常驻事实源，只放稳定原则、红线、教训与入口；不放历史、详细架构、命令大全。
- `decisions/`：P2 决策目录，一决策一文件，闭环事实唯一来源。
- `BACKLOG.md`：只放未完成事项；待办进、完成出，闭环进 decisions/。
- `调研报告.md`：P1 背景文档（需求与调研结论），被 Spec 取代后归档。
- `specs/`：按需创建的三件套，业务行为的实施许可。

## Agent 工具适配

| 工具 | 自动加载入口 | 状态 | 来源 | 最后确认 |
|---|---|---|---|---|
| ZCode | `AGENTS.md`（原生加载） | 已确认 | 运行时证据（会话系统上下文） | 2026-08-29 |

## AGENTS.md 变更日志

- 2026-08-29 初始化：敏捷迭代套餐（核心文档 + 排期 + path-align）；ZCode Stop 钩子接线至 `tools/path_align_hooks/turn_align_zcode.ps1`（适配脚本见该目录）。
