-- 0001_init.sql — CS_tutoring 初始 schema（契约：specs/spec.md v0.2.0 §4）
-- 执行环境：Supabase Dashboard SQL Editor 或 supabase CLI。可重复执行（幂等）。
-- 警告：执行前确认连接的是新建的独立 Supabase 项目，不要在 CourseCore 项目上执行。

-- ─── gigs 家教单 ───────────────────────────────────────────────
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  title varchar(60) not null,
  subject varchar(40) not null,
  grade_level varchar(10) not null check (grade_level in ('primary', 'junior', 'senior', 'college')),
  mode varchar(10) not null check (mode in ('online', 'offline')),
  region varchar(40) not null,
  student_gender varchar(10) not null default 'unknown' check (student_gender in ('male', 'female', 'unknown')),
  student_info text not null check (char_length(student_info) between 1 and 500),
  rate varchar(40),
  schedule varchar(120),
  requirements text not null check (char_length(requirements) between 1 and 2000),
  contact_wxid varchar(40),
  status varchar(10) not null default 'open' check (status in ('open', 'matched', 'closed')),
  published_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── site_config 站点联系配置（恒 1 行） ──────────────────────
create table if not exists public.site_config (
  id int primary key default 1 check (id = 1),
  wxid varchar(40) not null,
  qr_image_url text not null,
  notice varchar(200),
  updated_at timestamptz not null default now()
);

-- ─── profiles 用户资料（auth.users 1:1，承载角色） ────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role varchar(10) not null default 'free' check (role in ('admin', 'free')),
  display_name varchar(40),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── updated_at 自动维护（行内任何 UPDATE 触发；同值不执行 UPDATE 时不会触发） ──
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gigs_touch_updated_at on public.gigs;
create trigger gigs_touch_updated_at before update on public.gigs
  for each row execute function public.touch_updated_at();

drop trigger if exists site_config_touch_updated_at on public.site_config;
create trigger site_config_touch_updated_at before update on public.site_config
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── 新用户自动建 profile（role 默认 free） ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS（纵深防御；BFF 用 service_role 绕过，浏览器 anon 只读） ──
alter table public.gigs enable row level security;
drop policy if exists "gigs_public_select" on public.gigs;
create policy "gigs_public_select" on public.gigs
  for select to anon, authenticated using (true);
-- gigs 无 INSERT/UPDATE/DELETE 策略 → anon/authenticated 一律拒绝（spec §4.4）

alter table public.site_config enable row level security;
drop policy if exists "site_config_public_select" on public.site_config;
create policy "site_config_public_select" on public.site_config
  for select to anon, authenticated using (true);

alter table public.profiles enable row level security;
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- ─── 种子：site_config 单行（上线前必须在 /admin/settings 改为真实微信与二维码） ──
insert into public.site_config (id, wxid, qr_image_url, notice)
values (1, 'changeme-wxid', 'https://example.com/qr.png', null)
on conflict (id) do nothing;

-- ─── Storage：公开 bucket site-assets（微信二维码图片） + admin 写入策略 ──
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "site_assets_admin_write" on storage.objects;
create policy "site_assets_admin_write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'site-assets'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "site_assets_admin_update" on storage.objects;
create policy "site_assets_admin_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'site-assets'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "site_assets_admin_delete" on storage.objects;
create policy "site_assets_admin_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'site-assets'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
