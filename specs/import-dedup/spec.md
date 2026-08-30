# SPEC-003: 导入时疑似重复确认（宽松匹配 + 人工裁决）

> **规范状态:** 已实现（2026-08-30 v0.2.1 自动化验收全绿：BFF 用例、前端用例见 checklist；真机冒烟/375px 人工门待用户，见 checklist §6）
> **版本:** v0.2.1
> **负责人:** PO/TL/QA: 用户（单人项目）
> **代码包路径:** `bff/src/lib/dedupMatcher.ts`（匹配器纯函数，新增）、`bff/src/routes/import.ts`（preview 集成，修改）、`bff/src/lib/db.ts`（新增 `listOpenGigsForDedup`）、`src/pages/admin/AdminImportPage.tsx`（预览表 + 弹窗，修改）；数据层零变更（`gigs` 表不加列、不加表）
> **最后修改:** 2026-08-30
> **可执行性声明:** 本规范中的 Gherkin 场景是验收测试用例来源；接口契约与 `specs/openapi.yaml` 同源（本规范 §3 定义、实施时回写 openapi.yaml）；匹配器为纯函数，附 Properties 供属性测试作 oracle。
> **关联规范:** SPEC-001 v0.5.0（数据模型/鉴权/错误码唯一出处）、SPEC-002 v0.1.4（导入链路宿主，`specs/gig-import/spec.md`）。
> **关联对齐:** 2026-08-30 用户对齐颗粒度（8 项结论，全文记录于 §9 变更日志；沿用决策 008 的四问对齐方法）。

---

## 第 0 部分: 元数据与 CI 门禁

- 本规范是 SPEC-001 的**模块级补充规范**（第三个，前两个为 SPEC-002 批量导入）；数据模型、鉴权、错误码字典、枚举成员一律沿用 SPEC-001，本文只定义「导入时疑似重复确认」增量。
- 本规范**依赖 SPEC-002 已实现**的导入链路（preview 端点、预览表、勾选导入）；`GigImportRow` 扩展为向后兼容追加（`suspect` 可空，旧消费方忽略无碍）。
- CI 门禁（与 SPEC-001/002 同源，实施时同轮执行）：
  - `cd bff && npm run typecheck && npm run test`（匹配器单测 + preview 路由测试）
  - `npm run typecheck && npm run test && npm run build`（前端）
  - `grep -rn "SERVICE_ROLE_KEY" src/` 必须零匹配
  - `powershell -NoProfile -File tools/path_align_hooks/drift_lite.ps1` 必须 `ok=true`（契约变更需回写 openapi.yaml）

---

## 第 1 部分: 术语表与统一语言

| 术语 | 英文名 | 类型 | 定义 | 代码映射 | 数据库映射 | 示例 |
|---|---|---|---|---|---|---|
| 重复行 | DuplicateRow | 值对象 | **批次内**同去重键的后出行（SPEC-002 既有概念，本规范不改动）：置灰不可勾 | `GigImportRow.duplicate=true` | — | 同一次粘贴里 `10034617` 出现 2 次，后者为重复行 |
| 疑似重复单子 | ImportSuspect | 值对象 | **本批幸存行 vs 库中 open 单子**宽松匹配命中：命中 6 项信号池 ≥4 项，或标题编号硬信号命中；一次匹配只指向**一条**最像的库中单子 | `GigImportRow.suspect`（可空） | 不入库（运行时类型） | `{gig: {id: 'G1', …}, score: 5, hard: false, matched: ['grade_level','subject','district','hourly_rate','student_gender']}` |
| 信号池 | MatchSignal | 值对象 | 6 项固定比对信号：年级/科目集合/区县/时薪/学员性别/地址归一（§5.1 唯一出处） | `dedupMatcher.ts` | — | `grade_level` 命中计 1 分 |
| 命中数 | MatchScore | 值对象 | 一行与某条库中单子命中的信号数，0..6 | `ImportSuspect.score` | — | 5/6 |
| 硬信号 | TitleNoHardMatch | 值对象 | 双方标题编号均提取非空且相同 → 无条件疑似（不经阈值） | `ImportSuspect.hard=true` | — | 标题均含 `10034639` |
| 候选 | SuspectCandidate | 值对象 | 满足 `hard=true 或 score≥4` 的库中单子 | 匹配器内部 | — | score 4、5 的两条 open 单子 |
| 裁决 | SuspectDecision | 实体 | 管理员对疑似行的四态决策：`pending`（未裁决）/ `confirmed`（确认重复，不导入）/ `dismissed`（误判，照常导入）/ `reimport`（确认重复但本批信息已更新，**更新旧单内容**）；前三种为**前端会话态**不回传，`reimport` 随提交回传（目标旧单 id + 新内容） | `AdminImportPage` 组件状态 | 不入库（`reimport` 经 commit `updates` 生效） | pending → reimport |
| 对比弹窗 | SuspectDialog | 值对象 | 并排展示本行与库中单子全字段 + 命中数 + **三按钮**裁决入口 | 前端组件 | — | 「完全重复」/「不重复」/「更新单子」 |

