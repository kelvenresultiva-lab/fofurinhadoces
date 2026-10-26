// Uso: node backup/validacao-financeiro.js criar | verificar | limpar
// Valida a regra "parcela de contrato cancelado não é valor futuro" e a consistência entre
// Dashboard e Financeiro, ponta a ponta:
//   criar     -> empresa de TESTE isolada com 7 contratos/parcelas de cenários diferentes
//   verificar -> calcula os valores esperados por SQL (independente do código do app), entra no
//                app como o usuário de teste (precisa do servidor em APP_URL, padrão
//                http://localhost:3000), lê Dashboard, Financeiro (5 filtros) e a página do
//                contrato, e compara tudo. Sai com código 1 se qualquer verificação falhar.
//   limpar    -> remove tudo e confere que o banco voltou às contagens de antes do teste
// Não toca em dados de nenhuma outra empresa e não altera dados reais.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { SENHA, mais, textoDe, abrirSessao, cartoesFinanceiro, cartoesDashboard, linhasFinanceiro } = require('./lib-app-validacao');
const { Client } = require('pg');

const ESTADO = path.join(os.tmpdir(), 'validacao-financeiro.json');
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

function dataBR(data) { const [a, m, d] = data.split('-'); return `${d}/${m}/${a}`; }

// ---------------------------------------------------------------- criar
async function criar() {
  const c0 = await conn();
  const antes = await contagens(c0);
  const email = `teste-financeiro-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  await c0.query('begin');
  await c0.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  const emp = await c0.query("select * from criar_empresa_e_usuario('Empresa Financeiro TESTE','Usuario Financeiro',$1,null)", [email]);
  await c0.query('commit');
  const hoje = (await c0.query("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  const dia = (n) => `(date '${hoje}' + ${n})`;

  const ids = await como(uid, async (c) => {
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto Financeiro TESTE', 100) returning id")).rows[0].id;
    // Cada contrato tem cliente, evento e orçamento próprios (um contrato por evento).
    const contrato = async (sigla, preco, qtd, parcelas, primeiroVenc) => {
      const cid = (await c.query('insert into clientes (nome) values ($1) returning id', [`Cliente ${sigla}`])).rows[0].id;
      const eid = (await c.query(`insert into eventos (cliente_id, tipo, data, status) values ($1,'aniversario',${dia(60)},'confirmado') returning id`, [cid])).rows[0].id;
      const o = (await c.query('insert into orcamentos (cliente_id, evento_id) values ($1,$2) returning id', [cid, eid])).rows[0].id;
      await c.query('insert into orcamento_itens (orcamento_id, produto_id, quantidade, valor_unitario) values ($1,$2,$3,$4)', [o, prod, qtd, preco]);
      await c.query("update orcamentos set status='aprovado' where id=$1", [o]);
      const k = (await c.query(`select converter_orcamento_em_contrato($1,0,null,$2,${dia(primeiroVenc)}) id`, [o, parcelas])).rows[0].id;
      const ps = (await c.query('select id, numero from parcelas where contrato_id=$1 order by numero', [k])).rows;
      return { id: k, parcelas: ps.map((p) => p.id) };
    };
    const receber = (parcelaId, valor, dt, forma) => c.query(`select registrar_recebimento($1,$2,${dia(dt)},$3,null)`, [parcelaId, valor, forma]);
    const cancelar = (k) => c.query("select cancelar_contrato($1, 'Cancelado para validação')", [k.id]);

    // ATIVOS
    const KA = await contrato('KA', 100, 1, 1, 10);   // pendente, a vencer
    const KB = await contrato('KB', 200, 1, 1, 20);   // parcialmente paga (80 de 200), a vencer
    await receber(KB.parcelas[0], 80, -3, 'pix');
    const KC = await contrato('KC', 150, 1, 1, -12);  // pendente e VENCIDA
    const KG = await contrato('KG', 100, 2, 2, 5);    // 2 parcelas; a 2ª será cancelada individualmente

    // CANCELADOS (cancelados depois de gerar/receber; as parcelas continuam pendente/parcial)
    const KD = await contrato('KD', 300, 1, 1, 15);   // pendente, nunca recebeu nada
    await cancelar(KD);
    const KE = await contrato('KE', 100, 2, 2, -20);  // 1ª quitada (recebimento histórico), 2ª pendente a vencer
    await receber(KE.parcelas[0], 100, -18, 'dinheiro');
    await cancelar(KE);
    const KF = await contrato('KF', 100, 2, 2, -45);  // 1ª parcial (40 de 100), as duas VENCIDAS
    await receber(KF.parcelas[0], 40, -40, 'pix');
    await cancelar(KF);
    return { KA, KB, KC, KD, KE, KF, KG };
  });

  // Parcela individual cancelada (2ª do KG): via conexão administrativa, só neste tenant de teste.
  await c0.query("update parcelas set status='cancelado' where id=$1", [ids.KG.parcelas[1]]);
  await c0.end();

  fs.writeFileSync(ESTADO, JSON.stringify({ uid, email, empresaId: emp.rows[0].empresa_id, hoje, ids, antes }));
  console.log('cenário criado: 7 contratos (4 ativos, 3 cancelados), hoje =', hoje);
}

// ---------------------------------------------------------------- verificar
const SQL_BASE = 'from parcelas p join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1';
const ABERTA = "p.status<>'cancelado' and k.status<>'cancelado' and p.valor>p.valor_pago";

async function verificar() {
  const { email, empresaId, hoje, ids } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const nomeDe = Object.fromEntries(Object.entries(ids).map(([sigla, k]) => [k.id, sigla]));
  const rotulo = (chave) => { const [k, n] = chave.split('#'); return `${nomeDe[k]}#${n}`; };
  const falhas = [];
  const confere = (desc, ok, detalhe = '') => { console.log(`${ok ? '  OK ' : '  FALHA'}: ${desc}${ok ? '' : ' ' + detalhe}`); if (!ok) falhas.push(desc + ' ' + detalhe); };
  const igual = (a, b) => Math.abs(a - b) < 0.005;

  // ---- 1. esperado por SQL, independente do código do app ----
  const c = await conn();
  const q = async (sql, p = []) => (await c.query(sql, [empresaId, ...p])).rows;
  const [aRecSql] = await q(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA}`);
  const [atrasoSql] = await q(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA} and p.vencimento < $2::date`, [hoje]);
  const [aVencerSql] = await q(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and ${ABERTA} and p.vencimento >= $2::date`, [hoje]);
  const [recebidoSql] = await q(`select coalesce(sum(r.valor),0)::float v from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1`);
  const [ativosSql] = await q(`select count(distinct k.id)::int n from contratos k join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id join parcelas p on p.contrato_id=k.id where cl.empresa_id=$1 and k.status='ativo' and p.status<>'cancelado' and p.valor>p.valor_pago`);
  const [canceladosAbertos] = await q(`select coalesce(sum(p.valor-p.valor_pago),0)::float v, count(*)::int n ${SQL_BASE} and k.status='cancelado' and p.status<>'cancelado' and p.valor>p.valor_pago`);
  const [recebidoCancelados] = await q(`select coalesce(sum(r.valor),0)::float v, count(*)::int n from recebimentos r join parcelas p on p.id=r.parcela_id join contratos k on k.id=p.contrato_id join eventos e on e.id=k.evento_id join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1 and k.status='cancelado'`);
  const cenario = await q(`select k.id kid, k.status kstatus, p.numero, p.status pstatus, p.valor::float valor, p.valor_pago::float pago, p.vencimento::text venc ${SQL_BASE} order by k.id, p.numero`);

  console.log('== Cenário (sigla, status do contrato, parcela, status, valor, pago, vencimento) ==');
  for (const r of cenario) console.log(`  ${nomeDe[r.kid]} ${r.kstatus.padEnd(9)} #${r.numero} ${r.pstatus.padEnd(9)} ${String(r.valor).padStart(6)} ${String(r.pago).padStart(6)} ${r.venc}`);

  console.log('== 1. Esperado por SQL (conferido contra a conta manual do cenário) ==');
  confere('A receber = 470,00 em 4 parcelas (KA 100 + KB 120 + KC 150 + KG#1 100)', igual(aRecSql.v, 470) && aRecSql.n === 4, JSON.stringify(aRecSql));
  confere('Em atraso = 150,00 em 1 parcela (só KC; vencidas de contrato cancelado ficam fora)', igual(atrasoSql.v, 150) && atrasoSql.n === 1, JSON.stringify(atrasoSql));
  confere('Próximos vencimentos = 320,00 em 3 parcelas (KA, KB, KG#1)', igual(aVencerSql.v, 320) && aVencerSql.n === 3, JSON.stringify(aVencerSql));
  confere('Recebido = 220,00 (KB 80 + KE 100 + KF 40), inclui contratos cancelados', igual(recebidoSql.v, 220), JSON.stringify(recebidoSql));
  confere('Contratos ativos com saldo = 4 (KA, KB, KC, KG)', ativosSql.n === 4, JSON.stringify(ativosSql));
  confere('Contratos cancelados somam 560,00 em aberto em 4 parcelas (não podem aparecer)', igual(canceladosAbertos.v, 560) && canceladosAbertos.n === 4, JSON.stringify(canceladosAbertos));
  confere('Recebimentos de contratos cancelados = 140,00 em 2 registros (permanecem no histórico)', igual(recebidoCancelados.v, 140) && recebidoCancelados.n === 2, JSON.stringify(recebidoCancelados));
  confere('KG#2 é parcela individual cancelada em contrato ativo', cenario.some((r) => nomeDe[r.kid] === 'KG' && r.numero === 2 && r.pstatus === 'cancelado' && r.kstatus === 'ativo'));
  confere('KC#1 é parcela vencida de contrato ativo; KF#1/#2 vencidas de contrato cancelado',
    cenario.some((r) => nomeDe[r.kid] === 'KC' && r.kstatus === 'ativo' && r.venc < hoje && r.pago < r.valor) &&
    cenario.filter((r) => nomeDe[r.kid] === 'KF' && r.kstatus === 'cancelado' && r.venc < hoje && r.pago < r.valor).length === 2);

  // Conjuntos esperados por filtro (regra em SQL puro).
  const chaves = async (cond, p = []) => (await q(`select k.id::text || '#' || p.numero chave ${SQL_BASE} and ${cond}`, p)).map((r) => r.chave).sort();
  const esperadoFiltro = {
    todas: await chaves("not (k.status='cancelado' and p.status<>'cancelado' and p.valor>p.valor_pago)"),
    pendentes: await chaves("p.status='pendente' and k.status<>'cancelado'"),
    parciais: await chaves("p.status='parcial' and k.status<>'cancelado'"),
    pagas: await chaves("p.status='pago'"),
    vencidas: await chaves("p.status in ('pendente','parcial') and p.vencimento < $2::date and k.status<>'cancelado'", [hoje]),
  };
  const recDe = async (k) => (await c.query('select r.valor::float v, r.data::text d from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1', [k.id])).rows;
  const recKE = await recDe(ids.KE);
  const recKF = await recDe(ids.KF);
  await c.end();

  // ---- 2. app: Dashboard x Financeiro x SQL ----
  console.log('== 2. Dashboard x Financeiro x SQL ==');
  const get = await abrirSessao(email);
  const fin = cartoesFinanceiro(await get('/financeiro'));
  const dash = {
    mes: cartoesDashboard(await get('/dashboard?periodo=mes')),
    // passado: de hoje-90 até hoje (todos os pagamentos); futuro: de hoje até hoje+365 (todos os vencimentos futuros)
    passado: cartoesDashboard(await get(`/dashboard?periodo=personalizado&de=${mais(hoje, -90)}&ate=${hoje}`)),
    futuro: cartoesDashboard(await get(`/dashboard?periodo=personalizado&de=${hoje}&ate=${mais(hoje, 365)}`)),
    proximos30: cartoesDashboard(await get('/dashboard?periodo=proximos30')),
  };
  const linha = (metrica, d, f, s) => console.log(`  ${metrica.padEnd(34)} dashboard=${String(d).padStart(7)} financeiro=${String(f).padStart(7)} sql=${String(s).padStart(7)}`);
  linha('Recebido (últimos 90 dias | total)', dash.passado.recebidoPeriodo, fin.recebido, recebidoSql.v);
  linha('A receber', dash.mes.aReceber, fin.aReceber, aRecSql.v);
  linha('Em atraso', dash.mes.emAtraso, fin.emAtraso, atrasoSql.v);
  linha('Próximos vencimentos (a partir de hoje)', dash.futuro.proximos, fin.proximos, aVencerSql.v);
  confere('Recebido: Dashboard = Financeiro = SQL', igual(dash.passado.recebidoPeriodo, fin.recebido) && igual(fin.recebido, recebidoSql.v) && igual(dash.passado.resumoRecebido, recebidoSql.v));
  confere('A receber: Dashboard = Financeiro = SQL (valor e nº de parcelas)', igual(dash.mes.aReceber, fin.aReceber) && igual(fin.aReceber, aRecSql.v) && dash.mes.qtdAReceber === fin.qtdAReceber && fin.qtdAReceber === aRecSql.n);
  confere('Em atraso: Dashboard = Financeiro = SQL (valor e nº de parcelas)', igual(dash.mes.emAtraso, fin.emAtraso) && igual(fin.emAtraso, atrasoSql.v) && dash.mes.qtdEmAtraso === fin.qtdEmAtraso && fin.qtdEmAtraso === atrasoSql.n);
  confere('Próximos vencimentos: Dashboard (hoje até +365 dias) = Financeiro = SQL (valor e nº)', igual(dash.futuro.proximos, fin.proximos) && igual(fin.proximos, aVencerSql.v) && dash.futuro.qtdProximos === fin.qtdProximos && fin.qtdProximos === aVencerSql.n);
  confere('Próximos vencimentos: Dashboard "próximos 30 dias" = Financeiro (todo o futuro cabe em 30 dias)', igual(dash.proximos30.proximos, fin.proximos));
  confere('Resumo do Dashboard: "A receber no prazo" = Próximos vencimentos do Financeiro; atraso e recebido idem', igual(dash.mes.resumoAPrazo, fin.proximos) && igual(dash.mes.resumoAtraso, fin.emAtraso) && igual(dash.mes.resumoRecebido, fin.recebido));
  confere('Os quatro períodos do Dashboard dão o mesmo A receber / Em atraso', [dash.mes, dash.passado, dash.futuro, dash.proximos30].every((d) => igual(d.aReceber, fin.aReceber) && igual(d.emAtraso, fin.emAtraso)));
  confere('Dashboard: contratos ativos = 4 (cancelados não contam)', dash.mes.contratosAtivos === ativosSql.n);
  const idsLista = dash.mes.contratosNaLista.map((k) => nomeDe[k] ?? '?').sort().join(',');
  confere(`Lista de vencimentos do Dashboard só tem contratos ativos com saldo (KA,KB,KC,KG) -> ${idsLista}`, idsLista === 'KA,KB,KC,KG');
  confere('Nada de contrato cancelado inflando os totais (nem 1030 a receber, nem 310 em atraso)', fin.aReceber !== 1030 && fin.emAtraso !== 310 && dash.mes.aReceber !== 1030 && dash.mes.emAtraso !== 310);

  // ---- 3. filtros do Financeiro ----
  console.log('== 3. Filtros do Financeiro ==');
  for (const filtro of ['todas', 'pendentes', 'parciais', 'pagas', 'vencidas']) {
    const obtidas = linhasFinanceiro(await get(`/financeiro?filtro=${filtro}`));
    const esperadas = esperadoFiltro[filtro];
    confere(`filtro ${filtro}: [${obtidas.map(rotulo).join(', ')}] = SQL [${esperadas.map(rotulo).join(', ')}]`, JSON.stringify(obtidas) === JSON.stringify(esperadas));
  }
  for (const filtro of ['todas', 'pendentes', 'parciais', 'vencidas']) {
    const obtidas = linhasFinanceiro(await get(`/financeiro?filtro=${filtro}`)).map(rotulo);
    const vazou = obtidas.filter((r) => ['KD#1', 'KE#2', 'KF#1', 'KF#2'].includes(r));
    confere(`filtro ${filtro}: nenhuma parcela em aberto de contrato cancelado (KD#1, KE#2, KF#1, KF#2)`, vazou.length === 0, vazou.join(','));
  }
  confere('filtro pagas: a parcela quitada do contrato cancelado (KE#1) continua visível como histórico', linhasFinanceiro(await get('/financeiro?filtro=pagas')).map(rotulo).includes('KE#1'));

  // ---- 4. histórico de recebimentos dos contratos cancelados ----
  console.log('== 4. Histórico de recebimentos de contratos cancelados ==');
  const pKE = textoDe(await get(`/contratos/${ids.KE.id}`));
  const pKF = textoDe(await get(`/contratos/${ids.KF.id}`));
  const pKEPag = textoDe(await get(`/contratos/${ids.KE.id}?aba=pagamentos`));
  const pKFPag = textoDe(await get(`/contratos/${ids.KF.id}?aba=pagamentos`));
  confere('KE (cancelado): página do contrato mostra "Histórico de recebimentos" com R$ 100,00 e a data do pagamento',
    recKE.length === 1 && pKEPag.includes('Histórico de recebimentos') && pKEPag.includes(`${dataBR(recKE[0].d)} Parcela 1/2 R$ 100,00`) && pKE.includes(`R$ 100,00 — ${dataBR(recKE[0].d)}`));
  confere('KF (cancelado): página do contrato mostra "Histórico de recebimentos" com R$ 40,00 e a data do pagamento',
    recKF.length === 1 && pKFPag.includes('Histórico de recebimentos') && pKFPag.includes(`${dataBR(recKF[0].d)} Parcela 1/2 R$ 40,00`) && pKF.includes(`R$ 40,00 — ${dataBR(recKF[0].d)}`));
  confere('Recebido (Financeiro e Dashboard) continua incluindo os 140,00 desses contratos (220 total)', igual(fin.recebido, 220) && igual(dash.mes.resumoRecebido, 220));

  if (falhas.length) { console.error(`\n${falhas.length} VERIFICAÇÃO(ÕES) COM FALHA`); process.exit(1); }
  console.log('\nTODAS AS VERIFICAÇÕES DO FINANCEIRO OK');
}

