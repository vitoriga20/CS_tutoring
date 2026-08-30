import { Hono } from 'hono';
import type { Bindings } from '../env';
import type { District, GigSort, GigStatusFilter, PriceFilter, StudentGender } from '../types';
import { DISTRICTS, GENDER_FILTERS, GRADE_LEVELS, MODES, PRICE_FILTERS, SORTS, STATUSES } from '../types';
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

  // v0.4.0 筛选参数：district / price / student_gender / sort（spec §3）
  const districtRaw = c.req.query('district') || undefined;
  if (districtRaw && !(DISTRICTS as readonly string[]).includes(districtRaw)) {
    return validationError(c, [{ field: 'district', reason: `须为 ${DISTRICTS.join(' | ')} 之一` }]);
  }
  const priceRaw = c.req.query('price') || undefined;
  if (priceRaw && !(PRICE_FILTERS as readonly string[]).includes(priceRaw)) {
    return validationError(c, [{ field: 'price', reason: `须为 ${PRICE_FILTERS.join(' | ')} 之一` }]);
  }
  const genderRaw = c.req.query('student_gender') || undefined;
  if (genderRaw && !(GENDER_FILTERS as readonly string[]).includes(genderRaw)) {
    return validationError(c, [{ field: 'student_gender', reason: '须为 male | female 之一（unknown 表示未标注，不可筛选）' }]);
  }
  const sortRaw = c.req.query('sort') || undefined;
  if (sortRaw && !(SORTS as readonly string[]).includes(sortRaw)) {
    return validationError(c, [{ field: 'sort', reason: '须为 newest | rate_desc 之一' }]);
  }

  // v0.5.0 标题搜索：q 仅匹配 title 做不区分大小写的包含匹配；trim 后空串视为未提供；
  // 含 * / % 或 trim 后超 60 字符返回 422（通配符不作为搜索语法，沿 subject 补钉先例）
  const qRaw = c.req.query('q') || undefined;
  const q = qRaw?.trim() || undefined;
  if (q) {
    if (/[*%]/.test(q)) {
      return validationError(c, [{ field: 'q', reason: '不能包含 * 或 %' }]);
    }
    if (q.length > 60) {
      return validationError(c, [{ field: 'q', reason: '长度须在 1..60' }]);
    }
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10) || 20));

  const { items, total } = await db.listGigs(c.env, {
    status: statusRaw as GigStatusFilter,
    grade_level,
    mode,
    subject,
    q,
    district: districtRaw as District | undefined,
    price: priceRaw as PriceFilter | undefined,
    student_gender: genderRaw as StudentGender | undefined,
    sort: (sortRaw || 'newest') as GigSort,
    page,
    pageSize,
  });
  return c.json({ data: items, meta: { page, pageSize, total } });
});

// GET /api/v1/gigs/:id — 公开详情，任意状态可读；data 为 GigDetail（含发布者联系资料，spec v0.3.0 §3）
gigs.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return notFound(c);
  const gig = await db.getGig(c.env, id);
  if (!gig) return notFound(c);
  const publisher_contact = await db.getPublisherContact(c.env, gig.published_by);
  return c.json({ data: { ...gig, publisher_contact } });
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