一致性保障: 枚举（GradeLevel / LessonMode / District / StudentGender / GigStatus）成员与顺序以 SPEC-001 §1 为唯一出处；本规范「重复行」定义与 SPEC-002 P-IMPORT-01 逐字一致，不重新定义。

---

## 第 2 部分: 用户故事与验收场景（Gherkin）

```gherkin
功能: 导入时疑似重复确认
  作为管理员
  我想要批量导入时自动把粘贴的单子与库中在招单子宽松比对
  并逐条人工裁决疑似重复的单子
  以免同一个单子重复发布

  背景:
    假设 已登录且 profiles.role 为 "admin"（携带有效 JWT）
    且 预览响应中的行称为 GigImportRow（SPEC-002 §3.1）

  场景: 宽松匹配标记疑似重复
    假设 库中存在 open 单子 G1（初二、数学·物理·化学、yuelu、70元/小时、female、岳麓区梅溪湖壹号）
    且 粘贴文本解析出 1 行（初二、数学·物理·化学、yuelu、75元/小时、female、岳麓区观沙岭）
    当 管理员点击「解析」
    那么 该行 suspect 非空
    且 suspect.score 为 5 且 matched 含年级/科目/区县/时薪/性别
    且 suspect.gig.id 为 G1 的 id
    且 该行在预览表中默认不勾选

  场景: 编号硬信号（字段全变也可命中）
    假设 库中存在 open 单子 G2，标题含编号 "10034639"，其余字段与本批某行全部不同
    且 本批该行标题含编号 "10034639"
    当 管理员解析
    那么 该行 suspect 非空 且 suspect.hard 为 true

  场景: 低于阈值不疑似
    假设 本批某行与库中所有 open 单子的命中数均 ≤ 3 且编号硬信号未命中
    当 管理员解析
    那么 该行 suspect 为 null（正常行，默认勾选）

  场景: 只比对 status=open
    假设 库中存在 closed 单子 G3 与本批某行 6 项信号全命中且编号相同
    当 管理员解析
    那么 该行 suspect 为 null

  场景: 逐个自动弹窗裁决
    假设 解析返回 2 行 suspect 非空（按 index 升序为 R1、R2）
    那么 解析完成后自动弹出 R1 的对比弹窗
    当 管理员点击「完全重复」
    那么 R1 置灰不可勾选且排除出导入集合
    且 自动弹出 R2 的对比弹窗
    当 管理员点击「不重复」
    那么 R2 自动勾选且恢复可编辑（等同普通 ok 行，随 rows 插入）
    且 「导入选中」按钮变为可用

  场景: 更新单子（信息更新，更新旧单内容）
    假设 库中存在 open 单子 G4（标题 10034639、初二、数学、70元/小时、北部湾）
    且 本批某行与 G4 疑似命中（suspect.gig.id=G4.id）且该行内容已更新（标题 10034639、初二、数学、80元/小时、北部湾、含专属微信）
    当 管理员在弹窗点击「更新单子」
    那么 该行自动勾选且不进入插入集合（不入 rows）
    且 该行显示「重复-更新旧单」标记
    且 点击「导入选中」提交
    那么 请求体含 updates: [{id: G4.id, values: 该行内容}]
    且 G4 内容更新为该行新内容（时薪 80、含专属微信），id/status/published_by 不变
    且 G4.created_at 刷新为提交时刻（列表置顶）
    且 响应 updated 含更新后的 G4，created 不含该行

  场景: 未裁决完阻断导入
    假设 存在任一 suspect 非空且裁决为 pending 的行
    那么 「导入选中」按钮禁用
    当 所有疑似行均被裁决（confirmed / dismissed / reimport）
    那么 「导入选中」按钮恢复可用

  场景: 改判
    假设 管理员已将某疑似行裁决为「不重复」（已自动勾选，将插入）
    当 管理员点击该行「查看对比」并选择「完全重复」
    那么 该行取消勾选并置灰不可勾选
    当 管理员再次打开并选择「更新单子」
    那么 该行自动勾选且标记「重复-更新旧单」（改走更新通道）

  场景: 更新不覆盖旧值
    假设 库中 open 单子 G5 的 contact_wxid 为 "wx-old"、schedule 为 "周六"
    且 本批某行与 G5 疑似，管理员选「更新单子」后提交，该行 contact_wxid/schedule 均为空
    那么 G5.contact_wxid 仍为 "wx-old"、schedule 仍为 "周六"（null 不覆盖旧值）
    且 该行非空字段（标题/科目/时薪等）已覆盖

  场景: 裁决不持久化
    假设 管理员将某疑似行裁决为「不重复」并成功导入
    当 管理员隔天粘贴同一段文本再次解析
    那么 该行再次被标记为疑似重复（需重新裁决）

  场景: 批内重复行不参与库比对
    假设 粘贴文本中同一单子出现 2 次
    那么 后出行 duplicate=true 置灰且 suspect 为 null
    且 仅幸存行参与库中比对

  场景: 提交契约扩展（rows 插入 + updates 更新）
    假设 管理员裁决完毕：R1 完全重复、R2 不重复、R3 更新单子（勾选 R2、R3）
    当 点击「导入选中」
    那么 请求体为 { rows: [R2 内容], updates: [{id: R3.suspect.gig.id, values: R3 内容}] }
    且 响应为 { created: [新单], updated: [更新后的旧单], failed: [...] }
    且 BFF 对 rows 与 updates 逐元素重新校验，failed 元素不写入
```

