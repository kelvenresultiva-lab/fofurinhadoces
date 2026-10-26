-- Configurações da empresa e da conta.
--
-- 1. empresas.whatsapp: único campo que faltava para "Dados da empresa". Os demais já existiam e são
--    reutilizados: nome (razão social / nome de registro, obrigatório), nome_fantasia, cnpj (CNPJ ou CPF),
--    telefone, email (e-mail comercial), endereco (texto único) e logo (caminho no bucket `documentos`).
-- 2. Correção de segurança. As policies `usuarios_update_self` (id = auth.uid()) e `empresas_update_own`
--    (id = current_empresa_id()) não restringem COLUNAS: um usuário autenticado conseguia trocar a
--    própria usuarios.empresa_id para a de outra empresa (e passar a ler os dados dela, já que
--    current_empresa_id() lê essa coluna), mudar o próprio cargo/status e o plano/status da empresa.
--    Os triggers abaixo, no mesmo padrão de contratos_protege_cancelamento (só para os papéis
--    authenticated/anon; SECURITY DEFINER, service_role e o dono das tabelas não são afetados), deixam
--    o usuário editar apenas os campos de cadastro. criar_empresa_e_usuario (INSERT) não é afetada.
--
-- Reversão:
--   drop trigger usuarios_protege_vinculo on public.usuarios;
--   drop function public.proteger_vinculo_usuario();
--   drop trigger empresas_protege_controle on public.empresas;
--   drop function public.proteger_controle_empresa();
--   alter table public.empresas drop column whatsapp;
begin;

alter table public.empresas add column if not exists whatsapp text;

create or replace function public.proteger_vinculo_usuario()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.empresa_id is distinct from old.empresa_id
    or new.cargo is distinct from old.cargo
    or new.status is distinct from old.status
    or new.email is distinct from old.email
  ) then
    raise exception 'Empresa, cargo, status e e-mail da conta não podem ser alterados por aqui.';
  end if;
  return new;
end;
$function$;

drop trigger if exists usuarios_protege_vinculo on public.usuarios;
create trigger usuarios_protege_vinculo
  before update on public.usuarios
  for each row execute function public.proteger_vinculo_usuario();

create or replace function public.proteger_controle_empresa()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.plano is distinct from old.plano
    or new.status is distinct from old.status
  ) then
    raise exception 'Plano e status da empresa não podem ser alterados por aqui.';
  end if;
  return new;
end;
$function$;

drop trigger if exists empresas_protege_controle on public.empresas;
create trigger empresas_protege_controle
  before update on public.empresas
  for each row execute function public.proteger_controle_empresa();

commit;
