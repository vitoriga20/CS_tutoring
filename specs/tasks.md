# SPEC-001 实施任务清单

> 里程碑顺序执行；`[P]` 标记表示该里程碑/任务可并行推进。每项验收引用 `spec.md` 第 7 部分覆盖矩阵的用例 ID 与 `checklist.md` 分节。实施阶段发现 spec 缺约束时：暂停 → 回补 spec → 重跑 17 题自检 → 再继续（零自由发挥铁律）。

## M0 前端脚手架（无依赖）

- [x] T-M0-1 Vite + React 19 + TypeScript 初始化；目录 `src/{pages,components,services,lib,styles}`；Tailwind CSS v4 接入（`@tailwindcss/vite`）。
- [x] T-M0-2 react-router v7 路由骨架：`/`、`/gigs/:id`、`/admin`、`/admin/gigs/new`、`/admin/gigs/:id/edit`、`/admin/settings`、`*`（404）；接入 TanStack Query v5、lucide-react、supabase-js。
- [x] T-M0-3 `package.json` scripts 钉死：`dev` / `build`（vite build）/ `preview` / `typecheck`（tsc --noEmit）/ `test`（vitest run）；Vitest 初始化；把五个 CI 门禁命令回填 `AGENTS.md`「真实验证命令」。
- [x] T-M0-4 主题令牌移植：从素材库 `extracted-components/theme/` 提取色板/字体/间距/圆角/阴影到 `src/styles/tokens.css`，base 样式同批移植（带来源注释头）。（注：AppBackground 为 Vue 组件，移至 T-M3-1 布局壳时随底座移植；本任务交付 tokens.css + base + Tailwind @theme 映射）

验收：`npm run typecheck`、`npm run build` 绿；`drift_lite` 输出 `ok=true`。

## M1 Supabase 数据层 `[P]`（可与 M0 并行）

- [x] T-M1-1 `supabase/migrations/0001_init.sql`：gigs / site_config / profiles 三表（列、CHECK、表级约束按 spec §4）+ RLS 策略（spec §4.4）+ `on_auth_user_created` 触发器 + site_config 种子行（id=1）。
- [ ] T-M1-2 新建 Supabase 项目 → 执行迁移（可重复执行幂等）→ 注册管理员账号 → SQL 提权 `update profiles set role='admin'` → Storage 公开 bucket `site-assets` 并上传微信二维码。
- [ ] T-M1-3 Cloudflare：创建 Pages 项目与 KV 命名空间（RATE_LIMIT_KV）；注入 Secrets（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，进 Secrets 不进 VITE_*）。

验收：用 anon key 直连 Supabase 尝试 INSERT gigs 被拒绝；SELECT 正常。

## M2 BFF 契约实现（依赖 M1）

- [x] T-M2-1 搬运 CourseCore `bff/src/` 骨架：`app.ts`、`env.ts`、`middleware/{security,cache,rateLimit}.ts`、`lib/supabase.ts`、`pages-entry.ts`、`scripts/build-bff.js`、`wrangler.toml`（name 改为 CS_tutoring 项目名）。
- [x] T-M2-2 `bff/src/middleware/adminAuth.ts`：`assertAdmin()` = 骨架 `verifyAuth` → service_role 查 `profiles.role` → 放行/403（教训 L-001）。
- [x] T-M2-3 `bff/src/lib/validators.ts`：`validateGigInput` / `validateGigPatch` / `validateSiteConfigPatch` / `assertTransition`，签名与规则逐字按 spec §5.3。
- [x] T-M2-4 `bff/src/routes/gigs.ts`（列表筛选分页 / 详情 / POST / PATCH / DELETE）+ `bff/src/routes/site_config.ts`（GET / PATCH），注册进 `app.ts`；错误码与响应外壳逐字按 spec §3/§6。
- [x] T-M2-5 `tests/` 编写：CT-GIG-001、CT-ADMIN-001、TC-VIEW-001/002/006、TC-ADMIN-001..006、PT-GIG-01/02/03（Vitest；用例 ID 与覆盖矩阵逐字一致）。

验收：`healthz` 200；写端点匿名 401、free 403、admin 201/200/204；422 details、404 GIG_NOT_FOUND、GIG_INVALID_TRANSITION、429 均按字典返回；M2 相关用例转「已自动化」。

## M3 学生端页面（依赖 M0 令牌与 M2 API）

- [ ] T-M3-1 布局壳：底部 3 Tab（单子 `/`、联系=打开联系弹层、管理 `/admin`）；AppBackground；`viewport-fit=cover` + `env(safe-area-inset-*)` + `100dvh`。
- [ ] T-M3-2 首页列表：筛选栏（grade_level 下拉、mode 下拉、subject 文本输入）、单子卡片流（卡片含区域、性别徽标仅 male/female 时显示、报酬与时段）、分页（上一页/下一页 + 页码，pageSize=20）、骨架屏（6 卡）、空态文案「暂时没有新单子，过几天再来看看」、错误态 + 重试按钮。
- [ ] T-M3-3 详情页 `/gigs/:id`：全字段展示（学员情况独立分块，含性别徽标）、状态徽标（matched/closed 时联系按钮禁用）、id 不存在时 404 文案。
- [ ] T-M3-4 `ContactModal` 组件：二维码 + wxid 复制按钮 + notice 文案 + fallback 规则（P-GIG-04）；`PT-GIG-04` 组件测试。

验收：TC-VIEW-003/004/005 通过；375px 视口无横向滚动；键盘可达。

## M4 管理端页面（依赖 M0 与 M2）

- [ ] T-M4-1 `/admin` 登录门：未登录显示邮箱+密码登录表单（supabase-js `signInWithPassword`）；非 admin 显示无权限提示；登录态恢复（`onAuthStateChange`）。
- [ ] T-M4-2 单子管理列表：状态 Tab（全部 / open / matched / closed）；状态操作按钮按状态机只渲染合法目标状态；删除需二次确认。
- [ ] T-M4-3 发布/编辑表单（`/admin/gigs/new`、`/admin/gigs/:id/edit`）：字段与校验规则对齐 spec §5.3；服务端 422 details 映射到对应字段错误提示。
- [ ] T-M4-4 `/admin/settings`：wxid / notice 编辑 + 二维码图片上传至 `site-assets` bucket，回写 `qr_image_url`。

验收：TC-ADMIN-004/005 手工回归通过；管理端在 375px 可用（延续全屏后台习惯）。

## M5 验收与上线（依赖 M2..M4 全部完成）

- [ ] T-M5-1 覆盖矩阵全部条目转「已自动化」，或在 `checklist.md` 记录人工验收证据。
- [ ] T-M5-2 NFR 实测：Lighthouse 移动端 Performance ≥ 90 且 Accessibility ≥ 90；`GET /gigs` 20 次请求 P95 < 300ms；`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；CT-GIG-002 线上限流验证。
- [ ] T-M5-3 微信真机回归（iOS + Android）：弹层二维码长按识别、safe-area 无遮挡、`100dvh` 滚动正常、默认分享卡片可用。
- [ ] T-M5-4 `npx wrangler pages deploy dist` + 线上 `healthz` 200 + 线上冒烟（TC-VIEW-001 / TC-VIEW-004）。
- [ ] T-M5-5 收口：BACKLOG 清理（闭环项写 decisions）、AGENTS.md 踩坑教训回填、spec 状态改为「已实现」。