---

## 第 3 部分: API 接口与契约（与 openapi.yaml 同源）

> 本规范扩展两个端点的契约：① `POST /api/v1/gigs/import/preview` 的 `GigImportRow` 增加可空 `suspect` 字段（v0.1.1，不变）；② `POST /api/v1/gigs/import`（commit）请求增补 `updates`、响应增补 `updated` 与 `failed.kind`（v0.2.0，「更新单子」裁决随提交回传，把库中旧单内容更新为新行内容）。不新增端点、不新增错误码（`GIG_NOT_FOUND` 复用 SPEC-001 §6 字典，此处作元素级 failed 使用）。

### 3.1 `GigImportRow` 扩展（唯一契约变更点）

```yaml
GigImportRow:
  # 既有字段（SPEC-002 §3.1）不变: index / draft / issues / duplicate / status
  suspect:
    type: [object, 'null']
    description: 疑似重复的库中单子；仅当该行 duplicate=false 且与库中 open 单子宽松匹配命中时非空
    required: [gig, score, hard, matched]
    properties:
      gig: { $ref: '#/components/schemas/Gig' }   # 命中的库中 open 单子（完整字段，供对比弹窗展示）
      score: { type: integer, minimum: 0, maximum: 6 }  # 命中信号数
      hard: { type: boolean }                     # 编号硬信号是否命中
      matched:
        type: array
        items:
          type: string
          enum: [grade_level, subject, district, hourly_rate, student_gender, region]
```

- `suspect.gig` 为库中**单条**最像的 open 单子：候选集中取 score 最高者，同分取 `created_at` 最新者（§5.1）。
- `matched` 为命中信号名列表，长度 == `score`；`hard=true` 时 `matched` 与 `score` 按信号池如实填写（硬信号独立于分数，不占 6 项）。
- 兼容性：`suspect` 为可空追加字段，SPEC-002 既有消费方（测试/旧客户端）忽略该字段无碍。

### 3.2 preview 端点行为变更

- 请求体不变：`{ raw_text: string }`。
- 处理管线从 `parseImport(raw)` 扩展为：`parseImport(raw) → matchSuspects(rows, await db.listOpenGigsForDedup(env))`（§4.1）。
- 响应外壳与错误码不变：401 / 403 / 422 语义与 SPEC-002 §3.1 完全一致。
- **库查询失败 → 整个 preview 返回 500 INTERNAL，不静默降级为无匹配**（静默降级 = 放重复单入库，违背本规范目的；管理员重试即可）。

### 3.3 openapi.yaml 回写范围

- `GigImportRow` 增补 `suspect`；新增 `ImportSuspect` schema（`gig` 引用既有 `Gig` schema）。
- commit 请求增补 `updates: [{ id, values }]`（v0.2.0）；`GigImportCommit` 响应增补 `updated`、`failed.kind`（enum insert/update，缺省 insert）。
- 其余路径、请求体、响应结构不动；`drift_lite` 必须 `ok=true`。

