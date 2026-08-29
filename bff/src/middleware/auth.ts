import type { Context, Next } from 'hono';
import type { Bindings } from '../env';

// from: CourseCore bff/src/middleware/auth.ts（移植）
// 移植说明：
//   1) token 验证抽成纯函数 authenticateToken(env, token)，供 verifyAuth 与 adminAuth 共用；
//   2) 原文件的 requireRole('admin') 已刻意不移植——它检查 auth.users 自带 role
//      （默认 'authenticated'），拦不住普通用户（教训 L-001）。管理员判定统一走
//      middleware/adminAuth.ts 的 requireAdmin：服务端查 profiles.role。

export interface AuthedUser {
  id: string;
  email?: string;
}

export type AuthedContext = Context<{ Bindings: Bindings; Variables: { user: AuthedUser } }>;

// 验证 Supabase JWT，成功返回用户，失败返回 null（网络层细节不外泄）
export async function authenticateToken(env: Bindings, token: string): Promise<AuthedUser | null> {
  const sbUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const userData = (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
  if (!userData?.id) return null;
  return { id: userData.id, email: userData.email };
}

export async function verifyAuth(c: AuthedContext, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHENTICATED' }, 401);
  }

  const user = await authenticateToken(c.env, authHeader.slice(7));
  if (!user) {
    return c.json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' }, 401);
  }

  c.set('user', user);
  await next();
}

export function optionalAuth(c: AuthedContext, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifyAuth(c, next);
  }
  c.set('user', { id: '' });
  return next();
}
