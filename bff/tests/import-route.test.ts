// 导入端点测试（契约：specs/gig-import/spec.md §3；覆盖矩阵 TC-IMPORT-001..006、CT-IMPORT-001、PT-IMPORT-03/04）
// 复用 gigs-route.test.ts 的内存 PostgREST fake 模式：preview 不写库、commit 逐元素校验、failed 不插入。
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const store: { gigs: Row[]; profiles: Row[] } = { gigs: [], profiles: [] };
  let nextId = 1;
  const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  const now = () => new Date('2026-08-29T08:00:00.000Z').toISOString();

  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const FREE_ID = '22222222-2222-4222-8222-222222222222';

  function reset() {
    nextId = 1;
    store.gigs = [];
    store.profiles = [
      { id: ADMIN_ID, role: 'admin' },
      { id: FREE_ID, role: 'free' },
    ];
  }

  class SupabaseRest {
    query(table: string, q: any) {
      let rows: Row[] = [...(store[table as keyof typeof store] as Row[])];
      const filters = (q.filters ?? {}) as Record<string, unknown>;
      for (const [col, raw] of Object.entries(filters)) {
        const conds: [string, unknown][] = Array.isArray((raw as unknown[])?.[0])
          ? (raw as [string, unknown][])
          : [(raw as [string, unknown])];
        rows = rows.filter((r) => conds.every(([op, val]) => (op === 'eq' ? r[col] === val : false)));
      }
      const total = q.prefer?.includes('count=exact') ? rows.length : null;
      return Promise.resolve({ data: rows, total });
    }
    insert(table: string, body: Row) {
      const row = {
        ...body,
        id: uuid(),
        status: 'open',
        student_gender: 'unknown',
        created_at: now(),
        updated_at: now(),
      };
      (store[table as keyof typeof store] as Row[]).push(row);
      return Promise.resolve(row);
    }
  }

  return { store, reset, ADMIN_ID, FREE_ID, SupabaseRest };
});

vi.mock('../src/lib/supabase', () => ({ SupabaseRest: h.SupabaseRest }));

const ENV = {
  SUPABASE_URL: 'https://sb.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};
const EXEC_CTX = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} };

function authInit(token: string | null, method = 'GET', body?: unknown): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
}

async function jsonBody<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeEach(() => {
  h.reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        const token = new Headers(init?.headers).get('Authorization') ?? '';
        const t = token.replace('Bearer ', '');
        const id = t === 'admin-token' ? h.ADMIN_ID : t === 'free-token' ? h.FREE_ID : null;
        if (!id) return new Response('unauthorized', { status: 401 });
        return new Response(JSON.stringify({ id, email: `${id}@example.com` }), { status: 200 });
      }
      return new Response('unexpected fetch', { status: 500 });
    }),
  );
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => {} },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// 与 你好.txt 同构的 3 条单子文本（含 1 条必填缺失）
const RAW_3 = [
  '8.26长沙家教网10034639号家教',
  '学员地址：北部湾',
  '辅导科目：数学',
  '学员情况：初二、女  基础巩固',
  '时间安排：每次2小时（秋季一周一次）',
  '教员要求：女，有家教经验，有耐心',
  '老师薪水：70元/小时',
  '8.27长沙家教网10034675号家教',
  '学员地址：雨花区.才子嘉都',
  '辅导科目： 英语',
  '学员情况：准初三、女，巩固基础',
  '教员要求：男，带教经验丰富',
  '老师薪水：70元/小时',
  '8.26长沙家教网10034617号家教',
  '学员地址：岳麓区梅溪湖壹号',
  '辅导科目：语数英',
  '学员情况：四年级、男，英语基础薄弱',
  '教员要求：男，理科要好',
].join('\n');

// 与 RAW_3 第 1 条完全同键的重复单（同编号 10034639）
const RAW_DUP = '8.26长沙家教网10034639号家教\n学员地址：北部湾\n辅导科目：数学\n学员情况：初二、女\n教员要求：有耐心';

const VALID_ROW = {
  title: '高二数学一对一',
  subject: '数学',
  grade_level: 'senior',
  mode: 'online',
  region: '岳麓区·梅溪湖壹号',
  district: 'yuelu',
  hourly_rate: 150,
  student_gender: 'female',
  student_info: '女生，数学 85/150，基础较弱',
  rate: '150/小时',
  schedule: '周六全天',
  requirements: '每周两次线上辅导',
  contact_wxid: null,
};

