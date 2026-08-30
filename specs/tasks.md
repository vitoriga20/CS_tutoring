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

- [x] T-M3-1 布局壳：底部 2 Tab（单子 `/`、管理 `/admin`；2026-08-29 用户调整：移除「联系」Tab，联系入口收敛到单子详情页）；AppBackground；`viewport-fit=cover` + `env(safe-area-inset-*)` + `100dvh`。
- [x] T-M3-2 首页列表：筛选栏（grade_level 下拉、mode 下拉、subject 文本输入）、单子卡片流（卡片含区域、性别徽标仅 male/female 时显示、报酬与时段）、分页（上一页/下一页 + 页码，pageSize=20）、骨架屏（6 卡）、空态文案「暂时没有新单子，过几天再来看看」、错误态 + 重试按钮。
- [x] T-M3-3 详情页 `/gigs/:id`：全字段展示（学员情况独立分块，含性别徽标）、状态徽标（matched/closed 时联系按钮禁用）、id 不存在时 404 文案。
- [x] T-M3-4 `ContactModal` 组件：二维码 + wxid 复制按钮 + notice 文案 + fallback 规则（P-GIG-04）；`PT-GIG-04` 组件测试（tests/contact-target.test.ts，纯函数 oracle）。

验收：TC-VIEW-003/004/005 通过；375px 视口无横向滚动；键盘可达。
（2026-08-29 收口：TC-VIEW-003/004/005 已随 M3 转自动化——tests/view-components.test.tsx，依赖 @testing-library/react + @testing-library/dom + happy-dom（devDeps，用户确认）。）

## M4 管理端页面（依赖 M0 与 M2）

- [x] T-M4-1 `/admin` 登录门：未登录显示邮箱+密码登录表单（supabase-js `signInWithPassword`）；非 admin 显示无权限提示；登录态恢复（`onAuthStateChange`）。
- [x] T-M4-2 单子管理列表：状态 Tab（全部 / open / matched / closed）；状态操作按钮按状态机只渲染合法目标状态；删除需二次确认。
- [x] T-M4-3 发布/编辑表单（`/admin/gigs/new`、`/admin/gigs/:id/edit`）：字段与校验规则对齐 spec §5.3；服务端 422 details 映射到对应字段错误提示。
- [x] T-M4-4 `/admin/settings`：wxid / notice 编辑 + 二维码图片上传至 `site-assets` bucket，回写 `qr_image_url`。

验收：TC-ADMIN-004/005 手工回归通过；管理端在 375px 可用（延续全屏后台习惯）。
（2026-08-29 收口：四个任务落地。实现注记——AdminGate 用嵌套路由包住 /admin 三级页面，会话恢复与 profiles.role 确认跨子路由保持（role 判定只做 UI 分流，写接口权威门禁仍是 BFF assertAdmin）；状态机 UI 侧映射收敛于 `src/services/transitions.ts`（3×3 组合进 tests/admin-components.test.tsx）；删除二次确认用移植的 grad .modal；settings 二维码以时间戳文件名上传后回写 qr_image_url 并尽力清理旧对象。素材移植：.gh-tabs/.gh-tab（grad-github.css）与 .t-actions/.icon-btn（grad-task-list.css，svg 居中与换行为 M4 适配偏差）。前端门禁全绿：typecheck / 21 测试（新增 10 条 admin 组件用例）/ build / SERVICE_ROLE_KEY 零匹配 / drift_lite ok=true。375px 视口与真机回归留 M5 手工门。）

## M6 用户中心与发布者联系（v0.3.0 新增；依赖 M2..M4，可与 M5 剩余项并行）

> 来源：2026-08-29 用户需求（两轮对齐确认）：每账号自己的二维码/微信号 + 登录登出 + 教学方式默认线上。弹层三级回退与「仅 admin」边界经用户拍板。

- [ ] T-M6-1 `supabase/migrations/0002_profile_contact.sql`：profiles 新增 `wxid VARCHAR(40)` / `qr_image_url TEXT`（均可空，幂等）；经 Supabase MCP 执行并核验列结构。
- [ ] T-M6-2 BFF：`validateProfilePatch` + `bff/src/routes/me.ts`（GET/PATCH `/api/v1/me`，assertAdmin 门禁）+ `GET /gigs/:id` 详情 join 发布者 profiles 返回 `publisher_contact`；新增测试 TC-ACCT-001/002、CT-ACCT-001、CT-GIG-003。
- [ ] T-M6-3 前端用户中心 `/admin/account`：当前账号信息 + 退出登录按钮（补登录态登出入口）+ 自己的 wxid 编辑 + 二维码上传（`site-assets` bucket `qr/<uid>/` 路径，上传后 PATCH /me 回写）；AdminPage 加入口按钮；GigForm `contact_wxid` 默认填当前账号 wxid（可改可清空）。
- [ ] T-M6-4 弹层三级回退：ContactModal/ContactContext 接入 GigDetail.publisher_contact，回退链 contact_wxid → 发布者资料 → site_config；PT-GIG-04 扩展为 wxid 三级 + qr 两级 oracle；TC-VIEW-007 组件测试。
- [ ] T-M6-5 存量订正（独立确认项，先获用户明确同意）：`update gigs set mode='online' where mode='offline'`（当前 117 条），执行前后行数核对，闭环写 decisions。

