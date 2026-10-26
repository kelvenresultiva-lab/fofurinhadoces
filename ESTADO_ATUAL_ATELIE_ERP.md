# ESTADO_ATUAL_ATELIE_ERP.md

Auditoria do repositório real em `C:\Users\kelve\OneDrive\Desktop\FOFURINHA DOCES`, feita em 2026-09-27.
Nenhum arquivo de código, migration ou dado no banco foi alterado para produzir este relatório — só leitura
(`find`/`grep`, `tsc --noEmit`, `npm run lint`, `npm run build`, e SELECTs no Postgres via `.env.novo`).

**Aviso principal:** a lista de hipóteses recebida (RBAC, Central de Contratos, financeiro com RPC de
recebimento, arquivamento, histórico comercial imutável, auditoria, hardening, migrations `0011`–`0015`)
**não existe no repositório nem no banco remoto**. Nada disso foi encontrado em nenhum arquivo `.ts/.tsx/.sql`
do projeto, nem como tabela/função/coluna no Postgres. Ver seção 21.

---

## 1. Visão geral atual

O projeto é um sistema de gestão para a "Fofurinha Doces" (doces/eventos: casamento, chá revelação,
aniversário, 15 anos, batizado). Hoje ele cobre **apenas dois pedaços**: autenticação/cadastro de empresa
(self-service) e um CRUD de Clientes. Todo o resto do domínio (produtos, eventos, orçamentos, contratos,
financeiro, RBAC, auditoria, arquivamento) existe **só como tabela no schema**, sem nenhuma tela, RPC extra
ou regra de negócio implementada além do que já vinha na migration original.

## 2. Fluxo operacional (o que dá pra fazer hoje, de ponta a ponta)

1. Alguém acessa `/cadastro`, preenche nome da empresa/usuário/telefone/e-mail/senha.
2. Supabase exige confirmação de e-mail (`mailer_autoconfirm: false` no projeto) — o usuário recebe o link.
3. Ao confirmar (`/auth/confirm`), o sistema cria empresa + usuário atomicamente via RPC.
4. Login (`/login`) leva ao `/dashboard`, que hoje só mostra o total de clientes.
5. Em `/clientes` dá pra listar, buscar por nome, cadastrar, editar todos os campos e inativar/reativar
   (sem exclusão definitiva).
6. Não existe nenhuma outra tela navegável além dessas.

## 3. Stack real

- Next.js **16.3.6** (App Router, Turbopack, Server Components + Server Actions)
- React 19.2.8, TypeScript 5, Tailwind v4
- `@supabase/supabase-js` 2.117.2 e `@supabase/ssr` 0.12.7
- Supabase (Postgres + Auth) hospedado, projeto `kajepoypxcxgghfpxqij`
- Sem framework de teste configurado (não há Jest/Vitest/Playwright no `package.json`)

## 4. Estrutura de autenticação real

- **Modelo ativo: SaaS multiempresa self-service**, não ERP interno com bootstrap administrativo.
- `/cadastro` **existe** e é público (qualquer um pode criar uma empresa nova).
- `criar_empresa_e_usuario(nome_empresa, nome_usuario, email, telefone)` **existe** no banco (confirmado por
  query direta em `pg_proc`), é `SECURITY DEFINER`, e é a única forma de popular `empresas`/`usuarios` (não
  há policy de INSERT direto nessas tabelas).
- `/auth/confirm` **existe** (`app/app/auth/confirm/route.ts`), valida o link de confirmação (`verifyOtp`) e,
  se o usuário confirmado ainda não tiver linha em `usuarios`, chama a RPC acima lendo os dados de
  `user_metadata` (self-heal pós-confirmação).
- Não existe nenhuma gestão de equipe/convite de usuário para uma empresa já existente — cada cadastro cria
  uma empresa nova. Não existe RBAC nem bootstrap administrativo.

## 5. Modelo multiempresa real

Multiempresa por `empresa_id` com RLS no Postgres, via função `current_empresa_id()` (`SECURITY DEFINER`,
lê `usuarios.empresa_id` a partir de `auth.uid()`). Isso já valia desde a migration original (schema
`fofurinhadoces`), antes de qualquer trabalho desta fase — não foi criado agora, só reaproveitado.

