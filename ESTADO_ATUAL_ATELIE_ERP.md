# ESTADO_ATUAL_ATELIE_ERP.md

Estado real do repositório `FOFURINHA DOCES` (Ateliê ERP / Fofurinha Doces). Este arquivo substitui as versões anteriores, que estavam desatualizadas. Tudo aqui foi conferido no código e no banco; o que não existe está marcado como tal.

Última atualização: 2026-10-25. Último commit funcional: `7070254` (primeiro commit do repositório).

---

## 1. Visão geral

Sistema de gestão para a Fofurinha Doces (doces para eventos: casamento, chá revelação, aniversário, 15 anos, batizado). SaaS multiempresa self-service: qualquer pessoa cria uma empresa em `/cadastro` e só enxerga os dados da própria empresa.

Cobre o fluxo comercial de ponta a ponta: **cliente → evento → orçamento → contrato → parcelas → recebimentos**, com catálogo de produtos. Ainda não cobre produção, agenda, PDF, despesas, equipe e permissões por cargo.

## 2. Fluxo operacional

1. A pessoa cria a empresa em `/cadastro` e confirma o e-mail (o projeto exige confirmação). Empresa e usuário são criados juntos, de forma atômica.
2. Cadastra **clientes** e **produtos** (catálogo com preço).
3. Cria um **evento** para um cliente.
4. Cria um **orçamento** a partir do evento: adiciona produtos (o preço é congelado no item), aplica desconto (valor ou percentual), muda o status.
5. Ao **aprovar** o orçamento (só um aprovado por evento), gera o **contrato**: define número de parcelas, 1º vencimento e entrada opcional. O banco copia os itens e cria as parcelas.
6. No contrato ou em `/financeiro`, acompanha as parcelas e **registra recebimentos** (parciais ou totais). O banco mantém `valor_pago` e `status` da parcela sincronizados.

## 3. Stack real

- Next.js 16.3.6 (App Router, Turbopack, Server Components e Server Actions), React 19.2, TypeScript 5, Tailwind v4.
- `@supabase/supabase-js` e `@supabase/ssr` (cliente de navegador, de servidor e renovação de sessão). Ícones: `lucide-react`. Fonte: Inter.
- Supabase hospedado (Postgres + Auth). Next 16 usa `proxy.ts` no lugar de `middleware.ts`; o arquivo ativo é `app/proxy.ts`, que chama `lib/supabase/middleware.ts` (só um helper).
- Sem biblioteca de testes. O `app/AGENTS.md` (gerado pelo Next) manda ler `node_modules/next/dist/docs/` antes de escrever código.

## 4. Autenticação (modelo ativo)

- `/cadastro` público, `/login`, logout pelo menu lateral, `/auth/confirm` (valida o link do e-mail e, se o usuário ainda não tiver empresa, chama a RPC de cadastro com os dados guardados em `user_metadata`).
- Rotas privadas ficam no route group `app/app/(protegido)/`. O layout dele e o `proxy.ts` redirecionam quem não está logado para `/login`.
- Não existe convite de usuário para uma empresa já existente, nem recuperação de senha.

## 5. Modelo multiempresa

Isolamento por RLS no Postgres, via `current_empresa_id()` (lê `usuarios.empresa_id` a partir de `auth.uid()`). Todas as 12 tabelas de negócio têm RLS ligado. `eventos` e `contratos` não têm `empresa_id`: o isolamento vem da cadeia evento → cliente → empresa. Testado com duas empresas reais (leitura, escrita, RPCs e inserção cruzada bloqueadas).

## 6. Módulos e status

| Módulo | Status | O que faz |
|---|---|---|
| Autenticação/cadastro | PRONTO | cadastro self-service, login, logout, confirmação de e-mail |
| Dashboard | PRONTO | filtro de período (este mês, mês anterior, próximos 30 dias, personalizado), 8 cards, gráfico de recebimentos dos últimos 6 meses, resumo financeiro, próximos vencimentos, próximos eventos e orçamentos em negociação. Regra: parcelas de contrato cancelado (mesmo sem a parcela estar cancelada) ficam fora de A receber, Em atraso, Próximos vencimentos, lista e resumo; "Recebido" continua vindo dos recebimentos registrados, inclusive de contratos cancelados depois. A página `/financeiro` ainda NÃO aplica essa exclusão (só ignora parcela cancelada) |
| Clientes | PRONTO | lista, busca, criar, editar, inativar/reativar; ficha com eventos do cliente |
| Produtos | PRONTO | catálogo com preço em R$ (decimal exato), unidade, categoria, antecedência; busca, inativar/reativar |
| Eventos | PRONTO | tipo e status do banco, data civil sem fuso, filtros próximos/passados, busca; mostra orçamentos e contrato |
| Orçamentos | PRONTO | número automático, itens com preço congelado, desconto, status com histórico, travado após aprovação |
| Contratos | PRONTO (somente leitura) | gerado só a partir de orçamento aprovado; itens, valores, parcelas, linha do tempo, resumo lateral |
| Financeiro | PRONTO | cards, filtros, busca, registrar recebimento, histórico por parcela |
| Produção | NÃO EXISTE | só a coluna `contrato_itens.status_producao`, sem tela |
| Agenda, Relatórios, Marketing | NÃO EXISTE | |
| Documentos | NÃO EXISTE | existem a tabela `documentos` e o bucket, sem tela |
| Equipe e acessos, Configurações da empresa, Arquivados, Auditoria | NÃO EXISTE | |

