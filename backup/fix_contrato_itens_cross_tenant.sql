-- Corrige uma terceira vulnerabilidade cross-tenant, mesmo padrão de
-- orcamento_itens/orcamentos: contrato_itens_empresa_all só validava contrato_id,
-- nunca produto_id. Confirmado com teste real: Empresa B inseriu, no próprio
-- contrato (gerado legitimamente via converter_orcamento_em_contrato), um item
-- apontando para produto da Empresa A. Não altera coluna/tabela, só reforça o
-- WITH CHECK da policy.
drop policy if exists "contrato_itens_empresa_all" on public.contrato_itens;

create policy "contrato_itens_empresa_all" on public.contrato_itens
as permissive for all to public
using (
  exists (
    select 1
    from public.contratos ct
    join public.eventos e on e.id = ct.evento_id
    join public.clientes c on c.id = e.cliente_id
    where ct.id = contrato_itens.contrato_id
      and c.empresa_id = current_empresa_id()
  )
)
with check (
  exists (
    select 1
    from public.contratos ct
    join public.eventos e on e.id = ct.evento_id
    join public.clientes c on c.id = e.cliente_id
    where ct.id = contrato_itens.contrato_id
      and c.empresa_id = current_empresa_id()
  )
  and exists (
    select 1 from public.produtos p
    where p.id = contrato_itens.produto_id
      and p.empresa_id = current_empresa_id()
  )
);
