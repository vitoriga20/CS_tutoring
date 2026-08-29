// 路由测试：用内存版 PostgREST fake 替换 SupabaseRest（业务 oracle 与 spec 覆盖矩阵对齐）
// 覆盖：CT-GIG-001、CT-ADMIN-001、TC-VIEW-001/002/006、TC-ADMIN-001..005、PT-GIG-02/03
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';

// ── 内存数据层（hoisted 供 vi.mock 工厂引用） ──────────────────
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const store: { gigs: Row[]; profiles: Row[]; site_config: Row[] } = {
    gigs: [],
    profiles: [],
    site_config: [],
  };
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
    store.site_config = [
      { id: 1, wxid: 'admin-wx-001', qr_image_url: 'https://x.example/qr.png', notice: null },
    ];
  }

  function seedGig(over: Row = {}): Row {
    const row = {
      id: uuid(),
      title: '单子',
      subject: '数学',
      grade_level: 'senior',
      mode: 'online',
      region: '岳麓区·梅溪湖壹号',
      district: 'yuelu',
      hourly_rate: null,
      student_gender: 'unknown',
      student_info: '基础较弱',
      rate: null,
      schedule: null,
      requirements: '每周两次',
      contact_wxid: null,
      status: 'open',
      published_by: ADMIN_ID,
      created_at: now(),
      updated_at: now(),
      ...over,
    };
    store.gigs.push(row);
    return row;
  }

  // PostgREST 语义的内存实现（eq / ilike 无通配符精确忽略大小写 / gte / lte（NULL 不命中）/
  // 同列多条件 / order（含 nullslast）/ offset+limit / count）
  class SupabaseRest {
    query(table: string, q: any) {
      let rows: Row[] = [...(store[table as keyof typeof store] as Row[])];
      const filters = (q.filters ?? {}) as Record<string, unknown>;
      for (const [col, raw] of Object.entries(filters)) {
        // 同列多条件（数组套数组）或单条件；统一拍平成条件列表
        const conds: [string, unknown][] = Array.isArray((raw as unknown[])?.[0])
          ? (raw as [string, unknown][])
          : [(raw as [string, unknown])];
        rows = rows.filter((r) =>
          conds.every(([op, val]) => {
            if (op === 'eq') return r[col] === val;
            if (op === 'ilike') return String(r[col]).toLowerCase() === String(val).toLowerCase();
            if (op === 'gte' || op === 'lte') {
              // NULL 不参与数值比较（spec v0.4.0：hourly_rate NULL 不命中价格档）
              const v = r[col] as number | null;
              if (v === null || v === undefined) return false;
              return op === 'gte' ? v >= (val as number) : v <= (val as number);
            }
            throw new Error(`fake 未实现 op=${op}`);
          }),
        );
      }
      if (q.order) {
        const parts = String(q.order).split(',').map((s) => {
          const [col, dir, nulls] = s.split('.');
          return { col, desc: dir === 'desc', nullsLast: nulls === 'nullslast' };
        });
        rows.sort((a, b) => {
          for (const { col, desc, nullsLast } of parts) {
            const av = a[col] as string | number | null;
            const bv = b[col] as string | number | null;
            const aNull = av === null || av === undefined;
            const bNull = bv === null || bv === undefined;
            // nullslast：NULL 殿后；desc 下 NULL 视为正无穷
            if (aNull && bNull) continue;
            if (aNull !== bNull) {
              if (nullsLast) return aNull ? 1 : -1;
              return aNull ? -1 : 1;
            }
            if (av === bv) continue;
            const cmp = (av as string | number) < (bv as string | number) ? -1 : 1;
            return desc ? -cmp : cmp;
          }
          return 0;
        });
      }
      const total = q.prefer?.includes('count=exact') ? rows.length : null;
      const offset = q.offset ?? 0;
      const data = rows.slice(offset, offset + (q.limit ?? rows.length));
      return Promise.resolve({ data, total });
    }
    insert(table: string, body: Row) {
      const defaults: Row = { student_gender: 'unknown', status: 'open' };
      const row = {
        ...defaults,
        ...body,
        id: uuid(),
        created_at: now(),
        updated_at: now(),
      };
      (store[table as keyof typeof store] as Row[]).push(row);
      return Promise.resolve(row);
    }
    update(table: string, filters: Record<string, ['eq', unknown]>, body: Row) {
      const matched = (store[table as keyof typeof store] as Row[]).filter((r) =>
        Object.entries(filters).every(([col, [op, val]]) => (op === 'eq' ? r[col] === val : false)),
      );
      for (const r of matched) Object.assign(r, body, { updated_at: new Date().toISOString() });
      return Promise.resolve(matched);
    }
    remove(table: string, filters: Record<string, ['eq', unknown]>) {
      const t = store[table as keyof typeof store] as Row[];
      const keep = t.filter(
        (r) => !Object.entries(filters).every(([col, [op, val]]) => (op === 'eq' ? r[col] === val : false)),
      );
      store[table as keyof typeof store] = keep as never;
      return Promise.resolve();
    }
  }

  return { store, reset, seedGig, ADMIN_ID, FREE_ID, SupabaseRest };
});

