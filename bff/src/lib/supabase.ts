// 极简 PostgREST 客户端封装（基于 fetch，兼容 Cloudflare Workers 边缘运行时）
// 仅使用 service_role key，在服务端调用，RLS 被绕过——字段裁剪由本 BFF 控制。
// from: CourseCore bff/src/lib/supabase.ts（移植）
// CS_tutoring 新增（移植时扩展，均注明）：
//   1) QueryOptions.prefer —— 分页 total 需要 Prefer: count=exact 拿 content-range；
//   2) insert/update/remove —— gigs 与 site_config 的写路径（return=representation 取回行）。

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'is';

export interface QueryOptions {
  select?: string;
  // v0.4.0 扩展：同列多条件（价格区间 gte+lte）——值为条件数组时逐条 append，单条件行为不变
  filters?: Record<string, [FilterOp, string | number | boolean] | Array<[FilterOp, string | number | boolean]>>;
  order?: string; // 例如 'created_at.desc,id.desc'
  limit?: number;
  offset?: number;
  single?: boolean; // 期望单条，Accept: application/vnd.pgrst.object+json
  prefer?: string; // CS_tutoring 新增：如 'count=exact'
}

export interface QueryResult<T> {
  data: T | null;
  total: number | null; // 来自 content-range 头，用于分页
}

function parseTotal(contentRange?: string | null): number | null {
  if (!contentRange) return null;
  const last = contentRange.split('/').pop();
  if (!last || last === '*') return null;
  const n = parseInt(last, 10);
  return Number.isNaN(n) ? null : n;
}

export class SupabaseRest {
  constructor(
    private base: string,
    private key: string,
  ) {}

  private headers(): Record<string, string> {
    return { apikey: this.key, Authorization: `Bearer ${this.key}` };
  }

  private buildUrl(table: string, q: QueryOptions): string {
    const u = new URL(`${this.base.replace(/\/$/, '')}/rest/v1/${table}`);
    u.searchParams.set('select', q.select ?? '*');
    if (q.filters) {
      for (const [col, val] of Object.entries(q.filters)) {
        if (Array.isArray(val[0])) {
          // 同列多条件：逐条 append（URLSearchParams.set 会互相覆盖，必须用 append）
          for (const [op, v] of val as Array<[FilterOp, string | number | boolean]>) {
            u.searchParams.append(col, `${op}.${v}`);
          }
        } else {
          const [op, v] = val as [FilterOp, string | number | boolean];
          u.searchParams.set(col, `${op}.${v}`);
        }
      }
    }
    if (q.order) u.searchParams.set('order', q.order);
    if (q.limit != null) u.searchParams.set('limit', String(q.limit));
    if (q.offset != null) u.searchParams.set('offset', String(q.offset));
    return u.toString();
  }

  async query<T = unknown>(table: string, q: QueryOptions): Promise<QueryResult<T>> {
    const url = this.buildUrl(table, q);
    const headers: Record<string, string> = {
      ...this.headers(),
      'Content-Type': 'application/json',
    };
    if (q.single) headers['Accept'] = 'application/vnd.pgrst.object+json';
    if (q.prefer) headers['Prefer'] = q.prefer;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase ${table} ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as T;
    return { data, total: parseTotal(res.headers.get('content-range')) };
  }

  // CS_tutoring 新增：INSERT，return=representation 取回插入行（PostgREST 返回数组）
  async insert<T = unknown>(table: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase insert ${table} ${res.status}: ${text.slice(0, 500)}`);
    }
    const rows = (await res.json()) as T[];
    return rows[0];
  }

  // CS_tutoring 新增：UPDATE（带过滤条件），return=representation 取回更新后的行
  async update<T = unknown>(
    table: string,
    filters: Record<string, [FilterOp, string | number | boolean]>,
    body: unknown,
  ): Promise<T[]> {
    const url = this.buildUrl(table, { filters });
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase update ${table} ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as T[];
  }

  // CS_tutoring 新增：DELETE（带过滤条件）
  async remove(
    table: string,
    filters: Record<string, [FilterOp, string | number | boolean]>,
  ): Promise<void> {
    const url = this.buildUrl(table, { filters });
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase delete ${table} ${res.status}: ${text.slice(0, 500)}`);
    }
  }
}