describe('POST /api/v1/gigs/import/preview 解析预览', () => {
  it('TC-IMPORT-001：粘贴 3 条单子 → 返回 3 行，每行含字段与 issues', async () => {
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: RAW_3 }), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.rows).toHaveLength(3);
    expect(body.data.rows[0].draft.title).toContain('10034639');
    expect(body.data.rows[0].draft.hourly_rate).toBe(70);
    expect(body.data.rows[0].draft.district).toBe('wangcheng'); // 北部湾 → 手工映射
    expect(Array.isArray(body.data.rows[0].issues)).toBe(true);
    expect(body.data.rows[0].status).toBe('ok');
  });

  it('TC-IMPORT-002：必填字段解析失败标红（无学员情况且无可识别年级）', async () => {
    const raw = '8.26长沙家教网10034639号家教\n学员地址：北部湾\n辅导科目：数学';
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: raw }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data.rows[0].status).toBe('error');
    const fields = body.data.rows[0].issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('student_info');
    expect(fields).toContain('grade_level');
  });

  it('TC-IMPORT-003：同编号重复 → 首条 ok、其余 duplicate=true', async () => {
    const raw = `${RAW_DUP}\n${RAW_DUP}`;
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: raw }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.rows[0].duplicate).toBe(false);
    expect(body.data.rows[1].duplicate).toBe(true);
  });

  it('TC-IMPORT-006：空文本 → 422 VALIDATION_ERROR', async () => {
    for (const payload of [{ raw_text: '' }, { raw_text: '   ' }, {}]) {
      const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', payload), ENV, EXEC_CTX);
      expect(res.status, JSON.stringify(payload)).toBe(422);
      expect((await jsonBody(res)).code).toBe('VALIDATION_ERROR');
    }
    // preview 不写库
    expect(h.store.gigs).toHaveLength(0);
  });
});

describe('POST /api/v1/gigs/import 批量写入', () => {
  it('TC-IMPORT-004：编辑后导入选中行 → created=勾选合法行数，status=open', async () => {
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', { rows: [VALID_ROW, { ...VALID_ROW, title: '初三物理' }, { ...VALID_ROW, title: '五年级全科', grade_level: 'primary' }] }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.data.created).toHaveLength(3);
    expect(body.data.failed).toHaveLength(0);
    expect(body.data.created.every((g: { status: string }) => g.status === 'open')).toBe(true);
    expect(body.data.created.every((g: { published_by: string }) => g.published_by === h.ADMIN_ID)).toBe(true);
    expect(h.store.gigs).toHaveLength(3);
  });

  it('TC-IMPORT-005：提交后仍有非法行 → 合法行入库、failed 含该行且 details 指向字段', async () => {
    const bad = { ...VALID_ROW, grade_level: 'preschool' as string };
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', { rows: [VALID_ROW, bad] }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.failed).toHaveLength(1);
    expect(body.data.failed[0].index).toBe(1);
    expect(body.data.failed[0].code).toBe('VALIDATION_ERROR');
    expect(body.data.failed[0].details.some((d: { field: string }) => d.field === 'grade_level')).toBe(true);
    expect(h.store.gigs).toHaveLength(1); // failed 不插入
  });

  it('PT-IMPORT-03：created+failed 覆盖全部输入（无静默丢弃）', async () => {
    const rows = [VALID_ROW, { ...VALID_ROW, requirements: '' }, { ...VALID_ROW, title: '' }, { ...VALID_ROW, district: 'yuelu' }];
    const res = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', { rows }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data.created.length + body.data.failed.length).toBe(rows.length);
    expect(body.data.failed.map((f: { index: number }) => f.index)).toEqual([1, 2]);
    expect(h.store.gigs).toHaveLength(2);
  });

  it('空 rows 数组 → 422 VALIDATION_ERROR，且无写入', async () => {
    const res = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', { rows: [] }), ENV, EXEC_CTX);
    expect(res.status).toBe(422);
    expect((await jsonBody(res)).code).toBe('VALIDATION_ERROR');
    expect(h.store.gigs).toHaveLength(0);
  });
});

describe('CT-IMPORT-001 / PT-IMPORT-04 导入端点鉴权', () => {
  it.each([
    ['无 token 预览', null, '/preview', { raw_text: RAW_3 }, 401, 'UNAUTHENTICATED'],
    ['无 token 提交', null, '', { rows: [VALID_ROW] }, 401, 'UNAUTHENTICATED'],
    ['free 预览', 'free-token', '/preview', { raw_text: RAW_3 }, 403, 'FORBIDDEN'],
    ['free 提交', 'free-token', '', { rows: [VALID_ROW] }, 403, 'FORBIDDEN'],
  ] as const)('%s → %s', async (_name, token, path, body, status, code) => {
    const res = await app.request(`/api/v1/gigs/import${path}`, authInit(token, 'POST', body), ENV, EXEC_CTX);
    expect(res.status).toBe(status);
    expect((await jsonBody(res)).code).toBe(code);
    expect(h.store.gigs).toHaveLength(0); // 前两类请求无数据变更
  });

  it('admin 预览/提交按语义返回 200/201', async () => {
    const preview = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: RAW_3 }), ENV, EXEC_CTX);
    expect(preview.status).toBe(200);
    const commit = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', { rows: [VALID_ROW] }), ENV, EXEC_CTX);
    expect(commit.status).toBe(201);
    expect(h.store.gigs).toHaveLength(1);
  });
});
