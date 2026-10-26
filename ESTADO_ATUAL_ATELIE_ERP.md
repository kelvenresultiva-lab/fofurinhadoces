# ESTADO_ATUAL_ATELIE_ERP.md

Estado real do repositório `FOFURINHA DOCES` (Ateliê ERP / Fofurinha Doces). Este arquivo substitui as versões anteriores, que estavam desatualizadas. Tudo aqui foi conferido no código e no banco; o que não existe está marcado como tal.

Última atualização: 2026-10-26. Último commit funcional: "feat: adiciona metas de contratos e entradas" (o primeiro commit do repositório é o `7070254`).

---

## 1. Visão geral

Sistema de gestão para a Fofurinha Doces (doces para eventos: casamento, chá revelação, aniversário, 15 anos, batizado). SaaS multiempresa self-service: qualquer pessoa cria uma empresa em `/cadastro` e só enxerga os dados da própria empresa.

Cobre o fluxo comercial de ponta a ponta: **cliente → evento → orçamento → contrato → parcelas → recebimentos**, com catálogo de produtos, um controle básico de despesas (contas a pagar) e metas mensais de contratos e de entradas. Ainda não cobre produção, agenda, PDF, equipe e permissões por cargo.

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

Isolamento por RLS no Postgres, via `current_empresa_id()` (lê `usuarios.empresa_id` a partir de `auth.uid()`). Todas as 14 tabelas de negócio (incluindo `despesas` e `metas`) têm RLS ligado. `eventos` e `contratos` não têm `empresa_id`: o isolamento vem da cadeia evento → cliente → empresa. Testado com duas empresas reais (leitura, escrita, RPCs e inserção cruzada bloqueadas).

## 6. Módulos e status