## 6. Módulos e status real

| Módulo | Status | Evidência |
|---|---|---|
| Dashboard | **PARCIAL** | `app/app/(protegido)/dashboard/page.tsx` — só mostra contagem de clientes |
| Clientes | **PRONTO** | listar, buscar, criar, editar, inativar/reativar — testado ao vivo |
| Eventos | **NÃO EXISTE** | tabela `eventos` existe no banco, zero arquivo de UI |
| Produtos | **NÃO EXISTE** | tabela `produtos` existe no banco, zero arquivo de UI |
| Orçamentos | **NÃO EXISTE** | tabelas `orcamentos`/`orcamento_itens` + triggers de numeração/subtotal existem no banco, zero UI |
| Contratos | **NÃO EXISTE** | tabelas `contratos`/`contrato_itens` + função `converter_orcamento_em_contrato` existem no banco, zero UI, nenhuma "Central de Contratos" |
| Financeiro | **NÃO EXISTE** | tabelas `parcelas`/`recebimentos` existem no banco; **não existe** `registrar_recebimento`, `finance.ts` ou qualquer helper financeiro |
| Produção | **NÃO EXISTE** | só a coluna `contrato_itens.status_producao` existe; nenhuma tela |
| Agenda | **NÃO EXISTE** | nenhuma tabela ou tela dedicada |
| Documentos | **NÃO EXISTE** | tabela `documentos` + bucket `documentos` (privado) existem; zero UI |
| Relatórios | **NÃO EXISTE** | nada implementado |
| Configurações | **NÃO EXISTE** | não existe `/configuracoes`, nem edição de dados da empresa, nem upload de logo |
| Equipe e Acessos | **NÃO EXISTE** | não existe convite de usuário, nem RBAC, nem `/sem-acesso` |
| Registros Arquivados | **NÃO EXISTE** | não existe `archived_at` em nenhuma tabela (confirmado por query em `information_schema.columns`) |
| Auditoria | **NÃO EXISTE** | não existe `audit_logs`, nem `/configuracoes/auditoria`, nem helper `registrarAuditoria` |
| Marketing | **NÃO EXISTE** | nenhuma tabela ou tela |

## 7. Banco e principais tabelas

16 tabelas em `public`, todas com RLS habilitado (confirmado agora via query no Postgres remoto):
`cliente_familiares, clientes, contrato_itens, contratos, documentos, empresas, eventos, observacoes,
orcamento_historico, orcamento_itens, orcamentos, parcelas, produtos, recebimentos, tarefas, usuarios`.

Funções em `public` (6, todas pré-existentes da migration original, exceto a última):
`converter_orcamento_em_contrato, current_empresa_id, recalcular_subtotal_orcamento, set_orcamento_numero,
set_updated_at` (originais) + `criar_empresa_e_usuario` (criada nesta fase, para o self-service de cadastro).

Não existe arquivo de migration numerado (`0001`...) em lugar nenhum do repositório — ver seção 16.

## 8. Fonte financeira canônica

**Não implementado.** `parcelas.valor_pago` e a tabela `recebimentos` existem no schema original, mas não há
nenhuma regra de negócio, RPC ou helper (`finance.ts` ou equivalente) definindo qual é a fonte canônica, nem
tela nenhuma que grave ou leia recebimento.

## 9. RBAC

**Não implementado.** A coluna `usuarios.cargo` existe desde a migration original com um `CHECK` permitindo
`administrador, financeiro, producao, atendente, marketing`, mas isso é só uma restrição de valor de coluna —
não há nenhuma camada de permissão, proteção de rota/Server Action, filtro de sidebar por cargo, `/sem-acesso`,
proteção de autoelevação ou proteção do último administrador em lugar nenhum do código.

## 10. Arquivamento

**Não implementado.** Nenhuma tabela tem coluna `archived_at` (confirmado por query em
`information_schema.columns`). Não existe `/configuracoes/arquivados` nem lógica de restauração.

## 11. Histórico comercial

**Não implementado.** Não existe `podeEditarOrcamento`, nenhuma validação de status em Server Action (porque
não existem Server Actions de orçamento/contrato ainda), e não há nenhuma garantia de imutabilidade de
`contrato_itens` além do que a tabela já tinha originalmente (sem coluna de preço "congelado" adicional).

