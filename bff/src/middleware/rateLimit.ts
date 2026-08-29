import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';

// from: CourseCore bff/src/middleware/rateLimit.ts（逐字移植）
// 基于 Workers KV 的滑动窗口限流（按客户端 IP）。
// 若未绑定 RATE_LIMIT_KV 则优雅降级（不过滤），由 Cloudflare 边缘 WAF 兜底。
export function rateLimit(opts: { limit: number; windowSec: number }): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const kv = c.env.RATE_LIMIT_KV;
    if (!kv) return next();

    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const bucket = Math.floor(Date.now() / 1000 / opts.windowSec);
    const key = `rl:${ip}:${bucket}`;

    const current = parseInt((await kv.get(key)) || '0', 10);
    if (current >= opts.limit) {
      return c.json(
        { error: 'Too many requests', code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(opts.windowSec) },
      );
    }

    await kv.put(key, String(current + 1), { expirationTtl: opts.windowSec + 5 });
    c.header('X-RateLimit-Limit', String(opts.limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.limit - current - 1)));
    return next();
  };
}
