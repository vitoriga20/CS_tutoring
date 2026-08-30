# SPEC-002: 管理员批量导入（自动生成家教单）

> **规范状态:** 已实现（2026-08-30；v0.1.0 初稿 → v0.1.1 评审回补 → v0.1.2 实施验证回补 → v0.1.3 用户对齐 B → v0.1.4 用户对齐 G2；自动化验收全绿，真机冒烟/375px 人工门待用户，见 checklist 第 5/6 节）
> **版本:** v0.1.4
> **负责人:** PO/TL/QA: 用户（单人项目）
> **代码包路径:** `bff/src/lib/importParser.ts`（纯函数解析引擎）、`bff/src/routes/import.ts`（BFF 端点）、`src/pages/admin/AdminImportPage.tsx`（导入页）；数据层复用 SPEC-001 `supabase/migrations/` 的 `gigs` 表（**不新增列**）
> **最后修改:** 见 Git 提交记录（仓库尚无提交）
> **可执行性声明:** 本规范中的 Gherkin 场景是验收测试用例来源；接口契约与 SPEC-001 `specs/openapi.yaml` 同源（本规范 §3 定义、实施时回写 openapi.yaml）；关键解析行为附 Properties 供属性测试作 oracle。
> **关联决策:** `decisions/008-v1-admin-import-alignment.md`（四问对齐：纯文本粘贴 / 规则正则 / 预览确认入库 / 全链路）。

---

## 第 0 部分: 元数据与 CI 门禁

- 本规范是 SPEC-001 的**模块级补充规范**（决策 008 已批准立项）；数据模型、鉴权、错误码字典、枚举成员一律沿用 SPEC-001，本文只定义「批量导入」增量。
- CI 门禁（与 SPEC-001 同源，实施时同轮执行）：
  - `cd bff && npm run typecheck && npm run test`（解析引擎与导入端点单测）
  - `npm run typecheck && npm run test && npm run build`（前端）
  - `grep -rn "SERVICE_ROLE_KEY" src/` 必须零匹配
  - `powershell -NoProfile -File tools/path_align_hooks/drift_lite.ps1` 必须 `ok=true`（契约变更需回写 openapi.yaml）

---

## 第 1 部分: 术语表与统一语言

| 术语 | 英文名 | 类型 | 定义 | 代码映射 | 数据库映射 | 示例 |
|---|---|---|---|---|---|---|
| 原始文本 | RawImportText | 值对象 | 管理员从家教网复制/抓取的自由格式文本（参考仓库根 `你好.txt`） | `string` | 不入库 | 含 `学员地址：…` 等多个单子块 |
| 单子块 | RawGigBlock | 值对象 | 原始文本中按边界切出的单条家教单原始文本 | `string` | 不入库 | `8.26长沙家教网10034639号家教\n学员地址：…` |
| 导入草稿 | GigImportDraft | 实体 | 单子块经抽取+归一后的中间结构（字段可能缺失/未解析） | `bff/src/lib/importParser.ts` | 不入库（运行时类型） | `{title, subject, grade_level, …issues[]}` |
| 导入行 | GigImportRow | 实体 | 草稿 + 校验结果 + 去重标记，预览表一行 | `GigImportRow` | 不入库 | `{index, draft, issues, duplicate}` |
| 字段问题 | FieldIssue | 值对象 | 某字段解析/校验未通过的描述；形状与 SPEC-001 §5.3 / 错误响应 `details` 既有约定一致 | `{field, reason}` | — | `{field:'grade_level', reason:'未识别年级'}` |
| 去重键 | DedupKey | 值对象 | 由标题归一化得到的去重标识（剥装饰前缀→去 `号家教` 尾随数字→去空格/点/小写，规则唯一出处 §5.1 title 行） | `string` | — | `长沙家教网10034635家教`（`8.26长沙家教网10034635号家教` 与 `🎀🎀长沙家教网10034635号家教` 同键） |

一致性保障: 本规范出现的枚举（GradeLevel / LessonMode / District / StudentGender / GigStatus）成员与顺序以 SPEC-001 §1 为唯一出处，本规范不重新定义。

---

## 第 2 部分: 用户故事与验收场景（Gherkin）