## 12. Auditoria

**Não implementado.** Não existe tabela `audit_logs`, não existe tela de auditoria, não existe helper
`registrarAuditoria`, não existe client administrativo (`admin.ts`) em lugar nenhum do código.

## 13. RPCs existentes hoje

Apenas as 6 funções listadas na seção 7. Só uma foi criada nesta fase de trabalho: `criar_empresa_e_usuario`,
usada exclusivamente no fluxo de cadastro/confirmação de e-mail. Ela foi testada com uma corrida real de duas
conexões Postgres concorrentes disputando o mesmo `auth.uid()`: uma venceu, a outra recebeu um erro genuíno de
chave duplicada, e a empresa criada pela transação perdedora foi desfeita junto (zero linha órfã).

## 14. Storage

Um único bucket, `documentos`, **privado** (`public: false`), com 3 policies (`SELECT`, `INSERT`, `DELETE`)
restringindo por pasta = `empresa_id`. Não existe bucket público de logos nem qualquer outro bucket.

## 15. Variáveis de ambiente

Reais, hoje:

- `app/.env.local` (usado pelo Next, cliente + servidor):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publicável `sb_publishable_...`, não é JWT antigo)
- `.env.novo` (raiz do repo, **fora** do projeto Next, usado só por scripts administrativos em `backup/`):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (chave `sb_secret_...`), `SUPABASE_DB_URL`

Não existe variável chamada `SUPABASE_SECRET_KEY` em lugar nenhum (o nome real é
`SUPABASE_SERVICE_ROLE_KEY`, e ela **nunca** é referenciada em código do Next — só em scripts Node soltos em
`backup/`, fora da árvore `app/`). Não existe `src/lib/supabase/admin.ts`, não existe import `server-only` em
lugar nenhum do repositório, e **não existe `.env.example`**.

## 16. Migrations existentes

**Não existe pasta `supabase/migrations/` nem qualquer arquivo de migration numerado (`0001` a `0016`) em
lugar nenhum do repositório.** O que existe, em vez disso:

- `backup/migration_completa.sql` — um único arquivo (594 linhas) com o schema inteiro do projeto Supabase
  original, gerado por `backup/gerar-migration.js` a partir de um export (`backup/export-all.js`). Contém as
  16 tabelas, as 5 funções originais, índices, triggers, RLS e as 3 storage policies. Foi aplicado de uma vez
  só (`backup/apply-migration.js`) no projeto Supabase novo.
- `backup/rpc_criar_empresa_usuario.sql` — a função `criar_empresa_e_usuario`, aplicada separadamente
  (`backup/apply-sql.js`).

Não existe, portanto, `0011_empresa_config.sql`, `0012_rbac.sql`, `0013_arquivamento.sql`,
`0014_auditoria.sql`, `0015_auditoria_hardening.sql` nem `0016` — nenhum deles.

## 17. Segurança já implementada

- RLS habilitado em todas as 16 tabelas, isolando por `empresa_id` via `current_empresa_id()`.
- `criar_empresa_e_usuario` como único caminho de escrita em `empresas`/`usuarios` (sem policy de INSERT
  direta), evitando que qualquer usuário autenticado crie empresa/usuário fora do fluxo de cadastro.
- Bucket de documentos privado, com policies por empresa.
- `.env.local` do Next só expõe URL + chave publicável; a chave de service role fica fora da árvore do app.
- Não há security headers customizados em `next.config.ts` (só `turbopack.root`), não há RBAC, não há
  auditoria, não há rate limiting aplicativo além do que o próprio Supabase Auth já aplica.

## 18. Preparação para produção

- `npx tsc --noEmit`: **passa limpo**.
- `npm run lint`: **passa limpo**.
- `npm run build`: **passa limpo**, todas as rotas compilam (a maioria dinâmica, por causa de `cookies()`).
- `package.json` (raiz e `app/`) **não tem campo `engines`** (Node não está pinado).
- `next.config.ts` não define headers de segurança, nem limites de upload.
- Não há revisão de timezone Brasil em lugar nenhum do código.
- Não houve deploy — projeto roda só localmente (`npm run dev`, Turbopack, porta 3000).

## 19. Pendências reais

