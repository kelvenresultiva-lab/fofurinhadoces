// Uso: node backup/validacao-dashboard.js criar | esperado | comparar | limpar
// Cria uma empresa de TESTE isolada com um cenário controlado, imprime os valores
// esperados do dashboard (calculados por SQL, independente do código do app) e
// depois remove tudo. Não toca em dados de nenhuma outra empresa.
// O cenário inclui um contrato CANCELADO com parcela pendente (que não pode entrar em
// valores futuros) e um contrato ATIVO com parcela pendente; `esperado` confere isso e
// sai com código 1 se alguma verificação do cenário falhar. `comparar` entra no app (precisa do
// servidor em APP_URL, padrão http://localhost:3000) e confere Dashboard (4 períodos) e Financeiro
// contra esses valores esperados.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { abrirSessao, cartoesDashboard, cartoesFinanceiro } = require('./lib-app-validacao');

const ESTADO = path.join(os.tmpdir(), 'validacao-dashboard.json');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const conn = async () => { const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; };

async function como(uid, fn) {
  const c = await conn();
  await c.query('begin');
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await c.query('set local role authenticated');
  try { const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback'); throw e; } finally { await c.end(); }
}

async function criar() {
  const email = `teste-dashboard-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'senhaTeste123!', email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  const c0 = await conn();
  await c0.query('begin');
  await c0.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  const emp = await c0.query("select * from criar_empresa_e_usuario('Empresa Dashboard TESTE','Usuario Dashboard',$1,null)", [email]);
  await c0.query('commit');
  const hoje = (await c0.query("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  await c0.end();

  const dia = (n) => `(date '${hoje}' + ${n})`;
  await como(uid, async (c) => {
    const cli = async (nome, status = 'ativo') => (await c.query('insert into clientes (nome, status) values ($1,$2) returning id', [nome, status])).rows[0].id;
    const C1 = await cli('Cliente Ativo 1'), C2 = await cli('Cliente Ativo 2'); await cli('Cliente Inativo', 'inativo');
    const ev = async (cid, tipo, dt, status) => (await c.query(`insert into eventos (cliente_id, tipo, data, status, horario, local) values ($1,$2,${dia(dt)},$3,'18:30','Salão X') returning id`, [cid, tipo, status])).rows[0].id;
    const E1 = await ev(C1, 'aniversario', 10, 'planejado');
    const E2 = await ev(C2, 'casamento', 20, 'cancelado');
    const E3 = await ev(C1, 'batizado', -15, 'realizado');
    const E4 = await ev(C2, 'casamento', 5, 'confirmado');
    const E5 = await ev(C1, 'aniversario', 40, 'planejado');
    const E6 = await ev(C1, 'batizado', -5, 'realizado');
    const E8 = await ev(C2, 'aniversario', 15, 'confirmado'); // contrato ATIVO com parcela pendente
    const E9 = await ev(C1, 'casamento', -2, 'realizado'); // contrato que será CANCELADO
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto Dashboard TESTE', 100) returning id")).rows[0].id;
    const orc = async (cid, eid, qtd, status) => {
      const o = (await c.query('insert into orcamentos (cliente_id, evento_id) values ($1,$2) returning id', [cid, eid])).rows[0].id;
      await c.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) values ($1,$2,$3,100)', [o, prod, qtd]);
      await c.query('update orcamentos set status=$2 where id=$1', [o, status]);
      return o;
    };
    await orc(C1, E1, 1, 'enviado');
    await orc(C2, E4, 2, 'em_negociacao');
    await orc(C1, E5, 1, 'recusado');
    await orc(C1, E5, 1, 'expirado');
    await orc(C2, E2, 1, 'rascunho');
    const O6 = await orc(C1, E3, 3, 'aprovado');
    const O7 = await orc(C1, E6, 1, 'aprovado');
    const O8 = await orc(C2, E8, 2, 'aprovado'); // 200 em 1 parcela, vence daqui a 12 dias
    const O9 = await orc(C1, E9, 3, 'aprovado'); // 300 em 2 parcelas de 150 (uma já vencida)
    const K6 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,3,${dia(-40)}) id`, [O6])).rows[0].id;
    const K7 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,1,${dia(-5)}) id`, [O7])).rows[0].id;
    const K8 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,1,${dia(12)}) id`, [O8])).rows[0].id;
    const K9 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,2,${dia(-10)}) id`, [O9])).rows[0].id;
    const p6 = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [K6])).rows;
    const p7 = (await c.query('select id from parcelas where contrato_id=$1', [K7])).rows;
    const p9 = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [K9])).rows;
    // parcela 1 do contrato 6: DOIS pagamentos parciais (30 + 20); contrato 7: pago integral
    await c.query(`select registrar_recebimento($1,30,${dia(-35)},'pix',null)`, [p6[0].id]);
    await c.query(`select registrar_recebimento($1,20,${dia(-20)},'dinheiro',null)`, [p6[0].id]);
    await c.query(`select registrar_recebimento($1,100,${dia(-3)},'pix',null)`, [p7[0].id]);
    // contrato 9: recebe 50 na parcela 1 e SÓ DEPOIS é cancelado. As parcelas dele continuam
    // pendente/parcial (não canceladas): o dashboard precisa excluí-las pelo status do contrato,
    // mas os 50 já recebidos devem permanecer no histórico de recebido.
    await c.query(`select registrar_recebimento($1,50,${dia(-8)},'pix',null)`, [p9[0].id]);
    await c.query("update contratos set status='cancelado' where id=$1", [K9]);
  });

  fs.writeFileSync(ESTADO, JSON.stringify({ uid, email, empresaId: emp.rows[0].empresa_id, hoje }));
  console.log(JSON.stringify({ email, senha: 'senhaTeste123!', hoje }));
}

function mais(data, n) { const [a, m, d] = data.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); }

async function esperado(silencioso = false) {
  const { uid, hoje, empresaId } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const [a, m] = hoje.split('-').map(Number);
  const ini = (ano, mes) => new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  const periodos = {
    mes: [ini(a, m), fim(a, m)],
    anterior: [ini(a, m - 1), fim(a, m - 1)],
    proximos30: [hoje, mais(hoje, 30)],
    personalizado: [mais(hoje, -60), hoje],
  };
  const c = await conn();
  const q = async (sql, p = []) => (await c.query(sql, [empresaId, ...p])).rows[0];
  const qAll = async (sql, p = []) => (await c.query(sql, [empresaId, ...p])).rows;
  // Regra: parcela só entra em valor futuro se ela E o contrato dela não estão cancelados.
  const DA_EMPRESA = 'from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1';
  const ABERTA = `p.status<>'cancelado' and k.status<>'cancelado' and p.valor>p.valor_pago`;
  const fixos = {
    aReceber: (await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n ${DA_EMPRESA} and ${ABERTA}`)),
    emAtraso: (await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n ${DA_EMPRESA} and ${ABERTA} and p.vencimento < $2::date`, [hoje])),
    contratosAtivos: (await q(`select count(distinct k.id)::int n from contratos k join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id join parcelas p on p.contrato_id=k.id where c.empresa_id=$1 and k.status='ativo' and p.status<>'cancelado' and p.valor>p.valor_pago`)).n,
    orcamentosNegociacao: (await q(`select count(*)::int n from orcamentos where empresa_id=$1 and status in ('enviado','em_negociacao')`)).n,
    eventosFuturos: (await q(`select count(*)::int n from eventos e join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and e.data >= $2::date and e.status<>'cancelado'`, [hoje])).n,
    clientesAtivos: (await q(`select count(*)::int n from clientes where empresa_id=$1 and status='ativo'`)).n,
  };
  const porPeriodo = {};
  for (const [nome, [i, f]] of Object.entries(periodos)) {
    porPeriodo[nome] = {
      de: i, ate: f,
      recebido: (await q(`select coalesce(sum(r.valor),0)::text v from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and r.data between $2::date and $3::date`, [i, f])).v,
      proximosVencimentos: await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n ${DA_EMPRESA} and ${ABERTA} and p.vencimento between $2::date and $3::date`, [i, f]),
    };
  }

  // ---- Confirmações da regra "contrato cancelado não entra em valor futuro" ----
  // Os números abaixo vêm do cenário montado em criar(), conferidos à mão:
  //  K6 ativo: 3x100, 50 pagos          -> saldo 250 (3 parcelas abertas; 2 vencidas = 50 + 100)
  //  K7 ativo: 1x100 quitada            -> saldo 0
  //  K8 ativo: 1x200 pendente (+12 d)   -> saldo 200
  //  K9 CANCELADO: 2x150, 50 pagos      -> saldo 250 que NÃO pode aparecer (uma parcela vencida de 100)
  const contratos = await qAll(`
    select k.status, count(p.id)::int parcelas,
           count(*) filter (where p.status='cancelado')::int parcelas_canceladas,
           coalesce(sum(p.valor-p.valor_pago),0)::text saldo,
           coalesce(sum(p.valor_pago),0)::text pago
    ${DA_EMPRESA} group by k.id, k.status, k.valor_final order by k.valor_final, k.status`);
  const k9 = await q(`select k.status, coalesce(sum(p.valor-p.valor_pago),0)::text saldo, count(*)::int parcelas,
      count(*) filter (where p.status='cancelado')::int parcelas_canceladas,
      count(*) filter (where p.valor>p.valor_pago and p.vencimento < $2::date)::int vencidas
    ${DA_EMPRESA} and k.status='cancelado' group by k.id, k.status`, [hoje]);
  const recebidoTotal = (await q(`select coalesce(sum(r.valor),0)::text v from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1`)).v;
  const recebidoDoCancelado = (await q(`select coalesce(sum(r.valor),0)::text v from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and k.status='cancelado'`)).v;
  await c.end();

  const num = (x) => Number(x);
  const verificacoes = {
    '1. contrato cancelado tem parcela pendente (parcelas NÃO marcadas como canceladas)': !!k9 && k9.parcelas === 2 && k9.parcelas_canceladas === 0 && num(k9.saldo) === 250,
    '2. existe contrato ativo com parcela pendente (K8: 200 a vencer; K6: 250 em aberto)': contratos.filter((x) => x.status === 'ativo' && num(x.saldo) > 0).length === 2,
    '3a. A receber = 450 em 4 parcelas (só contratos ativos; os 250 do cancelado ficam fora)': num(fixos.aReceber.v) === 450 && fixos.aReceber.n === 4,
    '3b. Em atraso = 150 em 2 parcelas (a vencida de 100 do cancelado fica fora)': num(fixos.emAtraso.v) === 150 && fixos.emAtraso.n === 2,
    '3c. Contratos ativos com saldo = 2 (K6 e K8; o cancelado e o quitado não contam)': fixos.contratosAtivos === 2,
    '4a. Recebido (histórico total) = 200, incluindo os 50 do contrato cancelado': num(recebidoTotal) === 200,
    '4b. Os 50 recebidos no contrato cancelado permanecem no histórico': num(recebidoDoCancelado) === 50,
  };
  const armadilha = { aReceberSeContarCancelado: String(num(fixos.aReceber.v) + num(k9?.saldo ?? 0)), emAtrasoSeContarCancelado: String(num(fixos.emAtraso.v) + 100) };
  if (!silencioso) console.log(JSON.stringify({ hoje, fixos, porPeriodo, contratos, recebidoTotal, recebidoDoCancelado, armadilha, verificacoes }, null, 1));
  const falhas = Object.entries(verificacoes).filter(([, ok]) => !ok).map(([k]) => k);
  if (falhas.length) { console.error('VERIFICAÇÕES COM FALHA:\n- ' + falhas.join('\n- ')); process.exit(1); }
  if (!silencioso) console.log('TODAS AS VERIFICAÇÕES DO CENÁRIO OK');
  void uid;
  return { hoje, fixos, porPeriodo, recebidoTotal };
}

