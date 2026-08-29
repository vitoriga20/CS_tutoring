# SPEC-001: 家教单发布与接单（CS_tutoring 根级规范）

> **规范状态:** 已批准（2026-08-29，用户确认 v0.2.0）
> **版本:** v0.2.0
> **负责人:** PO/TL/QA: 用户（单人项目）
> **代码包路径:** `src/`（React 前端）、`bff/src/`（Hono BFF）、`functions/api/[[route]].js`（Pages Function 产物）、`supabase/migrations/`（数据库迁移）
> **最后修改:** 见 Git 提交记录（仓库尚无提交）
> **可执行性声明:** 本规范中的 Gherkin 场景是验收测试用例来源；`openapi.yaml` 是接口唯一事实来源；状态机 YAML 可直接翻译为代码校验函数；关键行为附 Properties 供属性测试作 oracle。
> **CI 门禁规则:** 本文件或 `specs/` 下任何契约文件被修改时，`src/`、`bff/src/` 中对应实现必须同轮修改（由 path-align L0 钩子 `drift_lite` 检查）。本地门禁命令（M0 脚手架落地后全部可执行）：
> - `npm run typecheck`（tsc --noEmit）必须通过
> - `npm run test`（vitest run）必须通过
> - `npm run build`（vite build）必须通过
> - `grep -rn "SERVICE_ROLE_KEY" src/` 必须零匹配（service_role 不进前端）
> - `powershell -NoProfile -File tools/path_align_hooks/drift_lite.ps1` 必须输出 `ok=true`

---

## 第 1 部分: 术语表与统一语言

| 术语 | 英文名 | 类型 | 定义 | 代码映射 | 数据库映射 | 示例 |
|------|--------|------|------|----------|------------|------|
| 家教单 | Gig | 聚合根 | 管理员发布的一条家教需求信息 | `interface Gig`（`src/services/types.ts`） | `gigs` 表 | `Gig { id, title, status }` |
| 单子状态 | GigStatus | 枚举 | 家教单生命周期状态 | `type GigStatus` | `gigs.status VARCHAR(10)` | `open`, `matched`, `closed` |
| 授课模式 | LessonMode | 枚举 | 线上或线下授课 | `type LessonMode` | `gigs.mode VARCHAR(10)` | `online`, `offline` |
| 年级段 | GradeLevel | 枚举 | 学员所处年级段 | `type GradeLevel` | `gigs.grade_level VARCHAR(10)` | `primary`, `junior`, `senior`, `college` |
| 区域 | Region | 值对象 | 学员所在城市或区域，线上、线下单都必填 | `region` 字段 | `gigs.region VARCHAR(40) NOT NULL` | `杭州市` |
| 学员性别 | StudentGender | 枚举 | 学员性别标注，未知可缺省 | `type StudentGender` | `gigs.student_gender VARCHAR(10)` | `male`, `female`, `unknown` |
| 学员情况 | StudentInfo | 值对象 | 学员的分数、基础、性格等补充描述 | `student_info` 字段 | `gigs.student_info TEXT` | `数学 85/150，基础较弱` |
| 站点配置 | SiteConfig | 值对象 | 全站单行配置：管理员微信联系方式 | `interface SiteConfig` | `site_config` 表（恒 1 行，id=1） | `SiteConfig { wxid, qr_image_url }` |
| 用户资料 | Profile | 聚合根 | auth.users 的 1:1 扩展，承载角色 | `interface Profile` | `profiles` 表 | `Profile { id, role }` |
| 用户角色 | ProfileRole | 枚举 | 管理员或普通用户 | `type ProfileRole` | `profiles.role VARCHAR(10)` | `admin`, `free` |
| 管理员 | Admin | 服务 | profiles.role='admin' 的登录用户，唯一可写角色 | BFF `assertAdmin()` | 无独立表 | — |

**一致性保障:** 所有代码中的枚举、实体、列名必须来自本表格；`GigStatus`/`LessonMode`/`GradeLevel`/`ProfileRole` 四个枚举的成员与顺序以本表为唯一出处（`open` < `matched` < `closed`；`online` < `offline`；`primary` < `junior` < `senior` < `college`；`admin` < `free`）。

---

## 第 2 部分: 用户故事与验收场景（Gherkin）

