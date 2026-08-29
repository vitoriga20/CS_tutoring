// 用户中心路由测试（契约：specs/openapi.yaml /api/v1/me；覆盖 TC-ACCT-001/002、CT-ACCT-001）
// 基建与 gigs-route.test.ts 同源：内存版 PostgREST fake + 认证桩（vi.mock SupabaseRest）。
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
  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const FREE_ID = '22222222-2222-4222-8222-222222222222';

  function reset() {
    store.gigs = [];
    store.profiles = [
      { id: ADMIN_ID, role: 'admin', wxid: null, qr_image_url: null },
      { id: FREE_ID, role: 'free', wxid: null, qr_image_url: null },
    ];
    store.site_config = [
      { id: 1, wxid: 'admin-wx-001', qr_image_url: 'https://x.example/qr.png', notice: null },
    ];
  }

  // PostgREST 语义的内存实现（me 路由只用 eq 过滤 + update）
  class SupabaseRest {
    query(table: string, q: any) {
      let rows: Row[] = [...(store[table as keyof typeof store] as Row[])];
      const filters = (q.filters ?? {}) as Record<string, [string, unknown]>;
      for (const [col, [op, val]] of Object.entries(filters)) {
        rows = rows.filter((r) => {
          if (op === 'eq') return r[col] === val;
          throw new Error(`fake 未实现 op=${op}`);
        });
      }
      const total = q.prefer?.includes('count=exact') ? rows.length : null;
      const offset = q.offset ?? 0;
      const data = rows.slice(offset, offset + (q.limit ?? rows.length));
      return Promise.resolve({ data, total });
    }
    update(table: string, filters: Record<string, ['eq', unknown]>, body: Row) {
      const matched = (store[table as keyof typeof store] as Row[]).filter((r) =>
        Object.entries(filters).every(([col, [op, val]]) => (op === 'eq' ? r[col] === val : false)),
      );
      for (const r of matched) Object.assign(r, body, { updated_at: new Date().toISOString() });
      return Promise.resolve(matched);
    }
  }

  return { store, reset, ADMIN_ID, FREE_ID, SupabaseRest };
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
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => {} },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/v1/me（用户中心资料）', () => {
  it('TC-ACCT-001：admin 查看自己资料 → 200，未设置字段为 null', async () => {
    const res = await app.request('/api/v1/me', authInit('admin-token'), ENV, EXEC_CTX);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.id).toBe(h.ADMIN_ID);
    expect(body.data.role).toBe('admin');
    expect(body.data.wxid).toBeNull();
    expect(body.data.qr_image_url).toBeNull();
  });

  it('CT-ACCT-001：未登录 → 401；free 用户 → 403', async () => {
    const anon = await app.request('/api/v1/me', authInit(null), ENV, EXEC_CTX);
    expect(anon.status).toBe(401);
    expect((await jsonBody(anon)).code).toBe('UNAUTHENTICATED');

    const free = await app.request('/api/v1/me', authInit('free-token'), ENV, EXEC_CTX);
    expect(free.status).toBe(403);
    expect((await jsonBody(free)).code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/v1/me（修改自己的资料）', () => {
  it('TC-ACCT-001：修改 wxid → 200 且 GET 立即反映', async () => {
    const res = await app.request(
      '/api/v1/me',
      authInit('admin-token', 'PATCH', { wxid: 'my-wx-001' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.wxid).toBe('my-wx-001');

    const after = await app.request('/api/v1/me', authInit('admin-token'), ENV, EXEC_CTX);
    expect((await jsonBody(after)).data.wxid).toBe('my-wx-001');
  });

  it('TC-ACCT-001：置空 wxid（显式 null）→ 200 且 data.wxid 为 null', async () => {
    await app.request(
      '/api/v1/me',
      authInit('admin-token', 'PATCH', { wxid: 'temp-wx' }),
      ENV,
      EXEC_CTX,
    );
    const res = await app.request(
      '/api/v1/me',
      authInit('admin-token', 'PATCH', { wxid: null }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(200);
    expect((await jsonBody(res)).data.wxid).toBeNull();
  });

  it('TC-ACCT-002：41 字 wxid → 422，details 含 wxid', async () => {
    const res = await app.request(
      '/api/v1/me',
      authInit('admin-token', 'PATCH', { wxid: 'x'.repeat(41) }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.some((d: any) => d.field === 'wxid')).toBe(true);
  });

  it('TC-ACCT-002：非 https qr_image_url → 422，details 含 qr_image_url', async () => {
    const res = await app.request(
      '/api/v1/me',
      authInit('admin-token', 'PATCH', { qr_image_url: 'http://x.example/qr.png' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.details.some((d: any) => d.field === 'qr_image_url')).toBe(true);
  });

  it('CT-ACCT-001：free 用户 PATCH → 403 且资料无变更', async () => {
    const res = await app.request(
      '/api/v1/me',
      authInit('free-token', 'PATCH', { wxid: 'hijack' }),
      ENV,
      EXEC_CTX,
    );
    expect(res.status).toBe(403);
    const freeRow = h.store.profiles.find((r) => r.id === h.FREE_ID);
    expect(freeRow?.wxid).toBeNull();
  });
});