```gherkin
功能: 管理员批量导入家教单
  作为管理员
  我想要粘贴家教网原始文本批量生成家教单
  以便快速发布而不用手工逐条填写

  背景:
    假设 已登录且 profiles.role 为 "admin"（携带有效 JWT）

  场景: 粘贴文本解析出预览
    假设 管理员在 /admin/import 粘贴一段含 3 条家教单的原始文本
    当 管理员点击「解析」
    那么 BFF 返回 preview 含 3 行
    且 每行含解析出的字段与逐字段 issues（可空）

  场景: 必填字段解析失败标红
    假设 某条单子块无「学员情况」且无可识别「年级」
    当 管理员解析
    那么 该行 status 为 "error"
    且 issues 含 student_info 与 grade_level 字段问题

  场景: 批量去重
    假设 原始文本中编号为 "10034617" 的家教单出现 2 次
    当 管理员解析
    那么 preview 中仅保留 1 条 status 为 "ok"
    且 另一条 duplicate 为 true（不计入可导入集合）

  场景: 编辑后导入选中行
    假设 preview 返回 3 行，其中 2 行 status 为 "ok"，1 行有 error
    当 管理员修正 error 行后勾选全部 3 行并点击「导入选中」
    那么 BFF 对每行重新校验并写入 3 条 status=open 的单子
    且 响应 data.created 长度为 3

  场景: 提交后仍有非法行
    假设 管理员勾选了 1 行但编辑后 grade_level 仍非法
    当 管理员点击「导入选中」
    那么 BFF 写入其余合法行
    且 响应 data.failed 含该行（code=VALIDATION_ERROR, details 指向 grade_level）

  场景: 未登录/非 admin 被拒绝
    当 匿名请求 POST /api/v1/gigs/import/preview
    那么 响应 401 UNAUTHENTICATED
    且 当 free 用户请求时响应 403 FORBIDDEN
    且 gigs 表无变更

  场景: 空文本被拒绝
    当 管理员粘贴空文本并解析
    那么 响应 422 VALIDATION_ERROR
```

---

## 第 3 部分: API 接口与契约（与 openapi.yaml 同源）

> 路径前缀 `/api/v1/` 不变；响应外壳 `{data}` / 错误 `{error, code, detail?}` 与 SPEC-001 一致。两个端点均 `security: [{ bearerAuth: [] }]` 且经 `requireAdmin`（`bff/src/middleware/adminAuth.ts`，SPEC-001 §5.4 文档别名 `assertAdmin`）门禁。

### 3.1 POST /api/v1/gigs/import/preview — 解析预览

- 请求体: `{ raw_text: string }`（必填，非空；缺失或空串 → 422 VALIDATION_ERROR）。
- 响应 `200`: `{ data: { rows: GigImportRow[] } }`。
- `GigImportRow`:
  - `index: integer`（批次内序号，从 0）
  - `draft: GigImportDraft`（`title/subject/grade_level/mode/region/district/student_gender/student_info/rate/schedule/requirements/contact_wxid/hourly_rate`；未解析字段为 null 或空串）
  - `issues: FieldIssue[]`（非空 → 该行不可直接导入）
  - `duplicate: boolean`（与前面某行去重键相同 → true）
  - `status: "ok" | "error"`（`error` ⇔ issues 非空，见 P-IMPORT-02）
- 错误: 401 UNAUTHENTICATED / 403 FORBIDDEN / 422 VALIDATION_ERROR。

### 3.2 POST /api/v1/gigs/import — 批量写入

- 请求体: `{ rows: GigCreate[] }`（管理员在预览表编辑/勾选后回传的合法草稿数组；空数组 → 422 VALIDATION_ERROR）。
- 服务端对每个元素**重新**跑 `validateGigInput`（权威校验，不信任前端），通过后以 `status=open`、`published_by=当前 admin id` 写入 `gigs` 表（复用 SPEC-001 写入路径）。
- 响应 `201`: `{ data: { created: Gig[], failed: { index: integer, code: string, details: FieldIssue[] }[] } }`。
  - `created`: 通过校验并成功插入的单子。
  - `failed`: 仍校验不通过的元素（含批次内 index，便于前端定位）；`failed` 元素**不插入**。
- 错误: 401 / 403 / 422（空 rows）。

---

## 第 4 部分: 数据模型与校验规则

- **复用 SPEC-001 §4 `gigs` 表**：批量导入只向该表插入行，**不新增任何列**；`id`/`status=open`/`published_by`/`created_at`/`updated_at` 由服务端生成（同单条 `POST /gigs`）。
- **运行时类型（不入库）**：`GigImportDraft` / `GigImportRow` / `FieldIssue` 见 §1 与 §3，仅存在于解析引擎与预览响应中。

