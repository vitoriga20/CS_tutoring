import { Hono } from 'hono';
import type { Bindings } from '../env';
import type { GigStatusFilter } from '../types';
import { GRADE_LEVELS, MODES, STATUSES } from '../types';
import { assertTransition, validateGigInput, validateGigPatch, type FieldIssue } from '../lib/validators';
import * as db from '../lib/db';
import { requireAdmin } from '../middleware/adminAuth';

// 家教单路由（契约：specs/openapi.yaml；错误码：specs/spec.md §6）
type AppEnv = { Bindings: Bindings; Variables: { user: { id: string; email?: string } } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_FILTERS: readonly GigStatusFilter[] = [...STATUSES, 'all'];

function validationError(c: any, details: FieldIssue[]) {
  return c.json({ error: '请求参数不满足约束', code: 'VALIDATION_ERROR', details }, 422);
}

function notFound(c: any) {
  return c.json({ error: 'Gig not found', code: 'GIG_NOT_FOUND' }, 404);
}

export const gigs = new Hono<AppEnv>();

// GET /api/v1/gigs — 公开列表；status 缺省 open（spec §3）
gigs.get('/', async (c) => {
  const statusRaw = c.req.query('status') || 'open';
  if (!(STATUS_FILTERS as readonly string[]).includes(statusRaw)) {
    return validationError(c, [{ field: 'status', reason: '须为 open | matched | closed | all 之一' }]);
  }
  const grade_level = c.req.query('grade_level') || undefined;
  if (grade_level && !(GRADE_LEVELS as readonly string[]).includes(grade_level)) {
    return validationError(c, [{ field: 'grade_level', reason: '须为 primary | junior | senior | college 之一' }]);
  }
  const mode = c.req.query('mode') || undefined;
  if (mode && !(MODES as readonly string[]).includes(mode)) {
    return validationError(c, [{ field: 'mode', reason: '须为 online | offline 之一' }]);
  }
  const subject = c.req.query('subject') || undefined;
  if (subject && /[*%]/.test(subject.trim())) {
    // 通配符不作为筛选语法（spec §3 要点；防止 ilike 语义漂移）
    return validationError(c, [{ field: 'subject', reason: '不能包含 * 或 %' }]);
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10) || 20));

  const { items, total } = await db.listGigs(c.env, {
    status: statusRaw as GigStatusFilter,
    grade_level,
    mode,
    subject,
    page,
    pageSize,
  });
  return c.json({ data: items, meta: { page, pageSize, total } });
});

// GET /api/v1/gigs/:id — 公开详情，任意状态可读
gigs.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return notFound(c);
  const gig = await db.getGig(c.env, id);
  if (!gig) return notFound(c);
  return c.json({ data: gig });
});

// POST /api/v1/gigs — 发布（admin）
gigs.post('/', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = validateGigInput(body);
  if (!result.ok) return validationError(c, result.details);
  const gig = await db.insertGig(c.env, result.value, c.get('user').id);
  return c.json({ data: gig }, 201);
});

// PATCH /api/v1/gigs/:id — 修改（admin；含状态流转）
gigs.patch('/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return notFound(c);
  const current = await db.getGig(c.env, id);
  if (!current) return notFound(c);

  const body = await c.req.json().catch(() => null);
  const result = validateGigPatch(body, current);
  if (!result.ok) return validationError(c, result.details);

  // 状态机（spec §5.1）：非法迁移抛 422 GIG_INVALID_TRANSITION；同值放行
  const nextStatus = (result.value as { status?: typeof current.status }).status;
  if (nextStatus && nextStatus !== current.status) {
    assertTransition(current.status, nextStatus);
  }

  // 合并后无任何字段实际变化时不执行 UPDATE，updated_at 保持不变（spec §5.1）
  const changed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result.value)) {
    if ((current as unknown as Record<string, unknown>)[k] !== v) changed[k] = v;
  }
  if (Object.keys(changed).length === 0) {
    return c.json({ data: current });
  }
  const rows = await db.updateGig(c.env, id, changed);
  return c.json({ data: rows[0] });
});

// DELETE /api/v1/gigs/:id — 删除（admin）
gigs.delete('/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return notFound(c);
  const current = await db.getGig(c.env, id);
  if (!current) return notFound(c);
  await db.deleteGig(c.env, id);
  return c.body(null, 204);
});
