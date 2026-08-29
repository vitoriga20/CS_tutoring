-- 0002_profile_contact.sql — profiles 账号级联系资料（契约：specs/spec.md v0.3.0 §4.3）
-- 用途：用户中心（/admin/account）数据源；学生联系弹层「发布者资料」回退层。
-- 写入只经 BFF PATCH /api/v1/me（service_role）；RLS 写入仍无策略（拒绝）。
-- 执行环境：Supabase MCP / Dashboard SQL Editor。可重复执行（幂等）。

alter table public.profiles
  add column if not exists wxid varchar(40);
alter table public.profiles
  add column if not exists qr_image_url text;

-- 列注释（文档性质，便于 Dashboard 查看）
comment on column public.profiles.wxid is '账号级微信号（用户中心维护）；联系弹层发布者资料回退层';
comment on column public.profiles.qr_image_url is '账号级微信二维码公开 URL（site-assets bucket qr/<uid>/ 目录，用户中心上传回写）';