### 4.1 解析引擎模块（`bff/src/lib/importParser.ts`，纯函数、无 CF 依赖、可单测）

| 函数 | 签名 | 职责 |
|---|---|---|
| 切分 | `segmentText(raw: string): string[]` | 整段文本按单子边界切成 N 个单子块；标题行形态 = 含「长沙家教/家教网/`号\d{0,2}家教`」或裸编号（≥6 位数字）；跳过纯 emoji/装饰行、行首剥装饰后为 `#` 且余文含标题形态的通告行（如「📘 #开学单已秒 …」）；**首个标题前的无标签噪声行（聊天/广告）不单独成块，直接丢弃（v0.1.3）**；标签分隔符：普通标签需全角/半角冒号或逗号，方括号标签（`【地址】`…）可直接接值无需分隔符；**`#` 行（v0.1.4）：剥 `#` 后余文含标题形态 → 通告行跳过，否则剥 `#` 保留为正文行（如「#老师要有耐心…」）** |
| 抽取+归一 | `parseGigBlock(block: string): GigImportDraft` | 标签正则抽取 → 归一为 schema 类型（见 §5.1）→ 产出 draft（未解析字段为 null/空） |
| 去重标记 | `markDuplicates(drafts: GigImportDraft[]): GigImportRow[]` | 按 `dedupKey(draft.title)` 归一去重，首条保留、其余 `duplicate=true` |
| 校验 | `collectIssues(draft: GigImportDraft): FieldIssue[]` | 必填字段解析缺失/非法 → issue（见 §5.2） |
| 组合 | `parseImport(raw: string): GigImportRow[]` | `segmentText → map parseGigBlock → markDuplicates → map collectIssues` |

> 解析引擎只在 BFF 服务端运行（预览接口返回结果）；前端不内联解析逻辑，避免逻辑双份与暴露规则。编辑发生在前端对 BFF 返回 draft 的修改上。

---

## 第 5 部分: 业务规则与状态流转

### 5.1 字段映射规则（抽取→归一，规范唯一出处）

