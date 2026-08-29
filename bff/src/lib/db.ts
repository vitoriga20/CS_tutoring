// 数据访问层：全部 Supabase 访问集中于此，路由不直接触库（便于测试替换）
import { assertSupabaseEnv, type Bindings } from '../env';
import { SupabaseRest } from './supabase';
import type { GigCreate } from './validators';
import type { Gig, GigStatusFilter, SiteConfig } from '../types';

export interface GigListFilters {
  status: GigStatusFilter;
  grade_level?: string;
  mode?: string;
  subject?: string;
  page: number;
  pageSize: number;
}

function client(env: Bindings): SupabaseRest {
  assertSupabaseEnv(env);
  return new SupabaseRest(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// 列表：status/grade_level/mode 精确匹配；subject 为 trim 后不区分大小写的精确匹配
//（PostgREST ilike 无通配符时等价于 lower(subject)=lower($1)，通配符已在路由层拒绝）
// 排序 created_at desc, id desc（spec §3）；Prefer: count=exact 取真实 total
export async function listGigs(
  env: Bindings,
  f: GigListFilters,
): Promise<{ items: Gig[]; total: number }> {
  const filters: Record<string, ['eq' | 'ilike', string]> = {};
  if (f.status !== 'all') filters.status = ['eq', f.status];
  if (f.grade_level) filters.grade_level = ['eq', f.grade_level];
  if (f.mode) filters.mode = ['eq', f.mode];
  if (f.subject) filters.subject = ['ilike', f.subject.trim()];
  const { data, total } = await client(env).query<Gig[]>('gigs', {
    select: '*',
    filters,
    order: 'created_at.desc,id.desc',
    limit: f.pageSize,
    offset: (f.page - 1) * f.pageSize,
    prefer: 'count=exact',
  });
  return { items: data ?? [], total: total ?? (data?.length ?? 0) };
}

export async function getGig(env: Bindings, id: string): Promise<Gig | null> {
  const { data } = await client(env).query<Gig[]>('gigs', {
    select: '*',
    filters: { id: ['eq', id] },
    limit: 1,
  });
  return data?.[0] ?? null;
}

export async function insertGig(env: Bindings, value: GigCreate, publishedBy: string): Promise<Gig> {
  return client(env).insert<Gig>('gigs', { ...value, published_by: publishedBy });
}

export async function updateGig(
  env: Bindings,
  id: string,
  patch: Record<string, unknown>,
): Promise<Gig[]> {
  return client(env).update<Gig>('gigs', { id: ['eq', id] }, patch);
}

export async function deleteGig(env: Bindings, id: string): Promise<void> {
  return client(env).remove('gigs', { id: ['eq', id] });
}

export async function getSiteConfig(env: Bindings): Promise<SiteConfig | null> {
  const { data } = await client(env).query<SiteConfig[]>('site_config', {
    select: 'wxid,qr_image_url,notice',
    filters: { id: ['eq', 1] },
    limit: 1,
  });
  return data?.[0] ?? null;
}

export async function updateSiteConfig(
  env: Bindings,
  patch: Record<string, unknown>,
): Promise<SiteConfig[]> {
  return client(env).update<SiteConfig>('site_config', { id: ['eq', 1] }, patch);
}

// 管理员判定（教训 L-001）：服务端查 profiles.role，禁止用 auth.users 自带 role
export async function getProfileRole(env: Bindings, userId: string): Promise<string | null> {
  const { data } = await client(env).query<{ role: string }[]>('profiles', {
    select: 'role',
    filters: { id: ['eq', userId] },
    limit: 1,
  });
  return data?.[0]?.role ?? null;
}
