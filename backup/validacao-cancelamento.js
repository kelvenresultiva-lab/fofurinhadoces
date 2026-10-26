// Uso: node backup/validacao-cancelamento.js criar | verificar | verificar-ui | limpar
// Valida o cancelamento de contrato (RPC cancelar_contrato) ponta a ponta:
//   criar         -> duas empresas de TESTE (A e B) e vários contratos ativos de A, um para cada teste
//   verificar     -> chamadas reais à API (PostgREST, com o JWT do usuário e com a chave anônima),
//                    conexões Postgres simultâneas para as corridas, e leitura das páginas do app
//                    (precisa do servidor em APP_URL, padrão http://localhost:3000). Sai com código 1
//                    se qualquer verificação falhar.
//   verificar-ui  -> confere o contrato K_UI, cancelado à mão pelo modal no navegador
//   limpar        -> remove tudo e confere que o banco voltou às contagens de antes do teste
// Não toca em dados de nenhuma outra empresa e não altera dados reais.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { SENHA, mais, textoDe, abrirSessao, cartoesDashboard, cartoesFinanceiro, linhasFinanceiro } = require('./lib-app-validacao');

const ESTADO = path.join(os.tmpdir(), 'validacao-cancelamento.json');
const TABELAS = ['empresas', 'usuarios', 'clientes', 'produtos', 'eventos', 'orcamentos', 'orcamento_itens', 'orcamento_historico', 'contratos', 'contrato_itens', 'parcelas', 'recebimentos'];
const NOME_A = 'Usuario Cancelamento A';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const conn = async () => { const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; };
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function como(uid, fn) {
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await c.query('set local role authenticated');
  try { const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback'); throw e; } finally { await c.end(); }
}
// Transação aberta à mão (para segurar travas) como o usuário autenticado.
async function abrirTx(uid) {
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await c.query('set local role authenticated');
  c.pid = (await c.query('select pg_backend_pid() pid')).rows[0].pid;
  return c;
}
async function contagens(c) {
  const o = {};
  for (const t of TABELAS) o[t] = (await c.query(`select count(*)::int n from ${t}`)).rows[0].n;
  return o;
}
async function criarEmpresa(c0, sufixo, nome) {
  const email = `teste-cancelamento-${sufixo}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw error;
  await c0.query('begin');
  await c0.query("select set_config('request.jwt.claim.sub',$1,true)", [data.user.id]);
  const emp = await c0.query('select * from criar_empresa_e_usuario($1,$2,$3,null)', [`Empresa Cancelamento ${sufixo} TESTE`, nome, email]);
  await c0.query('commit');
  return { uid: data.user.id, email, empresaId: emp.rows[0].empresa_id };
}
async function clienteApi(email) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error('login de teste falhou: ' + error.message);
  return sb;
}

// ---------------------------------------------------------------- criar
async function criar() {
  const c0 = await conn();
  const antes = await contagens(c0);
  const A = await criarEmpresa(c0, 'A', NOME_A);
  const B = await criarEmpresa(c0, 'B', 'Usuario Cancelamento B');
  const hoje = (await c0.query("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  await c0.end();
  const dia = (n) => `(date '${hoje}' + ${n})`;

  const ids = await como(A.uid, async (c) => {
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto Cancelamento TESTE', 100) returning id")).rows[0].id;
    const contrato = async (nomeCliente, qtd, parcelas, primeiroVenc) => {
      const cid = (await c.query('insert into clientes (nome) values ($1) returning id', [nomeCliente])).rows[0].id;
      const eid = (await c.query(`insert into eventos (cliente_id, tipo, data, status) values ($1,'casamento',${dia(60)},'confirmado') returning id`, [cid])).rows[0].id;
      const o = (await c.query('insert into orcamentos (cliente_id, evento_id) values ($1,$2) returning id', [cid, eid])).rows[0].id;
      await c.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) values ($1,$2,$3,100)', [o, prod, qtd]);
      await c.query("update orcamentos set status='aprovado' where id=$1", [o]);
      const k = (await c.query(`select converter_orcamento_em_contrato($1,0,null,$2,${dia(primeiroVenc)}) id`, [o, parcelas])).rows[0].id;
      const ps = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [k])).rows.map((p) => p.id);
      return { id: k, parcelas: ps, cliente: nomeCliente };
    };
    const receber = (parcelaId, valor, dt, forma) => c.query(`select registrar_recebimento($1,$2,${dia(dt)},$3,null)`, [parcelaId, valor, forma]);

    // K1 (principal): #1 paga (100), #2 parcial (40) e vencida, #3 pendente a vencer. Saldo = 60 + 100 = 160.
    const K1 = await contrato('Cliente Cancelamento K1', 3, 3, -40);
    await receber(K1.parcelas[0], 100, -35, 'pix');
    await receber(K1.parcelas[1], 40, -8, 'dinheiro');
    const simples = (nome) => contrato(nome, 2, 2, 10); // 2x100 pendentes, a vencer
    const ids = { K1, K2: await simples('Cliente Cancelamento K2'), K5: await simples('Cliente Cancelamento K5'), KUI: await simples('Cliente Cancelamento KUI'),
      KL: await simples('Cliente Cancelamento KL'), KP1: await simples('Cliente Cancelamento KP1'), KP2: await simples('Cliente Cancelamento KP2') };
    for (let i = 1; i <= 5; i++) ids[`KC${i}`] = await simples(`Cliente Cancelamento KC${i}`);
    return ids;
  });

  fs.writeFileSync(ESTADO, JSON.stringify({ A, B, hoje, ids, antes }));
  console.log(`cenário criado: empresas A e B, ${Object.keys(ids).length} contratos ativos na A, hoje = ${hoje}`);
}

// ---------------------------------------------------------------- verificar
const SQL_BASE = 'from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1';
const ABERTA = "p.status<>'cancelado' and k.status<>'cancelado' and p.valor>p.valor_pago";

async function totaisSql(c, empresaId, hoje) {
  const um = async (sql, p = []) => (await c.query(sql, [empresaId, ...p])).rows[0];
  const a = await um(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA}`);
  const at = await um(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA} and p.vencimento < $2::date`, [hoje]);
  const av = await um(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA} and p.vencimento >= $2::date`, [hoje]);
  const r = await um('select coalesce(sum(r.valor),0)::float v from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1');
  return { aReceber: a.v, qtdAReceber: a.n, emAtraso: at.v, qtdEmAtraso: at.n, aVencer: av.v, recebido: r.v };
}
async function impressao(c, kid) {
  const h = async (sql) => (await c.query(sql, [kid])).rows[0].h;
  return {
    itens: await h('select count(*)::int || md5(coalesce(string_agg(to_jsonb(t)::text, \'|\' order by id), \'\')) h from contrato_itens t where contrato_id=$1'),
    parcelas: await h('select count(*)::int || md5(coalesce(string_agg(to_jsonb(t)::text, \'|\' order by id), \'\')) h from parcelas t where contrato_id=$1'),
    recebimentos: await h('select count(*)::int || md5(coalesce(string_agg(to_jsonb(r)::text, \'|\' order by r.id), \'\')) h from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1'),
  };
}
const linhaContrato = async (c, kid) => (await c.query('select status, cancelado_em, cancelado_por, motivo_cancelamento, observacoes from contratos where id=$1', [kid])).rows[0];
const intactoAtivo = (l) => l.status === 'ativo' && l.cancelado_em === null && l.cancelado_por === null && l.motivo_cancelamento === null;