| 目标字段 | 规则 | 示例 |
|---|---|---|
| `title` | 取单子块首行「编号/标题」文本，去首尾空白，截断 ≤60；**去重键**（v0.1.1 修订）= 剥装饰前缀（行首 emoji 串、`#注释`段、`推`、日期 `X.Y`）→ 去 `号家教` 及其**尾随**数字（`号家教\d*$`，不动 `号\d家教` 形态）→ 去空格/点/小写 | `8.26长沙家教网10034639号家教`；`260827001`；`长沙家教ww260204`；去重示例：`8.26长沙家教网10034635号家教` ≡ `🎀🎀长沙家教网10034635号家教`；`260827001号4家教` ≢ `260827001`（不同单，不得合并） |
| `grade_level` | 年级词→enum（匹配优先级：college 先于「X年级」，避免「大学一年级」误判 primary）：一~六年级→primary；初一/初二/初三→junior；高一/高二/高三→senior；大一~大四/大学→college；`准X` 同 X（含无「年级」后缀的简写，如 `准五`→primary、`准初一`→junior）；`X升X`/`X进X`（一~六之间）→primary（四升五/三升四/二进三）；`小学生/初中生/高中生`→对应段；`小学`/`高中`/`初中` 裸词、幼儿/早教等未命中→null（留 issue）；来源依次为学员情况、年级科目、学员地址 | `初二`→junior、`准高一`→senior、`六年级`→primary、`大一`→college、`准五`→primary、`四升五`→primary、`学员地址：…托管 小学生`→primary |
| `subject` | 归一算法（v0.1.1 修订，分词从左到右）：① 命中标准全称（语文/数学/英语/物理/化学/生物/政治/历史/地理/全科/奥数）→ 原样保留；② 命中缩写字符（语数英理化生政史地）且处于「连续缩写段」（左右相邻也是缩写字符）→ 展开（语→语文、数→数学、英→英语、物→物理、化→化学、生→生物、政→政治、史→历史、地→地理、理→物理）；③ 其余字符原样保留；④ 相邻展开/全称科目段之间以 `·` 连接，不与实义词粘连；⑤ trim 后 ≤40 截断；⑥ 含「一个…一个」且无任何标准科目词（如 `文科一个 理科一个`）→ null（留 issue） | `语数英`→语文·数学·英语、`数理化`→数学·物理·化学、`数学物理`→数学·物理、`语数英（英语）`→语文·数学·英语（英语）、`长笛`→长笛（原样）、`文科一个 理科一个`→null |
| `district` | ① 正则前缀 `^(芙蓉区|天心区|雨花区|开福区|岳麓区|望城区|长沙县)` → 对应 enum；② 值内区县词兜底（`长沙市开福区清水塘路…`→kaifu，前缀优先，v0.1.3）；③ 无前缀走手工映射表（下表）；④ 均不中→`other`（other 为合法枚举，永不标 issue） | `岳麓区.梅溪湖壹号`→yuelu；`北部湾`→wangcheng；`长沙市开福区清水塘路`→kaifu |
| `hourly_rate` | 取「数字 +（元\|/小时\|每小时\|一小时\|块\|左右\|/h）」首次匹配整数（`/小时` 先于 `/h`）；区间（如 `100-110元/小时`）取**下限**（保守）；数字后紧跟 `左右` 取该数字；按次/天/月计费（`元/次`、`/天`、`/月`、`元/一次课`，及 `每(次\|天\|周\|月)…元` 句式如「每次薪资100元」，v0.1.3）与面议/可议/无数字→null；范围钳制 0..10000 | `70元/小时`→70、`100-110元/小时`→100、`60一小时一次两个小时`→60、`50左右`→50、`70/h`→70、`300元/次`→null、`每次薪资100元`→null、面议→null |
| `student_gender` | `女`→female、`男`→male、`男女不限/不限`→unknown、缺失→unknown（**不标 issue**，缺省规则同 SPEC-001 §5.2） | `初二、女`→female、`男女不限`→unknown |
| `mode` | 默认 `offline`；文本含 `线上/网课/直播`→`online` | — |
| `region` | 取 `学员地址/家教地址/具体地点/地点/【具体地点】` 的值；多值取首个；缺失→null（留 issue） | `岳麓区.梅溪湖壹号`、`汉唐·翰林府1期` |
| `student_info` | 取 `学员情况`（无标签时取块内描述性段落）原文，截断 ≤500；缺失→null（留 issue） | `初二、女 基础巩固…` |
| `schedule` | 取 `时间安排/每周课次/【每周课次】` 原文，截断 ≤120 | `每次2小时（秋季一周一次）` |
| `requirements` | 取 `教员要求/要求/大概要求/【大概要求】` 原文，截断 ≤2000 | `女，有家教经验…` |
| `rate` | 取薪水原文（如 `70元/小时`），截断 ≤40；与 `hourly_rate` 并存 | `70元/小时` |
| `contact_wxid` | **v1 不提取**（可靠性低）；恒为 null，交人工在预览表补 | — |

**区县手工映射表（复用 SPEC-001 `0003_district_rate.sql` 已核实的 8 条，禁止重复核实）：**

| region 原文 | district |
|---|---|
| 北部湾 | wangcheng |
| 汉唐·翰林府1期 | yuelu |
| 长沙地铁4号线观沙岭站附近 / 君康家园 | yuelu |
| 长沙火车站附近 | furong |
| 润和星河玥8栋 / 保利天汇二期 | yuhua |
| 长郡外国语附近 | tianxin |

> 其余无明确归属→`other`（宁乡/浏阳等）。`0003` 未覆盖的新小区若高频出现，归并到决策后升版本扩充本表。

### 5.2 必填性与 issue 触发（预览标红依据）

- 必填且解析缺失/非法 → `issue`（行 `status=error`，不可直接导入）：`title`、`subject`、`grade_level`、`region`、`student_info`、`requirements`。`requirements` 与 SPEC-001 §5.2、`GigForm` 客户端校验、`gigs` 表非空 CHECK 一致为必填，解析缺失必须交人工在预览表补，不得默认填充。
- 永不 issue（有默认值/兜底）：`mode`（默认 offline）、`district`（默认 other）、`student_gender`（默认 unknown）、`hourly_rate`/`rate`/`schedule`/`contact_wxid`（可空）。
- 归一化约束（截断/钳制）失败（如 `student_info` >500 截断后仍空）→ 视为缺失 → issue。

### 5.3 提交校验

- `POST /api/v1/gigs/import` 对每个元素调 `validateGigInput`（SPEC-001 §5.3），通过才插入；与单条 `POST /gigs` 校验完全一致，无第二条规则。