Rotas: `/`, `/login`, `/cadastro`, `/cadastro/verifique-email`, `/auth/confirm`, `/dashboard`, `/clientes` (+`/novo`, `/[id]`), `/produtos` (+`/novo`, `/[id]`), `/eventos` (+`/novo`, `/[id]`), `/orcamentos` (+`/novo`, `/[id]`), `/contratos` (+`/[id]`), `/financeiro`.

## 7. Banco e principais tabelas

16 tabelas em `public`: `empresas`, `usuarios`, `clientes`, `cliente_familiares` (sem tela), `produtos`, `eventos`, `orcamentos`, `orcamento_itens`, `orcamento_historico`, `contratos`, `contrato_itens`, `parcelas`, `recebimentos`, `tarefas` (sem tela), `documentos` (sem tela), `observacoes` (sem tela).

Regras relevantes do schema:
- `eventos.tipo` (casamento, cha_revelacao, aniversario, 15_anos, batizado, outro) e `eventos.status` (planejado, confirmado, realizado, cancelado) são CHECK fechados.
- `orcamentos.status`: rascunho, enviado, em_negociacao, aprovado, recusado, expirado, cancelado. Índice único parcial: só um aprovado por evento. Numeração por empresa via trigger (conflito sob concorrência vira erro de chave única, sem número duplicado).
- `orcamentos.subtotal` é mantido por trigger; `valor_total` e `orcamento_itens.subtotal` são colunas geradas. Desconto: `desconto_tipo` (valor/percentual) + `desconto_valor`.
- `contratos.evento_id` é único (um contrato por evento). `contratos.valor_final` (gerada) é o valor contratado; `valor_total` é o subtotal antes do desconto. `contratos.status`: ativo/cancelado.
- `parcelas.status`: pendente, parcial, pago, cancelado. `recebimentos.forma_pagamento` e `parcelas.forma_pagamento`: pix, dinheiro, cartao_credito, cartao_debito, transferencia, cheque, boleto, outros.
- `orcamentos.deleted_at` existe desde o schema original, mas nada o usa.

## 8. Fonte financeira canônica

`recebimentos` é o histórico (ledger) de pagamentos. `parcelas.valor_pago` e `parcelas.status` são o cache, escritos **somente** pela RPC `registrar_recebimento`, na mesma transação. Telas e cards derivam de `recebimentos`/saldo das parcelas, nunca do catálogo. Saldo = `valor - valor_pago`. **Vencida** é situação derivada (vencimento < hoje, saldo > 0, parcela não cancelada), comparada como data civil em texto `AAAA-MM-DD`. Diagnóstico `valor_pago` × soma dos recebimentos: 0 divergências.

## 9. RBAC

NÃO EXISTE. `usuarios.cargo` (administrador, financeiro, producao, atendente, marketing) é só uma coluna; o app apenas exibe o cargo na barra superior. Não há proteção de página ou ação por cargo.

## 10. Arquivamento

NÃO EXISTE. A remoção lógica é por status: clientes (`status` ativo/inativo), produtos (`ativo`), eventos (`cancelado`). Não há exclusão física pela interface.

## 11. Histórico comercial

- Orçamento só aceita alteração de itens, desconto e observações em rascunho, enviado e em_negociacao; as Server Actions conferem o status no banco antes de agir.
- Preço do produto é copiado para `orcamento_itens.valor_unitario` e depois para `contrato_itens.valor_unitario`; mudar o catálogo não altera orçamento nem contrato antigo (testado).
- Contrato não tem tela de edição.
- `orcamento_historico` registra mudanças de status e a conversão em contrato.

## 12. Auditoria

NÃO EXISTE auditoria global (sem `audit_logs`). Só o histórico de orçamento acima.

## 13. RPCs e funções