// Entra no app como o usuário de teste e compara o que Dashboard e Financeiro MOSTRAM com o
// esperado por SQL: recebido, a receber, em atraso, próximos vencimentos e contratos ativos.
async function comparar() {
  const { email } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const esp = await esperado(true);
  const get = await abrirSessao(email);
  const falhas = [];
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const confere = (desc, ok, detalhe = '') => { console.log(`${ok ? '  OK ' : '  FALHA'}: ${desc}${ok ? '' : ' ' + detalhe}`); if (!ok) falhas.push(desc); };

  const fin = cartoesFinanceiro(await get('/financeiro'));
  console.log('== Financeiro ==');
  confere(`A receber ${fin.aReceber} (${fin.qtdAReceber} parcelas) = ${esp.fixos.aReceber.v} (${esp.fixos.aReceber.n})`, igual(fin.aReceber, Number(esp.fixos.aReceber.v)) && fin.qtdAReceber === esp.fixos.aReceber.n);
  confere(`Em atraso ${fin.emAtraso} (${fin.qtdEmAtraso}) = ${esp.fixos.emAtraso.v} (${esp.fixos.emAtraso.n})`, igual(fin.emAtraso, Number(esp.fixos.emAtraso.v)) && fin.qtdEmAtraso === esp.fixos.emAtraso.n);
  confere(`Recebido ${fin.recebido} = ${esp.recebidoTotal} (todos os recebimentos, inclusive de contrato cancelado)`, igual(fin.recebido, Number(esp.recebidoTotal)));

  for (const [nome, e] of Object.entries(esp.porPeriodo)) {
    const rota = nome === 'personalizado' ? `/dashboard?periodo=personalizado&de=${e.de}&ate=${e.ate}` : `/dashboard?periodo=${nome}`;
    const d = cartoesDashboard(await get(rota));
    console.log(`== Dashboard: ${nome} (${e.de} a ${e.ate}) ==`);
    confere(`Recebido no período ${d.recebidoPeriodo} = ${e.recebido}`, igual(d.recebidoPeriodo, Number(e.recebido)));
    confere(`Próximos vencimentos ${d.proximos} (${d.qtdProximos}) = ${e.proximosVencimentos.v} (${e.proximosVencimentos.n})`, igual(d.proximos, Number(e.proximosVencimentos.v)) && d.qtdProximos === e.proximosVencimentos.n);
    confere(`A receber ${d.aReceber} (${d.qtdAReceber}) = ${esp.fixos.aReceber.v} (${esp.fixos.aReceber.n}) e igual ao Financeiro`, igual(d.aReceber, Number(esp.fixos.aReceber.v)) && d.qtdAReceber === esp.fixos.aReceber.n && igual(d.aReceber, fin.aReceber));
    confere(`Em atraso ${d.emAtraso} (${d.qtdEmAtraso}) = ${esp.fixos.emAtraso.v} (${esp.fixos.emAtraso.n}) e igual ao Financeiro`, igual(d.emAtraso, Number(esp.fixos.emAtraso.v)) && d.qtdEmAtraso === esp.fixos.emAtraso.n && igual(d.emAtraso, fin.emAtraso));
    confere(`Contratos ativos ${d.contratosAtivos} = ${esp.fixos.contratosAtivos}`, d.contratosAtivos === esp.fixos.contratosAtivos);
    confere(`Resumo: recebido total ${d.resumoRecebido} = ${esp.recebidoTotal}; em atraso ${d.resumoAtraso}`, igual(d.resumoRecebido, Number(esp.recebidoTotal)) && igual(d.resumoAtraso, Number(esp.fixos.emAtraso.v)));
  }
  if (falhas.length) { console.error(`\n${falhas.length} COMPARAÇÃO(ÕES) COM FALHA`); process.exit(1); }
  console.log('\nDASHBOARD E FINANCEIRO CONFEREM COM O ESPERADO');
}

async function limpar() {
  const { uid, empresaId } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const c = await conn();
  await c.query('delete from contratos where evento_id in (select e.id from eventos e join clientes c on c.id=e.cliente_id where c.empresa_id=$1)', [empresaId]);
  await c.query('delete from empresas where id=$1', [empresaId]);
  await c.end();
  await admin.auth.admin.deleteUser(uid);
  fs.unlinkSync(ESTADO);
  console.log('empresa de teste removida');
}

const modo = process.argv[2];
({ criar, esperado, comparar, limpar }[modo] || (() => { console.log('uso: criar | esperado | comparar | limpar'); return Promise.resolve(); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