| Módulo | Status | O que faz |
|---|---|---|
| Autenticação/cadastro | PRONTO | cadastro self-service, login, logout, confirmação de e-mail |
| Dashboard | PRONTO | filtro de período (este mês, mês anterior, próximos 30 dias, personalizado), 8 cards, resumo compacto das metas do mês atual (`metas/ResumoMetas.tsx`: barra de contratos e de entradas, link "Ver metas" ou "Definir metas do mês"; falha nele fica contida no bloco), gráfico de recebimentos dos últimos 6 meses, resumo financeiro, próximos vencimentos, próximos eventos e orçamentos em negociação. Regra: parcelas de contrato cancelado (mesmo sem a parcela estar cancelada) ficam fora de A receber, Em atraso, Próximos vencimentos, lista e resumo; "Recebido" continua vindo dos recebimentos registrados, inclusive de contratos cancelados depois. A mesma regra vale no `/financeiro` e está centralizada em `app/(protegido)/financeiro/calculos.ts` (Dashboard e Financeiro não têm cálculo próprio) |
| Clientes | PRONTO | lista, busca, criar, editar, inativar/reativar; ficha com eventos do cliente |
| Produtos | PRONTO | catálogo com preço em R$ (decimal exato), unidade, categoria, antecedência; busca, inativar/reativar |
| Eventos | PRONTO | tipo e status do banco, data civil sem fuso, filtros próximos/passados, busca; mostra orçamentos e contrato |
| Orçamentos | PRONTO | número automático, itens com preço congelado, desconto, status com histórico, travado após aprovação |
| Contratos | PRONTO (listagem geral e cancelamento implementados) | listagem geral em `/contratos` (arquivos em `contratos/(lista)/`, com `loading.tsx` e `error.tsx` próprios para não afetar a página do contrato): 5 cards da empresa (ativos, valor total contratado dos ativos, total recebido com o que veio de cancelados informado, saldo a receber, cancelados), busca sem acento por nº, cliente e tipo do evento, filtros Todos/Ativos/Pagos/Com saldo/Em atraso/Cancelados, ordenação por mais recentes/evento mais próximo/maior valor/maior saldo, tabela a partir de 1400px de largura e cards abaixo disso (sem rolagem horizontal no celular), estado vazio e erro de consulta sem zeros falsos; "Nº do contrato" é o número do orçamento de origem (contrato não tem numeração própria); situação financeira derivada em `situacaoFinanceiraContrato` (cancelado > pago > em atraso > parcial > em dia), sem coluna nova; lê as tabelas em páginas de 1000 linhas para os totais nunca serem cortados; gerado só a partir de orçamento aprovado; botão "Cancelar contrato" na página do contrato ativo (modal com explicação dos efeitos, motivo obrigatório até 500 caracteres, confirmação, bloqueio de duplo envio, carregando/erro/sucesso), sem reativação. Página do contrato (`/contratos/[id]`) no layout da referência: breadcrumb, cabeçalho com avatar de iniciais, cliente, status, tipo e data do evento, e-mail, telefone, valor total, entrada, parcelado (Nx de R$), criação, orçamento e vencimento final, botões "Receber pagamento" e "Cancelar contrato"; abas por `?aba=` (Resumo com itens e valores, Parcelas, Pagamentos com o histórico de recebimentos, Observações); tabela de parcelas (status, dias em atraso, "Pago em" com cada recebimento, "Registrar pagamento" em modal `RegistrarPagamento.tsx`), linha do tempo de pagamentos, e na lateral resumo em rosca (recebido / a receber / em atraso), próxima parcela, previsão de recebimentos e observações; no celular a tabela vira cards. Não existem no sistema e por isso não aparecem: editar contrato, adicionar parcela, comprovante, lembrete por WhatsApp, abas Histórico e Documentos, foto do cliente. Contrato cancelado abre como visão histórica: alerta "Contrato cancelado" com data e hora do cancelamento, motivo e nome de quem cancelou, valor original, recebido, itens, parcelas originais e histórico de recebimentos; parcela paga segue "Pago" e a não paga aparece como "Cancelada com o contrato" (só na exibição, o status gravado não muda). Não mostra saldo, a receber, em atraso, "Vencida", próxima parcela, formulário de recebimento nem qualquer botão de cobrança (o app não tem envio de lembretes) |
| Parcelas | PRONTO | menu lateral "Parcelas" (logo abaixo de Contratos, desktop e mobile) e página `/parcelas` com todas as parcelas da empresa, no padrão de `/contratos`: 4 cards (Total a receber, Recebido, Em atraso, Próximos vencimentos) calculados por `financeiro/calculos.ts` sobre a empresa inteira; lista com parcela/descrição, nº do contrato (nº do orçamento de origem), cliente, vencimento, valor, recebido, saldo, status (Pendente, Parcial, Pago, Vencida, Cancelada) e ações; busca sem acento por cliente, nº do contrato e descrição (busca só com dígitos, com ou sem "#", é nº do contrato exato); filtros Todas/Pendentes/Parciais/Pagas/Vencidas (mesma semântica do Financeiro); ordenação por vencimento mais próximo/mais distante, maior valor, maior saldo; tabela a partir de 1400px e cards abaixo disso; `loading.tsx`, `error.tsx` e estado vazio. Mesmas regras do Financeiro (`aparecemNaListaFinanceira`): parcela com saldo de contrato cancelado não aparece; quitadas seguem como histórico. "Registrar pagamento" só em parcela em aberto (`ehParcelaEmAberto`), usando o mesmo modal `RegistrarPagamento.tsx` e a mesma Server Action/RPC; o modal recebe `retorno` e a action volta para `/parcelas` com busca/filtros preservados (só aceita caminhos de `/parcelas`; sem ele, volta ao contrato como antes). "Ver contrato" em todas as linhas. Lê as tabelas em páginas de 1000 (`lerTudo`) e falha de consulta vai para `error.tsx`, nunca R$ 0,00 |
| Recebimentos | PRONTO | menu lateral "Recebimentos" (logo abaixo de Parcelas, desktop e mobile) e página `/recebimentos`, somente leitura, com todos os pagamentos da empresa (ledger `recebimentos`), inclusive de contratos cancelados (histórico, com selo discreto "Contrato cancelado"). Período (fuso America/Sao_Paulo, `resolverPeriodoRecebimentos` em `dashboard/periodo.ts`): Este mês (padrão), Mês anterior, Últimos 30 dias (hoje incluído), Este ano, Personalizado (datas inválidas voltam a Este mês com aviso). 4 cards: Recebido no período, Recebido neste mês (sempre o mês corrente), quantidade e valor médio no período; os cards consideram só o período, não a busca nem a forma. Lista: data, cliente, nº do contrato (nº do orçamento de origem), parcela, valor, forma de pagamento, observação e "Ver contrato"; busca sem acento por cliente, nº do contrato e descrição da parcela; filtro por forma de pagamento; ordenação mais recentes (padrão; mesmo dia desempata por `created_at`), mais antigos, maior e menor valor. Tabela a partir de 1400px, cards abaixo; `loading.tsx`, `error.tsx` (falha de consulta nunca vira R$ 0,00) e estado vazio. Sem editar, excluir, estornar ou comprovante. Lê em páginas de 1000 (`lerTudo`) |
| Despesas | PRONTO (básico) | menu lateral "Despesas" (abaixo de Recebimentos, desktop e mobile), `/despesas` com botão "Nova despesa", 4 cards (Total de despesas, Total pago, Total pendente, Total em atraso) sobre as despesas com vencimento no período, sem as canceladas; período pelo vencimento (Este mês, Mês anterior, Próximos 30 dias, Este ano, Personalizado; `resolverPeriodoDespesas` em `dashboard/periodo.ts`, fuso America/Sao_Paulo); busca sem acento em descrição e observações; filtros Todas/Pendentes/Pagas/Em atraso/Canceladas e categoria; ordenação vencimento mais próximo, mais recentes, maior e menor valor; status Pendente, Paga, Em atraso (só visual: pendente vencida), Cancelada. `/despesas/nova` (descrição, categoria, valor, vencimento, observações; nasce pendente) e `/despesas/[id]` (edição só de pendente; paga/cancelada abre como detalhe somente leitura). Ações da pendente: Editar, Marcar como paga (modal com data, sugerindo hoje e sem data futura, e forma de pagamento) e Cancelar (modal de confirmação); as Server Actions só alteram despesa ainda pendente (filtro por status). Sem exclusão, reabertura, fornecedores, recorrência ou anexos. Tabela a partir de 1400px, cards abaixo; `loading.tsx`, `error.tsx` e estado vazio. Ainda não entra no Dashboard nem no Financeiro |
| Metas | PRONTO | item "Metas" na seção "Outros" do menu (desktop; no celular segue na mesma barra). `/metas?mes=AAAA-MM`: mês anterior/próximo/voltar ao atual, "Definir/Editar metas" (formulário com mês e ano, meta de contratos e meta de entradas; grava só as metas, por upsert no mês). Dois blocos independentes, cada um com meta, realizado, quanto falta, percentual, quantidade, média e barra (roxa; verde quando atingida). **Meta de contratos** = soma de `contratos.valor_final` dos contratos ATIVOS cujo `created_at` (fuso America/Sao_Paulo) cai no mês; cada contrato conta uma vez pelo valor cheio; cancelado sai do realizado; parcelas e recebimentos não entram. **Meta de entradas** = soma de `recebimentos.valor` com `recebimentos.data` no mês (entrada e parcelas registradas); recebimento de contrato cancelado continua contando. Previsão (mês atual e futuros): já entrou, saldo das parcelas em aberto de contratos ativos com vencimento no mês (`parcelasEmAberto`), total potencial e quanto falta mesmo com o previsto. Histórico mensal (meses com meta ou com realizado, mais o atual): metas, realizados, percentuais e situação independente de cada meta (Atingida, Não atingida, Em andamento, Futura, Sem meta). Nada é gravado como realizado: tudo é recalculado em cada carregamento (`metas/calculos.ts`, leitura em `metas/dados.ts` com `lerTudo`), então gerar/cancelar contrato e registrar pagamento refletem sem botão nenhum. `loading.tsx`, `error.tsx` |
| Financeiro | PRONTO | cards (A receber, Recebido, Em atraso, Próximos vencimentos em valor e nº de parcelas), filtros (todas, pendentes, parciais, pagas, vencidas), busca, registrar recebimento, histórico por parcela. Aviso na tela se uma consulta falhar (nunca mostra R$ 0,00 em silêncio). Parcela com saldo de contrato cancelado não aparece em nenhum filtro nem entra em valor futuro; parcela quitada de contrato cancelado continua em "Todas"/"Pagas" e o histórico de recebimentos segue na página do contrato; "Recebido" soma todos os recebimentos |
| Produção | NÃO EXISTE | só a coluna `contrato_itens.status_producao`, sem tela |
| Agenda, Relatórios, Marketing | NÃO EXISTE | |
| Documentos | NÃO EXISTE | existem a tabela `documentos` e o bucket, sem tela |
| Equipe e acessos, Configurações da empresa, Arquivados, Auditoria | NÃO EXISTE | |

