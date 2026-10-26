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
| Dashboard | PRONTO | filtro de período (este mês, mês anterior, próximos 30 dias, personalizado), 8 cards, gráfico de recebimentos dos últimos 6 meses, resumo financeiro, próximos vencimentos, próximos eventos e orçamentos em negociação. Regra: parcelas de contrato cancelado (mesmo sem a parcela estar cancelada) ficam fora de A receber, Em atraso, Próximos vencimentos, lista e resumo; "Recebido" continua vindo dos recebimentos registrados, inclusive de contratos cancelados depois. A mesma regra vale no `/financeiro` e está centralizada em `app/(protegido)/financeiro/calculos.ts` (Dashboard e Financeiro não têm cálculo próprio) |
| Clientes | PRONTO | lista, busca, criar, editar, inativar/reativar; ficha com eventos do cliente |
| Produtos | PRONTO | catálogo com preço em R$ (decimal exato), unidade, categoria, antecedência; busca, inativar/reativar |
| Eventos | PRONTO | tipo e status do banco, data civil sem fuso, filtros próximos/passados, busca; mostra orçamentos e contrato |
| Orçamentos | PRONTO | número automático, itens com preço congelado, desconto, status com histórico, travado após aprovação |
| Contratos | PRONTO (cancelamento implementado) | gerado só a partir de orçamento aprovado; botão "Cancelar contrato" na página do contrato ativo (modal com explicação dos efeitos, motivo obrigatório até 500 caracteres, confirmação, bloqueio de duplo envio, carregando/erro/sucesso), sem reativação; itens, valores, parcelas, linha do tempo, resumo lateral. Contrato cancelado abre como visão histórica: alerta "Contrato cancelado" com data e hora do cancelamento, motivo e nome de quem cancelou, valor original, recebido, itens, parcelas originais e histórico de recebimentos; parcela paga segue "Pago" e a não paga aparece como "Cancelada com o contrato" (só na exibição, o status gravado não muda). Não mostra saldo, a receber, em atraso, "Vencida", próxima parcela, formulário de recebimento nem qualquer botão de cobrança (o app não tem envio de lembretes) |
| Financeiro | PRONTO | cards (A receber, Recebido, Em atraso, Próximos vencimentos em valor e nº de parcelas), filtros (todas, pendentes, parciais, pagas, vencidas), busca, registrar recebimento, histórico por parcela. Aviso na tela se uma consulta falhar (nunca mostra R$ 0,00 em silêncio). Parcela com saldo de contrato cancelado não aparece em nenhum filtro nem entra em valor futuro; parcela quitada de contrato cancelado continua em "Todas"/"Pagas" e o histórico de recebimentos segue na página do contrato; "Recebido" soma todos os recebimentos |
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
- `contratos.evento_id` é único (um contrato por evento). `contratos.valor_final` (gerada) é o valor contratado; `valor_total` é o subtotal antes do desconto. `contratos.status`: ativo/cancelado. Cancelamento: `cancelado_em` (timestamptz), `cancelado_por` (FK para `usuarios`, ON DELETE SET NULL) e `motivo_cancelamento` (texto, 1 a 500 caracteres). CHECK `contratos_cancelamento_check`: contrato ativo não tem dados de cancelamento, cancelado sempre tem data e motivo não vazio.
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
- `cancelar_contrato(p_contrato_id, p_motivo)` (SECURITY DEFINER, `search_path=public`, EXECUTE só para `authenticated`; anon recebe permissão negada): empresa vem de `auth.uid()` → `usuarios` (nunca de parâmetro); só enxerga contrato da própria empresa; exige contrato ativo e motivo não vazio (qualquer espaço em branco conta como vazio); trava o contrato (`FOR UPDATE`) para serializar cancelamentos simultâneos; grava status, `cancelado_em`, `cancelado_por` e motivo numa só instrução e devolve o contrato. Não toca em itens, parcelas ou recebimentos e não faz estorno.
- Trigger `contratos_protege_cancelamento` (BEFORE INSERT OR UPDATE em `contratos`): para os papéis `authenticated`/`anon`, bloqueia mudar status ou dados de cancelamento (inclusive reativar) e inserir contrato já cancelado. A policy `contratos_empresa_all` é FOR ALL e deixaria isso passar; a RPC (DEFINER) e o `service_role`/administrador não são afetados. Outras colunas (ex.: observações) seguem editáveis.
- `registrar_recebimento` (INVOKER): trava a parcela (`FOR UPDATE`) e o contrato (`FOR SHARE`, para um cancelamento e um pagamento simultâneos não furarem um ao outro), bloqueia valor ≤ 0, valor acima do saldo, forma inválida, parcela cancelada e contrato cancelado; insere o recebimento e atualiza `valor_pago`/`status`.
- Auxiliares: `current_empresa_id` (DEFINER), `set_orcamento_numero`, `recalcular_subtotal_orcamento`, `set_updated_at`.

## 14. Storage

Um bucket, `documentos`, privado, com 3 policies por pasta de empresa. Sem tela de upload e sem bucket público de logo.

## 15. Variáveis de ambiente (somente nomes)