### 5.4 无标签块特征分派（v0.1.4 G2）

块内**无任何「标签：值」行**（自由格式文本）时启用行级特征词分派，为缺失字段兜底；**有标签块不启用**（标签优先，行为与 v0.1.3 一致，零回归）。行命中优先级 **rate > subject > region > schedule > requirements**（一行只归属首个命中特征；已被 student_info 取用的行不参与分派）。

| 字段 | 特征词（命中即分派该行） | 示例 |
|---|---|---|
| `rate` | 数字+（元\|/小时\|每小时\|一小时\|块\|左右\|/h\|次\|天） | `50/小时 每次2小时…`→50 |
| `subject` | 科目缩写段（语数英理化生政史地 ≥2 连）或全称（语文/数学/…/全科/奥数） | `语数家庭作业+基础巩固`→语文·数学 |
| `region` | 小区/住宅/路/街/苑/园/广场/附近/大道/巷/湾/郡/府/镇/村/栋 | `龙湖湘风原著住宅小区A2区` |
| `schedule` | 周[一到五]/每天/每周/下午/晚上/上午/点半/点后 | `现在周一到周五下午四点半以后` |
| `requirements` | 老师/要求/经验/耐心/负责/优先/责任心 | `#老师要有耐心 负责 经验丰富 女老师`（# 剥除） |

`student_info` 兜底（无「学员情况」标签时，v0.1.4 修订）：优先取含年级词（准?X年级/准X/初X/高X/大X/X升X/学生段）或 男孩/女孩/幼儿/大班 的行，否则取首个非标签正文行。`grade_level` 从该值提取（`四年级 女孩一个…`→primary）。

### 第 5 部分附: Properties 行为不变量

| 性质 ID | 回链 | 量化式（oracle） | 生成器 | 自动化 |
|---------|------|------------------|--------|--------|
| P-IMPORT-01 | §5.1 去重键；Gherkin 批量去重 | 见下 PT-IMPORT-01 | 任意含重复标题的批次 | PT-IMPORT-01 |
| P-IMPORT-02 | §5.2；Gherkin 必填失败标红 | 见下 PT-IMPORT-02 | 任意单子块 | PT-IMPORT-02 |
| P-IMPORT-03 | §3.2；Gherkin 提交后仍有非法行 | 见下 PT-IMPORT-03 | 合法+非法混合批次 | PT-IMPORT-03 |
| P-IMPORT-04 | SPEC-001 §5.4；Gherkin 未登录/非 admin | 见下 PT-IMPORT-04 | `{无 token, free token, admin token}` | PT-IMPORT-04（复用 P-GIG-03 模式） |

```text
P-IMPORT-01: ∀ batch, ∀ i<j:
    dedupKey(rows[i].draft.title) == dedupKey(rows[j].draft.title)
      ⇒ rows[j].duplicate == true ∧ rows[i].duplicate == false
   且 每个去重键至多 1 条 duplicate==false

P-IMPORT-02: ∀ row:
    row.status == "ok"  ⇔  collectIssues(row.draft) 为空
      ⇔  {title, subject, grade_level, region, student_info, requirements} 全部解析成功

P-IMPORT-03: ∀ commit 请求 rows:
    created 长度 == 通过 validateGigInput 的元素数
    ∧ failed 长度 == 未通过的元素数
    ∧ created ∪ failed 覆盖全部输入元素（无静默丢弃）
    ∧ gigs 表仅新增 created 长度条记录

P-IMPORT-04: ∀ 请求 ∈ {POST /gigs/import/preview, POST /gigs/import}:
    无 Authorization 头                  ⇒ 401 UNAUTHENTICATED
    有效 token 但 role=='free'           ⇒ 403 FORBIDDEN
    有效 token 且 role=='admin'          ⇒ 按语义返回 200/201
    前两种情况 gigs 表无变更
```

**Correctness 变更门:** `bff/src/lib/importParser.ts` 与 `bff/src/routes/import.ts` 进入 dirty diff 时，必须跑 `PT-IMPORT-01..04`；只改文档/排版不触发。

---

## 第 6 部分: 错误处理与日志规范

