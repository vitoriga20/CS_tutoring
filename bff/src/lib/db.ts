// 数据访问层：全部 Supabase 访问集中于此，路由不直接触库（便于测试替换）
import { assertSupabaseEnv, type Bindings } from '../env';
import { SupabaseRest } from './supabase';
import type { GigCreate } from './validators';
import { PRICE_BOUNDS } from '../types';
import type { District, Gig, GigSort, GigStatusFilter, PriceFilter, Profile, PublisherContact, SiteConfig, StudentGender } from '../types';

export interface GigListFilters {
  status: GigStatusFilter;
  grade_level?: string;
  mode?: string;
  subject?: string;
  // v0.5.0 标题搜索：对 title 做不区分大小写的包含匹配（与 status 等筛选 AND 叠加）
  q?: string;
  district?: District;
  price?: PriceFilter;
  student_gender?: StudentGender;
  sort?: GigSort;
  page: number;
  pageSize: number;
}

function client(env: Bindings): SupabaseRest {
  assertSupabaseEnv(env);
  return new SupabaseRest(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// 列表：status/grade_level/mode/district 精确匹配；subject 为 trim 后不区分大小写的精确匹配
//（PostgREST ilike 无通配符时等价于 lower(subject)=lower($1)，通配符已在路由层拒绝）
// q（v0.5.0）为 title 不区分大小写的包含匹配（ilike '%q%'），通配符同样已在路由层拒绝；
// price 档位（spec v0.4.0 §3）：按 hourly_rate 左开右闭过滤（(下限,上限]），NULL 不命中任何档位
// sort：newest（缺省）= created_at desc；rate_desc = hourly_rate 降序 NULL 殿后（殿后段保持 created_at desc）
// Prefer: count=exact 取真实 total
export async function listGigs(
  env: Bindings,
  f: GigListFilters,
): Promise<{ items: Gig[]; total: number }> {
  const filters: Record<string, ['eq' | 'ilike', string] | Array<['gte' | 'lte', number]>> = {};
  if (f.status !== 'all') filters.status = ['eq', f.status];
  if (f.grade_level) filters.grade_level = ['eq', f.grade_level];
  if (f.mode) filters.mode = ['eq', f.mode];
  if (f.subject) filters.subject = ['ilike', f.subject.trim()];
  if (f.q) filters.title = ['ilike', `%${f.q}%`];
  if (f.district) filters.district = ['eq', f.district];
  if (f.student_gender) filters.student_gender = ['eq', f.student_gender];
  const range: Array<['gte' | 'lte', number]> = [];
  if (f.price) {
    const [lo, hi] = PRICE_BOUNDS[f.price];
    if (lo !== null) range.push(['gte', lo + 1]); // 左开：> 下限（整数列，+1 等价）
    if (hi !== null) range.push(['lte', hi]); // 右闭：<= 上限
    if (range.length > 0) filters.hourly_rate = range;
  }
  const order =
    f.sort === 'rate_desc'
      ? 'hourly_rate.desc.nullslast,created_at.desc,id.desc'
      : 'created_at.desc,id.desc';
  const { data, total } = await client(env).query<Gig[]>('gigs', {
    select: '*',
    filters,
    order,
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

// SPEC-003 疑似重复比对：全量拉取 status=open 单子（匹配与展示所需字段；不分页，
// 量级约束 spec §8：库中 open 单子 < 5000，超出需重新评估走决策）
export async function listOpenGigsForDedup(env: Bindings): Promise<Gig[]> {
  const { data } = await client(env).query<Gig[]>('gigs', {
    select: '*',
    filters: { status: ['eq', 'open'] },
    order: 'created_at.desc',
  });
  return data ?? [];
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

// GET /me：当前账号完整 profiles 行（联系资料 + 角色）
export async function getProfile(env: Bindings, userId: string): Promise<Profile | null> {
  const { data } = await client(env).query<Profile[]>('profiles', {
    select: 'id,role,display_name,avatar_url,wxid,qr_image_url,created_at,updated_at',
    filters: { id: ['eq', userId] },
    limit: 1,
  });
  return data?.[0] ?? null;
}

// PATCH /me：只写联系资料两列（service_role 绕过 RLS；RLS 写入仍无策略）
export async function updateProfile(
  env: Bindings,
  userId: string,
  patch: Record<string, unknown>,
): Promise<Profile[]> {
  return client(env).update<Profile>('profiles', { id: ['eq', userId] }, patch);
}

// 联系弹层「发布者资料」回退层：gigs.published_by 与 profiles 间无直接 FK（都指向 auth.users），
// PostgREST 不能资源嵌入，这里两次查询（服务端内部，公开详情页允许暴露 wxid/qr 两列）
export async function getPublisherContact(
  env: Bindings,
  publisherId: string,
): Promise<PublisherContact> {
  const { data } = await client(env).query<PublisherContact[]>('profiles', {
    select: 'wxid,qr_image_url',
    filters: { id: ['eq', publisherId] },
    limit: 1,
  });
  return { wxid: data?.[0]?.wxid ?? null, qr_image_url: data?.[0]?.qr_image_url ?? null };
}
