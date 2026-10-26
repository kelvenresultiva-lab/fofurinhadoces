-- RPC atômica de cadastro: cria empresa + usuario juntos.
-- O schema não tem trigger para isso e não há policy de INSERT em
-- "empresas"/"usuarios" (só select/update), então isso só pode ser
-- feito aqui, via SECURITY DEFINER.
--
-- Atomicidade: os dois INSERTs rodam dentro do mesmo corpo de função,
-- que executa na transação chamadora (uma chamada RPC = uma transação).
-- Não há bloco EXCEPTION aqui de propósito: qualquer erro (inclusive a
-- violação de PK em usuarios.id quando duas chamadas concorrem pelo
-- mesmo auth.uid()) aborta a transação inteira e desfaz o INSERT em
-- empresas também. Não existe cenário de empresa órfã.
CREATE OR REPLACE FUNCTION public.criar_empresa_e_usuario(
  p_nome_empresa text,
  p_nome_usuario text,
  p_email text,
  p_telefone text DEFAULT NULL
)
RETURNS TABLE (empresa_id uuid, usuario_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if exists (select 1 from public.usuarios u where u.id = v_uid) then
    raise exception 'Usuário já possui cadastro.';
  end if;

  if coalesce(trim(p_nome_empresa), '') = '' then
    raise exception 'Nome da empresa é obrigatório.';
  end if;

  insert into public.empresas (nome)
  values (p_nome_empresa)
  returning id into v_empresa_id;

  insert into public.usuarios (id, empresa_id, nome, email, telefone, cargo)
  values (v_uid, v_empresa_id, p_nome_usuario, p_email, p_telefone, 'administrador');

  return query select v_empresa_id, v_uid;
end;
$$;

GRANT EXECUTE ON FUNCTION public.criar_empresa_e_usuario(text, text, text, text) TO authenticated;
