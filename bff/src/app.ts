import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Bindings } from './env';
import { securityHeaders } from './middleware/security';
import { cacheMiddleware } from './middleware/cache';
import { rateLimit } from './middleware/rateLimit';
import { health } from './routes/health';
import { gigs } from './routes/gigs';
import { siteConfig } from './routes/site_config';

// from: CourseCore bff/src/app.ts（移植）
// 共享 Hono app：同时供两种部署形态复用
//   - Cloudflare Workers：bff/src/index.ts 直接 export default app
//   - Cloudflare Pages Functions：functions/api/[[route]].js 用 handle(app) 包裹
// 移植差异：路由换成 health/gigs/site-config；缓存 TTL 换 GIGS_CACHE_TTL（默认 60，
// gigs 列表新鲜度优先）；cors allowMethods 新增 PATCH/DELETE（本 API 有写方法）。
const app = new Hono<{ Bindings: Bindings }>();

// 1) 全局安全头（JSON API 可用极严格 CSP）
app.use('*', securityHeaders());

// 2) CORS：独立 Worker 跨域部署下必需；同域 Pages 部署下无害，浏览器忽略多余头
app.use(
  '/api/*',
  cors({
    origin: '*', // 生产可收紧为具体域名
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// 3) 限流（依赖 KV，未绑定则优雅降级，由边缘 WAF 兜底）
app.use('/api/v1/*', rateLimit({ limit: 120, windowSec: 60 }));

// 4) 边缘缓存（只读 GET、无 Authorization；TTL 取 GIGS_CACHE_TTL，默认 60s）
app.use('/api/v1/*', async (c, next) => {
  const ttl = parseInt(c.env.GIGS_CACHE_TTL || '60', 10) || 60;
  return cacheMiddleware({ ttl })(c, next);
});

// 5) 路由
app.route('/api/v1', health);
app.route('/api/v1/gigs', gigs);
app.route('/api/v1/site-config', siteConfig);

// 兜底 404
app.notFound((c) => c.json({ error: 'Not Found', code: 'NOT_FOUND' }, 404));

// 兜底错误：HTTPException（如 GIG_INVALID_TRANSITION）按自带响应返回，其余统一 500
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error('[bff] unhandled', err);
  return c.json({ error: 'Internal Server Error', code: 'INTERNAL' }, 500);
});

export { app };
