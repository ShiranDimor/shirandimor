create table if not exists public.email_optouts (email text primary key, created_at timestamptz default now());
alter table public.email_optouts enable row level security;
