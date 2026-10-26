-- RPC transacional pro Financeiro: registrar um recebimento e manter
-- parcelas.valor_pago/status sincronizados na mesma transação. Hoje nada faz
-- isso (auditoria confirmou: sem trigger, sem RPC existente) — inserir em
-- recebimentos direto deixaria a parcela desatualizada.
--
-- SECURITY INVOKER (não DEFINER): a RLS de parcelas/recebimentos já permite
-- corretamente a operação legítima da própria empresa (ambas as policies só
-- fazem join até current_empresa_id(), sem a brecha de segunda referência que
-- foi corrigida em orcamento_itens/orcamentos/contrato_itens) — não precisa do
-- bypass de DEFINER, e INVOKER evita o risco de contorno cross-tenant que
-- DEFINER carregaria.
--
-- SELECT ... FOR UPDATE trava a linha da parcela: uma segunda chamada
-- concorrente espera esta transação terminar e só então lê o saldo já
-- atualizado, fechando a janela de overpayment por leitura de saldo velho.
CREATE OR REPLACE FUNCTION public.registrar_recebimento(
  p_parcela_id uuid,
  p_valor numeric,
  p_data date DEFAULT CURRENT_DATE,
  p_forma_pagamento text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS public.recebimentos
LANGUAGE plpgsql
AS $function$
declare
  v_parcela record;
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

  if exists (select 1 from public.contratos where id = v_parcela.contrato_id and status = 'cancelado') then
    raise exception 'Não é possível registrar recebimento em um contrato cancelado.';
  end if;

  v_saldo := v_parcela.valor - v_parcela.valor_pago;

  if p_valor > v_saldo then
    raise exception 'O valor informado é maior que o saldo da parcela.';
  end if;

  insert into public.recebimentos (parcela_id, valor, data, forma_pagamento, observacoes)
  values (p_parcela_id, p_valor, coalesce(p_data, CURRENT_DATE), p_forma_pagamento, p_observacoes)
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

GRANT EXECUTE ON FUNCTION public.registrar_recebimento(uuid, numeric, date, text, text) TO authenticated;