### 3.4 commit 端点行为变更（v0.2.0）

- 请求体：`{ rows: GigImportDraft[], updates?: [{ id, values }] }`。`rows` 仍为插入行（「不重复」裁决）；`updates` 为「更新单子」裁决行：`id` = 该行 `suspect.gig.id`（目标库中旧单），`values` = 该行编辑后的内容。
- 校验：`rows` 与 `updates` **至少一个非空**（全空 → 422，与 SPEC-002 空 rows 语义一致）；两者均**逐元素** `validateGigInput` 权威校验（不信任前端），失败元素进 `failed` 不写入。
- 更新语义（「更新单子」= 替代旧单）：`id` 指向的库中旧单存在 → `updateGig(id, 新内容)`；**`created_at` 刷新为提交时刻**（列表置顶）；**新内容为 null 的字段不覆盖旧值**（避免误清旧单既有信息，如 contact_wxid/schedule/hourly_rate）；`id/status/published_by` 不变。
- 失败元素：`failed: [{ index, kind, code, details }]`——`kind=insert`（缺省，向后兼容）时 `index` = rows 数组下标；`kind=update` 时 `index` = updates 数组下标。目标旧单不存在 → `code=GIG_NOT_FOUND`（元素级 failed，非 404 响应）。
- 响应：`201 { data: { created: Gig[], updated: Gig[], failed: [...] } }`。

---

## 第 4 部分: 数据模型与校验规则

- **`gigs` 表零变更**：不加列、不加表、不加索引；比对数据为运行时查询。
- **运行时类型（不入库）**：`ImportSuspect`（§3.1）与裁决状态 `SuspectDecision`（前端组件状态）。

### 4.1 匹配器模块（`bff/src/lib/dedupMatcher.ts`，纯函数、无 CF 依赖、可单测）

| 函数 | 签名 | 职责 |
|---|---|---|
| 编号提取 | `extractTitleNo(title: string \| null): string \| null` | 标题中**首个 ≥6 位数字**的裸编号；无 → null。形态与 SPEC-002 `TITLE_RE` 裸编号一致 |
| 匹配 | `matchSuspects(rows: GigImportRow[], openGigs: Gig[]): GigImportRow[]` | 对每个 `duplicate=false` 的行，与全部 open 单子逐条算 6 项信号命中数与硬信号；产出候选 → 选最高分（同分取 `created_at` 最新）→ 填 `suspect`；`duplicate=true` 或无候选 → `suspect=null`。纯函数返回新数组 |
| 查询 | `db.listOpenGigsForDedup(env): Promise<Gig[]>`（`bff/src/lib/db.ts`） | `select` 匹配与展示所需字段，`where status='open'`，`order by created_at desc`；**不分页**（量级约束见 §8） |

> 匹配器只在 BFF 服务端运行（与 SPEC-002 解析引擎同一原则：规则不进前端，避免逻辑双份与规则暴露）；前端只消费 `suspect` 结果做展示与裁决。

---

## 第 5 部分: 业务规则与状态流转

### 5.1 六项信号池（「相同」的定义，规范唯一出处）

| # | 信号 | 比对对象 | 「命中」的定义 | 缺失/兜底值的处理 |
|---|---|---|---|---|
| 1 | `grade_level` | `draft.grade_level` vs `gig.grade_level` | enum 完全相同 | 任一侧 null → 不命中 |
| 2 | `subject` | `draft.subject` vs `gig.subject` | 按 `·` 拆分为集合后**集合相等**（顺序无关；「语数英」≈「数学·英语·语文」；长尾科目如长笛按同规则入集合比较） | 任一侧 null/空 → 不命中 |
| 3 | `district` | `draft.district` vs `gig.district` | enum 完全相同 | 双方均为 `other` → **不命中**（other 为兜底值，无信息量，避免大面积误报） |
| 4 | `hourly_rate` | `draft.hourly_rate` vs `gig.hourly_rate` | 双方非 null 且 `|a−b| ≤ 10`（重发常微调薪资，宽松容忍） | 任一侧 null → 不命中 |
| 5 | `student_gender` | `draft.student_gender` vs `gig.student_gender` | enum 完全相同 | 双方均为 `unknown` → **不命中**（缺省值无信息量） |
| 6 | `region` | `draft.region` vs `gig.region` | 双方归一化（去全部空白与标点 `.,，·、-－—（）()`、转小写）后**相等或互为包含** | 任一侧 null → 不命中 |

