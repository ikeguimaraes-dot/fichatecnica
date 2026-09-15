-- Rename only the independent structure created for this application.
alter table public.mise_recipes rename to receita;
alter index public.mise_recipes_user_updated rename to receita_user_updated;
alter table public.receita rename constraint mise_recipes_pkey to receita_pkey;
alter table public.receita rename constraint mise_recipes_user_id_fkey to receita_user_id_fkey;
alter policy mise_recipes_select on public.receita rename to receita_select;
alter policy mise_recipes_insert on public.receita rename to receita_insert;
alter policy mise_recipes_update on public.receita rename to receita_update;
alter policy mise_recipes_delete on public.receita rename to receita_delete;
-- The bucket was verified empty before this migration. Existing files would
-- cause the foreign key to reject this rename rather than lose data.
update storage.buckets set id='receita-fotos', name='receita-fotos' where id='mise-photos';
-- Keep previous bucket policies inert; they only address the retired bucket ID.
create policy receita_fotos_select on storage.objects for select to authenticated using (bucket_id='receita-fotos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receita_fotos_insert on storage.objects for insert to authenticated with check (bucket_id='receita-fotos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receita_fotos_delete on storage.objects for delete to authenticated using (bucket_id='receita-fotos' and (storage.foldername(name))[1]=(select auth.uid())::text);
comment on table public.receita is 'Estrutura própria do livro de receitas. Criada do zero, sem vínculo com tabelas legadas de fichas técnicas, ingredientes ou receitas.';