> 场景直接嵌入本文档（根级裁剪，不单设 features/ 目录）。每个场景关联到具体 API 端点，作为 `specs/checklist.md` 验收与 `specs/tasks.md` 测试任务的来源。

### 2.1 功能: 浏览家教单（学生，免登录）

```gherkin
功能: 浏览家教单
  作为一名想接单的大学生
  我想要浏览和筛选家教单
  以便找到合适的单子并联系管理员

  背景:
    假设 系统处于正常运行状态

  场景: 默认列表只展示 open 单子
    假设 数据库中存在状态为 "open"、"matched"、"closed" 的单子各 2 条
    当 访客向 GET /api/v1/gigs 发送请求
    那么 响应状态码是 200
    且 data 中只含 status 为 "open" 的 2 条
    且 meta.total 为 2
    且 data 按 created_at 降序排列（created_at 相同则按 id 降序）

  场景: 按年级段、模式、科目组合筛选
    假设 数据库中存在 grade_level "junior"、mode "offline"、subject "数学" 的 open 单子
    当 访客向 GET /api/v1/gigs?grade_level=junior&mode=offline&subject=数学 发送请求
    那么 响应状态码是 200
    且 data 中每条记录满足 grade_level 为 "junior" 且 mode 为 "offline" 且 subject 为 "数学"

  场景: 首页空态
    假设 数据库中不存在 status 为 "open" 的单子
    当 访客打开首页 "/"
    那么 页面显示空态文案 "暂时没有新单子，过几天再来看看"
    且 页面不显示骨架屏或错误提示

  场景: 详情页联系弹层（contact_wxid 回退规则）
    假设 访客打开单子 id 为 G1 的详情页 且 G1.contact_wxid 为空
    当 访客点击底部固定按钮 "联系小助理接单"
    那么 弹层展示 site_config.qr_image_url 的二维码与 site_config.wxid
    且 弹层提供复制 wxid 的按钮，点击后 wxid 进入剪贴板

  场景: 已匹配单子详情
    当 访客打开 status 为 "matched" 的单子详情页
    那么 页面显示 "已匹配" 状态徽标
    且 底部按钮 "联系小助理接单" 呈禁用态

  场景: 不存在的单子
    当 访客向 GET /api/v1/gigs/00000000-0000-0000-0000-000000000000 发送请求
    那么 响应状态码是 404
    且 响应体 code 为 "GIG_NOT_FOUND"
```

### 2.2 功能: 管理员管理家教单（需登录且 role=admin）

```gherkin
功能: 管理家教单
  作为管理员
  我想要发布、修改、下架家教单并维护联系方式

  背景:
    假设 已登录且 profiles.role 为 "admin"（携带有效 JWT）

  场景: 发布成功
    当 我向 POST /api/v1/gigs 发送以下请求
      """
      {
        "title": "高二数学一对一",
        "subject": "数学",
        "grade_level": "senior",
        "mode": "online",
        "region": "杭州市",
        "rate": "150/小时",
        "schedule": "周六全天",
        "student_gender": "female",
        "student_info": "女生，数学 85/150，基础较弱，计算易粗心",
        "requirements": "每周两次线上辅导，需要有耐心、能讲透基础题的学生"
      }
      """
    那么 响应状态码是 201
    且 data.status 为 "open"
    且 data.published_by 为当前管理员用户 id

  场景: 缺 region 被拒绝
    当 我向 POST /api/v1/gigs 发送不带 region 的请求（其余字段合法，mode 为 "online"）
    那么 响应状态码是 422
    且 code 为 "VALIDATION_ERROR"
    且 details 中包含字段 "region"

  场景大纲: 非法字段被拒绝
    当 我向 POST /api/v1/gigs 发送 <字段> 为 <值> 的请求（其余字段合法）
    那么 响应状态码是 422
    且 code 为 "VALIDATION_ERROR"

    例子:
      | 字段          | 值                                   |
      | title         | "   "                                |
      | title         | 61 个字符的字符串                    |
      | requirements  | 2001 个字符的字符串                  |
      | grade_level   | "chuzhong"                           |
      | mode          | "线"                                 |
      | region        | "   "                                |
      | student_info  | ""                                   |
      | student_gender| "女"                                 |

  场景: 状态流转 open 到 matched
    假设 存在 status 为 "open" 的单子 G2
    当 我向 PATCH /api/v1/gigs/G2 发送 {"status": "matched"}
    那么 响应状态码是 200
    且 data.status 为 "matched"

  场景: 状态流转 matched 到 closed
    假设 存在 status 为 "matched" 的单子 G5
    当 我向 PATCH /api/v1/gigs/G5 发送 {"status": "closed"}
    那么 响应状态码是 200
    且 data.status 为 "closed"

  场景: 状态流转 closed 到 open（重新上架）
    假设 存在 status 为 "closed" 的单子 G6
    当 我向 PATCH /api/v1/gigs/G6 发送 {"status": "open"}
    那么 响应状态码是 200
    且 data.status 为 "open"

  场景: 同值重申视为无变化
    假设 存在 status 为 "open" 的单子 G4
    当 我向 PATCH /api/v1/gigs/G4 发送 {"status": "open"}
    那么 响应状态码是 200
    且 data.status 仍为 "open"
    且 updated_at 不因本次请求改变

  场景大纲: 非法状态迁移被拒绝
    假设 存在 status 为 <当前状态> 的单子
    当 我向 PATCH /api/v1/gigs/<id> 发送 {"status": "<目标状态>"}
    那么 响应状态码是 422
    且 code 为 "GIG_INVALID_TRANSITION"

    例子:
      | 当前状态 | 目标状态 |
      | closed   | matched  |

  场景: 未登录发布被拒绝
    当 我不带 Authorization 头向 POST /api/v1/gigs 发送请求
    那么 响应状态码是 401
    且 code 为 "UNAUTHENTICATED"

  场景: 非 admin 登录用户发布被拒绝
    假设 已登录且 profiles.role 为 "free"
    当 我向 POST /api/v1/gigs 发送合法请求
    那么 响应状态码是 403
    且 code 为 "FORBIDDEN"

  场景: 删除单子
    假设 存在单子 G3
    当 我向 DELETE /api/v1/gigs/G3 发送请求
    那么 响应状态码是 204
    且 再向 GET /api/v1/gigs/G3 发送请求时返回 404
```