**硬信号（编号）**：`extractTitleNo(draft.title)` 与 `extractTitleNo(gig.title)` 均非空且相同 → 无条件候选（不依赖 6 项阈值）。双方任一侧无编号 → 硬信号不生效，仅走阈值。

**候选与唯一指向**：

- 候选条件：`hard=true` 或 `score≥4`。
- 一行命中多条候选时，`suspect` 只指向 **score 最高**者；同分取 `created_at` 最新者（最新单子更可能是「重发的那条」，且展示直觉）。
- 无候选 → `suspect=null`。

**阈值调优约束**：`4`（≥4 疑似）与信号池定义为本规范 v0.1.0 基线；实施后以 `你好.txt` 语料自比对（§7 TC-DEDUP-008）实测误报率，若需调整走决策后升版本，不得直接改代码常量。

### 5.2 裁决状态机（前端会话态；`reimport` 经提交回传生效）

```
疑似行初始: suspect 非空 → 裁决 = pending，勾选 = 未勾

  pending --弹窗「完全重复」--> confirmed（取消勾选 + 置灰不可勾，等同 duplicate 行视觉，不入提交）
  pending --弹窗「不重复」-----> dismissed（自动勾选 + 恢复可编辑，随 rows 插入新单）
  pending --弹窗「更新单子」---> reimport（自动勾选 + 恢复可编辑，随 updates 更新旧单内容）

  confirmed/dismissed/reimport 三者之间可经「查看对比」任意改判：
    改判为 confirmed → 取消勾选 + 置灰不可勾
    改判为 dismissed/reimport → 自动勾选（ok 行）并按各自通道提交
    dismissed ⇄ reimport 互改只换提交通道与行标记，勾选态不变

非疑似行（suspect=null）与 duplicate 行不进入该状态机，行为与 SPEC-002 完全一致。
```

- 裁决 `confirmed/dismissed` **不持久化**：不回传 BFF、不写库；下次粘贴同一文本需重新裁决（Gherkin「裁决不持久化」）。`reimport` 是唯一随提交回传的裁决（目标旧单 id + 新内容，§3.4）。
- 裁决只影响勾选态与提交通道，不影响 `issues` 红标编辑：`status=error` 的疑似行同样进入弹窗队列，裁决后仍需修正字段才能通过提交校验（两个维度独立；`reimport` 的 `values` 同样过 `validateGigInput`）。

### 5.3 前端交互规范（`/admin/import` 增量）

| 交互点 | 规则 |
|---|---|
| 预览表疑似标记 | 疑似行显示黄色「疑似重复」徽标（色值走 `src/styles/ba-tokens.css` 既有强调黄 token，禁任意 hex）；默认**不勾选**；裁决后：confirmed → 「已确认重复」、reimport → 「重复-更新旧单」、dismissed → 无标记（等同普通 ok 行） |
| 自动弹窗队列 | 预览数据到达后，若存在 `suspect≠null` 的行：按 `index` 升序自动弹出**首个 pending** 行的对比弹窗；每次裁决完成自动弹出下一个 pending；全部裁决完毕不再弹 |
| 弹窗强制选择 | 弹窗对 **pending** 行只有**三个**裁决按钮（「完全重复」/「不重复」/「更新单子」），无关闭按钮、点击遮罩不关闭——保证队列必然被逐条裁决完 |
| 已裁决行重开 | 行内常驻「查看对比」按钮；重开弹窗后可在三态间改判（状态机 §5.2），对已裁决行弹窗允许直接关闭不改变现状 |
| 「导入选中」禁用 | 存在任一 `suspect≠null` 且裁决=pending 的行 → 按钮禁用；全部裁决（confirmed/dismissed/reimport）→ 恢复可用。非疑似行的勾选逻辑不变（ok 默认勾、error 修正后人工勾） |
| 提交分流 | 勾选行按裁决分流：dismissed → `rows`（插入新单）；reimport → `updates`（`id`=该行 `suspect.gig.id`、`values`=编辑后内容）；confirmed/未裁决 → 不入提交 |
| 对比弹窗内容 | 字段逐项上下对照（上：本批行；下：库中单子，含发布时间 `created_at`）；顶部命中摘要「命中 N/6：年级、科目、区县…」，命中字段黄色高亮；375px 视口单列可用 |
| 导入结果 | `导入完成：已创建 X 条，已更新 Y 条`；failed 回填标红（kind=update 的按 updates 下标映射回预览行）、失效列表缓存——created/updated 与 failed 语义见 §3.4 |

