// 导入端点测试（契约：specs/gig-import/spec.md §3；覆盖矩阵 TC-IMPORT-001..006、CT-IMPORT-001、PT-IMPORT-03/04）
// 复用 gigs-route.test.ts 的内存 PostgREST fake 模式：preview 不写库、commit 逐元素校验、failed 不插入。
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const store: { gigs: Row[]; profiles: Row[] } = { gigs: [], profiles: [] };
  const state = { failGigsQuery: false }; // SPEC-003：注入库查询失败（preview → 500 断言）
  let nextId = 1;
  const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  const now = () => new Date('2026-08-29T08:00:00.000Z').toISOString();

  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const FREE_ID = '22222222-2222-4222-8222-222222222222';

  function reset() {
    nextId = 1;
    state.failGigsQuery = false;
    store.gigs = [];
    store.profiles = [
      { id: ADMIN_ID, role: 'admin' },
      { id: FREE_ID, role: 'free' },
    ];
  }

  class SupabaseRest {
    query(table: string, q: any) {
      if (table === 'gigs' && state.failGigsQuery) throw new Error('injected query failure');
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
    update(table: string, filters: any, body: Row) {
      const rows = store[table as keyof typeof store] as Row[];
      const conds = Object.entries(filters ?? {}) as [string, [string, unknown]][];
      const target = rows.find((r) => conds.every(([col, [op, val]]) => (op === 'eq' ? r[col] === val : false)));
      if (!target) return Promise.resolve([]);
      Object.assign(target, body);
      return Promise.resolve([target]);
    }
  }

  return { store, state, reset, ADMIN_ID, FREE_ID, SupabaseRest };
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

describe('SPEC-003 疑似重复确认（preview 集成，specs/import-dedup/spec.md §3/§5）', () => {
  // 直接种子库中单子（绕过 insert 的固定字段）；默认与 RAW_3 第 1 条（10034639 初二 女 数学 北部湾 70元/小时）为
  // 4/6 命中：科目与地址不同，年级/区县/时薪/性别相同；标题编号不同 → hard 不生效
  function seedGig(over: Record<string, unknown> = {}) {
    const g = {
      id: `seed-${h.store.gigs.length + 1}`,
      title: '长沙家教网10034001号家教',
      subject: '物理',
      grade_level: 'junior',
      mode: 'offline',
      region: '望城区.某小区',
      district: 'wangcheng',
      hourly_rate: 70,
      student_gender: 'female',
      student_info: '初二、女 基础巩固',
      rate: '70元/小时',
      schedule: null,
      requirements: '有耐心',
      contact_wxid: null,
      status: 'open',
      published_by: h.ADMIN_ID,
      created_at: '2026-08-29T08:00:00.000Z',
      updated_at: '2026-08-29T08:00:00.000Z',
      ...over,
    };
    h.store.gigs.push(g);
    return g;
  }

  it('TC-DEDUP-001：宽松匹配 5/6 → 行返回 suspect（score=5、matched 五项、gig 指向库中 G1）', async () => {
    // 与 RAW_3 第 1 条仅地址不同（region 不命中）→ 年级/科目/区县/时薪/性别 5 项命中
    const G1 = seedGig({ region: '望城区.某小区', subject: '数学' });
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: RAW_3 }), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    const row0 = body.data.rows[0];
    expect(row0.suspect).not.toBeNull();
    expect(row0.suspect.score).toBe(5);
    expect(row0.suspect.matched).toEqual(['grade_level', 'subject', 'district', 'hourly_rate', 'student_gender']);
    expect(row0.suspect.hard).toBe(false);
    expect(row0.suspect.gig.id).toBe(G1.id);
    expect(row0.suspect.gig.status).toBe('open');
    // 其他行命中不足 4 → 显式 suspect=null（契约 type: [object,'null']）
    for (const r of [body.data.rows[1], body.data.rows[2]]) {
      expect(r.suspect).toBeNull();
    }
  });

  it('TC-DEDUP-004 / PT-DEDUP-02：只比对 status=open，matched/closed 全命中+同编号也不疑似', async () => {
    const G1 = seedGig(); // open，与第 1 条 4/6
    const G2 = seedGig({ id: 'seed-matched', title: '8.26长沙家教网10034639号家教', subject: '数学', region: '北部湾', status: 'matched' });
    const G3 = seedGig({ id: 'seed-closed', title: '8.26长沙家教网10034639号家教', subject: '数学', region: '北部湾', status: 'closed' });
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: RAW_3 }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    const any = body.data.rows.filter((r: { suspect: unknown }) => r.suspect !== null);
    expect(any.length).toBeGreaterThan(0);
    for (const r of any) {
      expect(r.suspect.gig.status).toBe('open'); // 绝不指向 matched/closed
      expect(r.suspect.gig.id).not.toBe(G2.id);
      expect(r.suspect.gig.id).not.toBe(G3.id);
    }
    expect(body.data.rows[0].suspect.gig.id).toBe(G1.id);
  });

  it('TC-DEDUP-009：批内 duplicate 行 suspect=null，仅幸存行参与库比对', async () => {
    // RAW_DUP 无薪水行（时薪 null 不命中）：科目命中后 年级/科目/区县/性别 = 4/6 → 幸存行疑似
    seedGig({ subject: '数学' });
    const raw = `${RAW_DUP}\n${RAW_DUP}`;
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: raw }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data.rows[0].duplicate).toBe(false);
    expect(body.data.rows[0].suspect).not.toBeNull();
    expect(body.data.rows[1].duplicate).toBe(true);
    expect(body.data.rows[1].suspect).toBeNull();
  });

  it('库查询失败 → 500 INTERNAL（不降级为空匹配 200）', async () => {
    h.state.failGigsQuery = true;
    const res = await app.request('/api/v1/gigs/import/preview', authInit('admin-token', 'POST', { raw_text: RAW_3 }), ENV, EXEC_CTX);
    expect(res.status).toBe(500);
    expect((await jsonBody(res)).code).toBe('INTERNAL');
  });

  it('CT-DEDUP-001：commit 契约零变更（既有 commit 用例原样绿 + 请求体无裁决字段）', async () => {
    // 既有 TC-IMPORT-004/005/PT-IMPORT-03 已回归；此处显式断言提交不感知 suspect
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', { rows: [VALID_ROW] }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.failed).toHaveLength(0);
  });
});