---

## 第 3 部分: API 接口与契约（OpenAPI 3.1 同源）

唯一事实来源文件: `specs/openapi.yaml`。本节只列契约要点，字段与错误以 openapi.yaml 为准。

| 端点 | 方法 | 鉴权 | 成功响应 | 关键错误 |
|------|------|------|----------|----------|
| `/api/v1/healthz` | GET | 无 | 200 `{status, ts}` | — |
| `/api/v1/gigs` | GET | 无 | 200 `{data: Gig[], meta: {page, pageSize, total}}` | 422 `VALIDATION_ERROR` |
| `/api/v1/gigs` | POST | admin | 201 `{data: Gig}` | 401 `UNAUTHENTICATED` / 403 `FORBIDDEN` / 422 |
| `/api/v1/gigs/:id` | GET | 无 | 200 `{data: Gig}` | 404 `GIG_NOT_FOUND` |
| `/api/v1/gigs/:id` | PATCH | admin | 200 `{data: Gig}` | 401/403/404 `GIG_NOT_FOUND` / 422 `GIG_INVALID_TRANSITION` |
| `/api/v1/gigs/:id` | DELETE | admin | 204 无响应体 | 401/403/404 |
| `/api/v1/site-config` | GET | 无 | 200 `{data: SiteConfig}` | — |
| `/api/v1/site-config` | PATCH | admin | 200 `{data: SiteConfig}` | 401/403/422 |

**契约要点（与 CourseCore BFF 骨架同源，禁止另创约定）:**
- 分页参数: `page`（默认 1，最小 1）、`pageSize`（默认 20，最小 1，最大 100）；列表排序 `created_at desc, id desc`。
- 响应外壳: 单资源 `{data}`；列表 `{data, meta}`；错误 `{error, code, detail?}`。
- `status` 查询参数取值 `open | matched | closed | all`，缺省 `open`；非法取值返回 422。
- `subject` 筛选为 trim 后不区分大小写的精确匹配（`lower(subject) = lower($subject)`）；筛选值含 `*` 或 `%` 时返回 422 `VALIDATION_ERROR`（通配符不作为筛选语法，v0.2.1 补钉）。
- 请求体中的未知字段一律忽略，不报错。
- BFF 错误响应统一 `{error, code, detail?}`；429 附加 `Retry-After` 头，并带 `X-RateLimit-Limit` / `X-RateLimit-Remaining` 头。
- 前端 BFF 客户端对全部请求自动附加 `Authorization: Bearer <supabase access token>`（存在会话时），匿名请求不附加该头；token 来自 supabase-js 会话。