### 第 5 部分附: Properties 行为不变量

| 性质 ID | 回链 | 量化式（oracle） | 生成器 | 自动化 |
|---------|------|------------------|--------|--------|
| P-DEDUP-01 | §5.1 阈值 | 见下 PT-DEDUP-01 | 任意 draft×openGig 组合 | PT-DEDUP-01 |
| P-DEDUP-02 | §3.2 只比 open | 见下 PT-DEDUP-02 | open/matched/closed 混合库 | PT-DEDUP-02 |
| P-DEDUP-03 | §5.2 状态机 | 见下 PT-DEDUP-03 | 任意疑似行 + 裁决序列 | PT-DEDUP-03 |
| P-DEDUP-04 | §3.4 提交分流 | 复用 SPEC-002 P-IMPORT-03（created+failed 覆盖全部输入）+ 见下 PT-DEDUP-04 | — | 既有用例回归 + PT-DEDUP-04 |
| P-DEDUP-05 | §3.4 更新合并 | 见下 PT-DEDUP-05 | 任意旧单 × 任意新内容 | PT-DEDUP-05 |

```text
P-DEDUP-01: ∀ row(非 duplicate), ∀ g ∈ openGigs:
    suspect ≠ null ⇔ ∃ g: (hard(row,g) ∨ score(row,g) ≥ 4)
  且 suspect 指向的 g 满足 ∀ g': score(g') < score(g) ∨ (score(g')==score(g) ∧ created_at(g') ≤ created_at(g))
  且 duplicate=true 的行 ⇒ suspect == null

P-DEDUP-02: ∀ gig.status ∈ {matched, closed}:
    该 gig 不出现在任何 row.suspect.gig 中（无论信号命中多少）

P-DEDUP-03: ∀ 疑似行, 任意裁决序列 s1..sn（si ∈ {confirmed, dismissed, reimport}）:
    最终勾选态 ⇔ 最终裁决 ∈ {dismissed, reimport}（且行 status=ok）
  且 存在 pending ⇔ 「导入选中」禁用
  且 裁决不改变 issues / status / 可编辑性（confirmed 只加置灰与取消勾选）

P-DEDUP-04: ∀ 提交（rows ∪ updates），created/updated/failed 覆盖全部元素（无静默丢弃）：
    failed 元素不写入（插入不插、更新不更）

P-DEDUP-05: ∀ 旧单 gig × 新内容 values（经 validateGigInput 合法）:
    更新后 old' = { ...old, ...(values 中非 null 字段), created_at = now }
  且 old'.id == old.id 且 old'.status == old.status 且 old'.published_by == old.published_by
  且 values 中 null 字段在 old' 中保持 old 值不变
```

**Correctness 变更门:** `bff/src/lib/dedupMatcher.ts` 与 `bff/src/routes/import.ts` 进入 dirty diff 时，必须跑 `PT-DEDUP-01..05`；只改文档/排版不触发。

---

## 第 6 部分: 错误处理与日志规范

- 错误码**零新增**，复用 SPEC-001 §6 字典。
- preview 库查询失败 → 500 `INTERNAL`（含 `path` 日志，完整错误；不打印请求体全文与 JWT），**禁止**降级为「无匹配的 200」。
- 匹配器异常（理论不可达的脏数据）→ 同上走 BFF 全局 `onError` 兜底，不泄露堆栈。
- 裁决为前端会话态，无对应后端错误面；前端交互错误（如弹窗队列异常）不静默吞并，控制台报错并在预览表保留行内「查看对比」入口兜底。

---

## 第 7 部分: 测试用例与需求覆盖矩阵

