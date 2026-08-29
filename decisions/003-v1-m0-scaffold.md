# v1 · M0 前端脚手架落地（2026-08-29）

- 状态：活跃
- 关键词：脚手架、m0、react、tailwind-v4、令牌移植、闭环排期#002
- 相关模块：前端、工作区

## 摘要

**闭环：排期清单 #002**（前端脚手架）。按 SPEC-001 tasks.md M0 完成四项任务：

1. 工程栈：React 19 + TypeScript + Vite 6 + Tailwind CSS v4（@tailwindcss/vite）+ react-router v7 + TanStack Query v5 + supabase-js + lucide-react + Vitest 3；scripts：dev/build/preview/typecheck/test。
2. 路由骨架七条路径就位（/、/gigs/:id、/admin、/admin/gigs/new、/admin/gigs/:id/edit、/admin/settings、404），页面为占位组件。
3. 令牌移植：素材库唯一令牌源 `theme/grad-theme.css` 逐字移植至 `src/styles/tokens.css`（字体文件拷至 public/fonts 并改写 @font-face 路径；body overflow 与 Electron app-region 两处适配已在文件头注明理由）；`main.css` 用 Tailwind @theme inline 映射全部令牌，业务代码禁止自创色值。
4. 客户端地基：`src/services/types.ts`（枚举逐字对齐 spec §1）、`src/lib/supabase.ts`（anon key，未配置时优雅置 null）、`src/services/api.ts`（{data}/{data,meta} 外壳 + {error,code,detail?} 解析 + Bearer 注入）。

验证证据：`npm run typecheck` 0 错；`npm run test` 3/3 通过；`npm run build` 成功（gzip JS 83.44 kB）；`grep -rn "SERVICE_ROLE_KEY" src/` 零匹配；drift_lite `ok=true`。

注意事项：index.html `<title>` 暂用「CS_tutoring · 家教单」，产品名/品牌未定，M3 前需用户确认。（2026-08-29 更新：用户确认平台名为 CS_tutoring，title 已改为「CS_tutoring」，此待定项关闭。）