vi.mock('../src/lib/supabase', () => ({ SupabaseRest: h.SupabaseRest }));

// ── 环境与认证桩 ────────────────────────────────────────────────
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

// workers-types 下 Response.json() 返回 unknown，统一经此收敛类型
async function jsonBody<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeEach(() => {
  h.reset();
  // 认证桩：/auth/v1/user 按 token 映射用户；其余 fetch 一律失败（防误触真实网络）
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        const authHeader = new Headers(init?.headers).get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');
        const id =
          token === 'admin-token'
            ? h.ADMIN_ID
            : token === 'free-token'
              ? h.FREE_ID
              : null;
        if (!id) return new Response('unauthorized', { status: 401 });
        return new Response(JSON.stringify({ id, email: `${id}@example.com` }), { status: 200 });
      }
      return new Response('unexpected fetch', { status: 500 });
    }),
  );
  // Cloudflare Cache API 桩（仅 cache 中间件使用）
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => {} },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_GIG = {
  title: '高二数学一对一',
  subject: '数学',
  grade_level: 'senior',
  mode: 'online',
  region: '岳麓区·梅溪湖壹号',
  district: 'yuelu',
  hourly_rate: 150,
  student_gender: 'female',
  student_info: '女生，数学 85/150，基础较弱',
  requirements: '每周两次线上辅导',
};

