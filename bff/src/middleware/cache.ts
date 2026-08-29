import type { MiddlewareHandler } from 'hono';

// from: CourseCore bff/src/middleware/cache.ts（逐字移植）
// 基于 Cloudflare Cache API 的边缘缓存。
// 仅缓存 GET 且状态码 200 的响应；命中返回 X-Cache: HIT，未命中 MISS。
// 带 Authorization 的请求不缓存（管理员列表必须实时）。
export function cacheMiddleware(opts: { ttl: number; staleWhileRevalidate?: number }): MiddlewareHandler {
  const swr = opts.staleWhileRevalidate ?? opts.ttl * 2;
  return async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) return next();

    const cache = caches.default;
    const req = new Request(c.req.url, c.req.raw);
    const cached = await cache.match(req);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    await next();

    const resp = c.res;
    if (resp.status === 200) {
      // 关键：克隆整个 Response（含 body 流）供缓存写入，c.res 保持原流不被消费。
      const toCache = resp.clone();
      const headers = new Headers(toCache.headers);
      headers.set('Cache-Control', `public, max-age=${opts.ttl}, stale-while-revalidate=${swr}`);
      headers.set('X-Cache', 'MISS');
      const cachedResp = new Response(toCache.body, { status: resp.status, headers });
      c.executionCtx?.waitUntil?.(cache.put(req, cachedResp));
    }
  };
}
