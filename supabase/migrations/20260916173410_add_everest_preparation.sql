-- Authenticated API only. Independent from imported snapshot lifecycle.
create table public.receita_everest_preparo (
  unit_id bigint not null,
  ficha_id bigint not null,
  content jsonb not null default '{"steps":[],"finalPhoto":null}'::jsonb,
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  primary key (unit_id, ficha_id),
  check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 100000)
);
alter table public.receita_everest_preparo enable row level security;
revoke all on public.receita_everest_preparo from public, anon, authenticated;
grant all on public.receita_everest_preparo to service_role;

create function public.receita_everest_save_preparo(p_unit bigint, p_ficha bigint, p_content jsonb, p_revision uuid, p_user uuid)
returns setof public.receita_everest_preparo
language sql security invoker set search_path = '' as $$
  insert into public.receita_everest_preparo as old (unit_id, ficha_id, content, updated_by)
  select p_unit, p_ficha, p_content, p_user
  where p_revision is null or exists (
    select 1 from public.receita_everest_preparo where unit_id = p_unit and ficha_id = p_ficha
  )
  on conflict (unit_id, ficha_id) do update
  set content = excluded.content, updated_by = excluded.updated_by, updated_at = now(), revision = gen_random_uuid()
  where old.revision = p_revision
  returning *;
$$;
revoke all on function public.receita_everest_save_preparo(bigint,bigint,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.receita_everest_save_preparo(bigint,bigint,jsonb,uuid,uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receita-everest-preparo', 'receita-everest-preparo', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
