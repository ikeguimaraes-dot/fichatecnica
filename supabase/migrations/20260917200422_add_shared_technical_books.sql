-- Shared editorial books, independent of personal recipes and Everest snapshots.
create table public.receita_compartilhada (
 id uuid primary key default gen_random_uuid(),
 book_slug text not null check(book_slug in ('linguica','hamburguer')),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text) <= 200000),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id),
 check (jsonb_typeof(content->'title')='string' and char_length(btrim(content->>'title')) between 1 and 200),
 check (jsonb_typeof(content->'ingredients')='array' and jsonb_typeof(content->'steps')='array')
);
create index receita_compartilhada_book_updated on public.receita_compartilhada(book_slug,updated_at desc,id);
create index receita_compartilhada_creator on public.receita_compartilhada(created_by);
alter table public.receita_compartilhada enable row level security;
revoke all on public.receita_compartilhada from public,anon,authenticated;
grant select,insert,update,delete on public.receita_compartilhada to authenticated;
grant all on public.receita_compartilhada to service_role;
create policy receita_compartilhada_read on public.receita_compartilhada for select to authenticated
 using (not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create policy receita_compartilhada_insert on public.receita_compartilhada for insert to authenticated
 with check ((select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid and created_by=(select auth.uid()));
create policy receita_compartilhada_update on public.receita_compartilhada for update to authenticated
 using ((select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid)
 with check ((select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid and created_by=(select auth.uid()));
create policy receita_compartilhada_delete on public.receita_compartilhada for delete to authenticated
 using ((select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('receita-compartilhada-fotos','receita-compartilhada-fotos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy receita_compartilhada_fotos_read on storage.objects for select to authenticated
 using (bucket_id='receita-compartilhada-fotos' and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create policy receita_compartilhada_fotos_insert on storage.objects for insert to authenticated
 with check(bucket_id='receita-compartilhada-fotos' and (select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receita_compartilhada_fotos_delete on storage.objects for delete to authenticated
 using(bucket_id='receita-compartilhada-fotos' and (select auth.uid())='7ec10346-2f07-4ec7-93d0-3b1d1ee307ed'::uuid and (storage.foldername(name))[1]=(select auth.uid())::text);
