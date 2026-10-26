-- Corrige vulnerabilidade cross-tenant encontrada na auditoria do módulo de
-- Orçamentos: orcamento_itens_empresa_all só validava que orcamento_id era da
-- empresa atual, mas não validava que produto_id também era. Isso permitia uma
-- empresa inserir, no próprio orçamento, um item apontando para produto de
-- outra empresa (confirmado com teste real: INSERT teve sucesso antes desta
-- correção). Não altera coluna/tabela, só reforça o WITH CHECK da policy.
drop policy if exists "orcamento_itens_empresa_all" on public.orcamento_itens;

create policy "orcamento_itens_empresa_all" on public.orcamento_itens
as permissive for all to public
using (
  exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id
      and o.empresa_id = current_empresa_id()
  )
)
with check (
  exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id
      and o.empresa_id = current_empresa_id()
  )
  and exists (
    select 1 from public.produtos p
    where p.id = orcamento_itens.produto_id
      and p.empresa_id = current_empresa_id()
  )
);
