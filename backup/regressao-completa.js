require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK: ' : '  [FALHA] ') + m); if (!c) falhas++; };
const conn = async () => { const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; };

async function tenant(nome) {
  const email = `teste-regressao-${nome}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'senhaTeste123!', email_confirm: true });
  if (error) throw error;
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [data.user.id]);
  const r = await c.query('select * from public.criar_empresa_e_usuario($1,$2,$3,null)', [`Regressao ${nome} TESTE`, 'Usuario', email]);
  await c.query('commit'); await c.end();
  return { uid: data.user.id, empresaId: r.rows[0].empresa_id };
}
async function como(uid, fn, commit = true) {
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await c.query('set local role authenticated');
  try { const r = await fn(c); await c.query(commit ? 'commit' : 'rollback'); return r; }
  catch (e) { await c.query('rollback'); throw e; } finally { await c.end(); }
}
async function bloqueia(uid, sql, params) {
  try { await como(uid, (c) => c.query(sql, params), false); return false; } catch { return true; }
}

(async () => {
  const base = await conn();
  console.log('== 1. Estado do banco restaurado (somente leitura) ==');
  const tabelas = ['empresas','usuarios','clientes','produtos','eventos','orcamentos','orcamento_itens','orcamento_historico','contratos','contrato_itens','parcelas','recebimentos'];
  const rls = await base.query("select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1)", [tabelas]);
  ok(rls.rows.length === tabelas.length && rls.rows.every((r) => r.relrowsecurity), 'RLS ligado nas 12 tabelas de negócio');
  const pol = Object.fromEntries((await base.query("select tablename, with_check from pg_policies where schemaname='public'")).rows.map((r) => [r.tablename, r.with_check || '']));
  ok(/produtos/.test(pol.orcamento_itens), 'policy orcamento_itens valida produto_id (correção preservada)');
  ok(/clientes/.test(pol.orcamentos) && /eventos/.test(pol.orcamentos), 'policy orcamentos valida cliente_id/evento_id (correção preservada)');
  ok(/produtos/.test(pol.contrato_itens), 'policy contrato_itens valida produto_id (correção preservada)');
  const fn = await base.query("select proname, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('registrar_recebimento','converter_orcamento_em_contrato','criar_empresa_e_usuario')");
  ok(fn.rows.length === 3, 'RPCs registrar_recebimento, converter_orcamento_em_contrato e criar_empresa_e_usuario existem');
  const hist = await base.query("select (select count(*) from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relname in ('contratos','contrato_itens','parcelas','recebimentos') and g.tgname like '%\\_protege\\_exclusao')::int del, (select count(*) from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relname in ('contratos','contrato_itens','parcelas','recebimentos') and g.tgname like '%\\_protege\\_truncate')::int trunc, (select count(*) from (values ('contratos'),('contrato_itens'),('parcelas'),('recebimentos')) t(n) where has_table_privilege('authenticated','public.'||t.n,'DELETE') or has_table_privilege('anon','public.'||t.n,'DELETE') or has_table_privilege('authenticated','public.'||t.n,'TRUNCATE') or has_table_privilege('anon','public.'||t.n,'TRUNCATE'))::int priv");
  ok(hist.rows[0].del === 4 && hist.rows[0].trunc === 4 && hist.rows[0].priv === 0, 'histórico financeiro protegido: triggers de DELETE/TRUNCATE nas 4 tabelas e anon/authenticated sem privilégio de apagar');
  const canc = await base.query("select (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='cancelar_contrato' and prosecdef)::int rpc, (select count(*) from pg_trigger where tgrelid='public.contratos'::regclass and tgname='contratos_protege_cancelamento')::int trg, (select count(*) from pg_constraint where conname='contratos_cancelamento_check')::int chk, has_function_privilege('anon','public.cancelar_contrato(uuid,text)','execute') anon_exec");
  ok(canc.rows[0].rpc === 1 && canc.rows[0].trg === 1 && canc.rows[0].chk === 1 && canc.rows[0].anon_exec === false, 'cancelamento de contrato: RPC, trigger de proteção e CHECK existem e anon não executa a RPC');
  const antes = (await Promise.all(tabelas.map(async (t) => [t, (await base.query(`select count(*)::int n from public.${t}`)).rows[0].n]))).reduce((o, [t, n]) => ({ ...o, [t]: n }), {});
  console.log('  contagens antes:', JSON.stringify(antes));

  console.log('== 2. Cadastro (RPC) de duas empresas de teste ==');
  const A = await tenant('A'); const B = await tenant('B');
  ok(!!A.empresaId && !!B.empresaId && A.empresaId !== B.empresaId, 'criar_empresa_e_usuario criou 2 empresas distintas');

  console.log('== 3. Fluxo da Empresa A: cliente -> produto -> evento -> orçamento -> aprovar -> contrato -> recebimentos ==');
  const a = await como(A.uid, async (c) => {
    const cli = (await c.query("insert into clientes (nome) values ('Cliente TESTE regressao') returning id")).rows[0].id;
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto TESTE regressao', 100) returning id")).rows[0].id;
    const ev = (await c.query("insert into eventos (cliente_id, tipo) values ($1,'aniversario') returning id", [cli])).rows[0].id;
    const orc = (await c.query('insert into orcamentos (cliente_id, evento_id) values ($1,$2) returning id, numero', [cli, ev])).rows[0];
    await c.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) values ($1,$2,3,100)', [orc.id, prod]);
    const tot = (await c.query('select subtotal::text s, valor_total::text t from orcamentos where id=$1', [orc.id])).rows[0];
    await c.query("update orcamentos set status='aprovado' where id=$1", [orc.id]);
    const ct = (await c.query("select converter_orcamento_em_contrato($1,0,null,3,'2027-01-10') id", [orc.id])).rows[0].id;
    const parcelas = (await c.query('select id, valor::text v from parcelas where contrato_id=$1 order by numero', [ct])).rows;
    await c.query("select registrar_recebimento($1,30,current_date,'pix',null)", [parcelas[0].id]);
    await c.query("select registrar_recebimento($1,70,current_date,'pix',null)", [parcelas[0].id]);
    const p1 = (await c.query('select valor_pago::text vp, status from parcelas where id=$1', [parcelas[0].id])).rows[0];
    const soma = (await c.query('select sum(valor)::text s from recebimentos where parcela_id=$1', [parcelas[0].id])).rows[0].s;
    const cont = (await c.query('select valor_final::text vf from contratos where id=$1', [ct])).rows[0].vf;
    const somaParc = (await c.query('select sum(valor)::text s from parcelas where contrato_id=$1', [ct])).rows[0].s;
    let acima = false;
    try { await c.query('savepoint sp'); await c.query("select registrar_recebimento($1,1,current_date,'pix',null)", [parcelas[1].id]); await c.query("select registrar_recebimento($1,500,current_date,'pix',null)", [parcelas[1].id]); } catch { acima = true; await c.query('rollback to savepoint sp'); }
    return { cli, prod, ev, orc, tot, ct, parcelas, p1, soma, cont, somaParc, acima };
  });
  ok(a.orc.numero === 1, `numeração automática do orçamento (#${a.orc.numero})`);
  ok(a.tot.s === '300.00' && a.tot.t === '300.00', `subtotal/total calculados pelo banco (${a.tot.s}/${a.tot.t})`);
  ok(a.cont === '300.00' && a.somaParc === '300.00', `contrato (${a.cont}) = soma das parcelas (${a.somaParc}) = orçamento`);
  ok(a.p1.vp === '100.00' && a.p1.status === 'pago' && a.soma === '100.00', `parcial 30 + 70 -> pago (valor_pago ${a.p1.vp}, ledger ${a.soma})`);
  ok(a.acima, 'recebimento acima do saldo é bloqueado');

  console.log('== 4. Isolamento: Empresa B tenta acessar/atacar dados da Empresa A ==');
  await como(B.uid, async (c) => {
    for (const t of ['clientes','produtos','eventos','orcamentos','orcamento_itens','contratos','contrato_itens','parcelas','recebimentos']) {
      const n = (await c.query(`select count(*)::int n from ${t}`)).rows[0].n;
      ok(n === 0, `B enxerga 0 linhas de ${t}`);
    }
  }, false);
  ok(await bloqueia(B.uid, "select registrar_recebimento($1,10,current_date,'pix',null)", [a.parcelas[2].id]), 'B não registra recebimento em parcela de A (RPC)');
  ok(await bloqueia(B.uid, "select converter_orcamento_em_contrato($1,0,null,1,'2027-02-01')", [a.orc.id]), 'B não converte orçamento de A em contrato');
  ok(await bloqueia(B.uid, 'insert into orcamentos (cliente_id, evento_id) values ($1,$2)', [a.cli, a.ev]), 'B não cria orçamento sobre cliente/evento de A');
  const upd = await como(B.uid, (c) => c.query("update parcelas set valor_pago=0, status='pendente' where id=$1 returning id", [a.parcelas[0].id]), false);
  ok(upd.rowCount === 0, 'B não altera valor_pago de parcela de A');

  console.log('== 5. Limpeza só do que o teste criou ==');
  await base.query('delete from contratos where evento_id=$1', [a.ev]);
  await base.query('delete from empresas where id = any($1)', [[A.empresaId, B.empresaId]]);
  await admin.auth.admin.deleteUser(A.uid); await admin.auth.admin.deleteUser(B.uid);
  const depois = (await Promise.all(tabelas.map(async (t) => [t, (await base.query(`select count(*)::int n from public.${t}`)).rows[0].n]))).reduce((o, [t, n]) => ({ ...o, [t]: n }), {});
  ok(JSON.stringify(antes) === JSON.stringify(depois), 'contagens finais idênticas às iniciais (nenhum dado existente alterado)');
  await base.end();
  console.log(falhas === 0 ? '\nREGRESSÃO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
