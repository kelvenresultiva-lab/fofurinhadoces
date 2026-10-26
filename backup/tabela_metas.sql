-- Metas mensais (contratos e entradas).
--
-- Guarda SÓ as metas. Os realizados não ficam no banco: são calculados em tempo real pelo app a
-- partir de contratos (valor_final, created_at no fuso America/Sao_Paulo, só ativos) e recebimentos
-- (valor, data) — ver app/app/(protegido)/metas/calculos.ts.
--
-- 1. Tabela public.metas no padrão das tabelas de empresa: empresa_id com default
--    current_empresa_id() (vem do usuário autenticado), FK para empresas ON DELETE CASCADE,
--    created_at/updated_at com set_updated_at.
-- 2. mes_referencia é o 1º dia do mês (CHECK). Uma meta por empresa por mês (UNIQUE), o que também
--    permite gravar com upsert (ON CONFLICT (empresa_id, mes_referencia)).
-- 3. Metas >= 0 e pelo menos uma > 0.
-- 4. RLS: SELECT/INSERT/UPDATE só na própria empresa. Sem DELETE pela interface (revogado).
--
-- Reversão (apaga as metas cadastradas):
--   drop table public.metas;
begin;

create table if not exists public.metas (
  id uuid default gen_random_uuid() not null,
  empresa_id uuid default current_empresa_id() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  mes_referencia date not null,
  meta_contratos numeric(12,2) default 0 not null,
  meta_entradas numeric(12,2) default 0 not null,
  constraint metas_pkey primary key (id),
  constraint metas_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint metas_empresa_mes_key unique (empresa_id, mes_referencia),
  constraint metas_mes_referencia_check check (extract(day from mes_referencia) = 1),
  constraint metas_valores_check check (meta_contratos >= 0 and meta_entradas >= 0 and (meta_contratos > 0 or meta_entradas > 0))
);

drop trigger if exists metas_set_updated_at on public.metas;
create trigger metas_set_updated_at before update on public.metas
  for each row execute function public.set_updated_at();

alter table public.metas enable row level security;

drop policy if exists metas_empresa_select on public.metas;
drop policy if exists metas_empresa_insert on public.metas;
drop policy if exists metas_empresa_update on public.metas;
create policy metas_empresa_select on public.metas for select to authenticated
  using (empresa_id = current_empresa_id());
create policy metas_empresa_insert on public.metas for insert to authenticated
  with check (empresa_id = current_empresa_id());
create policy metas_empresa_update on public.metas for update to authenticated
  using (empresa_id = current_empresa_id())
  with check (empresa_id = current_empresa_id());

revoke delete, truncate on public.metas from public;
revoke delete, truncate on public.metas from anon, authenticated;

commit;
