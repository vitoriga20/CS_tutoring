// 管理员鉴权（spec §5.4，教训 L-001 的落地）：
// authenticateToken 验 JWT → 服务端查 profiles.role → 'admin' 放行，否则 401/403。
// 注意：失败路径必须直接 return 响应，不能依赖内层中间件的返回值（会吞掉 401）。
import type { MiddlewareHandler, Next } from 'hono';
import type { Bindings } from '../env';
import { authenticateToken } from './auth';
import { getProfileRole } from '../lib/db';

export function requireAdmin(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: { user: { id: string } };
}> {
  return async (c, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHENTICATED' }, 401);
    }
    const user = await authenticateToken(c.env, authHeader.slice(7));
    if (!user) {
      return c.json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' }, 401);
    }
    const role = await getProfileRole(c.env, user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403);
    }
    c.set('user', user);
    await next();
  };
}
