create table if not exists public.social_insights (
  platform text not null, media_id text not null, media_type text, permalink text, caption text,
  published_at timestamptz, metrics jsonb not null default '{}', fetched_at timestamptz not null default now(),
  primary key (platform, media_id));
create table if not exists public.social_account_snapshots (
  id bigserial primary key, platform text not null, followers int, media_count int, taken_at timestamptz not null default now());
alter table public.social_insights enable row level security;
alter table public.social_account_snapshots enable row level security;
