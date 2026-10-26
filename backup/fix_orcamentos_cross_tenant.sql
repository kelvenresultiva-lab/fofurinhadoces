-- Corrige uma segunda vulnerabilidade cross-tenant encontrada na auditoria do módulo
-- de Orçamentos: orcamentos_empresa_all só validava empresa_id = current_empresa_id(),
-- e como empresa_id tem DEFAULT current_empresa_id(), essa checagem sempre passa
-- sozinha. Ela nunca validava se cliente_id/evento_id realmente pertenciam à empresa
-- atual. Confirmado com teste real: Empresa B conseguiu inserir um orçamento próprio
-- apontando cliente_id/evento_id de outra empresa. Não altera coluna/tabela, só
-- reforça o WITH CHECK da policy.
drop policy if exists "orcamentos_empresa_all" on public.orcamentos;

create policy "orcamentos_empresa_all" on public.orcamentos
as permissive for all to public
using (
  empresa_id = current_empresa_id()
)
with check (
  empresa_id = current_empresa_id()
  and exists (
    select 1 from public.clientes c
    where c.id = orcamentos.cliente_id
      and c.empresa_id = current_empresa_id()
  )
  and exists (
    select 1 from public.eventos e
    join public.clientes c2 on c2.id = e.cliente_id
    where e.id = orcamentos.evento_id
      and c2.empresa_id = current_empresa_id()
  )
);
