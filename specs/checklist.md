# SPEC-001 验收清单

> 使用规则：每条通过打勾并附证据（测试 ID / 实测数值 / 截图说明）；有任一条未过，SPEC-001 不得标「已实现」。条目与 `spec.md` 覆盖矩阵、`tasks.md` 里程碑对应。

## 1. 功能验收（对应 Gherkin 场景）

- [ ] TC-VIEW-001 默认列表只含 open 单子，`meta.total` 正确，`created_at desc, id desc` 排序（REQ-VIEW-01）
- [ ] TC-VIEW-002 grade_level + mode + subject 组合筛选结果正确（REQ-VIEW-02）
- [ ] TC-VIEW-003 首页空态文案「暂时没有新单子，过几天再来看看」，无骨架屏无错误提示（REQ-VIEW-03）
- [ ] TC-VIEW-004 联系弹层回退链（v0.3）：单子专属微信 → 发布者 wxid/二维码 → site_config 兜底，复制按钮生效（REQ-VIEW-04，M6 按三级回退更新用例）
- [ ] TC-VIEW-005 matched/closed 详情页徽标 + 联系按钮禁用（REQ-VIEW-05）
- [ ] TC-VIEW-006 不存在的单子返回 404 页面文案，接口 code 为 GIG_NOT_FOUND（REQ-VIEW-06）
- [ ] TC-VIEW-007 弹层三级回退组合（contact_wxid × 发布者 wxid × 发布者 qr）逐项符合 P-GIG-04（REQ-VIEW-07）
- [ ] TC-ACCT-001 用户中心查看/修改/置空自己 wxid 均 200 且 GET 立即反映（REQ-ACCT-01）
- [ ] TC-ACCT-002 用户中心非法资料（41 字 wxid、非 https qr URL）422 且 details 指向字段（REQ-ACCT-02）
- [ ] TC-ACCT-003 用户中心匿名 401、free 用户 403（REQ-ACCT-03）
- [ ] CT-GIG-003 GET /gigs/:id 响应含 publisher_contact（发布者 wxid/qr，未设置为 null），列表响应不含该字段（REQ-CT-03）
- [ ] TC-ADMIN-001 发布成功 201，status=open，published_by 正确（REQ-ADMIN-01）
- [ ] TC-ADMIN-002 缺 region（无论 mode）拒绝 422，details 含 region（REQ-ADMIN-02）
- [ ] TC-ADMIN-003 非法字段（空标题/61 字标题/2001 字要求/非法枚举/空 student_info/非法 student_gender）均 422（REQ-ADMIN-03）
- [ ] TC-ADMIN-004 状态流转 open→matched→closed→open 全部 200（REQ-ADMIN-04）
- [ ] TC-ADMIN-005 同值重申 200 且 updated_at 不变；closed→matched 返回 422 GIG_INVALID_TRANSITION（REQ-ADMIN-05）
- [ ] TC-ADMIN-006 删除 204 且详情转 404（REQ-ADMIN-07）
- [ ] CT-ADMIN-001 未登录写端点 401、free 用户 403，且无数据变更（REQ-ADMIN-06）

## 2. API 契约门（对照 specs/openapi.yaml）

- [ ] CT-GIG-001 GET /gigs 响应形状 `{data, meta:{page,pageSize,total}}` 与示例一致（REQ-CT-01）
- [ ] 所有错误响应形状 `{error, code, detail?}`，错误码逐字命中 spec §6 字典
- [ ] 分页参数 `page/pageSize` 生效：默认 20、上限 100、page<1 归 1
- [ ] status 查询参数 open/matched/closed/all 生效，非法值 422
- [ ] PATCH site-config 后 GET 立即反映新值（gigs 列表边缘缓存 TTL 不影响 site-config）
- [ ] PATCH me 后 GET 立即反映新值；置空 wxid（显式 null）后弹层回退链按空值处理

## 3. UI 质量门（反 slop）

- [ ] 色板/字体/间距/圆角/阴影全部来自 `src/styles/tokens.css`（溯源素材库 theme/），代码中零任意 hex
- [ ] 移植组件动画与素材库逐字一致，来源注释头齐全
- [ ] 全部交互元素具备 default/hover/active/focus/disabled 五态
- [ ] 列表/详情/管理端均有加载态（骨架屏）、空态、错误态（toast 或内联 + 重试）
- [ ] 删除等破坏性操作有二次确认弹层，非 alert()
- [ ] 图标单一来源 lucide-react
- [ ] 动效克制：仅弹层/列表过渡，无装饰性满屏动画

## 4. 移动端 / 微信 H5 门

- [ ] 375px 视口无横向滚动；底部 Tab 不与 iOS Home 指示条重叠（safe-area）
- [ ] `100dvh` 布局：微信内置浏览器地址栏收展不产生空白或遮挡
- [ ] 微信内置浏览器内长按可识别联系弹层中的二维码（iOS + Android 真机各一台）
- [ ] 全部交互键盘可达，focus 环可见
- [ ] 默认分享链接可用（不依赖 JS-SDK）

## 5. 非功能性需求门（数值记入本清单）

- [ ] Lighthouse 移动端（Slow 4G）：Performance ≥ 90、Accessibility ≥ 90，实测值：P=____ A=____
- [ ] `GET /api/v1/gigs` 连续 20 次请求 P95 = ____ ms（< 300ms）
- [ ] `grep -rn "SERVICE_ROLE_KEY" src/` 零匹配
- [ ] CT-GIG-002：线上第 121 次请求返回 429 且 `Retry-After: 60`（需绑定 RATE_LIMIT_KV）
- [ ] 注入异常 smoke：5xx 返回 `{error: "Internal Server Error", code: "INTERNAL"}`，无堆栈泄露

## 6. 上线门

- [ ] Cloudflare Secrets 注入 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY；KV RATE_LIMIT_KV 已绑定
- [ ] 线上 `/api/v1/healthz` 返回 200
- [ ] 线上冒烟：TC-VIEW-001 / TC-VIEW-004 通过（真实扫码加微信可达管理员）
- [ ] 用户中心手工验收：登录 → 上传自己的二维码 + 填 wxid → 发布测试单 → 详情弹层展示发布者资料 → 退出登录回到登录页（M6）
- [ ] 存量数据订正核对：117 条 offline 单改 online 前后行数一致（T-M6-5，执行前需用户明确同意）
- [ ] spec.md 状态改「已实现」；BACKLOG 闭环项清除并写 decisions；AGENTS.md 踩坑教训回填
