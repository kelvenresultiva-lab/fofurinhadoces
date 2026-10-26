// Uso: node backup/validacao-historico-financeiro.js auditar | criar | verificar | limpar
// Histórico financeiro (contratos, contrato_itens, parcelas, recebimentos) não pode ser apagado por
// usuários da aplicação.
//   auditar   -> SOMENTE LEITURA: grants, policies, triggers, foreign keys e cadeias de CASCADE que
//                chegam nessas 4 tabelas, e se authenticated/anon conseguem apagar.
//   criar     -> duas empresas de TESTE (A e B) e vários contratos de A, um para cada tentativa
//   verificar -> tenta apagar de todas as formas pela API real (JWT do usuário, chave anônima, outra
//                empresa), por cascata (evento/cliente), TRUNCATE e policy permissiva futura; confere
//                que nada mudou e que cancelar, gerar contrato e registrar recebimento seguem
//                funcionando. Sai com código 1 se qualquer verificação falhar.
//   limpar    -> remove tudo e confere que o banco voltou às contagens de antes do teste
// Os DELETEs de teste só atingem as empresas de TESTE criadas aqui; nunca dados reais.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { SENHA } = require('./lib-app-validacao');

const ESTADO = path.join(os.tmpdir(), 'validacao-historico-financeiro.json');
const T4 = ['contratos', 'contrato_itens', 'parcelas', 'recebimentos'];
const TABELAS = ['empresas', 'usuarios', 'clientes', 'produtos', 'eventos', 'orcamentos', 'orcamento_itens', 'orcamento_historico', 'contratos', 'contrato_itens', 'parcelas', 'recebimentos'];

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const conn = async () => { const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; };

