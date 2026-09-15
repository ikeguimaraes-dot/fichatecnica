create table public.receita_livro (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 100),
 description text not null default '' check(char_length(description) <= 1000),
 cover text not null default '',
 theme text not null default 'orange' check(theme in ('orange','cream','ink')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index receita_livro_user_updated on public.receita_livro(user_id,updated_at desc);
alter table public.receita_livro enable row level security;
revoke all on public.receita_livro from anon;
grant select,insert,update,delete on public.receita_livro to authenticated;
create policy receita_livro_select on public.receita_livro for select to authenticated using ((select auth.uid())=user_id);
create policy receita_livro_insert on public.receita_livro for insert to authenticated with check ((select auth.uid())=user_id);
create policy receita_livro_update on public.receita_livro for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy receita_livro_delete on public.receita_livro for delete to authenticated using ((select auth.uid())=user_id);
alter table public.receita add column book_id uuid;
alter table public.receita add constraint receita_book_owner_fk foreign key (book_id,user_id) references public.receita_livro(id,user_id) on delete set null (book_id);
create index receita_book_owner_idx on public.receita(book_id,user_id);
comment on table public.receita_livro is 'Livros independentes do Le Chef. Excluir um livro preserva as receitas em Sem livro.';