- `app/.env.local` (usado pelo Next): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Atualizado após a rotação de credenciais.
- `.env.novo` na raiz (só para scripts de `backup/`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Após a rotação os valores foram conferidos e os scripts funcionam.
- Existem `.env.example` na raiz e em `app/`, sem valores. A chave secret nunca é usada pelo código do Next.

## 16. SQL aplicado (versionado em `backup/`)

Não existe `supabase/migrations/` nem migrations numeradas. O histórico é um conjunto de arquivos SQL aplicados à mão com `backup/apply-sql.js`:
- `migration_completa.sql`: schema inteiro (tabelas, funções, triggers, RLS, bucket).
- `rpc_criar_empresa_usuario.sql`.
- `fix_orcamento_itens_cross_tenant.sql`, `fix_orcamentos_cross_tenant.sql`, `fix_contrato_itens_cross_tenant.sql`: três brechas de isolamento entre empresas, achadas em teste e corrigidas (a policy não validava `produto_id`, `cliente_id`/`evento_id`).
- `rpc_registrar_recebimento.sql`.
- `rpc_cancelar_contrato.sql`: colunas de cancelamento, FK, CHECK, trigger de proteção, RPC `cancelar_contrato` e nova versão de `registrar_recebimento` (com `FOR SHARE`). Aplicada numa transação única; contém o roteiro de reversão no cabeçalho.
- Scripts: `apply-sql.js`, `apply-migration.js`, `validacao-dashboard.js` (`criar | esperado | comparar | limpar`: empresa de teste com cenário controlado, valores esperados do dashboard calculados por SQL, comparação com o que Dashboard e Financeiro mostram nos 4 períodos, e remoção de tudo), `validacao-cancelamento.js` (`criar | verificar | verificar-ui | limpar`: 17 pontos do cancelamento via API real com JWT, chave anônima e outra empresa; 5 rodadas de 2 cancelamentos simultâneos, trava de linha, corridas cancelamento × pagamento, falha transacional injetada, contorno por UPDATE direto, Dashboard/Financeiro/página do contrato antes e depois), `validacao-contrato.js` (`criar | verificar | limpar`: empresa A com contrato ativo e contrato cancelado, empresa B para isolamento; confere os 10 pontos da página `/contratos/[id]` e que nada foi alterado no banco), `validacao-financeiro.js` (`criar | verificar | limpar`: 7 contratos de cenários diferentes, confere Dashboard x Financeiro x SQL, os 5 filtros e o histórico de recebimentos de contratos cancelados; `limpar` confere que o banco voltou às contagens iniciais), `lib-app-validacao.js` (login do usuário de teste e leitura das páginas, usado pelos dois scripts; precisa do servidor em `APP_URL`, padrão `http://localhost:3000`), `regressao-completa.js` (regressão do banco: policies, fluxo completo e isolamento; cria e apaga duas empresas de teste), `test-rpc-atomicidade.js`, `export-all.js`, `gerar-migration.js`, `test-connection.js`.

## 17. Segurança implementada

RLS em todas as tabelas de negócio com `WITH CHECK` validando todas as referências; escrita financeira só pela RPC; contrato e orçamento aprovado imutáveis pela interface; `.env*` fora do Git; busca de credenciais nos arquivos versionados sem ocorrências; credenciais antigas rotadas.

## 18. Preparação para produção

- `tsc --noEmit`, `lint` e `build` passam (21 rotas, todas dinâmicas exceto `_not-found` e `/cadastro/verifique-email`).
- Não há deploy. O app roda local com `npm run dev` na porta 3000.
- Faltam: campo `engines` no `package.json`, headers de segurança e limites de upload no `next.config.ts`, testes automatizados. Datas civis são tratadas como texto e "hoje" usa o fuso America/Sao_Paulo (`hojeISO`).

## 19. Pendências reais

Produção; Agenda; PDF de orçamento e contrato; estorno, edição e exclusão de recebimento; cancelamento de parcela individual (existe no banco, sem tela); reativação de contrato cancelado (não existe; o trigger a bloqueia); controle por cargo (hoje qualquer usuário da empresa cancela contrato); documentos/upload; relatórios; despesas e contas a pagar; equipe, cargos e permissões; auditoria; configurações da empresa; recuperação de senha; importar (ou descartar) os dados reais do projeto antigo, que estão exportados em `backup/data/` (fora do Git, contêm dados pessoais).

## 20. Último ponto do desenvolvimento

Redesign visual (menu lateral, barra superior, tema claro, fonte Inter, página do contrato em duas colunas), reativação do projeto Supabase, validação completa, rotação das credenciais e primeiro commit no Git. Depois: Dashboard gerencial e alinhamento do Dashboard com o Financeiro na regra de contratos cancelados (cálculo único em `financeiro/calculos.ts`). Em seguida, a página do contrato (`/contratos/[id]`) passou a tratar contrato cancelado como visão histórica, usando as mesmas funções de `financeiro/calculos.ts` (`parcelasEmAberto`, `resumoFuturo`, `situacaoHistorica`). Por último, o cancelamento seguro de contrato (migration `rpc_cancelar_contrato.sql`, RPC `cancelar_contrato`, modal na página do contrato). Limitações: qualquer usuário da empresa pode cancelar (não há permissão por cargo); não há reativação nem estorno; o cancelamento não cancela as parcelas (o status gravado delas fica como estava, e a tela mostra "Cancelada com o contrato"); a policy `contratos_empresa_all` continua permitindo DELETE direto de contrato. O banco hoje tem 1 empresa e 1 usuário reais e nenhum dado de negócio.

## 21. Próximo passo recomendado

1. Estorno de recebimento (fecha o Financeiro).
2. Produção.
3. PDF de orçamento e contrato.
4. Permissão por cargo (quem pode cancelar contrato) e bloqueio de DELETE direto em `contratos`.
5. Antes de publicar: headers de segurança, `engines` e atualizar o `.env.novo`.

## Git

Repositório próprio nesta pasta (`main`), sem remote. Primeiro commit `7070254`. Fora do Git: `.env*` (exceto `.env.example`), `node_modules`, `.next`, `backup/data`, `backup/storage` e `fofurinhadoces/` (repositório aninhado com export antigo).