- 错误码**复用 SPEC-001 §6 字典**：`UNAUTHENTICATED`(401) / `FORBIDDEN`(403) / `VALIDATION_ERROR`(422) / `INTERNAL`(500)。**不新增错误码**。
- 空 `raw_text` / 空 `rows` → `422 VALIDATION_ERROR`（detail 指向字段）。
- 解析阶段的逐字段问题**不走 HTTP 错误**，而是随 preview 响应以 `issues[]` 返回（行级标红），由管理员在预览表修正。
- 日志: 导入端点 4xx 打印一行摘要（`[import] 422 VALIDATION_ERROR`）；5xx 打印完整错误含 `path`；不打印 JWT 与请求体外文本身份信息（同 SPEC-001 §6）。

---

## 第 7 部分: 测试用例与需求覆盖矩阵

| 需求来源 | 需求 ID | 类型 | 测试用例 ID | 自动化状态 |
|----------|---------|------|-------------|------------|
| Gherkin: 粘贴文本解析出预览 | REQ-IMP-01 | 验收测试 | TC-IMPORT-001 | 待自动化（M-IMPORT-1） |
| Gherkin: 必填字段解析失败标红 | REQ-IMP-02 | 验收测试 | TC-IMPORT-002 | 待自动化（M-IMPORT-1） |
| Gherkin: 批量去重 | REQ-IMP-03 | 验收测试 | TC-IMPORT-003 | 待自动化（M-IMPORT-1） |
| Gherkin: 编辑后导入选中行 | REQ-IMP-04 | 验收测试 | TC-IMPORT-004 | 待自动化（M-IMPORT-1） |
| Gherkin: 提交后仍有非法行 | REQ-IMP-05 | 验收测试 | TC-IMPORT-005 | 待自动化（M-IMPORT-1） |
| Gherkin: 空文本被拒绝 | REQ-IMP-06 | 验收测试 | TC-IMPORT-006 | 待自动化（M-IMPORT-1） |
| Gherkin: 未登录/非 admin 被拒绝 | REQ-IMP-07 | 契约测试 | CT-IMPORT-001 | 待自动化（M-IMPORT-1） |
| 解析引擎单测: 字段映射（年级/科目/区县/时薪/性别/模式） | REQ-IMP-08 | 单元测试 | TC-IMPORT-007 | 待自动化（M-IMPORT-0） |
| 解析引擎单测: 用 `你好.txt` 跑准确率 | REQ-IMP-09 | 验收测试 | TC-IMPORT-008 | 待自动化（M-IMPORT-0） |
| Properties: P-IMPORT-01 | REQ-PT-IMP-01 | 属性测试 | PT-IMPORT-01 | 待自动化（M-IMPORT-0） |
| Properties: P-IMPORT-02 | REQ-PT-IMP-02 | 属性测试 | PT-IMPORT-02 | 待自动化（M-IMPORT-0） |
| Properties: P-IMPORT-03 | REQ-PT-IMP-03 | 属性测试 | PT-IMPORT-03 | 待自动化（M-IMPORT-1） |
| Properties: P-IMPORT-04 | REQ-PT-IMP-04 | 属性测试 | PT-IMPORT-04 | 待自动化（M-IMPORT-1） |

一致性保障: 用例 ID 与本矩阵逐字一致；解析引擎单测（M-IMPORT-0）先于端点（M-IMPORT-1）落地，先用 `你好.txt` 验证可解析率再接 UI。

---

## 第 8 部分: 非功能性需求

