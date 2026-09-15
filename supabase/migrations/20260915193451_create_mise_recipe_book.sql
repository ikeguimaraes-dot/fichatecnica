create table public.mise_recipes (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references auth.users(id) on delete cascade,
title text not null check (char_length(title) between 1 and 160),
category text not null default 'Principais',
description text not null default '',
servings integer not null default 1 check(servings between 1 and 10000),
minutes integer not null default 30 check(minutes between 0 and 100000),
cover text not null default '',
ingredients jsonb not null default '[]' check(jsonb_typeof(ingredients) = 'array'),
steps jsonb not null default '[]' check(jsonb_typeof(steps) = 'array'),
notes text not null default '',
favorite boolean not null default false,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);
create index mise_recipes_user_updated on public.mise_recipes(user_id,updated_at desc);
alter table public.mise_recipes enable row level security;
grant select,insert,update,delete on public.mise_recipes to authenticated;
revoke all on public.mise_recipes from anon;
create policy mise_recipes_select on public.mise_recipes for select to authenticated using ((select auth.uid()) = user_id);
create policy mise_recipes_insert on public.mise_recipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mise_recipes_update on public.mise_recipes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy mise_recipes_delete on public.mise_recipes for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('mise-photos','mise-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy mise_photos_select on storage.objects for select to authenticated using (bucket_id='mise-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy mise_photos_insert on storage.objects for insert to authenticated with check (bucket_id='mise-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy mise_photos_delete on storage.objects for delete to authenticated using (bucket_id='mise-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