async function como(uid, fn) {
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await c.query('set local role authenticated');
  try { const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback'); throw e; } finally { await c.end(); }
}
async function contagens(c) {
  const o = {};
  for (const t of TABELAS) o[t] = (await c.query(`select count(*)::int n from ${t}`)).rows[0].n;
  return o;
}
async function criarEmpresa(c0, sufixo) {
  const email = `teste-historico-${sufixo}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw error;
  await c0.query('begin');
  await c0.query("select set_config('request.jwt.claim.sub',$1,true)", [data.user.id]);
  const emp = await c0.query('select * from criar_empresa_e_usuario($1,$2,$3,null)', [`Empresa Historico ${sufixo} TESTE`, `Usuario Historico ${sufixo}`, email]);
  await c0.query('commit');
  return { uid: data.user.id, email, empresaId: emp.rows[0].empresa_id };
}
async function clienteApi(email) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error('login de teste falhou: ' + error.message);
  return sb;
}

// ---------------------------------------------------------------- auditar (somente leitura)
async function auditar(silencioso = false) {
  const c = await conn();
  await c.query('begin read only');
  const log = (...a) => { if (!silencioso) console.log(...a); };
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const brechas = [];

  log('== 1. Privilégios de tabela (anon / authenticated / service_role) ==');
  for (const t of T4) {
    const linha = {};
    for (const papel of ['anon', 'authenticated', 'service_role']) {
      const r = (await q(`select has_table_privilege($1,'public.${t}','DELETE') d, has_table_privilege($1,'public.${t}','TRUNCATE') t`, [papel]))[0];
      linha[papel] = `DELETE=${r.d ? 'sim' : 'não'} TRUNCATE=${r.t ? 'sim' : 'não'}`;
      if ((papel === 'anon' || papel === 'authenticated') && (r.d || r.t)) brechas.push(`${papel} tem privilégio ${r.d ? 'DELETE' : ''}${r.d && r.t ? '+' : ''}${r.t ? 'TRUNCATE' : ''} em ${t}`);
    }
    log(`  ${t.padEnd(14)} ${Object.entries(linha).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
  }

  log('== 2. Policies que permitem DELETE ==');
  const pol = await q("select tablename, policyname, cmd, roles::text r from pg_policies where schemaname='public' and tablename = any($1) order by 1,2", [T4]);
  for (const p of pol) log(`  ${p.tablename.padEnd(14)} ${p.policyname} (${p.cmd}, ${p.r})`);
  const polDelete = pol.filter((x) => x.cmd === 'ALL' || x.cmd === 'DELETE');

  log('== 3. Triggers ==');
  const trg = await q("select c.relname t, g.tgname, g.tgtype, pg_get_triggerdef(g.oid) d from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relname = any($1) order by 1,2", [T4]);
  for (const g of trg) log(`  ${g.t.padEnd(14)} ${g.tgname}`);
  const protegidas = T4.filter((t) => trg.some((g) => g.t === t && g.tgname === `${t}_protege_exclusao` && /DELETE/.test(g.d)));
  const truncProt = T4.filter((t) => trg.some((g) => g.t === t && g.tgname === `${t}_protege_truncate` && /TRUNCATE/.test(g.d)));
  // A policy FOR ALL continua existindo (não foi alterada); ela só é brecha se o trigger de bloqueio faltar.
  for (const p of polDelete) {
    if (!protegidas.includes(p.tablename)) brechas.push(`policy ${p.policyname} (${p.cmd}) em ${p.tablename} permite DELETE pelo RLS e não há trigger de bloqueio`);
    else log(`  (policy ${p.policyname} ainda permite DELETE no RLS, mas está neutralizada: trigger de bloqueio + privilégio revogado)`);
  }
  if (protegidas.length < 4) brechas.push(`sem trigger de bloqueio de DELETE em: ${T4.filter((t) => !protegidas.includes(t)).join(', ')}`);
  if (truncProt.length < 4) brechas.push(`sem trigger de bloqueio de TRUNCATE em: ${T4.filter((t) => !truncProt.includes(t)).join(', ')}`);

  log('== 4. Foreign keys que envolvem as 4 tabelas (ação ao apagar o registro referenciado) ==');
  const acao = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  const fks = await q(`select conrelid::regclass::text filho, confrelid::regclass::text pai, conname, confdeltype d
                       from pg_constraint where contype='f' and connamespace='public'::regnamespace order by 2,1`);
  for (const f of fks.filter((x) => T4.includes(x.filho.replace('public.', '')) || T4.includes(x.pai.replace('public.', '')))) log(`  apagar ${f.pai.padEnd(14)} -> ${f.filho.padEnd(16)} ${acao[f.d]}  (${f.conname})`);

  log('== 5. Cadeias de CASCADE que chegam ao histórico financeiro ==');
  const pais = {};
  for (const f of fks.filter((x) => x.d === 'c')) (pais[f.filho] ??= []).push(f.pai);
  const ancestrais = new Set();
  const subir = (t) => { for (const p of pais[t] ?? []) if (!ancestrais.has(p)) { ancestrais.add(p); subir(p); } };
  for (const t of T4) subir(t);
  const delPol = await q("select tablename, cmd from pg_policies where schemaname='public' and cmd in ('ALL','DELETE')");
  for (const a of [...ancestrais].sort()) {
    const priv = (await q('select has_table_privilege(\'authenticated\', $1, \'DELETE\') d', [a]))[0].d;
    const temPolicy = delPol.some((p) => `public.${p.tablename}` === a || p.tablename === a);
    const alcanca = priv && temPolicy;
    log(`  ${a.padEnd(20)} authenticated pode apagar? ${alcanca ? 'SIM (privilégio + policy)' : priv ? 'não (sem policy de DELETE: o RLS filtra tudo)' : 'não'}`);
    if (alcanca && protegidas.length < 4) brechas.push(`apagar ${a} (acessível ao usuário) apaga em CASCATA o histórico financeiro`);
  }
  await c.query('rollback');
  await c.end();
  log(brechas.length ? `\nBRECHAS ENCONTRADAS (${brechas.length}):\n- ${brechas.join('\n- ')}` : '\nSEM BRECHAS: nenhum papel da aplicação consegue apagar o histórico financeiro, nem em cascata.');
  return brechas;
}

// ---------------------------------------------------------------- criar
async function criar() {
  const c0 = await conn();
  const antes = await contagens(c0);
  const A = await criarEmpresa(c0, 'A');
  const B = await criarEmpresa(c0, 'B');
  const hoje = (await c0.query("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  await c0.end();
  const dia = (n) => `(date '${hoje}' + ${n})`;

  const ids = await como(A.uid, async (c) => {
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto Historico TESTE', 100) returning id")).rows[0].id;
    const preparar = async (nome) => {
      const cid = (await c.query('insert into clientes (nome) values ($1) returning id', [nome])).rows[0].id;
      const eid = (await c.query(`insert into eventos (cliente_id, tipo, data, status) values ($1,'casamento',${dia(60)},'confirmado') returning id`, [cid])).rows[0].id;
      const o = (await c.query('insert into orcamentos (cliente_id, evento_id) values ($1,$2) returning id', [cid, eid])).rows[0].id;
      await c.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) values ($1,$2,2,100)', [o, prod]);
      await c.query("update orcamentos set status='aprovado' where id=$1", [o]);
      return { cliente: cid, evento: eid, orcamento: o, nome };
    };
    const gerar = async (nome, { pagar = false, cancelar = false } = {}) => {
      const base = await preparar(nome);
      const k = (await c.query(`select converter_orcamento_em_contrato($1,0,null,2,${dia(15)}) id`, [base.orcamento])).rows[0].id;
      const ps = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [k])).rows.map((p) => p.id);
      if (pagar) await c.query(`select registrar_recebimento($1,30,${dia(0)},'pix',null)`, [ps[0]]);
      if (cancelar) await c.query("select cancelar_contrato($1,'Cancelado para validação')", [k]);
      return { ...base, id: k, parcelas: ps };
    };
    return {
      ATIVO: await gerar('Cliente Historico ATIVO', { pagar: true }),
      CANC: await gerar('Cliente Historico CANC', { pagar: true, cancelar: true }),
      OUTRA: await gerar('Cliente Historico OUTRA', { pagar: true }),
      FILHOS: await gerar('Cliente Historico FILHOS', { pagar: true }),
      EVT: await gerar('Cliente Historico EVT', { pagar: true }),
      CLI: await gerar('Cliente Historico CLI', { pagar: true }),
      FUT: await gerar('Cliente Historico FUT', { pagar: true }),
      CANCELAR: await gerar('Cliente Historico CANCELAR'),
      RECEBER: await gerar('Cliente Historico RECEBER'),
      MANUT: await gerar('Cliente Historico MANUT', { pagar: true }),
      SVC: await gerar('Cliente Historico SVC', { pagar: true }),
      GERAR: await preparar('Cliente Historico GERAR'),
    };
  });

  fs.writeFileSync(ESTADO, JSON.stringify({ A, B, hoje, ids, antes }));
  console.log(`cenário criado: empresas A e B, ${Object.keys(ids).length} cenários na A, hoje = ${hoje}`);
}

