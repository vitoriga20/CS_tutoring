// 批量导入端点（契约：specs/gig-import/spec.md §3；错误码复用 SPEC-001 §6 字典）
// 两个端点均 requireAdmin（服务端查 profiles.role，教训 L-001）；
// 预览只跑解析不写库；提交逐元素 validateGigInput 权威校验（不信任前端），失败元素不插入。
import { Hono } from 'hono';
import type { Bindings } from '../env';
import { validateGigInput } from '../lib/validators';
import * as db from '../lib/db';
import { requireAdmin } from '../middleware/adminAuth';
import { parseImport } from '../lib/importParser';
import { matchSuspects } from '../lib/dedupMatcher';
import type { Gig } from '../types';

type AppEnv = { Bindings: Bindings; Variables: { user: { id: string; email?: string } } };

function validationError(c: any, field: string, reason: string) {
  return c.json({ error: '请求参数不满足约束', code: 'VALIDATION_ERROR', details: [{ field, reason }] }, 422);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const gigImport = new Hono<AppEnv>();

// POST /api/v1/gigs/import/preview — 解析预览（不写库）
// SPEC-003：管线从 parseImport 扩展为 parseImport → matchSuspects(rows, 库中 open 单子)；
// 库查询失败 → 500 INTERNAL，禁止降级为空匹配 200（静默降级 = 放重复单入库，违背本规范目的）。
gigImport.post('/preview', requireAdmin(), async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
    return validationError(c, 'raw_text', '必填且为非空字符串');
  }
  let openGigs: Gig[];
  try {
    openGigs = await db.listOpenGigsForDedup(c.env);
  } catch (err) {
    console.error('[import] listOpenGigsForDedup failed', err);
    return c.json({ error: 'Internal Server Error', code: 'INTERNAL' }, 500);
  }
  const rows = matchSuspects(parseImport(body.raw_text), openGigs);
  return c.json({ data: { rows } });
});

// POST /api/v1/gigs/import — 批量写入（逐元素重校验；failed 元素不插入/不更新）
// v0.2.0（SPEC-003）：请求体增补 updates——rows = 插入行（裁决「不重复」）；updates = 「重复导入」行
// （{id, values}：id = 该行 suspect.gig.id，values = 新内容）；「重复导入」不插入新单，把库中旧单内容更新为新内容：
// created_at 刷新为提交时刻（列表置顶）、values 中 null 字段不覆盖旧值、id/status/published_by 不变。
// rows 与 updates 至少一个非空；失败元素进 failed（kind=insert 缺省 / kind=update），不写入。
gigImport.post('/', requireAdmin(), async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || !Array.isArray(body.rows)) {
    return validationError(c, 'rows', '必填且为数组');
  }
  const updates = Array.isArray(body.updates) ? (body.updates as unknown[]) : [];
  if (body.rows.length === 0 && updates.length === 0) {
    return validationError(c, 'rows', 'rows 与 updates 不能同时为空');
  }
  const created = [];
  const updated = [];
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
  for (let j = 0; j < updates.length; j++) {
    const u = updates[j];
    if (!isRecord(u) || typeof u.id !== 'string' || u.id.trim() === '') {
      failed.push({ index: j, kind: 'update', code: 'VALIDATION_ERROR', details: [{ field: 'id', reason: '缺少目标单 id' }] });
      continue;
    }
    const result = validateGigInput(u.values);
    if (!result.ok) {
      failed.push({ index: j, kind: 'update', code: 'VALIDATION_ERROR', details: result.details });
      continue;
    }
    const old = await db.getGig(c.env, u.id);
    if (!old) {
      failed.push({ index: j, kind: 'update', code: 'GIG_NOT_FOUND', details: [{ field: 'id', reason: '目标单不存在' }] });
      continue;
    }
    // 更新合并（§3.4）：created_at 刷新；null 字段不覆盖旧值（剔除出 patch）；status/published_by 不在 patch 中 → 不变
    const patch: Record<string, unknown> = { ...result.value, created_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete patch[k];
    }
    const [gig] = await db.updateGig(c.env, u.id, patch);
    updated.push(gig);
  }
  return c.json({ data: { created, updated, failed } }, 201);
});
