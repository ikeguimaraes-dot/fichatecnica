-- Weight of the finished recipe, not an inferred conversion from portions.
alter table public.receita add column yield_kg numeric;
alter table public.receita add constraint receita_yield_kg_positive check (yield_kg > 0 and yield_kg <= 10000);
comment on column public.receita.yield_kg is 'Peso final produzido em kg. NULL significa rendimento ainda não informado. Nunca inferir a partir de servings.';
comment on column public.receita.servings is 'Campo legado em porções, preservado como histórico. O Le Chef usa yield_kg para rendimento e custo por kg.';