async function verificar() {
  const { A, B, hoje, ids } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const falhas = [];
  const confere = (desc, ok, detalhe = '') => { console.log(`${ok ? '  OK ' : '  FALHA'}: ${desc}${ok ? '' : ' ' + detalhe}`); if (!ok) falhas.push(desc + ' ' + detalhe); };
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const c = await conn();
  const sbA = await clienteApi(A.email);
  const sbB = await clienteApi(B.email);
  const sbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const getA = await abrirSessao(A.email);
  const pagina = async (k) => textoDe(await getA(`/contratos/${k.id}`));
  const cancelar = (sb, k, motivo) => sb.rpc('cancelar_contrato', { p_contrato_id: k.id, p_motivo: motivo });
  const rotaDash = `/dashboard?periodo=personalizado&de=${mais(hoje, -120)}&ate=${mais(hoje, 365)}`;

  // ---- páginas e totais ANTES do cancelamento principal ----
  const antesLinha = await linhaContrato(c, ids.K1.id);
  const antesImp = await impressao(c, ids.K1.id);
  const totAntesSql = await totaisSql(c, A.empresaId, hoje);
  const finAntes = cartoesFinanceiro(await getA('/financeiro'));
  const dashAntes = cartoesDashboard(await getA(rotaDash));
  const htmlAntes = await getA(`/contratos/${ids.K1.id}`);
  const tAntes = textoDe(htmlAntes);

  console.log('== Contrato ATIVO: ação disponível e modal de confirmação ==');
  confere('página do contrato ativo mostra o botão "Cancelar contrato" e não mostra aviso de cancelamento', tAntes.includes('Cancelar contrato') && !tAntes.includes('Cancelado em'));
  confere('modal explica: cobranças futuras somem, recebido preservado, sem estorno, sem novos pagamentos',
    ['As cobranças futuras deixarão de aparecer', 'Os valores já recebidos serão preservados', 'Nenhum estorno será realizado', 'O contrato não poderá receber novos pagamentos'].every((t) => tAntes.includes(t)));
  confere('modal exige motivo (textarea obrigatória) e confirmação (checkbox) e tem botão de confirmar', /<textarea[^>]*name="motivo"[^>]*required/.test(htmlAntes) && htmlAntes.includes('name="confirmacao"') && tAntes.includes('Confirmar cancelamento'));
  confere('antes: Dashboard e Financeiro batem com o SQL', igual(finAntes.aReceber, totAntesSql.aReceber) && igual(dashAntes.aReceber, totAntesSql.aReceber) && igual(finAntes.recebido, totAntesSql.recebido));

  console.log('== 1-4. Cancelamento do contrato ativo (chamada real à API como usuário A) ==');
  const t0 = (await c.query('select clock_timestamp() t')).rows[0].t;
  const r1 = await cancelar(sbA, ids.K1, '  Cliente desistiu do evento  ');
  const t1 = (await c.query('select clock_timestamp() t')).rows[0].t;
  const dep = await linhaContrato(c, ids.K1.id);
  confere('1. cancelou o contrato ativo e a RPC devolveu o contrato cancelado', !r1.error && r1.data?.status === 'cancelado' && dep.status === 'cancelado', JSON.stringify(r1.error));
  confere('2. gravou a data/hora do cancelamento (dentro da janela da chamada)', dep.cancelado_em && dep.cancelado_em >= t0 && dep.cancelado_em <= t1);
  confere('3. gravou o motivo (sem espaços nas pontas)', dep.motivo_cancelamento === 'Cliente desistiu do evento');
  confere('4. gravou o usuário autenticado como responsável (cancelado_por = usuário A)', dep.cancelado_por === A.uid);

  console.log('== 5-8. Recusas ==');
  const r2 = await cancelar(sbA, ids.K1, 'outro motivo');
  const apos2 = await linhaContrato(c, ids.K1.id);
  confere('5. segundo cancelamento é recusado e não altera data/motivo/responsável', !!r2.error && /já está cancelado/i.test(r2.error.message) && apos2.cancelado_em.getTime() === dep.cancelado_em.getTime() && apos2.motivo_cancelamento === dep.motivo_cancelamento && apos2.cancelado_por === A.uid, r2.error?.message);
  const semMotivo = [await cancelar(sbA, ids.K2, ''), await cancelar(sbA, ids.K2, '   '), await cancelar(sbA, ids.K2, '\n\t '), await sbA.rpc('cancelar_contrato', { p_contrato_id: ids.K2.id, p_motivo: null }), await cancelar(sbA, ids.K2, 'x'.repeat(501))];
  confere('6. sem motivo (vazio, espaços, nulo) ou com mais de 500 caracteres é recusado e o contrato segue ativo', semMotivo.every((r) => !!r.error) && intactoAtivo(await linhaContrato(c, ids.K2.id)), semMotivo.map((r) => r.error?.message).join(' | '));
  const rB = await cancelar(sbB, ids.K2, 'tentativa da outra empresa');
  confere('7. outra empresa (B) não cancela contrato da empresa A ("Contrato não encontrado") e nada muda', !!rB.error && /não encontrado/i.test(rB.error.message) && intactoAtivo(await linhaContrato(c, ids.K2.id)), rB.error?.message);
  const rAnon = await cancelar(sbAnon, ids.K2, 'tentativa anônima');
  confere('8. chamada anônima (chave anon, sem login) é bloqueada pelo banco (permissão negada) e nada muda', !!rAnon.error && (rAnon.error.code === '42501' || /permission denied/i.test(rAnon.error.message)) && intactoAtivo(await linhaContrato(c, ids.K2.id)), JSON.stringify(rAnon.error));
  const rUuid = await sbA.rpc('cancelar_contrato', { p_contrato_id: '00000000-0000-0000-0000-000000000000', p_motivo: 'x' });
  confere('contrato inexistente é recusado com mensagem clara', !!rUuid.error && /não encontrado/i.test(rUuid.error.message));

  console.log('== 9-11. Preservação de itens, parcelas e recebimentos ==');
  const depImp = await impressao(c, ids.K1.id);
  confere('9. itens do contrato idênticos (nenhuma linha apagada ou alterada)', antesImp.itens === depImp.itens);
  confere('10. parcelas idênticas, inclusive o status gravado (pago / parcial / pendente)', antesImp.parcelas === depImp.parcelas && JSON.stringify((await c.query('select status from parcelas where contrato_id=$1 order by numero', [ids.K1.id])).rows.map((r) => r.status)) === JSON.stringify(['pago', 'parcial', 'pendente']));
  confere('11. recebimentos idênticos (100,00 e 40,00 preservados, sem estorno)', antesImp.recebimentos === depImp.recebimentos && (await c.query('select count(*)::int n, sum(r.valor)::float s from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1', [ids.K1.id])).rows[0].s === 140);

  console.log('== 12. Bloqueio de novo pagamento ==');
  const pagamento = await sbA.rpc('registrar_recebimento', { p_parcela_id: ids.K1.parcelas[2], p_valor: '10', p_data: hoje, p_forma_pagamento: 'pix', p_observacoes: null });
  confere('12. recebimento em contrato cancelado é recusado e nada é gravado', !!pagamento.error && /contrato cancelado/i.test(pagamento.error.message) && (await impressao(c, ids.K1.id)).recebimentos === antesImp.recebimentos, pagamento.error?.message);

  console.log('== 13-15. Dashboard e Financeiro depois do cancelamento ==');
  const totDepSql = await totaisSql(c, A.empresaId, hoje);
  const finDep = cartoesFinanceiro(await getA('/financeiro'));
  const dashDep = cartoesDashboard(await getA(rotaDash));
  confere('13. Dashboard: a receber caiu exatamente os 160,00 do saldo do contrato e bate com o SQL', igual(totAntesSql.aReceber - totDepSql.aReceber, 160) && igual(dashDep.aReceber, totDepSql.aReceber) && igual(dashDep.emAtraso, totDepSql.emAtraso) && igual(dashDep.proximos, totDepSql.aReceber) && dashDep.qtdAReceber === dashAntes.qtdAReceber - 2, `antes=${totAntesSql.aReceber} depois=${totDepSql.aReceber} dash=${dashDep.aReceber}`);
  confere('14. Financeiro: a receber, em atraso e próximos vencimentos batem com o SQL (sem o contrato cancelado)', igual(finDep.aReceber, totDepSql.aReceber) && igual(finDep.emAtraso, totDepSql.emAtraso) && igual(finDep.proximos, totDepSql.aVencer) && finDep.qtdAReceber === finAntes.qtdAReceber - 2 && finDep.qtdEmAtraso === finAntes.qtdEmAtraso - 1);
  const filtros = {};
  for (const f of ['pendentes', 'parciais', 'vencidas', 'pagas']) filtros[f] = linhasFinanceiro(await getA(`/financeiro?filtro=${f}`)).filter((x) => x.startsWith(ids.K1.id));
  confere('14b. nenhuma parcela em aberto do contrato cancelado nos filtros pendentes/parciais/vencidas', filtros.pendentes.length + filtros.parciais.length + filtros.vencidas.length === 0, JSON.stringify(filtros));
  confere('15. recebimentos históricos permanecem: recebido igual antes e depois (Dashboard, Financeiro e SQL) e a parcela paga segue em "Pagas"',
    igual(totAntesSql.recebido, totDepSql.recebido) && igual(dashDep.resumoRecebido, totDepSql.recebido) && igual(finDep.recebido, totDepSql.recebido) && filtros.pagas.length === 1);

  console.log('== 16. Página do contrato cancelado ==');
  const htmlDep = await getA(`/contratos/${ids.K1.id}`);
  const tDep = textoDe(htmlDep);
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(dep.cancelado_em);
  const p = (t) => quando.find((x) => x.type === t).value;
  confere('16a. mostra "Contrato cancelado", a data e hora do cancelamento, o motivo e o NOME do responsável', tDep.includes('Contrato cancelado') && tDep.includes(`Cancelado em ${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`) && tDep.includes('Motivo Cliente desistiu do evento') && tDep.includes(`Cancelado por ${NOME_A}`), tDep.slice(tDep.indexOf('Contrato cancelado'), tDep.indexOf('Contrato cancelado') + 300));
  confere('16b. não mostra mais a ação de cancelar nem o modal, nem formulário de recebimento', !tDep.includes('Cancelar contrato') && !tDep.includes('Confirmar cancelamento') && !htmlDep.includes('name="confirmacao"') && !tDep.includes('Registrar recebimento'));
  confere('16c. mantém a visão histórica: valor original, recebido 140,00, histórico de recebimentos e parcelas "Cancelada com o contrato"', tDep.includes('Valor original') && tDep.includes('Recebido R$ 140,00') && tDep.includes('R$ 100,00 —') && tDep.includes('R$ 40,00 —') && tDep.includes('Cancelada com o contrato') && !tDep.includes('Próxima parcela') && !/Em atraso/.test(tDep));
  const pagB = await getB_raw(A, B, ids.K1);
  confere('16d. a empresa B continua sem acesso à página do contrato cancelado da A (404)', pagB);

  console.log('== Proteção contra contornar a operação (API direta, como usuário A) ==');
  const dir1 = await sbA.from('contratos').update({ status: 'cancelado' }).eq('id', ids.K2.id).select();
  const dir2 = await sbA.from('contratos').update({ status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: 'forjado', cancelado_por: A.uid }).eq('id', ids.K2.id).select();
  const dir3 = await sbA.from('contratos').update({ cancelado_em: new Date().toISOString() }).eq('id', ids.K2.id).select();
  const dir4 = await sbA.from('contratos').update({ status: 'ativo', cancelado_em: null, cancelado_por: null, motivo_cancelamento: null }).eq('id', ids.K1.id).select();
  const evK = (await c.query('select evento_id, valor_total::text vt from contratos where id=$1', [ids.K2.id])).rows[0];
  const dir5 = await sbA.from('contratos').insert({ evento_id: evK.evento_id, valor_total: 1, status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: 'forjado' }).select();
  const ok = await sbA.from('contratos').update({ observacoes: 'edição comum continua permitida' }).eq('id', ids.K2.id).select();
  const apos = await linhaContrato(c, ids.K2.id);
  const aposK1 = await linhaContrato(c, ids.K1.id);
  confere('UPDATE direto de status/dados de cancelamento é bloqueado (4 variações, inclusive reativar o cancelado)', [dir1, dir2, dir3, dir4].every((r) => !!r.error && /operação cancelar_contrato/.test(r.error.message)) && intactoAtivo(apos) && aposK1.status === 'cancelado' && aposK1.cancelado_em.getTime() === dep.cancelado_em.getTime(), [dir1, dir2, dir3, dir4].map((r) => r.error?.message).join(' | '));
  confere('INSERT direto de contrato já cancelado é bloqueado', !!dir5.error && /operação cancelar_contrato/.test(dir5.error.message), JSON.stringify(dir5.error));
  confere('edição de outro campo (observações) segue permitida: o gatilho não quebra fluxos existentes', !ok.error && ok.data?.length === 1 && apos.observacoes === 'edição comum continua permitida', JSON.stringify(ok.error));

  console.log('== Concorrência: duas tentativas simultâneas de cancelamento ==');
  const clientes2 = [await clienteApi(A.email), await clienteApi(A.email)];
  let rodadasOk = 0;
  const detalhes = [];
  for (let i = 1; i <= 5; i++) {
    const k = ids[`KC${i}`];
    const [x, y] = await Promise.all([cancelar(clientes2[0], k, `motivo X${i}`), cancelar(clientes2[1], k, `motivo Y${i}`)]);
    const sucessos = [x, y].filter((r) => !r.error).length;
    const l = await linhaContrato(c, k.id);
    const vencedor = x.error ? `motivo Y${i}` : `motivo X${i}`;
    const perdedorMsg = (x.error ?? y.error)?.message ?? '';
    if (sucessos === 1 && /já está cancelado/i.test(perdedorMsg) && l.status === 'cancelado' && l.motivo_cancelamento === vencedor) rodadasOk++;
    detalhes.push(`rodada ${i}: ${sucessos} sucesso(s), vencedor "${l.motivo_cancelamento}"`);
  }
  confere('5 rodadas de 2 chamadas simultâneas pela API: em todas, exatamente 1 efetiva e a outra recebe "já está cancelado"; o motivo gravado é o do vencedor', rodadasOk === 5, detalhes.join('; '));

  // Determinístico: a 1ª transação segura a trava; a 2ª tem de esperar, e só falha depois do commit da 1ª.
  const cT1 = await abrirTx(A.uid);
  const cT2 = await abrirTx(A.uid);
  await cT1.query('select cancelar_contrato($1,$2)', [ids.KL.id, 'primeiro']);
  const p2 = cT2.query('select cancelar_contrato($1,$2)', [ids.KL.id, 'segundo']).then(() => ({ ok: true }), (e) => ({ ok: false, msg: e.message }));
  await dormir(1200);
  const esperando = (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [cT2.pid])).rows[0]?.wait_event_type;
  const resolveuAntes = await Promise.race([p2.then(() => true), dormir(100).then(() => false)]);
  await cT1.query('commit');
  const res2 = await p2;
  await cT2.query('rollback');
  await cT1.end(); await cT2.end();
  const lKL = await linhaContrato(c, ids.KL.id);
  confere('trava de linha: a 2ª transação ficou ESPERANDO (Lock) enquanto a 1ª não commitou, depois recebeu "já está cancelado"; vale o motivo da 1ª', esperando === 'Lock' && !resolveuAntes && !res2.ok && /já está cancelado/i.test(res2.msg) && lKL.motivo_cancelamento === 'primeiro', `${esperando} ${res2.msg}`);

  console.log('== Corridas cancelamento x pagamento (sem deadlock) ==');
  // (a) pagamento começa primeiro: o cancelamento espera, o pagamento fica registrado e o cancelamento conclui depois.
  const pa = ids.KP1.parcelas[0];
  const cPay = await abrirTx(A.uid);
  const cCan = await abrirTx(A.uid);
  await cPay.query(`select registrar_recebimento($1,10,date '${hoje}','pix',null)`, [pa]);
  const pCan = cCan.query('select cancelar_contrato($1,$2)', [ids.KP1.id, 'cancelado depois do pagamento']).then(() => ({ ok: true }), (e) => ({ ok: false, msg: e.message }));
  await dormir(1200);
  const espCan = (await c.query('select wait_event_type from pg_stat_activity where pid=$1', [cCan.pid])).rows[0]?.wait_event_type;
  await cPay.query('commit');
  const rCan = await pCan;
  await cCan.query('commit');
  await cPay.end(); await cCan.end();
  const lKP1 = await linhaContrato(c, ids.KP1.id);
  const recKP1 = (await c.query('select count(*)::int n, sum(valor)::float s from recebimentos where parcela_id=$1', [pa])).rows[0];
  confere('pagamento iniciado ANTES: o cancelamento esperou, o recebimento de 10,00 foi preservado e o contrato ficou cancelado', espCan === 'Lock' && rCan.ok && lKP1.status === 'cancelado' && recKP1.n === 1 && recKP1.s === 10, `${espCan} ${rCan.msg ?? ''}`);
  // (b) cancelamento começa primeiro: o pagamento espera e é recusado; nada é gravado.
  const pb = ids.KP2.parcelas[0];
  const cCan2 = await abrirTx(A.uid);
  const cPay2 = await abrirTx(A.uid);
  await cCan2.query('select cancelar_contrato($1,$2)', [ids.KP2.id, 'cancelado antes do pagamento']);
  const pPay = cPay2.query(`select registrar_recebimento($1,10,date '${hoje}','pix',null)`, [pb]).then(() => ({ ok: true }), (e) => ({ ok: false, msg: e.message }));
  await dormir(1200);
  const espPay = (await c.query('select wait_event_type from pg_stat_activity where pid=$1', [cPay2.pid])).rows[0]?.wait_event_type;
  await cCan2.query('commit');
  const rPay = await pPay;
  await cPay2.query('rollback');
  await cCan2.end(); await cPay2.end();
  const recKP2 = (await c.query('select count(*)::int n from recebimentos where parcela_id=$1', [pb])).rows[0].n;
  confere('cancelamento iniciado ANTES: o pagamento esperou, foi recusado ("contrato cancelado") e nenhum recebimento foi gravado', espPay === 'Lock' && !rPay.ok && /contrato cancelado/i.test(rPay.msg) && recKP2 === 0, `${espPay} ${rPay.msg ?? ''}`);

  console.log('== 17. Falha transacional: nenhuma atualização parcial ==');
  const k5 = ids.K5.id;
  // (i) falha injetada DENTRO da operação (trigger temporário que explode ao gravar o cancelamento).
  const cF = await conn();
  let msgI = '';
  await cF.query('begin');
  await cF.query("create function public.__falha_injetada() returns trigger language plpgsql as $$ begin if new.status = 'cancelado' then raise exception 'FALHA INJETADA'; end if; return new; end $$");
  await cF.query('create trigger zz_falha_injetada before update on public.contratos for each row execute function public.__falha_injetada()');
  await cF.query("select set_config('request.jwt.claim.sub',$1,true)", [A.uid]);
  await cF.query('set local role authenticated');
  try { await cF.query('select cancelar_contrato($1,$2)', [k5, 'vai falhar']); } catch (e) { msgI = e.message; }
  await cF.query('rollback');
  const triggerSobrou = (await cF.query("select count(*)::int n from pg_trigger where tgname='zz_falha_injetada'")).rows[0].n;
  await cF.end();
  confere('(i) falha no meio da RPC: erro propagado, contrato intacto e gatilho de teste desfeito junto', msgI === 'FALHA INJETADA' && intactoAtivo(await linhaContrato(c, k5)) && triggerSobrou === 0, msgI);
  // (ii) RPC concluída e falha logo depois na mesma transação: rollback total.
  const cG = await abrirTx(A.uid);
  await cG.query('select cancelar_contrato($1,$2)', [k5, 'vai ser desfeito']);
  const dentro = (await cG.query('select status from contratos where id=$1', [k5])).rows[0].status;
  let msgII = '';
  try { await cG.query('select 1/0'); } catch (e) { msgII = e.message; }
  await cG.query('rollback'); await cG.end();
  confere('(ii) cancelamento concluído dentro da transação e erro logo depois: rollback devolve o contrato ativo e sem dados de cancelamento', dentro === 'cancelado' && /division by zero/.test(msgII) && intactoAtivo(await linhaContrato(c, k5)));
  // (iii) o CHECK impede qualquer estado "pela metade", mesmo para quem tem acesso total ao banco.
  const parciais = [
    "update contratos set status='cancelado' where id=$1",
    "update contratos set status='cancelado', cancelado_em=now() where id=$1",
    "update contratos set status='cancelado', cancelado_em=now(), motivo_cancelamento='   ' where id=$1",
    "update contratos set cancelado_em=now() where id=$1",
    "update contratos set motivo_cancelamento='solto' where id=$1",
  ];
  let barradas = 0;
  for (const sql of parciais) {
    await c.query('begin');
    try { await c.query(sql, [k5]); } catch (e) { if (/contratos_cancelamento_check/.test(e.message)) barradas++; }
    await c.query('rollback');
  }
  confere('(iii) o banco recusa, mesmo ao administrador, 5 formas de gravar cancelamento incompleto (CHECK de integridade); contrato segue ativo', barradas === 5 && intactoAtivo(await linhaContrato(c, k5)), `barradas=${barradas}`);

  console.log('== Contrato reservado para o teste de interface ==');
  confere('KUI segue ativo e intacto (será cancelado pelo modal no navegador)', intactoAtivo(await linhaContrato(c, ids.KUI.id)));
  await c.end();

  if (falhas.length) { console.error(`\n${falhas.length} VERIFICAÇÃO(ÕES) COM FALHA`); process.exit(1); }
  console.log('\nTODAS AS VERIFICAÇÕES DO CANCELAMENTO OK');
}