---

## 第 4 部分: 数据模型与校验规则

实体 JSON Schema: `specs/gig.schema.json`、`specs/site_config.schema.json`、`specs/profile.schema.json`。数据库迁移文件: `supabase/migrations/0001_init.sql`（M1 任务产出）。

### 4.1 gigs 表

| 业务字段 | 数据库列（PostgreSQL） | 类型/约束 | 必填 | 默认值 | JSON 属性 |
|----------|------------------------|-----------|------|--------|-----------|
| 单子 ID | `id uuid PRIMARY KEY` | `default gen_random_uuid()` | 是 | 自动生成 | `id {type: string, format: uuid}` |
| 标题 | `title VARCHAR(60)` | trim 后非空 | 是 | — | `title {type: string, maxLength: 60}` |
| 科目 | `subject VARCHAR(40)` | trim 后非空 | 是 | — | `subject {type: string, maxLength: 40}` |
| 年级段 | `grade_level VARCHAR(10)` | CHECK in 枚举 | 是 | — | `grade_level {enum}` |
| 授课模式 | `mode VARCHAR(10)` | CHECK in 枚举 | 是 | — | `mode {enum}` |
| 区域 | `region VARCHAR(40)` | 非空，trim 后 1..40 | 是 | — | `region {type: string, maxLength: 40}` |
| 学员性别 | `student_gender VARCHAR(10)` | CHECK in 枚举 | 是 | `unknown` | `student_gender {enum}` |
| 学员情况 | `student_info TEXT` | trim 后非空且 ≤500 字符 | 是 | — | `student_info {type: string, maxLength: 500}` |
| 报酬 | `rate VARCHAR(40)` | 自由文本 | 否 | NULL | `rate {type: [string, null]}` |
| 时间 | `schedule VARCHAR(120)` | 自由文本 | 否 | NULL | `schedule {type: [string, null]}` |
| 对老师的要求 | `requirements TEXT` | trim 后非空且 ≤2000 字符 | 是 | — | `requirements {type: string, maxLength: 2000}` |
| 单子专属微信 | `contact_wxid VARCHAR(40)` | 可空 | 否 | NULL | `contact_wxid {type: [string, null]}` |
| 状态 | `status VARCHAR(10)` | CHECK in 枚举 | 是 | `open` | `status {enum}` |
| 发布人 | `published_by uuid` | REFERENCES auth.users(id) | 是 | — | `published_by {type: string, format: uuid}` |
| 创建时间 | `created_at timestamptz` | — | 是 | `now()` | `created_at {format: date-time}` |
| 更新时间 | `updated_at timestamptz` | — | 是 | `now()` | `updated_at {format: date-time}` |

约束: `region`、`student_info` 为 NOT NULL；`student_gender` 为 NOT NULL DEFAULT 'unknown'。

### 4.2 site_config 表（单行，id 恒为 1）

| 业务字段 | 数据库列 | 类型/约束 | 必填 | 默认值 |
|----------|----------|-----------|------|--------|
| 行 ID | `id INT PRIMARY KEY` | CHECK (id = 1) | 是 | 1 |
| 管理员微信号 | `wxid VARCHAR(40)` | 非空 | 是 | — |
| 二维码地址 | `qr_image_url TEXT` | 非空，`^https://` 开头，≤500 字符 | 是 | — |
| 弹层提示 | `notice VARCHAR(200)` | 可空；空字符串存为 NULL | 否 | NULL |
| 更新时间 | `updated_at timestamptz` | — | 是 | `now()` |

### 4.3 profiles 表

| 业务字段 | 数据库列 | 类型/约束 | 必填 | 默认值 |
|----------|----------|-----------|------|--------|
| 用户 ID | `id uuid PRIMARY KEY` | REFERENCES auth.users(id) ON DELETE CASCADE | 是 | — |
| 角色 | `role VARCHAR(10)` | CHECK in ('admin','free') | 是 | `free` |
| 昵称 | `display_name VARCHAR(40)` | 可空 | 否 | NULL |
| 头像 | `avatar_url TEXT` | 可空 | 否 | NULL |
| 时间戳 | `created_at` / `updated_at timestamptz` | — | 是 | `now()` |