Rotas: `/`, `/login`, `/cadastro`, `/cadastro/verifique-email`, `/auth/confirm`, `/dashboard`, `/clientes` (+`/novo`, `/[id]`), `/produtos` (+`/novo`, `/[id]`), `/eventos` (+`/novo`, `/[id]`), `/orcamentos` (+`/novo`, `/[id]`), `/contratos` (+`/[id]`), `/parcelas`, `/recebimentos`, `/despesas` (+`/nova`, `/[id]`), `/financeiro`, `/metas`.

## 7. Banco e principais tabelas

18 tabelas em `public`: `empresas`, `usuarios`, `clientes`, `cliente_familiares` (sem tela), `produtos`, `eventos`, `orcamentos`, `orcamento_itens`, `orcamento_historico`, `contratos`, `contrato_itens`, `parcelas`, `recebimentos`, `despesas`, `metas`, `tarefas` (sem tela), `documentos` (sem tela), `observacoes` (sem tela).

Regras relevantes do schema:
- `eventos.tipo` (casamento, cha_revelacao, aniversario, 15_anos, batizado, outro) e `eventos.status` (planejado, confirmado, realizado, cancelado) são CHECK fechados.
- `orcamentos.status`: rascunho, enviado, em_negociacao, aprovado, recusado, expirado, cancelado. Índice único parcial: só um aprovado por evento. Numeração por empresa via trigger (conflito sob concorrência vira erro de chave única, sem número duplicado).
- `orcamentos.subtotal` é mantido por trigger; `valor_total` e `orcamento_itens.subtotal` são colunas geradas. Desconto: `desconto_tipo` (valor/percentual) + `desconto_valor`.
- `contratos.evento_id` é único (um contrato por evento). `contratos.valor_final` (gerada) é o valor contratado; `valor_total` é o subtotal antes do desconto. `contratos.status`: ativo/cancelado. Cancelamento: `cancelado_em` (timestamptz), `cancelado_por` (FK para `usuarios`, ON DELETE SET NULL) e `motivo_cancelamento` (texto, 1 a 500 caracteres). CHECK `contratos_cancelamento_check`: contrato ativo não tem dados de cancelamento, cancelado sempre tem data e motivo não vazio.
- `parcelas.status`: pendente, parcial, pago, cancelado. `recebimentos.forma_pagamento` e `parcelas.forma_pagamento`: pix, dinheiro, cartao_credito, cartao_debito, transferencia, cheque, boleto, outros.
- `orcamentos.deleted_at` existe desde o schema original, mas nada o usa.
- `metas` (migration `tabela_metas.sql`): `empresa_id` com default `current_empresa_id()` (FK para empresas, CASCADE), `mes_referencia` date sempre dia 1º (CHECK), `meta_contratos` e `meta_entradas` numeric(12,2) >= 0 com pelo menos uma > 0 (CHECK `metas_valores_check`), UNIQUE (empresa_id, mes_referencia). Não tem coluna de realizado. RLS por policies SELECT/INSERT/UPDATE da própria empresa; DELETE/TRUNCATE revogados.
- `despesas` (migration `tabela_despesas.sql`): `empresa_id` com default `current_empresa_id()` (FK para empresas, CASCADE), descrição (1 a 200), `categoria` (ingredientes, embalagens, funcionarios, agua_luz_internet, aluguel, transporte, marketing, impostos_taxas, equipamentos, outros), `valor` numeric(12,2) > 0, `vencimento` date, `status` (pendente, paga, cancelada), `data_pagamento`, `forma_pagamento` (mesma lista de recebimentos), `observacoes`. CHECK `despesas_pagamento_check`: paga tem data de pagamento; não paga não tem data nem forma. RLS por policies SELECT/INSERT/UPDATE da própria empresa, sem policy de DELETE e com DELETE/TRUNCATE revogados de `anon`/`authenticated`.

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
- Proteção do histórico financeiro: triggers `*_protege_exclusao` (BEFORE DELETE por linha) e `*_protege_truncate` em `contratos`, `contrato_itens`, `parcelas` e `recebimentos`, mais `REVOKE DELETE, TRUNCATE` para `anon` e `authenticated`, recusam apagar quando o papel da sessão é authenticated/anon. A função confere `current_user` e também `current_setting('role')`, porque o CASCADE roda como dono da tabela mas o `SET ROLE` do PostgREST continua valendo: apagar um evento ou cliente que tenha contrato falha inteiro e não apaga nada (evento/cliente sem contrato seguem apagáveis). As policies `*_empresa_all` (FOR ALL) não foram alteradas e continuam permitindo DELETE no RLS, mas ficam neutralizadas. Postgres (SQL Editor/migrations) e `service_role` (só servidor) ainda conseguem apagar. FKs ao apagar o pai: contratos → contrato_itens e parcelas CASCADE; parcelas → recebimentos CASCADE; eventos → contratos CASCADE (e clientes → eventos, empresas → clientes); contratos → orcamentos.contrato_id SET NULL; produtos → contrato_itens RESTRICT; usuarios → contratos.cancelado_por SET NULL.
- `registrar_recebimento` (INVOKER): trava a parcela (`FOR UPDATE`) e o contrato (`FOR SHARE`, para um cancelamento e um pagamento simultâneos não furarem um ao outro), bloqueia valor ≤ 0, valor acima do saldo, forma inválida, parcela cancelada e contrato cancelado; insere o recebimento e atualiza `valor_pago`/`status`.
- `proteger_status_despesa` + trigger `despesas_protege_status` (BEFORE INSERT OR UPDATE em `despesas`, só para `authenticated`/`anon`): nova despesa nasce pendente; despesa paga ou cancelada não muda mais (status, valor, vencimento, pagamento, descrição, categoria).
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
- `fix_protege_historico_financeiro.sql`: triggers e revogação de DELETE/TRUNCATE descritos na seção 13; aplicada numa transação, sem alterar dados, policies ou FKs; reversão no cabeçalho.
- `tabela_metas.sql`: tabela `metas`, CHECKs, UNIQUE por empresa e mês, trigger de `updated_at`, RLS e revogação de DELETE/TRUNCATE. Aplicada numa transação; reversão no cabeçalho.
- `tabela_despesas.sql`: tabela `despesas`, CHECKs, índice (empresa_id, vencimento), trigger de `updated_at`, trigger `despesas_protege_status`, RLS e revogação de DELETE/TRUNCATE. Aplicada numa transação; reversão no cabeçalho.
- `rpc_cancelar_contrato.sql`: colunas de cancelamento, FK, CHECK, trigger de proteção, RPC `cancelar_contrato` e nova versão de `registrar_recebimento` (com `FOR SHARE`). Aplicada numa transação única; contém o roteiro de reversão no cabeçalho.
- Scripts: `apply-sql.js`, `apply-migration.js`, `validacao-dashboard.js` (`criar | esperado | comparar | limpar`: empresa de teste com cenário controlado, valores esperados do dashboard calculados por SQL, comparação com o que Dashboard e Financeiro mostram nos 4 períodos, e remoção de tudo), `validacao-historico-financeiro.js` (`auditar | criar | verificar | limpar`: `auditar` é somente leitura e lista grants, policies, triggers, FKs e cadeias de CASCADE; `verificar` tenta apagar contrato ativo/cancelado, itens, parcelas e recebimentos como a própria empresa, outra empresa e anônimo, por cascata de evento/cliente, TRUNCATE e policy permissiva criada depois, e confere hash das tabelas, isolamento e que gerar contrato, receber e cancelar seguem funcionando), `validacao-cancelamento.js` (`criar | verificar | verificar-ui | limpar`: 17 pontos do cancelamento via API real com JWT, chave anônima e outra empresa; 5 rodadas de 2 cancelamentos simultâneos, trava de linha, corridas cancelamento × pagamento, falha transacional injetada, contorno por UPDATE direto, Dashboard/Financeiro/página do contrato antes e depois), `validacao-contrato.js` (`criar | verificar | limpar`: empresa A com contrato ativo e contrato cancelado, empresa B para isolamento; confere os 10 pontos da página `/contratos/[id]` e que nada foi alterado no banco), `validacao-financeiro.js` (`criar | verificar | limpar`: 7 contratos de cenários diferentes, confere Dashboard x Financeiro x SQL, os 5 filtros e o histórico de recebimentos de contratos cancelados; `limpar` confere que o banco voltou às contagens iniciais), `lib-app-validacao.js` (login do usuário de teste e leitura das páginas, usado pelos dois scripts; precisa do servidor em `APP_URL`, padrão `http://localhost:3000`), `regressao-completa.js` (regressão do banco: policies, fluxo completo e isolamento; cria e apaga duas empresas de teste), `test-rpc-atomicidade.js`, `export-all.js`, `gerar-migration.js`, `test-connection.js`.

