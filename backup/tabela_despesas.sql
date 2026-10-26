-- Módulo básico de Despesas (contas a pagar da empresa).
--
-- 1. Tabela public.despesas no padrão das demais tabelas de empresa (produtos, clientes):
--    empresa_id com default current_empresa_id() (vem do usuário autenticado, nunca da tela),
--    FK para empresas ON DELETE CASCADE, created_at/updated_at com o trigger set_updated_at.
-- 2. CHECKs: descrição não vazia (até 200), categoria e status fechados, valor > 0, forma de
--    pagamento na mesma lista de recebimentos; despesa paga tem data de pagamento; despesa não paga
--    não tem data nem forma de pagamento.
-- 3. RLS: SELECT/INSERT/UPDATE só na própria empresa (WITH CHECK impede gravar em outra). Não há
--    policy de DELETE e DELETE/TRUNCATE são revogados de anon/authenticated: a interface nunca
--    exclui; a remoção lógica é o status 'cancelada'.
-- 4. Trigger despesas_protege_status (só para os papéis authenticated/anon, como o de contratos):
--    nova despesa nasce pendente e sem pagamento; despesa paga ou cancelada não muda mais
--    (nem valor, nem status — sem reabrir, sem pagar cancelada, sem cancelar paga).
--
-- Reversão (apaga as despesas cadastradas):
--   drop table public.despesas;
--   drop function public.proteger_status_despesa();
begin;

create table if not exists public.despesas (
  id uuid default gen_random_uuid() not null,
  empresa_id uuid default current_empresa_id() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  descricao text not null,
  categoria text not null,
  valor numeric(12,2) not null,
  vencimento date not null,
  status text default 'pendente' not null,
  data_pagamento date,
  forma_pagamento text,
  observacoes text,
  constraint despesas_pkey primary key (id),
  constraint despesas_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint despesas_descricao_check check (descricao !~ '^[[:space:]]*$' and char_length(descricao) <= 200),
  constraint despesas_categoria_check check (categoria = any (array[
    'ingredientes', 'embalagens', 'funcionarios', 'agua_luz_internet', 'aluguel',
    'transporte', 'marketing', 'impostos_taxas', 'equipamentos', 'outros'
  ])),
  constraint despesas_valor_check check (valor > 0),
  constraint despesas_status_check check (status = any (array['pendente', 'paga', 'cancelada'])),
  constraint despesas_forma_pagamento_check check (forma_pagamento = any (array[
    'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'cheque', 'boleto', 'outros'
  ])),
  constraint despesas_pagamento_check check (
    (status = 'paga' and data_pagamento is not null)
    or (status <> 'paga' and data_pagamento is null and forma_pagamento is null)
  )
);

create index if not exists despesas_empresa_vencimento_idx on public.despesas using btree (empresa_id, vencimento);

drop trigger if exists despesas_set_updated_at on public.despesas;
create trigger despesas_set_updated_at before update on public.despesas
  for each row execute function public.set_updated_at();

create or replace function public.proteger_status_despesa()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.status is distinct from 'pendente' then
        raise exception 'Toda nova despesa começa como pendente.';
      end if;
    elsif old.status <> 'pendente' and (
         new.status is distinct from old.status
      or new.valor is distinct from old.valor
      or new.vencimento is distinct from old.vencimento
      or new.data_pagamento is distinct from old.data_pagamento
      or new.forma_pagamento is distinct from old.forma_pagamento
      or new.descricao is distinct from old.descricao
      or new.categoria is distinct from old.categoria
    ) then
      raise exception 'Despesa paga ou cancelada não pode ser alterada.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists despesas_protege_status on public.despesas;
create trigger despesas_protege_status
  before insert or update on public.despesas
  for each row execute function public.proteger_status_despesa();

alter table public.despesas enable row level security;

drop policy if exists despesas_empresa_select on public.despesas;
drop policy if exists despesas_empresa_insert on public.despesas;
drop policy if exists despesas_empresa_update on public.despesas;
create policy despesas_empresa_select on public.despesas for select to authenticated
  using (empresa_id = current_empresa_id());
create policy despesas_empresa_insert on public.despesas for insert to authenticated
  with check (empresa_id = current_empresa_id());
create policy despesas_empresa_update on public.despesas for update to authenticated
  using (empresa_id = current_empresa_id())
  with check (empresa_id = current_empresa_id());

revoke delete, truncate on public.despesas from public;
revoke delete, truncate on public.despesas from anon, authenticated;

commit;