配 `on_auth_user_created` 触发器：新注册用户自动插入 role='free' 的 profiles 行。

### 4.4 RLS 策略（纵深防御；BFF 用 service_role 绕过 RLS 写入）

| 表 | anon/authenticated 权限 |
|----|--------------------------|
| `gigs` | SELECT 允许；INSERT/UPDATE/DELETE 无策略（拒绝） |
| `site_config` | SELECT 允许；写入无策略（拒绝） |
| `profiles` | SELECT 仅 `auth.uid() = id`；写入无策略（拒绝） |

---

## 第 5 部分: 业务规则与状态流转

### 5.1 GigStatus 状态机

```yaml
stateMachine: GigStatus
initial: open
states:
  open:
    on:
      TO_MATCHED: matched
      TO_CLOSED: closed
  matched:
    on:
      REOPEN: open
      TO_CLOSED: closed
  closed:
    on:
      REOPEN: open
```

事件映射: PATCH 请求体 `status` 目标值 → 事件：目标 `matched` = `TO_MATCHED`，目标 `closed` = `TO_CLOSED`，目标 `open` = `REOPEN`。PATCH 中 `status` 等于当前值时视为无变化，直接放行返回 200。PATCH 请求体合并到当前实体后无任何字段实际变化时，不执行 UPDATE，`updated_at` 保持不变。非法迁移返回 422 `GIG_INVALID_TRANSITION`。

### 5.2 字段必填性与 NULL 触发条件

- 必填字段（POST 必须提供且校验通过）: `title`、`subject`、`grade_level`、`mode`、`region`、`student_info`、`requirements`。
- `student_gender` 可缺省：请求体缺省或显式 null 时存 `unknown`；显式提供时必须为枚举成员。
- 可空字段（NULL 触发条件）：`rate`、`schedule`、`contact_wxid`、`notice` 在请求体中缺省或显式为 null 时存 NULL（`notice` 另有 `"" → null` 规范化）；PATCH 显式置 null 为合法操作。
- PATCH 对合并后的最终实体整体校验：合并后任何必填字段为缺失或空（含 `region`、`student_info`）即 422 `VALIDATION_ERROR`。

### 5.3 校验器函数签名（BFF 内，`bff/src/lib/validators.ts`）

```text
validateGigInput(body: unknown): { ok: true, value: GigCreate } | { ok: false, details: FieldIssue[] }
validateGigPatch(body: unknown, current: Gig): { ok: true, value: GigUpdate } | { ok: false, details: FieldIssue[] }
validateSiteConfigPatch(body: unknown): { ok: true, value: SiteConfigUpdate } | { ok: false, details: FieldIssue[] }
assertTransition(from: GigStatus, to: GigStatus): void   // 非法迁移抛 Hono HTTPException(422, GIG_INVALID_TRANSITION)
```

字段校验规则（POST 与 PATCH 共用；PATCH 对合并后的最终实体校验）:
- `title`: trim 后长度 1..60
- `subject`: trim 后长度 1..40
- `grade_level`: 枚举成员
- `mode`: 枚举成员
- `region`: trim 后长度 1..40（必填）
- `student_gender`: 枚举成员；请求体缺省或显式 null 时取 `unknown`
- `student_info`: trim 后长度 1..500（必填）
- `rate`: 长度 ≤40，可空
- `schedule`: 长度 ≤120，可空
- `requirements`: trim 后长度 1..2000
- `contact_wxid`: 长度 ≤40，可空
- `status`: 枚举成员 + 状态机
- `wxid`: trim 后长度 1..40
- `qr_image_url`: 长度 1..500 且以 `https://` 开头
- `notice`: 长度 ≤200；空字符串规范化为 NULL
- 可空字段的 NULL 触发条件与 `student_gender` 缺省规则见 §5.2。

### 5.4 管理员鉴权规则（教训 L-001 的落地）

`assertAdmin(c)`（`bff/src/middleware/adminAuth.ts`）: 先走骨架 `verifyAuth` 得到 JWT 用户 id → 用 service_role 客户端查 `profiles.role` → `role === 'admin'` 放行；查无此用户或 role ≠ 'admin' 返回 403 `FORBIDDEN`。禁止使用 auth.users 自带的 role 字段判定管理员。

### 第 5 部分附: Properties 行为不变量