describe('SPEC-003 v0.2.0 重复导入（commit updates 通道，specs/import-dedup/spec.md §3.4）', () => {
  // 种子库中旧单（含专属微信/时间/时薪，供「null 不覆盖」断言）
  function seedGig(over: Record<string, unknown> = {}) {
    const g = {
      id: `seed-${h.store.gigs.length + 1}`,
      title: '长沙家教网10034639号家教',
      subject: '数学',
      grade_level: 'junior',
      mode: 'offline',
      region: '北部湾',
      district: 'wangcheng',
      hourly_rate: 70,
      student_gender: 'female',
      student_info: '初二、女 基础巩固',
      rate: '70元/小时',
      schedule: '周六',
      requirements: '有耐心',
      contact_wxid: 'wx-old',
      status: 'open',
      published_by: h.ADMIN_ID,
      created_at: '2026-08-29T08:00:00.000Z',
      updated_at: '2026-08-29T08:00:00.000Z',
      ...over,
    };
    h.store.gigs.push(g);
    return g;
  }

  it('TC-DEDUP-013：重复导入 → updated 含替换后的旧单、created 不含该行、created_at 刷新、status/published_by 不变', async () => {
    const G = seedGig();
    const origCreatedAt = G.created_at; // fake 原地改对象：请求前捕获原始值
    const newValues = { ...VALID_ROW, title: '长沙家教网10034639号家教（更新）', hourly_rate: 80 };
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', { rows: [], updates: [{ id: G.id, values: newValues }] }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.updated).toHaveLength(1);
    const u = body.data.updated[0];
    expect(u.id).toBe(G.id);
    expect(u.title).toBe('长沙家教网10034639号家教（更新）');
    expect(u.hourly_rate).toBe(80);
    expect(u.status).toBe('open'); // status 不变
    expect(u.published_by).toBe(G.published_by); // published_by 不变
    expect(Date.parse(u.created_at)).toBeGreaterThan(Date.parse(origCreatedAt)); // 刷新置顶
    expect(h.store.gigs).toHaveLength(1); // 不插入新行
  });

  it('TC-DEDUP-014：values 中 null 字段不覆盖旧值（contact_wxid/schedule 保留，非 null 覆盖）', async () => {
    const G = seedGig({ contact_wxid: 'wx-old', schedule: '周六', hourly_rate: 70 });
    const newValues = { ...VALID_ROW, contact_wxid: null, schedule: null, hourly_rate: 80 };
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', { rows: [], updates: [{ id: G.id, values: newValues }] }),
      ENV,
      EXEC_CTX,
    );
    const body = await jsonBody(res);
    expect(body.data.failed).toHaveLength(0);
    const u = body.data.updated[0];
    expect(u.contact_wxid).toBe('wx-old'); // null 不覆盖
    expect(u.schedule).toBe('周六');
    expect(u.hourly_rate).toBe(80); // 非 null 覆盖
  });

  it('TC-DEDUP-015：updates 校验失败 → failed（kind=update）；目标不存在 → GIG_NOT_FOUND', async () => {
    const G = seedGig();
    const res = await app.request(
      '/api/v1/gigs/import',
      authInit('admin-token', 'POST', {
        rows: [],
        updates: [
          { id: 'missing-id', values: VALID_ROW },                                  // idx 0：目标不存在
          { id: G.id, values: { ...VALID_ROW, grade_level: 'preschool' as string } }, // idx 1：校验失败
          { id: G.id, values: VALID_ROW },                                          // idx 2：成功
        ],
      }),
      ENV,
      EXEC_CTX,
    );
    const body = await jsonBody(res);
    expect(body.data.updated).toHaveLength(1);
    expect(body.data.failed).toHaveLength(2);
    expect(body.data.failed[0]).toMatchObject({ index: 0, kind: 'update', code: 'GIG_NOT_FOUND' });
    expect(body.data.failed[1]).toMatchObject({ index: 1, kind: 'update', code: 'VALIDATION_ERROR' });
    expect(body.data.failed[1].details.some((d: { field: string }) => d.field === 'grade_level')).toBe(true);
    expect(h.store.gigs).toHaveLength(1); // 仅种子，无插入
  });

  it('PT-DEDUP-04：created+updated+failed 覆盖全部提交元素（无静默丢弃），failed 不写入', async () => {
    const G = seedGig();
    const rows = [VALID_ROW, { ...VALID_ROW, title: '' }, { ...VALID_ROW, title: '第二个' }];
    const updates = [
      { id: G.id, values: { ...VALID_ROW, hourly_rate: 90 } }, // 成功更新
      { id: 'missing', values: VALID_ROW },                     // 失败：目标不存在
    ];
    const res = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', { rows, updates }), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data.created).toHaveLength(2); // rows[0]、rows[2]
    expect(body.data.updated).toHaveLength(1);
    expect(body.data.failed.map((f: { kind?: string; index: number }) => [f.kind ?? 'insert', f.index])).toEqual([
      ['insert', 1],
      ['update', 1],
    ]);
    expect(h.store.gigs).toHaveLength(1 + 2); // 种子 + 2 条插入（failed 不写入）
  });

  it('PT-DEDUP-05：更新合并性质——null 保持旧值、非 null 覆盖、id/status/published_by 不变、created_at 刷新（50 轮）', async () => {
    let seedN = 42;
    const rand = (n: number) => {
      seedN = (seedN * 1103515245 + 12345) % 2147483648;
      return seedN % n;
    };
    const NULLABLE = ['hourly_rate', 'rate', 'schedule', 'contact_wxid'] as const;
    for (let iter = 0; iter < 50; iter++) {
      h.reset();
      const G = seedGig({ contact_wxid: 'wx-old', schedule: '周六', hourly_rate: 70, rate: '70元/小时' });
      const orig: Record<string, unknown> = { ...G }; // fake 原地改对象：请求前捕获原始值
      const values = {
        ...VALID_ROW,
        hourly_rate: 60 + rand(40),
        rate: rand(2) ? '90元/小时' : null,
        schedule: rand(2) ? '周日' : null,
        contact_wxid: rand(2) ? 'wx-new' : null,
      };
      const res = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', { rows: [], updates: [{ id: G.id, values }] }), ENV, EXEC_CTX);
      const body = await jsonBody(res);
      expect(body.data.failed, `iter=${iter}`).toHaveLength(0);
      const u = body.data.updated[0];
      expect(u.id).toBe(G.id);
      expect(u.status).toBe('open');
      expect(u.published_by).toBe(orig.published_by);
      for (const k of NULLABLE) {
        if ((values as Record<string, unknown>)[k] === null) {
          expect(u[k], `iter=${iter} ${k} 应保持旧值`).toBe(orig[k]);
        } else {
          expect(u[k], `iter=${iter} ${k} 应覆盖`).toBe((values as Record<string, unknown>)[k]);
        }
      }
      expect(u.title).toBe(values.title);
      expect(Date.parse(u.created_at)).toBeGreaterThan(Date.parse(orig.created_at as string));
    }
  });

  it('rows 与 updates 同时为空 → 422 VALIDATION_ERROR（不写入）', async () => {
    for (const payload of [{ rows: [] }, { rows: [], updates: [] }]) {
      const res = await app.request('/api/v1/gigs/import', authInit('admin-token', 'POST', payload), ENV, EXEC_CTX);
      expect(res.status).toBe(422);
      expect((await jsonBody(res)).code).toBe('VALIDATION_ERROR');
    }
    expect(h.store.gigs).toHaveLength(0);
  });
});
