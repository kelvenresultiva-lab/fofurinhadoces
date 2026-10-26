-- Protege o histórico financeiro contra exclusão: contratos, contrato_itens, parcelas, recebimentos.
--
-- PROBLEMA (auditado em backup/validacao-historico-financeiro.js auditar): as policies
-- contratos_empresa_all, contrato_itens_empresa_all, parcelas_empresa_all e recebimentos_empresa_all
-- são FOR ALL e anon/authenticated têm DELETE e TRUNCATE nas quatro tabelas (padrão do Supabase).
-- Um usuário comum da própria empresa conseguia, pela API, apagar contrato (ativo ou cancelado),
-- itens, parcelas e recebimentos. Pior: eventos e clientes também são apagáveis pela API, e as FKs
-- eventos -> contratos -> (contrato_itens, parcelas -> recebimentos) são ON DELETE CASCADE, então
-- apagar um evento ou um cliente apagava todo o histórico financeiro dele, em silêncio.
--
-- CORREÇÃO, em duas camadas independentes (o mesmo padrão do trigger de cancelamento):
-- 1. Trigger BEFORE DELETE (por linha) e BEFORE TRUNCATE nas quatro tabelas, que recusa a operação
--    quando o papel é authenticated ou anon. Vale mesmo que alguém crie depois uma policy permissiva
--    ou devolva o GRANT. Uma exclusão em cascata também passa por esses triggers: o Postgres executa
--    o CASCADE como dono da tabela (current_user deixa de ser authenticated), mas o papel da sessão
--    (current_setting('role'), definido pelo SET ROLE do PostgREST) continua authenticated/anon, e é
--    isso que a função confere. Por isso apagar um evento/cliente COM contrato passa a falhar inteiro,
--    sem apagar nada; evento/cliente sem contrato continuam apagáveis como antes.
-- 2. REVOKE DELETE, TRUNCATE nas quatro tabelas para anon e authenticated (erro "permission denied").
--
-- Continuam funcionando: INSERT/UPDATE/SELECT de todos os fluxos (gerar contrato, registrar
-- recebimento, cancelar contrato), e a manutenção feita pelo papel administrativo (postgres: SQL
-- Editor, migrations) e pelo service_role (chave de servidor, nunca no navegador).
-- Não altera nenhum dado, nenhuma policy e nenhuma foreign key.
--
-- Reversão:
--   drop trigger <tabela>_protege_exclusao on public.<tabela>; drop trigger <tabela>_protege_truncate on public.<tabela>;
--   (para as quatro tabelas) e drop function public.bloquear_exclusao_historico_financeiro();
--   grant delete, truncate on public.<tabela> to anon, authenticated;  (não recomendado)
begin;

create or replace function public.bloquear_exclusao_historico_financeiro()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('authenticated', 'anon')
     or coalesce(current_setting('role', true), '') in ('authenticated', 'anon') then
    raise exception 'O histórico financeiro não pode ser excluído: contratos, itens, parcelas e recebimentos são preservados. Para encerrar um contrato, use o cancelamento.';
  end if;

  if tg_op = 'TRUNCATE' then
    return null;
  end if;
  return old;
end;
$function$;

drop trigger if exists contratos_protege_exclusao on public.contratos;
create trigger contratos_protege_exclusao
  before delete on public.contratos
  for each row execute function public.bloquear_exclusao_historico_financeiro();
drop trigger if exists contratos_protege_truncate on public.contratos;
create trigger contratos_protege_truncate
  before truncate on public.contratos
  for each statement execute function public.bloquear_exclusao_historico_financeiro();

drop trigger if exists contrato_itens_protege_exclusao on public.contrato_itens;
create trigger contrato_itens_protege_exclusao
  before delete on public.contrato_itens
  for each row execute function public.bloquear_exclusao_historico_financeiro();
drop trigger if exists contrato_itens_protege_truncate on public.contrato_itens;
create trigger contrato_itens_protege_truncate
  before truncate on public.contrato_itens
  for each statement execute function public.bloquear_exclusao_historico_financeiro();

drop trigger if exists parcelas_protege_exclusao on public.parcelas;
create trigger parcelas_protege_exclusao
  before delete on public.parcelas
  for each row execute function public.bloquear_exclusao_historico_financeiro();
drop trigger if exists parcelas_protege_truncate on public.parcelas;
create trigger parcelas_protege_truncate
  before truncate on public.parcelas
  for each statement execute function public.bloquear_exclusao_historico_financeiro();

drop trigger if exists recebimentos_protege_exclusao on public.recebimentos;
create trigger recebimentos_protege_exclusao
  before delete on public.recebimentos
  for each row execute function public.bloquear_exclusao_historico_financeiro();
drop trigger if exists recebimentos_protege_truncate on public.recebimentos;
create trigger recebimentos_protege_truncate
  before truncate on public.recebimentos
  for each statement execute function public.bloquear_exclusao_historico_financeiro();

revoke delete, truncate on public.contratos, public.contrato_itens, public.parcelas, public.recebimentos from public;
revoke delete, truncate on public.contratos, public.contrato_itens, public.parcelas, public.recebimentos from anon, authenticated;

commit;