const contar = (texto, trecho) => texto.split(trecho).length - 1;
async function getB_raw(A, B, k) {
  const getB = await abrirSessao(B.email);
  const r = await getB.raw(`/contratos/${k.id}`);
  const t = textoDe(r.html);
  return (r.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404|could not be found/i.test(r.html)) && !t.includes(k.cliente) && !t.includes('Motivo Cliente desistiu');
}

// ---------------------------------------------------------------- verificar-ui
async function verificarUi() {
  const { A, ids } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const c = await conn();
  const l = await linhaContrato(c, ids.KUI.id);
  const getA = await abrirSessao(A.email);
  const t = textoDe(await getA(`/contratos/${ids.KUI.id}`));
  const ok = l.status === 'cancelado' && l.cancelado_por === A.uid && l.motivo_cancelamento === 'Teste pela interface do modal' && !!l.cancelado_em
    && t.includes('Contrato cancelado') && t.includes('Motivo Teste pela interface do modal') && t.includes(`Cancelado por ${NOME_A}`) && !t.includes('Cancelar contrato');
  console.log(ok ? '  OK : cancelamento feito pelo modal gravou status, data, responsável e motivo, e a página mostra tudo' : '  FALHA: ' + JSON.stringify(l));
  await c.end();
  if (!ok) process.exit(1);
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
  const funcoesTeste = (await c.query("select count(*)::int n from pg_proc where proname='__falha_injetada'")).rows[0].n;
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
  console.log(funcoesTeste === 0 ? '  OK : nenhum objeto temporário de teste no banco' : '  FALHA: sobrou função de teste');
  if (!iguais || restantes !== 0 || usuariosRestantes || funcoesTeste) process.exit(1);
}

const modo = process.argv[2];
({ criar, verificar, 'verificar-ui': verificarUi, limpar }[modo] || (() => { console.log('uso: criar | verificar | verificar-ui | limpar'); return Promise.resolve(); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