// ── 公开读 ─────────────────────────────────────────────────────
describe('GET /api/v1/gigs（公开列表）', () => {
  it('CT-GIG-001：响应形状 {data, meta:{page,pageSize,total}}', async () => {
    h.seedGig();
    const res = await app.request('/api/v1/gigs', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(body.data[0].title).toBe('单子');
  });

  it('PT-GIG-02：缺省只返回 open 单子，total 为 open 总数', async () => {
    h.seedGig({ status: 'open' });
    h.seedGig({ status: 'matched', title: '已匹配单' });
    h.seedGig({ status: 'closed', title: '已关闭单' });
    h.seedGig({ status: 'open', title: '第二张开放单' });
    const res = await app.request('/api/v1/gigs', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((g: { status: string }) => g.status === 'open')).toBe(true);
    expect(body.meta.total).toBe(2);
  });

  it('TC-VIEW-002：grade_level + mode + subject 组合筛选', async () => {
    h.seedGig({ grade_level: 'junior', mode: 'offline', subject: '数学', region: '杭州市' });
    h.seedGig({ grade_level: 'junior', mode: 'offline', subject: '物理', region: '杭州市' });
    h.seedGig({ grade_level: 'junior', mode: 'online', subject: '数学' });
    h.seedGig({ grade_level: 'senior', mode: 'offline', subject: '数学', region: '杭州市' });
    const res = await app.request(
      '/api/v1/gigs?grade_level=junior&mode=offline&subject=数学',
      authInit(null),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].subject).toBe('数学');
  });

  it('非法 status 查询参数 → 422 VALIDATION_ERROR', async () => {
    const res = await app.request('/api/v1/gigs?status=xxx', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ── v0.4.0 新筛选参数（spec §2.1 场景） ──────────────────────
  it('TC-VIEW-008：district 筛选只返回对应区县', async () => {
    h.seedGig({ district: 'yuelu', title: '岳麓单' });
    h.seedGig({ district: 'kaifu', title: '开福单' });
    const res = await app.request('/api/v1/gigs?district=yuelu', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].district).toBe('yuelu');
    expect(body.data[0].title).toBe('岳麓单');
  });

  it('TC-VIEW-009：price 档位筛选，hourly_rate NULL 不命中（左开右闭）', async () => {
    h.seedGig({ hourly_rate: 60, title: '60 元' }); // (50,80] 命中
    h.seedGig({ hourly_rate: 90, title: '90 元' }); // 不命中
    h.seedGig({ hourly_rate: null, title: '面议单' }); // NULL 不命中
    h.seedGig({ hourly_rate: 50, title: '50 元' }); // 边界：(50,80] 不含 50
    h.seedGig({ hourly_rate: 80, title: '80 元' }); // 边界：含 80
    const res = await app.request('/api/v1/gigs?price=50-80', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    const titles = body.data.map((g: { title: string }) => g.title).sort();
    expect(titles).toEqual(['60 元', '80 元']);
  });

  it('TC-VIEW-010：sort=rate_desc 时薪降序在前，NULL 殿后（殿后段保持 created_at 降序）', async () => {
    const t1 = h.seedGig({ hourly_rate: 60, title: '旧-60 元', created_at: '2026-08-29T01:00:00.000Z' });
    const t2 = h.seedGig({ hourly_rate: 100, title: '旧-100 元', created_at: '2026-08-29T02:00:00.000Z' });
    h.seedGig({ hourly_rate: null, title: '新-面议A', created_at: '2026-08-29T03:00:00.000Z' });
    h.seedGig({ hourly_rate: null, title: '新-面议B', created_at: '2026-08-29T04:00:00.000Z' });
    const res = await app.request('/api/v1/gigs?sort=rate_desc', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.map((g: { title: string }) => g.title)).toEqual([
      '旧-100 元',
      '旧-60 元',
      '新-面议B',
      '新-面议A',
    ]);
    void t1;
    void t2;
  });

  it('TC-VIEW-011：student_gender 筛选命中对应性别，unknown 不命中', async () => {
    h.seedGig({ student_gender: 'female', title: '女生单' });
    h.seedGig({ student_gender: 'male', title: '男生单' });
    h.seedGig({ student_gender: 'unknown', title: '旧单-未标注' });
    const res = await app.request('/api/v1/gigs?student_gender=female', authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('女生单');
  });

  it('v0.4.0：district/price/student_gender/sort 非法取值 → 422', async () => {
    for (const q of ['district=liuyang', 'price=100-300', 'student_gender=unknown', 'sort=cheap']) {
      const res = await app.request(`/api/v1/gigs?${q}`, authInit(null), ENV, EXEC_CTX);
      expect(res.status, q).toBe(422);
      const body = await jsonBody(res);
      expect(body.code, q).toBe('VALIDATION_ERROR');
    }
  });

  it('status=all 返回全部状态', async () => {
    h.seedGig({ status: 'open' });
    h.seedGig({ status: 'closed', title: '已关闭单' });
    const res = await app.request('/api/v1/gigs?status=all', authInit(null), ENV, EXEC_CTX);
    const body = await jsonBody(res);
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
  });
});

describe('GET /api/v1/gigs/:id（公开详情）', () => {
  it('存在的单子 → 200 {data}', async () => {
    const gig = h.seedGig();
    const res = await app.request(`/api/v1/gigs/${gig.id}`, authInit(null), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.id).toBe(gig.id);
  });

  it('CT-GIG-003：详情含 publisher_contact（发布者 wxid/qr），列表响应不含该字段', async () => {
    const gig = h.seedGig();
    const admin = h.store.profiles.find((r) => r.id === h.ADMIN_ID)!;
    admin.wxid = 'pub-wx-001';
    admin.qr_image_url = 'https://x.example/pub-qr.png';

    const detail = await app.request(`/api/v1/gigs/${gig.id}`, authInit(null), ENV, EXEC_CTX);
    expect(detail.status).toBe(200);
    const dBody = await jsonBody(detail);
    expect(dBody.data.publisher_contact).toEqual({
      wxid: 'pub-wx-001',
      qr_image_url: 'https://x.example/pub-qr.png',
    });

    // 发布者未设置资料 → 两字段为 null（回退由前端按 P-GIG-04 处理）
    admin.wxid = null;
    admin.qr_image_url = null;
    const bare = await app.request(`/api/v1/gigs/${gig.id}`, authInit(null), ENV, EXEC_CTX);
    expect((await jsonBody(bare)).data.publisher_contact).toEqual({ wxid: null, qr_image_url: null });

    // 列表响应不含 publisher_contact
    const list = await app.request('/api/v1/gigs?status=all', authInit(null), ENV, EXEC_CTX);
    const lBody = await jsonBody(list);
    expect(lBody.data[0].publisher_contact).toBeUndefined();
  });

  it('TC-VIEW-006：不存在的单子 → 404 GIG_NOT_FOUND', async () => {
    const res = await app.request(
      '/api/v1/gigs/00000000-0000-0000-0000-000000000000',
      authInit(null),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(404);
    const body = await jsonBody(res);
    expect(body.code).toBe('GIG_NOT_FOUND');
  });
});

// ── 管理员写（PT-GIG-03 / CT-ADMIN-001） ───────────────────────
describe('写端点鉴权门（PT-GIG-03 / CT-ADMIN-001）', () => {
  it('未登录 POST → 401 UNAUTHENTICATED，且无数据变更', async () => {
    const res = await app.request('/api/v1/gigs', authInit(null, 'POST', VALID_GIG), ENV, EXEC_CTX);
    expect(res.status).toBe(401);
    const body = await jsonBody(res);
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(h.store.gigs).toHaveLength(0);
  });

  it('free 用户 POST → 403 FORBIDDEN，且无数据变更', async () => {
    const res = await app.request('/api/v1/gigs', authInit('free-token', 'POST', VALID_GIG), ENV, EXEC_CTX);
    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.code).toBe('FORBIDDEN');
    expect(h.store.gigs).toHaveLength(0);
  });

  it('admin POST → 201，status=open，published_by 正确（TC-ADMIN-001）', async () => {
    const res = await app.request('/api/v1/gigs', authInit('admin-token', 'POST', VALID_GIG), ENV, EXEC_CTX);
    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.data.status).toBe('open');
    expect(body.data.published_by).toBe(h.ADMIN_ID);
    expect(h.store.gigs).toHaveLength(1);
  });

  it('TC-ADMIN-002：缺 region（mode=online）→ 422，details 含 region', async () => {
    const res = await app.request(
      '/api/v1/gigs',
      authInit('admin-token', 'POST', { ...VALID_GIG, region: undefined }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.some((d: { field: string }) => d.field === 'region')).toBe(true);
  });
});

// ── 状态流转 ───────────────────────────────────────────────────
describe('PATCH 状态流转', () => {
  it('TC-ADMIN-004：open → matched 合法迁移成功', async () => {
    const gig = h.seedGig({ status: 'open' });
    const res = await app.request(
      `/api/v1/gigs/${gig.id}`,
      authInit('admin-token', 'PATCH', { status: 'matched' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.status).toBe('matched');
  });

  it('TC-ADMIN-005：closed → matched 非法迁移 → 422 GIG_INVALID_TRANSITION', async () => {
    const gig = h.seedGig({ status: 'closed' });
    const res = await app.request(
      `/api/v1/gigs/${gig.id}`,
      authInit('admin-token', 'PATCH', { status: 'matched' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.code).toBe('GIG_INVALID_TRANSITION');
  });

  it('同值重申：200 且 updated_at 不变（spec §5.1）', async () => {
    const gig = h.seedGig({ status: 'open' });
    const before = gig.updated_at;
    const res = await app.request(
      `/api/v1/gigs/${gig.id}`,
      authInit('admin-token', 'PATCH', { status: 'open' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.status).toBe('open');
    expect(body.data.updated_at).toBe(before);
  });
});

// ── 删除与 site-config ─────────────────────────────────────────
describe('DELETE 与 site-config', () => {
  it('TC-ADMIN-006：删除 → 204，再查详情 404', async () => {
    const gig = h.seedGig();
    const del = await app.request(`/api/v1/gigs/${gig.id}`, authInit('admin-token', 'DELETE'), ENV, EXEC_CTX);
    expect(del.status).toBe(204);
    const get = await app.request(`/api/v1/gigs/${gig.id}`, authInit(null), ENV, EXEC_CTX);
    expect(get.status).toBe(404);
  });

  it('GET /site-config 公开可读；notice 空串规范化为 null', async () => {
    const get = await app.request('/api/v1/site-config', authInit(null), ENV, EXEC_CTX);
    expect(get.status).toBe(200);
    const body = (await jsonBody(get)) as { data: { wxid: string; notice: string | null } };
    expect(body.data.wxid).toBe('admin-wx-001');

    const patch = await app.request(
      '/api/v1/site-config',
      authInit('admin-token', 'PATCH', { notice: '' }),
      ENV,
      EXEC_CTX,
    );
    expect(patch.status).toBe(200);
    const patched = (await jsonBody(patch)) as { data: { notice: string | null } };
    expect(patched.data.notice).toBeNull();
  });
});