验收：`npm run typecheck`、`npm run test`、`npm run build`、BFF typecheck/test 全绿；drift_lite ok=true；覆盖矩阵 M6 新增条目转「已自动化」。

## M7 标题搜索（v0.5.0 新增；依赖 M2/M3/M4，可与 M6 并行）

> 来源：2026-08-30 用户需求（四点对齐确认）：学生首页与管理列表都提供标题（单号=标题）搜索；仅匹配 title；350ms 防抖即时生效；首页搜索词随 v0.4.1 持久化链路进 sessionStorage（管理侧不持久化，随 /admin 列表现状）。

- [x] T-M7-1 BFF：`bff/src/routes/gigs.ts` 解析 `q`（trim 后空串视为未提供；含 `*`/`%` 返回 422；trim 后超 60 字符返回 422）；`bff/src/lib/db.ts` `listGigs` 加 `title ilike '%q%'` 不区分大小写包含匹配（与其他筛选 AND）；`bff/tests/gigs-route.test.ts` 新增 TC-VIEW-013 路由层用例与 CT-GIG-004 契约用例（命中/大小写/叠加/无结果 total=0/通配符 422/超长 422/空串与纯空格忽略）。
- [x] T-M7-2 学生首页搜索框：`src/pages/HomePage.tsx` 筛选区顶部常驻输入框（placeholder「搜单号 / 标题关键词」）；`StoredFilters` 新增 `q`/`qText` 字段并入 v0.4.1 持久化与恢复校验（复用 `pickText` 截断）；搜索词 350ms 防抖、值确实变化时重置页码（复用科目输入防抖模式）；搜索词不计入「更多筛选」角标计数；搜索激活且无结果时空态文案「没有找到相关单子，换个关键词试试」，清空后恢复默认空态；`tests/view-components.test.tsx` 新增 TC-VIEW-013 组件层与 TC-VIEW-014 / TC-VIEW-015 用例。
- [x] T-M7-3 管理列表搜索框：`src/pages/admin/AdminPage.tsx` 状态 Tab 区加常驻输入框（同一 `q` 参数）；queryKey 与请求参数加 `q`；搜索词变化重置页码；不做 sessionStorage 持久化（离开 /admin 重置）；`tests/admin-components.test.tsx` 新增 TC-ADMIN-007 用例（输入后请求带 q、状态 Tab 叠加、离开重置）。

验收：`npm run typecheck`、`npm run test`、`npm run build`、`cd bff && npm run typecheck`、`cd bff && npm run test` 全绿；`drift_lite` 输出 `ok=true`；覆盖矩阵 v0.5.0 新增 5 行转「已自动化」。

## M5 验收与上线（依赖 M2..M4 全部完成）

> 验收方式（2026-08-29 用户 PO 指示）：除静态检查（grep 泄露门禁、代码走查、文档收口等可由 Agent 代办的项）外，不做自动化实测验收——Lighthouse 实测、真机回归、线上冒烟、限流验证等由用户手动验收，证据由用户回填。

- [ ] T-M5-1 覆盖矩阵全部条目转「已自动化」，或在 `checklist.md` 记录人工验收证据。
- [ ] T-M5-2 NFR 实测：Lighthouse 移动端 Performance ≥ 90 且 Accessibility ≥ 90；`GET /gigs` 20 次请求 P95 < 300ms；`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；CT-GIG-002 线上限流验证。
- [ ] T-M5-3 微信真机回归（iOS + Android）：弹层二维码长按识别、safe-area 无遮挡、`100dvh` 滚动正常、默认分享卡片可用。
- [ ] T-M5-4 `npx wrangler pages deploy dist` + 线上 `healthz` 200 + 线上冒烟（TC-VIEW-001 / TC-VIEW-004）。
- [ ] T-M5-5 收口：BACKLOG 清理（闭环项写 decisions）、AGENTS.md 踩坑教训回填、spec 状态改为「已实现」。
