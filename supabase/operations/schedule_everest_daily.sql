-- Daily at 01:00 America/Sao_Paulo (04:00 GMT, the project's cron timezone).
-- Run as postgres. Reapplying updates the same named job.
-- A null requester identifies automation; a null unit requests all units.
-- The existing start function prevents concurrent jobs and resumes failures.
select cron.schedule(
  'le-chef-everest-daily-sync',
  '0 4 * * *',
  $cron$select public.receita_everest_start(null::uuid, null::bigint);$cron$
);
