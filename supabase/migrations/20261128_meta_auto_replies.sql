create table if not exists public.meta_auto_replies (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  channel text not null,
  sender_id text not null,
  comment_id text,
  text text,
  is_story_reply boolean default false,
  replied boolean default false,
  error text,
  created_at timestamptz default now()
);
create index if not exists meta_auto_replies_sender on public.meta_auto_replies(platform, sender_id, created_at desc);
alter table public.meta_auto_replies enable row level security;