## 17. Segurança implementada

RLS em todas as tabelas de negócio com `WITH CHECK` validando todas as referências; escrita financeira só pela RPC; contrato e orçamento aprovado imutáveis pela interface; `.env*` fora do Git; busca de credenciais nos arquivos versionados sem ocorrências; credenciais antigas rotadas.

## 18. Preparação para produção

- `tsc --noEmit`, `lint` e `build` passam (27 rotas, todas dinâmicas exceto `_not-found` e `/cadastro/verifique-email`).
- Não há deploy. O app roda local com `npm run dev` na porta 3000.
- Faltam: campo `engines` no `package.json`, headers de segurança e limites de upload no `next.config.ts`, testes automatizados. Datas civis são tratadas como texto e "hoje" usa o fuso America/Sao_Paulo (`hojeISO`).

## 19. Pendências reais

Dashboard e Financeiro ainda leem parcelas e recebimentos numa consulta só, sujeita ao limite de 1000 linhas da API (a listagem de contratos já lê em páginas; vale reaproveitar `lerTudo` neles quando a base crescer); Produção; Agenda; PDF de orçamento e contrato; estorno, edição e exclusão de recebimento; cancelamento de parcela individual (existe no banco, sem tela); reativação de contrato cancelado (não existe; o trigger a bloqueia); controle por cargo (hoje qualquer usuário da empresa cancela contrato); documentos/upload; relatórios; despesas além do básico (fornecedores, recorrência, anexos, despesas no Dashboard/fluxo de caixa); equipe, cargos e permissões; auditoria; configurações da empresa; recuperação de senha; importar (ou descartar) os dados reais do projeto antigo, que estão exportados em `backup/data/` (fora do Git, contêm dados pessoais).