| 类别 | 具体要求 | 验证方法 |
|------|----------|----------|
| 准确率 | 解析引擎对 `你好.txt` 语料的**单子级可解析率**（ok 行占比）首版目标 ≥ 80%（必填字段无需人工补的比例） | TC-IMPORT-008 跑全量统计，数值记入 checklist |
| 安全 | `SERVICE_ROLE_KEY` 不进 `src/`；导入端点仅 admin 可写 | `grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；CT-IMPORT-001 |
| 性能 | 单次导入预览解析 ≤ 200 条文本块时端到端 < 2s（BFF 纯函数，无外部 IO） | 构造 200 块 fixture 计时，记入 checklist |
| 可用性 | `/admin/import` 在 375px 视口可用；预览表红格与勾选键盘可达 | checklist 人工门（同 SPEC-001 §4 移动端门） |
| 可靠性 | 解析异常块不导致整批失败（单块 issue 隔离）；BFF 未捕获异常统一 `INTERNAL` 不泄露堆栈 | 代码走查 + 注入异常 smoke |

---

## 第 9 部分: 假设、约束与变更日志

**假设:**
- 管理员粘贴的文本形态与 `你好.txt` 同构（家教网抓取，自由格式、标签多变）；规则覆盖主流格式，长尾格式靠预览标红交人工。
- `你好.txt` 作为规范语料 fixture 保留于仓库根，实施时复制为 `bff/tests/fixtures/hello.txt` 用于单测。
- 解析规则（尤其区县手工映射表）随业务迭代，变更走决策后升版本。

**约束:**
- 路径前缀 `/api/v1/`、响应外壳、错误码字典、枚举成员一律沿用 SPEC-001，**不得偏离**。
- 不新增数据库列；导入写入复用 `gigs` 表与单条 `POST /gigs` 校验路径。
- 解析引擎只在 BFF 服务端，前端不内联解析逻辑。
- v1 范围（决策 008）：纯文本粘贴 / 规则正则 / 预览确认入库 / 全链路。**不做** LLM 解析、CSV/Excel 列导入、全自动入库、微信号自动提取。
- 设计令牌与组件风格沿用 SPEC-001 的 BA 蔚蓝档案体系（素材库只读）。

**变更日志（以 Git 提交记录为准）:**

| 日期 | 版本 | 变更说明 | 关联 Commit |
|------|------|----------|-------------|
| 2026-08-30 | v0.1.0 | 初始版本: 模块级三件套（spec/tasks/checklist），对齐决策 008 | （仓库尚无提交） |
| 2026-08-30 | v0.1.1 | 实施前回补（执行计划评审发现）：① 必填集合补 `requirements`（与 SPEC-001 §5.2、GigForm 客户端校验、gigs 非空 CHECK 三层对齐，杜绝「预览 ok 提交必失败」契约破口）；② `FieldIssue` 形状 `message`→`reason`（对齐既有错误响应 `details` 约定）；③ `subject` 归一算法细化（纯缩写展开 / 全称保留 / 长尾实义值原样 / 「一个…一个」模糊），保证 TC-IMPORT-008 可解析率 ≥80% 可达成；④ `hourly_rate` 抽取补「左右」与 `/h`、明示按次/天/月→null；⑤ 鉴权命名对齐 `requireAdmin`；⑥ 去重键剥装饰前缀（emoji/`#注释`/「推」/日期）与 `号家教` 尾随数字，`260827001号4家教` 与 `260827001` 显式不合并；⑦ 年级词支持 `准X` 无「年级」后缀简写（`准五`→primary） | （待提交） |
| 2026-08-30 | v0.1.2 | 实施验证回补：① 标题行形态明确为「长沙家教/家教网/`号\d{0,2}家教`/裸编号」，排除含「家教」的聊天噪声行；② 通告行（行首剥装饰后为 `#`）跳过；③ 标签分隔符支持逗号（`教员要求，…`）；④ 年级规则补 `X升X/X进X`、`小学生/初中生/高中生`、`大学一年级` 优先级与来源顺序（学员情况→年级科目→学员地址）；⑤ 可解析率实测 90.8%（196 块/178 ok，见 checklist TC-IMPORT-008） | （待提交） |
| 2026-08-30 | v0.1.3 | 用户对齐颗粒度 B（解析增强）：① 短标签白名单【地址】→region、【科目】→subject、【时间】→schedule、【要求】→requirements、【报酬】/【薪资】→rate+时薪（方括号标签可直接接值，无需分隔符）；② 切分丢弃首个标题前的无标签噪声行（聊天/广告，不再单独成块）；③ 区县值内词兜底（`长沙市开福区…`→kaifu）；④ 时薪识别 `每(次\|天\|周\|月)…元` 句式→null（按次/天计费）。用户三例回归：例 1/例 3 ok，例 2 恢复 region/subject/requirements/schedule/rate（仅 grade 原文缺失需人工） | （待提交） |
| 2026-08-30 | v0.1.4 | 用户对齐颗粒度 G2（无标签块特征分派）：① `#` 行剥 `#` 保留为正文行（余文含标题形态的通告行仍跳过），内容行可参与分派；② `student_info` 兜底改「含年级/性别词的行优先」；③ 无标签块行级特征分派（rate>subject>region>schedule>requirements，规则表见 §5.4），有标签块不启用；④ 用户无标签块示例（10034644）全字段自动解析 status=ok；语料可解析率 90.8%→91.3%（196 块/179 ok）；BFF 134 用例全绿 | （待提交） |