| 性质 ID | 回链 | 量化式（oracle） | 生成器 | 自动化 |
|---------|------|------------------|--------|--------|
| P-GIG-01 | 状态机 YAML；Gherkin 合法/非法流转 | 见下 PT-GIG-01 | `GigStatus` × `GigStatus` | PT-GIG-01 |
| P-GIG-02 | Gherkin 默认列表；§3 status 参数 | 见下 PT-GIG-02 | 任意 status 混合的 DB 快照 | PT-GIG-02 |
| P-GIG-03 | Gherkin 未登录/非 admin 场景；错误码表 | 见下 PT-GIG-03 | `{无 token, free token, admin token}` | PT-GIG-03 |
| P-GIG-04 | Gherkin 联系弹层 | 见下 PT-GIG-04 | `contact_wxid ∈ {null, 非null}` | PT-GIG-04 |

```text
P-GIG-01: Allowed = {(open,matched),(open,closed),(matched,open),(matched,closed),(closed,open)}
  ∀ from ∈ GigStatus, ∀ to ∈ GigStatus:
    to == from                       ⇒ assertTransition(from,to) 不抛错且实体不变更状态
    (from,to) ∈ Allowed              ⇒ assertTransition(from,to) 通过
    (from,to) ∉ Allowed ∧ to≠from    ⇒ 抛 422 GIG_INVALID_TRANSITION

P-GIG-02: ∀ DB 状态组合, ∀ 匿名请求 GET /api/v1/gigs（不带 status 参数）:
    200 ∧ data 中每个元素的 status == "open" ∧ meta.total == open 总数

P-GIG-03: ∀ 请求 ∈ {POST /gigs, PATCH /gigs/:id, DELETE /gigs/:id, PATCH /site-config}:
    无 Authorization 头                        ⇒ 401 UNAUTHENTICATED
    有效 token 但 profiles.role == "free"      ⇒ 403 FORBIDDEN
    有效 token 且 profiles.role == "admin"     ⇒ 按语义返回 201/200/204
    前两种情况 gigs 与 site_config 表无任何变更

P-GIG-04: ∀ gig:
    gig.contact_wxid == null ⇒ 弹层展示 site_config.wxid 与 site_config.qr_image_url
    gig.contact_wxid != null ⇒ 弹层展示 gig.contact_wxid 与 site_config.qr_image_url
```

**Correctness 变更门:** 写入/状态迁移相关实现（`bff/src/routes/gigs.ts`、`bff/src/lib/validators.ts`、`bff/src/middleware/adminAuth.ts`）进入 dirty diff 时，必须跑命中的 `PT-GIG-01..03`；`src/components/ContactModal` 相关文件变更时跑 `PT-GIG-04`。只改文档/排版时不触发。

---

## 第 6 部分: 错误处理与日志规范

错误码字典（错误响应统一 `{error, code, detail?}`，与 BFF 骨架同源）:

| 错误码 | HTTP 状态码 | 触发条件 | 日志级别 |
|--------|-------------|----------|----------|
| `UNAUTHENTICATED` | 401 | 缺失、格式错误或无效的 JWT | INFO |
| `FORBIDDEN` | 403 | 已登录但 profiles.role ≠ 'admin'，或 profiles 行不存在 | WARN |
| `GIG_NOT_FOUND` | 404 | 详情/PATCH/DELETE 的单子 id 不存在 | INFO |
| `NOT_FOUND` | 404 | 未知路由（BFF 兜底） | INFO |
| `VALIDATION_ERROR` | 422 | 请求体或查询参数不满足第 4/5 部分规则 | WARN |
| `GIG_INVALID_TRANSITION` | 422 | status 迁移不在状态机 Allowed 表内 | INFO |
| `RATE_LIMITED` | 429 | 同一 IP 每 60 秒超过 120 次请求（响应含 `Retry-After: 60`） | WARN |
| `INTERNAL` | 500 | 未预期的服务器错误（`{error: "Internal Server Error", code: "INTERNAL"}`） | ERROR |

日志规范: BFF 中 4xx 打印一行摘要（`[gigs] 422 VALIDATION_ERROR`）；5xx 打印完整错误对象含 `path`；不打印 JWT、请求体外文本身份信息。（M3 实施注记：请求一行摘要由 `bff/src/middleware/requestLog.ts` 落地，含方法/路径/状态/耗时；前端失败请求在 DEV 模式打 `console.debug`，仅用于开发诊断，不进生产 console。）

