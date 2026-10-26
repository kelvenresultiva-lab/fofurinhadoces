-- Cancelamento seguro de contrato.
--
-- 1. Colunas de auditoria em contratos: quando, quem e por quê. O responsável aponta para
--    public.usuarios (a mesma tabela usada por orcamento_historico/observacoes), com
--    ON DELETE SET NULL como nas demais FKs de usuário.
-- 2. CHECK de integridade: contrato ativo não tem dados de cancelamento; contrato cancelado
--    sempre tem data e motivo. Nenhum caminho (nem o service_role) grava um cancelamento pela metade.
-- 3. Trigger de proteção. A policy contratos_empresa_all é FOR ALL: qualquer usuário da empresa
--    poderia fazer UPDATE direto de status='cancelado' pela API, sem motivo e sem registro de
--    quem cancelou, e até reativar um contrato cancelado. O trigger bloqueia mudança de
--    status/dados de cancelamento (e INSERT já cancelado) quando o papel é authenticated ou anon.
--    A RPC abaixo é SECURITY DEFINER, então o trigger enxerga current_user = dono da função e
--    deixa passar; psql/service_role (manutenção) também não são afetados.
-- 4. RPC cancelar_contrato(p_contrato_id, p_motivo): uma chamada = uma transação.
--    SECURITY DEFINER (precisa gravar o que o trigger bloqueia para authenticated), por isso faz a
--    própria checagem de tenant: a empresa vem de auth.uid() -> usuarios (nunca de parâmetro) e o
--    contrato só é encontrado se pertencer a ela. SELECT ... FOR UPDATE serializa cancelamentos
--    simultâneos: o segundo espera, vê status='cancelado' e falha.
-- 5. registrar_recebimento passa a travar a linha do contrato com FOR SHARE. Antes, a checagem de
--    "contrato cancelado" era uma leitura sem trava: um recebimento que começasse um instante antes
--    do cancelamento poderia ser gravado depois dele. Agora um espera o outro (sem deadlock: o
--    cancelamento só trava o contrato; o recebimento trava parcela e depois contrato).
--
-- Motivo "em branco": btrim() só remove espaços comuns, então um motivo de só tabs/quebras de linha
-- passaria como preenchido. Por isso tanto a RPC quanto o CHECK usam [[:space:]] (qualquer espaço).
--
-- Não apaga nem altera parcelas, itens ou recebimentos. Não faz estorno.
--
-- Reversão (somente se nenhum contrato tiver sido cancelado por esta operação):
--   drop trigger contratos_protege_cancelamento on public.contratos;
--   drop function public.proteger_cancelamento_contrato();
--   drop function public.cancelar_contrato(uuid, text);
--   alter table public.contratos drop constraint contratos_cancelamento_check;
--   alter table public.contratos drop column cancelado_em, drop column cancelado_por, drop column motivo_cancelamento;
--   (e reaplicar backup/rpc_registrar_recebimento.sql)
begin;

alter table public.contratos
  add column if not exists cancelado_em timestamp with time zone,
  add column if not exists cancelado_por uuid,
  add column if not exists motivo_cancelamento text;

alter table public.contratos drop constraint if exists contratos_cancelado_por_fkey;
alter table public.contratos
  add constraint contratos_cancelado_por_fkey
  foreign key (cancelado_por) references public.usuarios(id) on delete set null;

