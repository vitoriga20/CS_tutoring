import type { MiddlewareHandler } from 'hono';

// from: CourseCore bff/src/middleware/security.ts（逐字移植）
// 给所有响应附加安全响应头。
// 这是 JSON API，没有页面渲染，因此 CSP 可以非常严格（default-src 'none'）。
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    await next();
  };
}