---

## 第 7 部分: 测试用例与需求覆盖矩阵

| 需求来源 | 需求 ID | 类型 | 测试用例 ID | 自动化状态 |
|----------|---------|------|-------------|------------|
| Gherkin: 默认列表只展示 open | REQ-VIEW-01 | 验收测试 | TC-VIEW-001 | 已自动化（bff/tests PT-GIG-02 路由级覆盖） |
| Gherkin: 组合筛选 | REQ-VIEW-02 | 验收测试 | TC-VIEW-002 | 已自动化（bff/tests/gigs-route.test.ts） |
| Gherkin: 首页空态 | REQ-VIEW-03 | 验收测试 | TC-VIEW-003 | 已自动化（tests/view-components.test.tsx，2026-08-29 经用户确认新增 @testing-library/react + happy-dom） |
| Gherkin: 详情联系弹层 | REQ-VIEW-04 | 验收测试 | TC-VIEW-004 | 已自动化（tests/view-components.test.tsx，含 P-GIG-04 组件侧两分支与剪贴板断言） |
| Gherkin: 已匹配单子详情 | REQ-VIEW-05 | 验收测试 | TC-VIEW-005 | 已自动化（tests/view-components.test.tsx，matched/closed 双状态徽标 + 按钮禁用） |
| Gherkin: 不存在的单子 | REQ-VIEW-06 | 验收测试 | TC-VIEW-006 | 已自动化（bff/tests/gigs-route.test.ts） |
| Gherkin: 发布成功 | REQ-ADMIN-01 | 验收测试 | TC-ADMIN-001 | 已自动化（bff/tests/gigs-route.test.ts） |
| Gherkin: 缺 region 被拒绝 | REQ-ADMIN-02 | 验收测试 | TC-ADMIN-002 | 已自动化（bff/tests 路由+校验器双层） |
| Gherkin 大纲: 非法字段 | REQ-ADMIN-03 | 验收测试 | TC-ADMIN-003 | 已自动化（bff/tests/validators.test.ts） |
| Gherkin: 状态流转三场景（open→matched、matched→closed、closed→open 重新上架） | REQ-ADMIN-04 | 验收测试 | TC-ADMIN-004 | 已自动化（bff/tests/gigs-route.test.ts） |
| Gherkin: 同值重申视为无变化 + 大纲: 非法迁移（closed→matched） | REQ-ADMIN-05 | 验收测试 | TC-ADMIN-005 | 已自动化（bff/tests 路由+PT-GIG-01 全组合） |
| Gherkin: 401 / 403 | REQ-ADMIN-06 | 契约测试 | CT-ADMIN-001 | 已自动化（bff/tests/gigs-route.test.ts） |
| Gherkin: 删除 204 | REQ-ADMIN-07 | 验收测试 | TC-ADMIN-006 | 已自动化（bff/tests/gigs-route.test.ts） |
| OpenAPI: GET /gigs 200 形状 | REQ-CT-01 | 契约测试 | CT-GIG-001 | 已自动化（bff/tests/gigs-route.test.ts） |
| OpenAPI: 429 与 Retry-After | REQ-CT-02 | 契约测试 | CT-GIG-002 | 未自动化（期限: M5 里程碑内，需线上 KV） |
| Properties: P-GIG-01 | REQ-PT-01 | 属性测试 | PT-GIG-01 | 已自动化（bff/tests/validators.test.ts 3×3 全组合） |
| Properties: P-GIG-02 | REQ-PT-02 | 属性测试 | PT-GIG-02 | 已自动化（bff/tests/gigs-route.test.ts 路由级） |
| Properties: P-GIG-03 | REQ-PT-03 | 属性测试 | PT-GIG-03 | 已自动化（bff/tests/gigs-route.test.ts 401/403/201 三态+无变更断言） |
| Properties: P-GIG-04 | REQ-PT-04 | 属性测试 | PT-GIG-04 | 已自动化（tests/contact-target.test.ts，纯函数 oracle 遍历 contact_wxid ∈ {null, 非null}；组件渲染侧由 TC-VIEW-004 承接） |

一致性保障: 测试文件存 `tests/`，用例 ID 与本矩阵逐字一致；全部转「已自动化」前不允许把 M5 标记完成。

---

## 第 8 部分: 非功能性需求