| 需求来源 | 需求 ID | 类型 | 测试用例 ID | 自动化状态 |
|----------|---------|------|-------------|------------|
| Gherkin: 宽松匹配标记疑似重复 | REQ-DED-01 | 验收测试 | TC-DEDUP-001 | 已自动化 |
| Gherkin: 编号硬信号 | REQ-DED-02 | 验收测试 | TC-DEDUP-002 | 已自动化 |
| Gherkin: 低于阈值不疑似 | REQ-DED-03 | 验收测试 | TC-DEDUP-003 | 已自动化 |
| Gherkin: 只比对 status=open | REQ-DED-04 | 验收测试 | TC-DEDUP-004 | 已自动化 |
| Gherkin: 逐个自动弹窗裁决（三按钮） | REQ-DED-05 | 验收测试 | TC-DEDUP-005 | 已自动化 |
| Gherkin: 未裁决完阻断导入 | REQ-DED-06 | 验收测试 | TC-DEDUP-006 | 已自动化 |
| Gherkin: 改判（三态） | REQ-DED-07 | 验收测试 | TC-DEDUP-007 | 已自动化 |
| Gherkin: 裁决不持久化 | REQ-DED-08 | 验收测试 | TC-DEDUP-008 | 已自动化 |
| Gherkin: 批内重复行不参与库比对 | REQ-DED-09 | 验收测试 | TC-DEDUP-009 | 已自动化 |
| Gherkin: 提交契约扩展（rows+updates 分流） | REQ-DED-10 | 契约测试 | CT-DEDUP-001 | 已自动化（v0.2.0 重写：insert/update 双通道） |
| Gherkin: 更新单子（更新旧单内容）（created_at 刷新/status 不变） | REQ-DED-14 | 验收测试 | TC-DEDUP-013 | 已自动化（v0.2.0） |
| Gherkin: 更新不覆盖旧值（null 不覆盖） | REQ-DED-15 | 验收测试 | TC-DEDUP-014 | 已自动化（v0.2.0） |
| 匹配器单测: 信号池逐项 + 边界 | REQ-DED-11 | 单元测试 | TC-DEDUP-010 | 已自动化 |
| 匹配器单测: 同分取 created_at 最新 | REQ-DED-12 | 单元测试 | TC-DEDUP-011 | 已自动化 |
| 语料自比对回归 | REQ-DED-13 | 验收测试 | TC-DEDUP-012 | 已自动化（见下） |
| BFF: updates 校验失败/目标不存在 → failed（kind=update） | REQ-DED-16 | 单元/契约 | TC-DEDUP-015 | 已自动化（v0.2.0） |
| Properties: P-DEDUP-01 | REQ-PT-DED-01 | 属性测试 | PT-DEDUP-01 | 已自动化 |
| Properties: P-DEDUP-02 | REQ-PT-DED-02 | 属性测试 | PT-DEDUP-02 | 已自动化 |
| Properties: P-DEDUP-03 | REQ-PT-DED-03 | 属性测试 | PT-DEDUP-03 | 已自动化（三态） |
| Properties: P-DEDUP-04 | REQ-PT-DED-04 | 属性测试 | PT-DEDUP-04 | 已自动化（v0.2.0） |
| Properties: P-DEDUP-05 | REQ-PT-DED-05 | 属性测试 | PT-DEDUP-05 | 已自动化（v0.2.0） |

**TC-DEDUP-012 语料自比对（误报率 oracle）**：`你好.txt` 解析两遍——第一遍幸存行（`duplicate=false`）映射为 openGigs（模拟库），第二遍同语料跑 `matchSuspects`。断言：第二遍所有 `duplicate=false` 行 `suspect≠null`（同源内容应全命中，含编号硬信号兜底）；同时用**打乱字段**（如随机替换 region/年级为不相关值）的对照批次断言疑似率显著低于全量，作为误报上限观测。数值记入 checklist。

一致性保障: 用例 ID 与本矩阵逐字一致；匹配器单测（M-DEDUP-0）先于路由集成（M-DEDUP-1）落地，前端交互（M-DEDUP-2）最后。

---

## 第 8 部分: 非功能性需求

| 类别 | 具体要求 | 验证方法 |
|------|----------|----------|
| 性能 | preview 全链路（解析 + 查询 + 匹配）在 200 行 × 库中 5000 条 open 单子规模下端到端 < 2s | 构造 fixture 计时，数值记入 checklist（SPEC-002 纯解析 5.2ms 基线上的增量） |
| 量级约束 | `listOpenGigsForDedup` 不分页全量拉取，前提假设库中 open 单子 < 5000 条；超出后需重新评估（预过滤方案走决策） | checklist 记录当前库量级；AGENTS.md 约束不新增 |
| 安全 | 匹配器只在 BFF 服务端；`SERVICE_ROLE_KEY` 零匹配；preview/commit 鉴权语义与 SPEC-002 一致 | `grep -rn "SERVICE_ROLE_KEY" src/`；CT-DEDUP-001 |
| 可用性 | 对比弹窗 375px 单列可读、裁决按钮键盘可达；疑似徽标满足与既有红标同对比度 | checklist 人工门（真机） |
| 可靠性 | 库查询失败不静默降级（500 而非空匹配）；单行匹配异常不影响其他行（逐行独立，异常行按无候选处理并记日志） | 注入异常 smoke + 代码走查 |