// ---------------------------------------------------------------- limpar
async function limpar() {
  const { uid, empresaId, antes } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const c = await conn();
  await c.query('delete from contratos where evento_id in (select e.id from eventos e join clientes cl on cl.id=e.cliente_id where cl.empresa_id=$1)', [empresaId]);
  await c.query('delete from empresas where id=$1', [empresaId]);
  const depois = await contagens(c);
  const restantes = (await c.query("select count(*)::int n from empresas where nome like '%TESTE%'")).rows[0].n;
  await c.end();
  await admin.auth.admin.deleteUser(uid);
  const { data: u } = await admin.auth.admin.getUserById(uid);
  fs.unlinkSync(ESTADO);
  const iguais = JSON.stringify(antes) === JSON.stringify(depois);
  console.log('contagens antes :', JSON.stringify(antes));
  console.log('contagens depois:', JSON.stringify(depois));
  console.log(iguais ? '  OK : banco idêntico ao de antes do teste' : '  FALHA: contagens diferentes');
  console.log(restantes === 0 ? '  OK : nenhuma empresa de teste restante' : '  FALHA: sobrou empresa de teste');
  console.log(!u?.user ? '  OK : usuário de teste removido do Auth' : '  FALHA: usuário de teste ainda existe');
  if (!iguais || restantes !== 0 || u?.user) process.exit(1);
}

const modo = process.argv[2];
({ criar, verificar, limpar }[modo] || (() => { console.log('uso: criar | verificar | limpar'); return Promise.resolve(); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