Praticamente todo o domínio de negócio além de Clientes: Produtos, Eventos, Orçamentos, Contratos,
Financeiro (incluindo a própria definição de "fonte canônica"), Produção, Agenda, Documentos, Relatórios,
Configurações da empresa (incluindo upload de logo), Equipe e Acessos/RBAC, Arquivamento, Auditoria. Também
faltam: `.env.example`, pin de versão do Node, headers de segurança, e qualquer suíte de testes automatizados.

## 20. Último ponto real do desenvolvimento

O cadastro de teste usado durante a verificação do módulo de Clientes foi removido do banco (linha `Maria
Silva` em `clientes`, apagada via SQL direto após o teste). O estado atual do banco tem `0` linhas em
`clientes`, `1` empresa e `1` usuário reais (a conta criada para o dono do projeto,
`kelven.resultiva@gmail.com`, empresa "Fofurinha Doces"). Não há nenhum "Tópico 6.1" nem diagnóstico SQL de
validação remota em andamento — isso não faz parte do histórico real deste repositório.

## 21. Próximo passo recomendado

Dado que só existe Clientes hoje, e que Orçamento/Contrato/Financeiro dependem de Produto e Evento existirem
primeiro, a ordem natural é: **Produtos → Eventos → Orçamentos → Contratos/Parcelas**. RBAC, arquivamento e
auditoria só fazem sentido depois de existir alguma coisa de negócio pra proteger/auditar/arquivar — não há
necessidade de adiantar isso agora.

---

## DIVERGÊNCIAS COM O RESUMO ANTIGO (e com a lista de hipóteses recebida)

O resumo antigo (o que eu mesmo escrevi antes) **está correto e é o único que bate com o repositório real**.
A lista de hipóteses recebida nesta mensagem **não corresponde a nenhum trabalho existente neste projeto** —
provavelmente veio de uma resposta de outra IA (ChatGPT) descrevendo um roadmap ou um projeto diferente, e foi
colada aqui como se fosse histórico real. Especificamente, **não existe no repositório nem no banco**:

1. Nenhuma tela ou migration de "Configurações da empresa" (`/configuracoes`, upload de logo, PDF institucional).
2. Nenhum RBAC (permissões por cargo, proteção de Server Action, sidebar filtrada, `/sem-acesso`, proteção de
   autoelevação/último administrador).
3. Nenhuma "Central Geral de Contratos" (`/contratos`, cards de valor contratado/recebido/saldo).
4. Nenhuma "fonte financeira única" formalizada, nem `src/lib/finance.ts` (aliás, **não existe pasta `src/`
   em lugar nenhum do projeto** — todo o código Next mora em `app/app/` e `app/lib/`).
5. Nenhuma RPC `registrar_recebimento`.
6. Nenhum arquivamento (`archived_at`, `/configuracoes/arquivados`, restauração).
7. Nenhuma regra de imutabilidade de histórico comercial além do que o schema original já garantia.
8. Nenhuma tabela `audit_logs`, nenhuma tela `/configuracoes/auditoria`.
9. Nenhum hardening de auditoria, nenhum `admin.ts`, nenhum uso de `server-only`.
10. Nenhuma migration numerada (`0011` a `0016`) — na verdade, **não existe nenhuma migration numerada**,
    ponto: o projeto usa um único `migration_completa.sql` + um SQL avulso para a RPC de cadastro.
11. A variável de ambiente citada como `SUPABASE_SECRET_KEY` **não existe com esse nome**; o nome real é
    `SUPABASE_SERVICE_ROLE_KEY`, e ela vive só em `.env.novo` (fora do Next), nunca em `app/`.
12. Não existe `.env.example`.
13. O "Tópico 6.1" e o diagnóstico SQL de validação remota mencionados como "último ponto do desenvolvimento"
    não fazem parte do histórico real — o último trabalho de fato concluído foi o módulo de Clientes.

O que o resumo antigo disse e que **está confirmado como verdadeiro**: existe `/cadastro` público, existe
`/auth/confirm`, existe a RPC `criar_empresa_e_usuario`, existe `proxy.ts` (não `middleware.ts`) como arquivo
ativo do Next 16, o modelo é SaaS multiempresa self-service (não ERP interno com bootstrap administrativo), e
o módulo de Clientes está pronto e testado.
