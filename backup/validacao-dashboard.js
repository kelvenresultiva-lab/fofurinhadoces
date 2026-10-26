// Uso: node backup/validacao-dashboard.js criar | limpar
// Cria uma empresa de TESTE isolada com um cenário controlado, imprime os valores
// esperados do dashboard (calculados por SQL, independente do código do app) e
// depois remove tudo. Não toca em dados de nenhuma outra empresa.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

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
    const K6 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,3,${dia(-40)}) id`, [O6])).rows[0].id;
    const K7 = (await c.query(`select converter_orcamento_em_contrato($1,0,null,1,${dia(-5)}) id`, [O7])).rows[0].id;
    const p6 = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [K6])).rows;
    const p7 = (await c.query('select id from parcelas where contrato_id=$1', [K7])).rows;
    // parcela 1 do contrato 6: DOIS pagamentos parciais (30 + 20); contrato 7: pago integral
    await c.query(`select registrar_recebimento($1,30,${dia(-35)},'pix',null)`, [p6[0].id]);
    await c.query(`select registrar_recebimento($1,20,${dia(-20)},'dinheiro',null)`, [p6[0].id]);
    await c.query(`select registrar_recebimento($1,100,${dia(-3)},'pix',null)`, [p7[0].id]);
  });

  fs.writeFileSync(ESTADO, JSON.stringify({ uid, email, empresaId: emp.rows[0].empresa_id, hoje }));
  console.log(JSON.stringify({ email, senha: 'senhaTeste123!', hoje }));
}

function mais(data, n) { const [a, m, d] = data.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); }

async function esperado() {
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
  const fixos = {
    aReceber: (await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and p.status<>'cancelado' and p.valor>p.valor_pago`)),
    emAtraso: (await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and p.status<>'cancelado' and p.valor>p.valor_pago and p.vencimento < $2::date`, [hoje])),
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
      proximosVencimentos: await q(`select coalesce(sum(p.valor-p.valor_pago),0)::text v, count(*)::int n from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes c on c.id=e.cliente_id where c.empresa_id=$1 and p.status<>'cancelado' and p.valor>p.valor_pago and p.vencimento between $2::date and $3::date`, [i, f]),
    };
  }
  await c.end();
  console.log(JSON.stringify({ hoje, fixos, porPeriodo }, null, 1));
  void uid;
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
({ criar, esperado, limpar }[modo] || (() => { console.log('uso: criar | esperado | limpar'); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
