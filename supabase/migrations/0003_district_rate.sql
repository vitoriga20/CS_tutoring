-- 0003_district_rate.sql — 筛选增强（契约：specs/spec.md v0.4.0 §4.1/§4.1.1）
-- 用途：区域筛选（district 枚举列）+ 价格筛选/排序（hourly_rate 数值列）。
-- region 原文保留为「详细地点」，语义收窄不变更约束。
-- 执行环境：Supabase MCP / Dashboard SQL Editor。可重复执行（幂等：回填仅处理 NULL 行）。

-- ── 1. 新增列 ──────────────────────────────────────────────
alter table public.gigs
  add column if not exists district varchar(20);
alter table public.gigs
  add column if not exists hourly_rate integer;

-- CHECK 约束（PG 中 CHECK 对 NULL 恒通过，回填前不阻塞）
alter table public.gigs
  drop constraint if exists gigs_district_check;
alter table public.gigs
  add constraint gigs_district_check
  check (district in ('wangcheng', 'kaifu', 'yuelu', 'furong', 'tianxin', 'yuhua', 'changsha_county', 'other'));
alter table public.gigs
  drop constraint if exists gigs_hourly_rate_check;
alter table public.gigs
  add constraint gigs_hourly_rate_check
  check (hourly_rate between 0 and 10000);

-- 列注释（文档性质，便于 Dashboard 查看）
comment on column public.gigs.district is '长沙区县枚举（v0.4.0 区域筛选维度）；other 兜底宁乡/浏阳等无明确区县归属';
comment on column public.gigs.hourly_rate is '时薪（元/小时，v0.4.0 价格筛选与排序维度）；按次/面议/无法解析为 NULL';

-- ── 2. 存量回填 · district（按 spec §4.1.1 规则）────────────
-- 2a. region 前缀解析（X区· / X区 / 长沙县 开头）
update public.gigs
set district = case
  when region like '芙蓉区%' then 'furong'
  when region like '天心区%' then 'tianxin'
  when region like '雨花区%' then 'yuhua'
  when region like '开福区%' then 'kaifu'
  when region like '岳麓区%' then 'yuelu'
  when region like '望城区%' then 'wangcheng'
  when region like '长沙县%' then 'changsha_county'
end
where district is null;

-- 2b. 无区前缀的 8 条人工归类（小区实际位置已于 2026-08-30 逐一核实，用户确认）：
--   北部湾 = 嘉宇北部湾（望城丁字湾街道）                    → wangcheng
--   汉唐·翰林府1期 = 汉唐翰林府（岳麓麓南含浦）              → yuelu
--   长沙地铁4号线观沙岭站附近 = 观沙岭（岳麓）               → yuelu
--   君康家园 = 梅溪湖路（岳麓）                              → yuelu
--   长沙火车站附近 = 长沙火车站（芙蓉）                      → furong
--   润和星河玥8栋 = 高铁新城黎托街道（雨花）                 → yuhua
--   保利天汇二期 = 雨花                                      → yuhua
--   长郡外国语附近 = 长郡外国语实验中学（天心）              → tianxin
update public.gigs
set district = case region
  when '北部湾' then 'wangcheng'
  when '汉唐·翰林府1期' then 'yuelu'
  when '长沙地铁4号线观沙岭站附近' then 'yuelu'
  when '君康家园' then 'yuelu'
  when '长沙火车站附近' then 'furong'
  when '润和星河玥8栋' then 'yuhua'
  when '保利天汇二期' then 'yuhua'
  when '长郡外国语附近' then 'tianxin'
  else 'other'
end
where district is null;

-- 2c. 兜底（理论上不命中；保证 SET NOT NULL 不失败）
update public.gigs set district = 'other' where district is null;

alter table public.gigs
  alter column district set not null;

-- ── 3. 存量回填 · hourly_rate（宽松正则，区间取均值，不匹配置 NULL）──
update public.gigs
set hourly_rate = sub.v
from (
  select g.id,
         case
           when m[2] is not null then round(((m[1]::numeric + m[2]::numeric) / 2))::int
           else m[1]::int
         end as v
  from public.gigs g,
       regexp_match(g.rate, '(\d+)(?:\s*[-~至]\s*(\d+))?\s*元\s*/\s*小时') as m
  where g.rate is not null and g.hourly_rate is null
) sub
where public.gigs.id = sub.id;

-- ── 4. 筛选索引 ────────────────────────────────────────────
create index if not exists idx_gigs_district on public.gigs (district);
create index if not exists idx_gigs_hourly_rate on public.gigs (hourly_rate);
