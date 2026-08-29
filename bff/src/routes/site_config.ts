import { Hono } from 'hono';
import type { Bindings } from '../env';
import { validateSiteConfigPatch } from '../lib/validators';
import * as db from '../lib/db';
import { requireAdmin } from '../middleware/adminAuth';

// 站点联系配置路由（契约：specs/openapi.yaml）
type AppEnv = { Bindings: Bindings; Variables: { user: { id: string; email?: string } } };

export const siteConfig = new Hono<AppEnv>();

// GET /api/v1/site-config — 公开（联系弹层用）
siteConfig.get('/', async (c) => {
  const row = await db.getSiteConfig(c.env);
  if (!row) {
    return c.json({ error: 'Internal Server Error', code: 'INTERNAL' }, 500);
  }
  return c.json({ data: row });
});

// PATCH /api/v1/site-config — 修改（admin）
siteConfig.patch('/', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = validateSiteConfigPatch(body);
  if (!result.ok) {
    return c.json({ error: '请求参数不满足约束', code: 'VALIDATION_ERROR', details: result.details }, 422);
  }
  if (Object.keys(result.value).length === 0) {
    const row = await db.getSiteConfig(c.env);
    return c.json({ data: row });
  }
  const rows = await db.updateSiteConfig(c.env, result.value as unknown as Record<string, unknown>);
  return c.json({ data: rows[0] });
});