// ---------------------------------------------------------------- verificar
async function impressao(c, empresaId) {
  const base = 'from contratos k join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id';
  const h = async (sql) => (await c.query(sql, [empresaId])).rows[0].h;
  return {
    contratos: await h(`select count(*)::int || md5(coalesce(string_agg(to_jsonb(k)::text, '|' order by k.id), '')) h ${base} where cl.empresa_id=$1`),
    contrato_itens: await h(`select count(*)::int || md5(coalesce(string_agg(to_jsonb(i)::text, '|' order by i.id), '')) h from contrato_itens i join contratos k on k.id=i.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1`),
    parcelas: await h(`select count(*)::int || md5(coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '')) h from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1`),
    recebimentos: await h(`select count(*)::int || md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by r.id), '')) h from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1`),
  };
}

async function verificar() {
  const { A, B, hoje, ids } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const falhas = [];
  const confere = (desc, ok, detalhe = '') => { console.log(`${ok ? '  OK ' : '  FALHA'}: ${desc}${ok ? '' : ' ' + detalhe}`); if (!ok) falhas.push(desc + ' ' + detalhe); };
  const c = await conn();
  const sbA = await clienteApi(A.email);
  const sbB = await clienteApi(B.email);
  const sbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const tenta = (r) => ({ erro: r.error?.message ?? null, apagou: (r.data ?? []).length });
  const protegido = (r) => !!r.erro && !r.apagou; // erro explícito e nada apagado
  const nadaApagado = (r) => !r.apagou; // outra empresa / anônimo: basta não apagar (o RLS já filtrava em silêncio)
  const itensDe = async (k) => (await c.query('select id from contrato_itens where contrato_id=$1', [k.id])).rows.map((x) => x.id);
  const recDe = async (k) => (await c.query('select r.id from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1', [k.id])).rows.map((x) => x.id);
  const msgHistorico = /histórico financeiro|permission denied/i;

  console.log('== Auditoria (somente leitura) ==');
  const brechas = await auditar(true);
  confere('nenhum papel da aplicação consegue apagar o histórico financeiro (privilégio, policy, trigger e cascata)', brechas.length === 0, brechas.join(' | '));

  const snap0 = await impressao(c, A.empresaId);
  const n0 = (await contagens(c));

  console.log('== 1-4. Excluir contrato ==');
  const r1 = tenta(await sbA.from('contratos').delete().eq('id', ids.ATIVO.id).select());
  confere('1. usuário da própria empresa NÃO exclui contrato ativo', protegido(r1), JSON.stringify(r1));
  const r2 = tenta(await sbA.from('contratos').delete().eq('id', ids.CANC.id).select());
  confere('2. usuário da própria empresa NÃO exclui contrato cancelado', protegido(r2), JSON.stringify(r2));
  const r3 = [tenta(await sbB.from('contratos').delete().eq('id', ids.OUTRA.id).select()), tenta(await sbB.from('contratos').delete().eq('id', ids.CANC.id).select())];
  confere('3. usuário de OUTRA empresa NÃO exclui contratos da empresa A', r3.every(nadaApagado), JSON.stringify(r3));
  const r4 = [tenta(await sbAnon.from('contratos').delete().eq('id', ids.OUTRA.id).select()), tenta(await sbAnon.from('contratos').delete().neq('id', '00000000-0000-0000-0000-000000000000').select())];
  confere('4. chamada anônima NÃO exclui contratos (nem em massa)', r4.every(nadaApagado), JSON.stringify(r4));

  console.log('== 5-7. Excluir itens, parcelas e recebimentos ==');
  const it = await itensDe(ids.FILHOS); const rc = await recDe(ids.FILHOS);
  const r5 = [tenta(await sbA.from('contrato_itens').delete().eq('id', it[0]).select()), tenta(await sbB.from('contrato_itens').delete().eq('id', it[0]).select()), tenta(await sbAnon.from('contrato_itens').delete().eq('id', it[0]).select())];
  confere('5. NINGUÉM exclui item de contrato (própria empresa, outra empresa, anônimo)', protegido(r5[0]) && r5.every(nadaApagado), JSON.stringify(r5));
  const r6 = [tenta(await sbA.from('parcelas').delete().eq('id', ids.FILHOS.parcelas[1]).select()), tenta(await sbB.from('parcelas').delete().eq('id', ids.FILHOS.parcelas[1]).select()), tenta(await sbAnon.from('parcelas').delete().eq('id', ids.FILHOS.parcelas[1]).select())];
  confere('6. NINGUÉM exclui parcela (própria empresa, outra empresa, anônimo)', protegido(r6[0]) && r6.every(nadaApagado), JSON.stringify(r6));
  const r7 = [tenta(await sbA.from('recebimentos').delete().eq('id', rc[0]).select()), tenta(await sbB.from('recebimentos').delete().eq('id', rc[0]).select()), tenta(await sbAnon.from('recebimentos').delete().eq('id', rc[0]).select())];
  confere('7. NINGUÉM exclui recebimento (própria empresa, outra empresa, anônimo)', protegido(r7[0]) && r7.every(nadaApagado), JSON.stringify(r7));

  console.log('== Cascata: apagar um registro "pai" acessível ao usuário não pode levar o histórico junto ==');
  const rEvt = tenta(await sbA.from('eventos').delete().eq('id', ids.EVT.evento).select());
  confere('apagar o EVENTO de um contrato é recusado (o CASCADE não chega ao histórico)', protegido(rEvt) && msgHistorico.test(rEvt.erro ?? ''), JSON.stringify(rEvt));
  const rCli = tenta(await sbA.from('clientes').delete().eq('id', ids.CLI.cliente).select());
  confere('apagar o CLIENTE de um contrato é recusado (cascata cliente → evento → contrato)', protegido(rCli) && msgHistorico.test(rCli.erro ?? ''), JSON.stringify(rCli));
  const rEmp = [tenta(await sbA.from('empresas').delete().eq('id', A.empresaId).select()), tenta(await sbA.from('usuarios').delete().eq('id', A.uid).select())];
  confere('apagar a EMPRESA ou o USUÁRIO não é possível pela API (sem policy de DELETE)', rEmp.every((r) => r.apagou === 0), JSON.stringify(rEmp));
  const rProd = tenta(await sbA.from('produtos').delete().neq('id', '00000000-0000-0000-0000-000000000000').select());
  confere('apagar o PRODUTO usado em contrato é recusado (RESTRICT em contrato_itens)', protegido(rProd) && /foreign key|violates/i.test(rProd.erro ?? ''), JSON.stringify(rProd));

  console.log('== TRUNCATE e policy permissiva criada no futuro ==');
  const trunc = async (papel) => {
    const cc = await conn();
    let msg = null;
    try {
      await cc.query('begin');
      await cc.query(`set local role ${papel}`);
      await cc.query('truncate table public.contratos cascade');
    } catch (e) { msg = e.message; }
    await cc.query('rollback'); await cc.end();
    return msg;
  };
  const tA = await trunc('authenticated'); const tN = await trunc('anon');
  confere('TRUNCATE ... CASCADE por authenticated e por anon é recusado', !!tA && !!tN, `${tA} | ${tN}`);
  // Alguém no futuro cria uma policy de DELETE permissiva E devolve o privilégio: o trigger ainda barra.
  const cf = await conn();
  let msgF = null; let apagouF = 0;
  await cf.query('begin');
  await cf.query('create policy teste_futura on public.contratos for delete to public using (true)');
  await cf.query('grant delete on public.contratos to authenticated, anon');
  await cf.query("select set_config('request.jwt.claim.sub',$1,true)", [A.uid]);
  await cf.query('set local role authenticated');
  try { apagouF = (await cf.query('delete from contratos where id=$1', [ids.FUT.id])).rowCount; } catch (e) { msgF = e.message; }
  await cf.query('rollback');
  const sobrouPolicy = (await cf.query("select count(*)::int n from pg_policies where policyname='teste_futura'")).rows[0].n;
  await cf.end();
  confere('mesmo com policy de DELETE permissiva + GRANT DELETE criados depois, o trigger no banco ainda barra (e a policy de teste foi desfeita)', apagouF === 0 && /histórico financeiro/i.test(msgF ?? '') && sobrouPolicy === 0, `${msgF} apagou=${apagouF} sobrou=${sobrouPolicy}`);

  console.log('== 11-12. Contagens preservadas e isolamento ==');
  const snap1 = await impressao(c, A.empresaId);
  const n1 = await contagens(c);
  confere('11. contagens e conteúdo (hash linha a linha) de contratos, itens, parcelas e recebimentos IDÊNTICOS depois de todas as tentativas', JSON.stringify(snap0) === JSON.stringify(snap1) && JSON.stringify(n0) === JSON.stringify(n1), JSON.stringify({ snap0, snap1 }));
  const vistoB = await como(B.uid, async (cc) => (await cc.query('select (select count(*) from contratos)::int k, (select count(*) from contrato_itens)::int i, (select count(*) from parcelas)::int p, (select count(*) from recebimentos)::int r')).rows[0]);
  confere('12. isolamento: a empresa B não enxerga nada do histórico financeiro da A', vistoB.k === 0 && vistoB.i === 0 && vistoB.p === 0 && vistoB.r === 0, JSON.stringify(vistoB));

  console.log('== Não ampliou para outras áreas ==');
  const evSem = (await sbA.from('clientes').insert({ nome: 'Cliente sem contrato' }).select().single()).data;
  const evNovo = (await sbA.from('eventos').insert({ cliente_id: evSem.id, tipo: 'outro', data: hoje, status: 'planejado' }).select().single()).data;
  const rEvSem = tenta(await sbA.from('eventos').delete().eq('id', evNovo.id).select());
  const rCliSem = tenta(await sbA.from('clientes').delete().eq('id', evSem.id).select());
  confere('evento e cliente SEM contrato continuam podendo ser apagados (comportamento de outras áreas intacto)', !rEvSem.erro && rEvSem.apagou === 1 && !rCliSem.erro && rCliSem.apagou === 1, JSON.stringify({ rEvSem, rCliSem }));
  const orcItem = (await c.query('select oi.id from orcamento_itens oi join orcamentos o on o.id=oi.orcamento_id where o.id=$1', [ids.GERAR.orcamento])).rows[0].id;
  const rOi = tenta(await sbA.from('orcamento_itens').delete().eq('id', orcItem).select());
  confere('excluir item de ORÇAMENTO (fluxo existente do app) continua funcionando', !rOi.erro && rOi.apagou === 1, JSON.stringify(rOi));
  // recria o item para o teste de geração de contrato abaixo
  await como(A.uid, (cc) => cc.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) select $1, id, 2, 100 from produtos where nome=$2', [ids.GERAR.orcamento, 'Produto Historico TESTE']));

  console.log('== 8-10. Fluxos existentes continuam funcionando ==');
  const rCan = await sbA.rpc('cancelar_contrato', { p_contrato_id: ids.CANCELAR.id, p_motivo: 'Cancelamento normal após a proteção' });
  const lCan = (await c.query('select status, cancelado_por, motivo_cancelamento from contratos where id=$1', [ids.CANCELAR.id])).rows[0];
  confere('8. cancelamento normal (RPC) continua funcionando e grava status, responsável e motivo', !rCan.error && lCan.status === 'cancelado' && lCan.cancelado_por === A.uid && lCan.motivo_cancelamento === 'Cancelamento normal após a proteção', JSON.stringify(rCan.error));
  const rGer = await sbA.rpc('converter_orcamento_em_contrato', { p_orcamento_id: ids.GERAR.orcamento, p_entrada: '0', p_data_entrada: null, p_numero_parcelas: 2, p_primeiro_vencimento: hoje });
  const nGer = rGer.data ? (await c.query('select (select count(*) from contrato_itens where contrato_id=$1)::int i, (select count(*) from parcelas where contrato_id=$1)::int p', [rGer.data])).rows[0] : null;
  confere('9. geração de contrato (RPC) continua funcionando: contrato, itens e 2 parcelas criados', !rGer.error && nGer && nGer.i === 1 && nGer.p === 2, JSON.stringify(rGer.error));
  const rRec = await sbA.rpc('registrar_recebimento', { p_parcela_id: ids.RECEBER.parcelas[0], p_valor: '25', p_data: hoje, p_forma_pagamento: 'pix', p_observacoes: null });
  const lPar = (await c.query('select valor_pago::float vp, status from parcelas where id=$1', [ids.RECEBER.parcelas[0]])).rows[0];
  confere('10. registro de recebimento (RPC) continua funcionando e atualiza a parcela (parcial, 25,00)', !rRec.error && lPar.vp === 25 && lPar.status === 'parcial', JSON.stringify(rRec.error));

  console.log('== Manutenção controlada continua possível pelo papel adequado ==');
  const rSvc = await admin.from('contratos').delete().eq('id', ids.SVC.id).select();
  const restoSvc = (await c.query('select (select count(*) from parcelas where contrato_id=$1)::int p, (select count(*) from contrato_itens where contrato_id=$1)::int i', [ids.SVC.id])).rows[0];
  confere('service_role (chave de servidor, nunca no navegador) consegue excluir contrato de teste, com cascata aos filhos', !rSvc.error && rSvc.data?.length === 1 && restoSvc.p === 0 && restoSvc.i === 0, JSON.stringify(rSvc.error));
  const rMan = await c.query('delete from contratos where id=$1', [ids.MANUT.id]);
  confere('papel administrativo (postgres / SQL Editor / migrations) consegue excluir contrato de teste', rMan.rowCount === 1);
  await c.end();

  if (falhas.length) { console.error(`\n${falhas.length} VERIFICAÇÃO(ÕES) COM FALHA`); process.exit(1); }
  console.log('\nTODAS AS VERIFICAÇÕES DO HISTÓRICO FINANCEIRO OK');
}