alter table public.contratos drop constraint if exists contratos_cancelamento_check;
alter table public.contratos
  add constraint contratos_cancelamento_check check (
    (status = 'ativo' and cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
    or
    (status = 'cancelado' and cancelado_em is not null
       and motivo_cancelamento is not null
       and motivo_cancelamento !~ '^[[:space:]]*$'
       and char_length(motivo_cancelamento) <= 500)
  );

create or replace function public.proteger_cancelamento_contrato()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.status is distinct from 'ativo'
         or new.cancelado_em is not null
         or new.cancelado_por is not null
         or new.motivo_cancelamento is not null then
        raise exception 'Um contrato só pode ser cancelado pela operação cancelar_contrato.';
      end if;
    elsif new.status is distinct from old.status
       or new.cancelado_em is distinct from old.cancelado_em
       or new.cancelado_por is distinct from old.cancelado_por
       or new.motivo_cancelamento is distinct from old.motivo_cancelamento then
      raise exception 'O cancelamento de contrato só pode ser feito pela operação cancelar_contrato.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists contratos_protege_cancelamento on public.contratos;
create trigger contratos_protege_cancelamento
  before insert or update on public.contratos
  for each row execute function public.proteger_cancelamento_contrato();

create or replace function public.cancelar_contrato(
  p_contrato_id uuid,
  p_motivo text
)
returns public.contratos
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_motivo text := regexp_replace(coalesce(p_motivo, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_contrato public.contratos;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select u.empresa_id into v_empresa_id from public.usuarios u where u.id = v_uid;

  if v_empresa_id is null then
    raise exception 'Usuário sem empresa cadastrada.';
  end if;

  if v_motivo = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  if char_length(v_motivo) > 500 then
    raise exception 'O motivo do cancelamento deve ter no máximo 500 caracteres.';
  end if;

  -- Só enxerga o contrato se ele pertencer à empresa do usuário autenticado; a trava serializa
  -- cancelamentos (e recebimentos) simultâneos sobre o mesmo contrato.
  select k.* into v_contrato
  from public.contratos k
  join public.eventos e on e.id = k.evento_id
  join public.clientes c on c.id = e.cliente_id
  where k.id = p_contrato_id
    and c.empresa_id = v_empresa_id
  for update of k;

  if not found then
    raise exception 'Contrato não encontrado.';
  end if;

  if v_contrato.status = 'cancelado' then
    raise exception 'Este contrato já está cancelado.';
  end if;

  update public.contratos
  set status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = v_uid,
      motivo_cancelamento = v_motivo
  where id = p_contrato_id
  returning * into v_contrato;

  return v_contrato;
end;
$function$;

revoke all on function public.cancelar_contrato(uuid, text) from public;
revoke all on function public.cancelar_contrato(uuid, text) from anon;
grant execute on function public.cancelar_contrato(uuid, text) to authenticated;

-- registrar_recebimento: mesma função de rpc_registrar_recebimento.sql, trocando só a checagem do
-- contrato cancelado por uma leitura com FOR SHARE (ver item 5 do cabeçalho).
create or replace function public.registrar_recebimento(
  p_parcela_id uuid,
  p_valor numeric,
  p_data date default current_date,
  p_forma_pagamento text default null,
  p_observacoes text default null
)
returns public.recebimentos
language plpgsql
as $function$
declare
  v_parcela record;
  v_status_contrato text;
  v_saldo numeric(12,2);
  v_novo_valor_pago numeric(12,2);
  v_novo_status text;
  v_recebimento public.recebimentos;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor do recebimento precisa ser maior que zero.';
  end if;

  if p_forma_pagamento is null or p_forma_pagamento not in
     ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','cheque','boleto','outros') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select * into v_parcela from public.parcelas where id = p_parcela_id for update;

  if v_parcela is null then
    raise exception 'Parcela não encontrada.';
  end if;

  if v_parcela.status = 'cancelado' then
    raise exception 'Não é possível registrar recebimento em uma parcela cancelada.';
  end if;

  select status into v_status_contrato
  from public.contratos
  where id = v_parcela.contrato_id
  for share;

  if v_status_contrato = 'cancelado' then
    raise exception 'Não é possível registrar recebimento em um contrato cancelado.';
  end if;

  v_saldo := v_parcela.valor - v_parcela.valor_pago;

  if p_valor > v_saldo then
    raise exception 'O valor informado é maior que o saldo da parcela.';
  end if;

  insert into public.recebimentos (parcela_id, valor, data, forma_pagamento, observacoes)
  values (p_parcela_id, p_valor, coalesce(p_data, current_date), p_forma_pagamento, p_observacoes)
  returning * into v_recebimento;

  v_novo_valor_pago := v_parcela.valor_pago + p_valor;
  v_novo_status := case when v_novo_valor_pago >= v_parcela.valor then 'pago' else 'parcial' end;

  update public.parcelas
  set valor_pago = v_novo_valor_pago,
      status = v_novo_status
  where id = p_parcela_id;

  return v_recebimento;
end;
$function$;

grant execute on function public.registrar_recebimento(uuid, numeric, date, text, text) to authenticated;

commit;
