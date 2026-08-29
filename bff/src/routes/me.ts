import { Hono } from 'hono';
import type { Bindings } from '../env';
import { validateProfilePatch } from '../lib/validators';
import * as db from '../lib/db';
import { requireAdmin } from '../middleware/adminAuth';

// 用户中心资料路由（契约：specs/openapi.yaml /api/v1/me；spec.md §2.3）
// 仅 admin 可用（用户拍板 2026-08-29）；写入只落到自己的 profiles 行。
type AppEnv = { Bindings: Bindings; Variables: { user: { id: string; email?: string } } };

export const me = new Hono<AppEnv>();

// GET /api/v1/me — 当前账号资料（admin）
me.get('/', requireAdmin(), async (c) => {
  const row = await db.getProfile(c.env, c.get('user').id);
  if (!row) {
    // requireAdmin 已确认 profiles.role='admin'，走到这里说明行被并发删除；按契约错误返回
    return c.json({ error: 'Internal Server Error', code: 'INTERNAL' }, 500);
  }
  return c.json({ data: row });
});

// PATCH /api/v1/me — 修改自己的联系资料（admin）
me.patch('/', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = validateProfilePatch(body);
  if (!result.ok) {
    return c.json({ error: '请求参数不满足约束', code: 'VALIDATION_ERROR', details: result.details }, 422);
  }
  if (Object.keys(result.value).length === 0) {
    const row = await db.getProfile(c.env, c.get('user').id);
    return c.json({ data: row });
  }
  const rows = await db.updateProfile(c.env, c.get('user').id, result.value as Record<string, unknown>);
  return c.json({ data: rows[0] });
});