| 类别 | 具体要求 | 验证方法 |
|------|----------|----------|
| 性能 | `GET /api/v1/gigs`（pageSize=20）连续 20 次请求 P95 < 300ms（`wrangler pages dev` 连远程 Supabase） | curl 循环脚本计时取 P95，结果记入 checklist |
| 性能 | 首页与详情页 Lighthouse 移动端（Slow 4G 模拟）Performance ≥ 90 且 Accessibility ≥ 90 | Chrome DevTools Lighthouse 实测，数值记入 checklist |
| 安全 | `SERVICE_ROLE_KEY` 字符串不出现在 `src/` | `grep -rn "SERVICE_ROLE_KEY" src/` 零匹配 |
| 安全 | 全部写端点匿名 401、非 admin 403 | CT-ADMIN-001 |
| 限流 | 120 请求/60 秒/IP，第 121 次返回 429 + `Retry-After: 60` | CT-GIG-002（需绑定 RATE_LIMIT_KV） |
| 可用性 | 375px 视口无横向滚动；全部交互元素键盘可达且 focus 可见 | checklist 人工门（iOS Safari + Android Chrome + 微信内置浏览器） |
| 可靠性 | BFF 未捕获异常统一返回 `{error: "Internal Server Error", code: "INTERNAL"}` 且不泄露堆栈 | 代码走查 + 临时注入异常的 smoke 验证 |
| 兼容性 | iOS Safari 15+、Android Chrome、微信内置浏览器可用 | checklist 真机回归 |

---

## 第 9 部分: 假设、约束与变更日志

**假设:**
- 新建独立 Supabase 项目可用（PostgreSQL 15+，含 auth schema 与 Storage）。
- Cloudflare 账号可创建 Pages 项目与 KV 命名空间（RATE_LIMIT_KV）。
- 管理员能提供微信二维码图片（上传至 Supabase Storage 公开 bucket `site-assets`）与微信号。
- 目标浏览器: iOS Safari 15+、Android Chrome、微信内置浏览器（X5/WKWebView）。

**约束:**
- API 路径前缀 `/api/v1/` 不得改变；响应外壳与错误码不得偏离第 3/6 部分。
- 前端技术栈钉死: React 19 + TypeScript + Vite + Tailwind CSS v4 + react-router v7 + TanStack Query v5 + lucide-react；测试栈 Vitest。
- 登录仅管理员使用，走 supabase-js（邮箱+密码，Supabase Auth）；学生免登录；BFF 不提供登录端点。
- 管理员提权为手动 SQL: `update profiles set role='admin' where id = <uuid>;`（运营动作，不开发界面）。
- `SUPABASE_SERVICE_ROLE_KEY` 只存 Cloudflare Secrets 与本地 `.dev.vars`。
- 设计令牌（色板/字体/间距/圆角/阴影）与组件动画一律从素材库 `extracted-components/theme/` 逐字移植，禁止自创色值；组件移植遵守素材库提取铁律（动画全量搬运、令牌入 theme、带来源注释头）。
- v1 不做企业微信客服链接、学生账号、报名记录、在线聊天、支付、微信 JS-SDK 分享；`site_config` 表结构不为此预留字段，未来扩展须升版本并新增决策。
- CourseCore 仓库与审美素材库目录只读。

**变更日志（以 Git 提交记录为准）:**

| 日期 | 版本 | 变更说明 | 关联 Commit |
|------|------|----------|-------------|
| 2026-08-29 | v0.1.0 | 初始版本: 根级 spec + openapi.yaml + 3 个实体 schema + tasks/checklist | （仓库尚无提交） |
| 2026-08-29 | v0.2.0 | gigs 表修订: region 改为无条件必填，新增 student_gender / student_info 字段，requirements 明确为「对老师的要求」，移除 region 条件 CHECK | （仓库尚无提交） |
| 2026-08-29 | v0.2.1 | M2 实施回补: subject 筛选通配符（* 与 %）返回 422；覆盖矩阵按 BFF 测试落地更新自动化状态 | （仓库尚无提交） |
| 2026-08-29 | v0.2.2 | M3 实施 UI 调整（用户 PO 指示）: 底部导航移除「联系」Tab（2 Tab：单子/管理），联系入口收敛到单子详情页底部按钮；按钮文案「联系管理员接单」→「联系小助理接单」（弹层内文案同步） | （仓库尚无提交） |