- `criar_empresa_e_usuario` (SECURITY DEFINER): cria empresa + usuário atomicamente; única forma de popular essas duas tabelas.
- `converter_orcamento_em_contrato` (INVOKER): exige orçamento aprovado e sem contrato; copia itens; cria parcelas (divisão com resto na última); vincula o orçamento; registra no histórico. Serializa chamadas simultâneas com `FOR UPDATE`.
- `registrar_recebimento` (INVOKER): trava a parcela (`FOR UPDATE`), bloqueia valor ≤ 0, valor acima do saldo, forma inválida, parcela cancelada e contrato cancelado; insere o recebimento e atualiza `valor_pago`/`status`.
- Auxiliares: `current_empresa_id` (DEFINER), `set_orcamento_numero`, `recalcular_subtotal_orcamento`, `set_updated_at`.

## 14. Storage

Um bucket, `documentos`, privado, com 3 policies por pasta de empresa. Sem tela de upload e sem bucket público de logo.

## 15. Variáveis de ambiente (somente nomes)

- `app/.env.local` (usado pelo Next): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Atualizado após a rotação de credenciais.
- `.env.novo` na raiz (só para scripts de `backup/`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Como as credenciais foram rotadas, esses valores precisam ser atualizados antes de usar os scripts.
- Existem `.env.example` na raiz e em `app/`, sem valores. A chave secret nunca é usada pelo código do Next.

## 16. SQL aplicado (versionado em `backup/`)

Não existe `supabase/migrations/` nem migrations numeradas. O histórico é um conjunto de arquivos SQL aplicados à mão com `backup/apply-sql.js`:
- `migration_completa.sql`: schema inteiro (tabelas, funções, triggers, RLS, bucket).
- `rpc_criar_empresa_usuario.sql`.
- `fix_orcamento_itens_cross_tenant.sql`, `fix_orcamentos_cross_tenant.sql`, `fix_contrato_itens_cross_tenant.sql`: três brechas de isolamento entre empresas, achadas em teste e corrigidas (a policy não validava `produto_id`, `cliente_id`/`evento_id`).
- `rpc_registrar_recebimento.sql`.
- Scripts: `apply-sql.js`, `apply-migration.js`, `validacao-dashboard.js` (cria uma empresa de teste com cenário controlado, imprime os valores esperados do dashboard calculados por SQL e remove tudo), `regressao-completa.js` (regressão do banco: policies, fluxo completo e isolamento; cria e apaga duas empresas de teste), `test-rpc-atomicidade.js`, `export-all.js`, `gerar-migration.js`, `test-connection.js`.

## 17. Segurança implementada

RLS em todas as tabelas de negócio com `WITH CHECK` validando todas as referências; escrita financeira só pela RPC; contrato e orçamento aprovado imutáveis pela interface; `.env*` fora do Git; busca de credenciais nos arquivos versionados sem ocorrências; credenciais antigas rotadas.

## 18. Preparação para produção

- `tsc --noEmit`, `lint` e `build` passam (21 rotas, todas dinâmicas exceto `_not-found` e `/cadastro/verifique-email`).
- Não há deploy. O app roda local com `npm run dev` na porta 3000.
- Faltam: campo `engines` no `package.json`, headers de segurança e limites de upload no `next.config.ts`, testes automatizados. Datas civis são tratadas como texto e "hoje" usa o fuso America/Sao_Paulo (`hojeISO`).

## 19. Pendências reais

Produção; Agenda; PDF de orçamento e contrato; estorno, edição e exclusão de recebimento; cancelamento de contrato e de parcela (existe no banco, sem tela); documentos/upload; relatórios; despesas e contas a pagar; equipe, cargos e permissões; auditoria; configurações da empresa; recuperação de senha; importar (ou descartar) os dados reais do projeto antigo, que estão exportados em `backup/data/` (fora do Git, contêm dados pessoais).

## 20. Último ponto do desenvolvimento

Redesign visual (menu lateral, barra superior, tema claro, fonte Inter, página do contrato em duas colunas), reativação do projeto Supabase, validação completa, rotação das credenciais e primeiro commit no Git. O banco hoje tem 1 empresa e 1 usuário reais e nenhum dado de negócio.

## 21. Próximo passo recomendado

1. Estorno de recebimento (fecha o Financeiro).
2. Produção.
3. PDF de orçamento e contrato.
5. Antes de publicar: headers de segurança, `engines` e atualizar o `.env.novo`.

## Git

Repositório próprio nesta pasta (`main`), sem remote. Primeiro commit `7070254`. Fora do Git: `.env*` (exceto `.env.example`), `node_modules`, `.next`, `backup/data`, `backup/storage` e `fofurinhadoces/` (repositório aninhado com export antigo).