// ---------------------------------------------------------------- limpar
async function limpar() {
  const { A, B, antes } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const c = await conn();
  for (const e of [A, B]) {
    await c.query('delete from contratos where evento_id in (select ev.id from eventos ev join clientes cl on cl.id=ev.cliente_id where cl.empresa_id=$1)', [e.empresaId]);
    await c.query('delete from empresas where id=$1', [e.empresaId]);
  }
  const depois = await contagens(c);
  const restantes = (await c.query("select count(*)::int n from empresas where nome like '%TESTE%'")).rows[0].n;
  const sobra = (await c.query("select (select count(*) from pg_policies where policyname='teste_futura')::int p")).rows[0].p;
  await c.end();
  let usuariosRestantes = 0;
  for (const e of [A, B]) {
    await admin.auth.admin.deleteUser(e.uid);
    const { data: u } = await admin.auth.admin.getUserById(e.uid);
    if (u?.user) usuariosRestantes++;
  }
  fs.unlinkSync(ESTADO);
  const iguais = JSON.stringify(antes) === JSON.stringify(depois);
  console.log('contagens antes :', JSON.stringify(antes));
  console.log('contagens depois:', JSON.stringify(depois));
  console.log(iguais ? '  OK : banco idêntico ao de antes do teste' : '  FALHA: contagens diferentes');
  console.log(restantes === 0 ? '  OK : nenhuma empresa de teste restante' : '  FALHA: sobrou empresa de teste');
  console.log(usuariosRestantes === 0 ? '  OK : usuários de teste removidos do Auth' : '  FALHA: sobrou usuário de teste');
  console.log(sobra === 0 ? '  OK : nenhuma policy temporária de teste no banco' : '  FALHA: sobrou policy de teste');
  if (!iguais || restantes !== 0 || usuariosRestantes || sobra) process.exit(1);
}

const modo = process.argv[2];
({ auditar: () => auditar(false).then(() => {}), criar, verificar, limpar }[modo] || (() => { console.log('uso: auditar | criar | verificar | limpar'); return Promise.resolve(); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
