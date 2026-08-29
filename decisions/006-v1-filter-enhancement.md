# v1 · 筛选增强（2026-08-30）

- 状态：活跃
- 关键词：筛选、district、hourly_rate、价格档、排序、chip、spec-v0.4.0
- 相关模块：前端、数据层、后端

## 摘要

用户在 BA 换皮（决策 005）后提出增强列表筛选：区域、价格及其他。经三轮对齐确认：

| 决策点 | 结论 |
|---|---|
| 区域 | 新增 `district` 枚举列（望城/开福/岳麓/芙蓉/天心/雨花/长沙县/其他），`region` 原文保留为「详细地点」展示——实测存量 117 条 region 是「区县·小区」两级格式，直接枚举化会丢小区信息（迁移 0003） |
| 存量清洗 | district 按 region 前缀解析；无前缀 8 条逐小区核实归属（北部湾→望城、汉唐·翰林府→岳麓、观沙岭→岳麓、君康家园→岳麓、火车站→芙蓉、润和星河玥→雨花、保利天汇→雨花、长郡外国语→天心）；hourly_rate 宽松正则解析（区间取均值），未命中置 NULL |
| 价格 | 新增 `hourly_rate INT`（元/小时，可空）；筛选按档位左开右闭（≤50/(50,80]/(80,120]/(120,200]/(200,∞)），NULL 不命中；rate 文本保留展示 |
| 价格口径 | 发布表单改「时薪数字 + 面议开关」，提交时 rate 自动生成「N元/小时」，面议为 null |
| 其他筛选 | 学员性别（student_gender 枚举已有，unknown 不可筛）、科目热门 chips（保留自定义输入）、排序（newest 缺省 / rate_desc 时薪降序 NULL 殿后） |
| UI | 区域/科目/年级 BA chip 横排点选（单选再点取消）；模式/时薪/性别/排序收进「更多筛选」展开区；激活筛选计数徽标 |
| 不做 | 关键字搜索（本轮未选）、多选筛选、时段筛选 |

## 契约变更（spec v0.4.0）

- GET /gigs 新增 query：`district`（8 枚举）、`price`（5 档）、`student_gender`（male|female）、`sort`（newest|rate_desc）；非法取值 422。
- Gig/GigCreate/GigUpdate 新增 `district`（创建必填）、`hourly_rate`（可空整数 0..10000）。
- BFF：PostgREST 客户端支持同列多条件（gte+lte，价格区间）；rate_desc 用 `hourly_rate.desc.nullslast`。

## 验证

typecheck 0 错；前端 29/29、BFF 45/45；build + build:bff 成功；SERVICE_ROLE 门禁零匹配；drift_lite 通过。迁移 0003 由用户在 Supabase Dashboard 执行（执行环境同 0001/0002），随后验证回填与部署。
