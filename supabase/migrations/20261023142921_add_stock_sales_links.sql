-- Explicit stock-consumption mapping. Source sales and recipe tables remain unchanged.
create table if not exists public.receita_estoque_vinculo (
  unit_id bigint not null references public.receita_everest_unidade(id),
  sale_name text not null check (length(sale_name) between 1 and 300),
  recipe_id bigint not null check (recipe_id > 0),
  output_per_sale numeric not null check (output_per_sale > 0 and output_per_sale < 1000000),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (unit_id, sale_name)
);
create index if not exists receita_estoque_vinculo_author on public.receita_estoque_vinculo(updated_by);
alter table public.receita_estoque_vinculo enable row level security;
revoke all on public.receita_estoque_vinculo from public, anon, authenticated;
grant select, insert, update, delete on public.receita_estoque_vinculo to service_role;