## 20. Último ponto do desenvolvimento

Redesign visual (menu lateral, barra superior, tema claro, fonte Inter, página do contrato redesenhada conforme a referência enviada), reativação do projeto Supabase, validação completa, rotação das credenciais e primeiro commit no Git. Depois: Dashboard gerencial e alinhamento do Dashboard com o Financeiro na regra de contratos cancelados (cálculo único em `financeiro/calculos.ts`). Em seguida, a página do contrato (`/contratos/[id]`) passou a tratar contrato cancelado como visão histórica, usando as mesmas funções de `financeiro/calculos.ts` (`parcelasEmAberto`, `resumoFuturo`, `situacaoHistorica`). Por último, o cancelamento seguro de contrato (migration `rpc_cancelar_contrato.sql`, RPC `cancelar_contrato`, modal na página do contrato). Limitações: qualquer usuário da empresa pode cancelar (não há permissão por cargo); não há reativação nem estorno; o cancelamento não cancela as parcelas (o status gravado delas fica como estava, e a tela mostra "Cancelada com o contrato"); o DELETE direto de contrato, itens, parcelas e recebimentos foi bloqueado depois (migration `fix_protege_historico_financeiro.sql`). Depois vieram a listagem geral `/contratos` e, por último, o menu e a página geral `/parcelas` (sem mudança no banco nem nas regras de recebimento; validada com o cenário de `validacao-financeiro.js`: lista, cards, busca, filtros, ordenação, pagamento parcial e total pela própria página, contrato cancelado fora das cobranças, empresa vazia, celular e tela larga). Por último, o menu e a página geral `/recebimentos` (somente leitura, sem mudança no banco nem na regra de registrar pagamento; validada com o mesmo cenário mais um pagamento com observação: os 5 períodos, período personalizado e inválido, busca, forma de pagamento, ordenação, recebimentos de contratos cancelados, "Ver contrato", empresa vazia, isolamento, erro de consulta, celular e tela larga). Por último, o módulo básico de Despesas (migration `tabela_despesas.sql` e páginas `/despesas`, `/despesas/nova` e `/despesas/[id]`), validado com duas empresas de teste: regras do banco como usuário autenticado (empresa_id automático, isolamento de leitura/escrita/inserção, DELETE e TRUNCATE bloqueados, valor > 0, nasce pendente, paga exige data, paga e cancelada imutáveis), cadastro, edição, pagamento e cancelamento pela tela, cards nos 5 períodos, filtros, busca, ordenação, empresa vazia, erro de consulta, celular e tela larga. Depois, as metas mensais (migration `tabela_metas.sql`, página `/metas`, resumo no Dashboard), validadas com duas empresas de teste: contrato de R$ 10.000 com entrada de R$ 2.000 (contratos +10.000; entradas +2.000 só quando a entrada é registrada; parcelas futuras só na previsão), contrato fechado em setembro e pago em setembro e outubro (cada valor no mês certo), cancelamento pela tela tirando o contrato da meta de contratos e mantendo o recebido na de entradas, pagamento posterior entrando sozinho, edição da meta pelo formulário (barra verde ao atingir), histórico, Dashboard, isolamento entre empresas e regras do banco, celular e tela larga. O banco hoje tem 1 empresa e 1 usuário reais e nenhum dado de negócio.

## 21. Próximo passo recomendado

1. Estorno de recebimento (fecha o Financeiro).
2. Produção.
3. PDF de orçamento e contrato.
4. Permissão por cargo (quem pode cancelar contrato).
5. Antes de publicar: headers de segurança, `engines` e atualizar o `.env.novo`.

## Git

Repositório próprio nesta pasta (`main`), sem remote. Primeiro commit `7070254`; o histórico completo está em `git log`. Fora do Git: `.env*` (exceto `.env.example`), `node_modules`, `.next`, `backup/data`, `backup/storage` e `fofurinhadoces/` (repositório aninhado com export antigo).
