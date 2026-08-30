// 批量导入端点（契约：specs/gig-import/spec.md §3；错误码复用 SPEC-001 §6 字典）
// 两个端点均 requireAdmin（服务端查 profiles.role，教训 L-001）；
// 预览只跑解析不写库；提交逐元素 validateGigInput 权威校验（不信任前端），失败元素不插入。
import { Hono } from 'hono';
import type { Bindings } from '../env';
import { validateGigInput } from '../lib/validators';
import * as db from '../lib/db';
import { requireAdmin } from '../middleware/adminAuth';
import { parseImport } from '../lib/importParser';

type AppEnv = { Bindings: Bindings; Variables: { user: { id: string; email?: string } } };

function validationError(c: any, field: string, reason: string) {
  return c.json({ error: '请求参数不满足约束', code: 'VALIDATION_ERROR', details: [{ field, reason }] }, 422);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const gigImport = new Hono<AppEnv>();

// POST /api/v1/gigs/import/preview — 解析预览（不写库）
gigImport.post('/preview', requireAdmin(), async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
    return validationError(c, 'raw_text', '必填且为非空字符串');
  }
  const rows = parseImport(body.raw_text);
  return c.json({ data: { rows } });
});

// POST /api/v1/gigs/import — 批量写入（逐元素重校验；failed 元素不插入）
gigImport.post('/', requireAdmin(), async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || !Array.isArray(body.rows)) {
    return validationError(c, 'rows', '必填且为数组');
  }
  if (body.rows.length === 0) {
    return validationError(c, 'rows', '不能为空数组');
  }
  const created = [];
  const failed = [];
  for (let i = 0; i < body.rows.length; i++) {
    const result = validateGigInput(body.rows[i]);
    if (!result.ok) {
      failed.push({ index: i, code: 'VALIDATION_ERROR', details: result.details });
      continue;
    }
    const gig = await db.insertGig(c.env, result.value, c.get('user').id);
    created.push(gig);
  }
  return c.json({ data: { created, failed } }, 201);
});
