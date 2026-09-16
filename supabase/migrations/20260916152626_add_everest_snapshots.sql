-- Dedicated Everest cache. Own recipes/books are never touched.
create table public.receita_everest_unidade (
  id bigint primary key, name text not null, snapshot_id uuid, previous_snapshot_id uuid,
  synced_at timestamptz, recipe_count integer not null default 0,
  enabled boolean not null default true, environment text not null default 'production'
);
create table public.receita_everest_sync (
  id uuid primary key default gen_random_uuid(), requested_by uuid references auth.users(id),
  requested_unit bigint, status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  state jsonb not null default '{"phase":"catalog","page":1,"units":[]}',
  progress text not null default 'Aguardando início', error text,
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), finished_at timestamptz
);
create unique index receita_everest_one_active_sync on public.receita_everest_sync ((true)) where status in ('queued','running');
create index receita_everest_sync_recent on public.receita_everest_sync(created_at desc);
create table public.receita_everest_template (
  job_id uuid not null references public.receita_everest_sync(id) on delete cascade,
  id bigint not null, item_id bigint not null, raw jsonb not null, primary key(job_id,id)
);
create table public.receita_everest_snapshot (
  snapshot_id uuid not null references public.receita_everest_sync(id) on delete cascade,
  unit_id bigint not null references public.receita_everest_unidade(id), id bigint not null,
  item_id bigint not null, summary jsonb not null, detail jsonb not null,
  raw_ficha jsonb not null, raw_cost jsonb, checked boolean not null default false,
  primary key(snapshot_id,unit_id,id)
);
create index receita_everest_snapshot_item on public.receita_everest_snapshot(snapshot_id,unit_id,item_id);
create index receita_everest_snapshot_unit on public.receita_everest_snapshot(unit_id);
alter table public.receita_everest_unidade enable row level security;
alter table public.receita_everest_sync enable row level security;
alter table public.receita_everest_template enable row level security;
alter table public.receita_everest_snapshot enable row level security;
revoke all on public.receita_everest_unidade,public.receita_everest_sync,public.receita_everest_template,public.receita_everest_snapshot from public,anon,authenticated;
grant all on public.receita_everest_unidade,public.receita_everest_sync,public.receita_everest_template,public.receita_everest_snapshot to service_role;

create function public.receita_everest_start(p_user uuid, p_unit bigint default null)
returns public.receita_everest_sync language plpgsql security invoker set search_path='' as $$
declare j public.receita_everest_sync;
begin
 perform pg_advisory_xact_lock(2024059,91853);
 select * into j from public.receita_everest_sync where status in ('queued','running') limit 1;
 if found then return j; end if;
 if p_unit is not null and not exists(select 1 from public.receita_everest_unidade where id=p_unit and enabled) then raise exception 'invalid_unit'; end if;
 insert into public.receita_everest_sync(requested_by,requested_unit) values(p_user,p_unit) returning * into j;
 return j;
end $$;
create function public.receita_everest_claim()
returns public.receita_everest_sync language plpgsql security invoker set search_path='' as $$
declare j public.receita_everest_sync;
begin
 select * into j from public.receita_everest_sync where status in ('queued','running') and available_at<=now() and (lease_until is null or lease_until<now()) order by created_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.receita_everest_sync set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '150 seconds',updated_at=now() where id=j.id returning * into j;
 return j;
end $$;
create function public.receita_everest_checkpoint(p_id uuid,p_lease uuid,p_state jsonb,p_progress text,p_release boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.receita_everest_sync set state=p_state,progress=p_progress,updated_at=now(),attempts=0,error=null,
 lease_until=case when p_release then null else now()+interval '150 seconds' end,
 lease_token=case when p_release then null else lease_token end
 where id=p_id and lease_token=p_lease and status='running' and lease_until>now();
 return found;
end $$;
create function public.receita_everest_publish(p_id uuid,p_lease uuid,p_unit bigint,p_count integer,p_environment text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 perform 1 from public.receita_everest_sync where id=p_id and lease_token=p_lease and status='running' and lease_until>now() for update;
 if not found then raise exception 'lost_lease'; end if;
 select count(*) into n from public.receita_everest_snapshot where snapshot_id=p_id and unit_id=p_unit and checked;
 if n<>p_count or exists(select 1 from public.receita_everest_snapshot where snapshot_id=p_id and unit_id=p_unit and not checked) then raise exception 'incomplete_snapshot'; end if;
 update public.receita_everest_unidade set previous_snapshot_id=snapshot_id,snapshot_id=p_id,synced_at=now(),recipe_count=n,enabled=true,environment=p_environment where id=p_unit and snapshot_id is distinct from p_id;
 return true;
end $$;
create function public.receita_everest_failure(p_id uuid,p_lease uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.receita_everest_sync set attempts=attempts+1,error=p_error,progress='Consulta interrompida. Tentando novamente…',
 status=case when attempts>=4 then 'failed' else 'queued' end,
 finished_at=case when attempts>=4 then now() else null end,available_at=now()+interval '1 minute',lease_token=null,lease_until=null,updated_at=now()
 where id=p_id and lease_token=p_lease and status='running';
 return found;
end $$;
create function public.receita_everest_complete(p_id uuid,p_lease uuid,p_units bigint[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.receita_everest_sync;
begin
 select * into j from public.receita_everest_sync where id=p_id and lease_token=p_lease and status='running' and lease_until>now() for update;
 if not found then raise exception 'lost_lease'; end if;
 if j.requested_unit is null then update public.receita_everest_unidade set enabled=false where not(id=any(p_units)); end if;
 update public.receita_everest_sync set status='completed',progress='Atualização concluída',error=null,finished_at=now(),updated_at=now(),lease_token=null,lease_until=null where id=p_id;
 delete from public.receita_everest_template where job_id=p_id;
 delete from public.receita_everest_snapshot s where not exists(select 1 from public.receita_everest_unidade u where u.id=s.unit_id and (u.snapshot_id=s.snapshot_id or u.previous_snapshot_id=s.snapshot_id));
 return true;
end $$;
revoke all on function public.receita_everest_start(uuid,bigint),public.receita_everest_claim(),public.receita_everest_checkpoint(uuid,uuid,jsonb,text,boolean),public.receita_everest_publish(uuid,uuid,bigint,integer,text),public.receita_everest_failure(uuid,uuid,text),public.receita_everest_complete(uuid,uuid,bigint[]) from public,anon,authenticated;
grant execute on function public.receita_everest_start(uuid,bigint),public.receita_everest_claim(),public.receita_everest_checkpoint(uuid,uuid,jsonb,text,boolean),public.receita_everest_publish(uuid,uuid,bigint,integer,text),public.receita_everest_failure(uuid,uuid,text),public.receita_everest_complete(uuid,uuid,bigint[]) to service_role;
create index receita_everest_sync_user on public.receita_everest_sync(requested_by);
-- This schedule ONLY resumes manually requested jobs. It never creates refreshes.
-- Provision lechef_everest_worker_token in Vault and Vercel separately.
select cron.schedule('le-chef-everest-worker','* * * * *',$cron$
 select net.http_post(
  url:='https://fichatecnica-sandy.vercel.app/api/everest-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lechef_everest_worker_token')),
  body:='{}'::jsonb,timeout_milliseconds:=110000
 ) where exists(select 1 from public.receita_everest_sync where status in ('queued','running') and available_at<=now() and (lease_until is null or lease_until<now()))
 and exists(select 1 from vault.decrypted_secrets where name='lechef_everest_worker_token');
$cron$);