---

## 第 9 部分: 假设、约束与变更日志

**假设:**
- 同一单子重发时**标题编号常变但内容基本不变**（用户对齐结论），故信号池以内容字段为主、编号为硬信号兜底。
- `hourly_rate` 宽容 ±10、`subject` 集合相等、`region` 互包含为宽松匹配的初版基线；阈值（≥4）与信号定义随语料实测调优，**调整必须走决策后升版本**，不得改代码常量了事。
- open 单子量级 < 5000（§8），全量拉取内存比对可行。
- 管理员裁决可信度高于自动匹配：本规范目标是「宁可误报让人看一眼，不可漏报放重复单入库」，故阈值取 4/6 偏召回，误报成本由强制弹窗承担。

**约束:**
- 不新增数据库列/表/索引；不新增端点与错误码；commit 契约只做向后兼容扩展（请求增 `updates`、响应增 `updated`/`failed.kind`，既有 `rows` 语义不变）。
- 匹配器与解析引擎同在 BFF 服务端，前端不内联匹配逻辑。
- `GigImportRow` 只做向后兼容追加（可空 `suspect`），SPEC-002 既有测试与语义零回归。
- 设计令牌沿用 BA 蔚蓝档案体系（`src/styles/ba-tokens.css` 既有黄 token），素材库只读。
- 裁决 `confirmed/dismissed` 为前端会话态：不落库、不回传；`reimport` 是唯一随提交回传的裁决（目标旧单 id + 新内容，§3.4）。v1 不做「已裁决单子指纹持久化」（同文本下次仍需裁决，属有意行为）。

**变更日志（以 Git 提交记录为准）:**

| 日期 | 版本 | 变更说明 | 关联 Commit |
|------|------|----------|-------------|
| 2026-08-30 | v0.1.0 | 初始版本（用户对齐颗粒度 8 项结论落稿）：① 匹配信号 = 关键字段组合 + 编号硬信号；② 阈值 ≥4/6；③ 只比 status=open；④ 疑似行默认不勾；⑤ 解析后自动逐个弹窗、展示最像一条（含命中数）；⑥ 误判决后自动勾选；⑦ 确认重复后置灰不可勾；⑧ 未裁决完「导入选中」禁用。附带两个默认（对齐时明示）：编辑不重算（疑似以解析时为准）、裁决不持久化。三件套建 `specs/import-dedup/` | （待提交） |
| 2026-08-30 | v0.1.1 | 一致性修订 + 实施完成：①「宽松匹配标记疑似重复」场景行地址改为「岳麓区观沙岭」（同区不同址、区县仍 yuelu），使 score=5 与 §5.1 信号池自洽（原稿双方地址相同按信号池应命中 6/6）；② M-DEDUP-0..3 全部实施完成：匹配器（`bff/src/lib/dedupMatcher.ts`）+ preview 集成（库查询失败 500 不降级）+ 前端交互（徽标/默认不勾/对比弹窗/自动队列/导入禁用）+ openapi v0.6.0 回写；自动化验收全绿（BFF 188 用例、前端 43 用例）；NFR 匹配器 200×5000 = 946.3ms < 2s；TC-DEDUP-012 语料实测全量疑似率 100.0%、打乱 0.0%；真机冒烟/375px 人工门待用户 | （待提交） |
| 2026-08-30 | v0.2.0 | 用户验收新增「重复导入」第三裁决（对齐结论，decisions/010）：弹窗三按钮（重复不导入 / 不重复 / 重复导入）；「重复导入」= 承认与库中旧单重复但本批信息已更新 → 不插入新单，提交时经 commit 新增 `updates: [{id, values}]` 把旧单内容更新为新行内容（created_at 刷新置顶、null 字段不覆盖旧值、id/status/published_by 不变）；响应增 `updated`、`failed.kind`。交互保持 v0.1.1 自动弹窗队列 + 行内「查看对比」改判（用户确认无需前后浏览/末尾确认，误触可由查看对比撤销）。openapi v0.7.0 回写；自动化验收全绿（BFF/前端用例数见 checklist）；真机冒烟/375px 人工门待用户 | （待提交） |
| 2026-08-30 | v0.2.1 | 按钮文案调整（用户指示）：三裁决按钮改名——「重复不导入」→「完全重复」、「重复导入」→「更新单子」（「不重复」不变）；行为与契约零变更，仅 UI 文案与 spec/checklist 按钮名引用同步 | （待提交） |
