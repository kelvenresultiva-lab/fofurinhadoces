// Uso: node backup/validacao-contrato.js criar | verificar | limpar
// Valida a página individual do contrato (/contratos/[id]) para contrato ATIVO e CANCELADO:
//   criar     -> duas empresas de TESTE; a empresa A tem 1 contrato ativo (com parcela parcial e
//                vencidas) e 1 contrato cancelado (parcela paga, parcela parcial, pendente vencida
//                e pendente a vencer); a empresa B serve ao teste de isolamento
//   verificar -> entra no app como os usuários de teste (precisa do servidor em APP_URL, padrão
//                http://localhost:3000), lê as páginas e confere os 10 pontos pedidos. Também
//                confere no banco que nada foi alterado (status das parcelas e recebimentos).
//                Sai com código 1 se qualquer verificação falhar.
//   limpar    -> remove tudo e confere que o banco voltou às contagens de antes do teste
// Não toca em dados de nenhuma outra empresa e não altera dados reais.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { SENHA, textoDe, abrirSessao } = require('./lib-app-validacao');

const ESTADO = path.join(os.tmpdir(), 'validacao-contrato.json');
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

async function criarEmpresa(c0, sufixo) {
  const email = `teste-contrato-${sufixo}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw error;
  await c0.query('begin');
  await c0.query("select set_config('request.jwt.claim.sub',$1,true)", [data.user.id]);
  const emp = await c0.query('select * from criar_empresa_e_usuario($1,$2,$3,null)', [`Empresa Contrato ${sufixo} TESTE`, `Usuario Contrato ${sufixo}`, email]);
  await c0.query('commit');
  return { uid: data.user.id, email, empresaId: emp.rows[0].empresa_id };
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
    const prod = (await c.query("insert into produtos (nome, preco) values ('Produto Contrato TESTE', 100) returning id")).rows[0].id;
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

    // ATIVO: 3x100. #1 parcial (40 de 100) e vencida; #2 pendente e vencida; #3 pendente a vencer.
    const ativo = await contrato('Cliente Contrato Ativo', 3, 3, -45);
    await receber(ativo.parcelas[0], 40, -40, 'pix');

    // CANCELADO: 4x100. #1 paga (100), #2 parcial (40), #3 pendente vencida, #4 pendente a vencer.
    const cancelado = await contrato('Cliente Contrato Cancelado', 4, 4, -70);
    await receber(cancelado.parcelas[0], 100, -65, 'pix');
    await receber(cancelado.parcelas[1], 40, -38, 'dinheiro');
    await c.query("select cancelar_contrato($1, 'Cancelado para validação')", [cancelado.id]);
    return { ativo, cancelado };
  });

  fs.writeFileSync(ESTADO, JSON.stringify({ A, B, hoje, ids, antes }));
  console.log('cenário criado: empresa A (1 contrato ativo, 1 cancelado) e empresa B (isolamento), hoje =', hoje);
}

// ---------------------------------------------------------------- verificar
function linhasDeParcelas(html) {
  const linhas = {};
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celulas = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => textoDe(x[1]).trim());
    if (celulas.length >= 5 && /^\d+$/.test(celulas[0])) linhas[celulas[0]] = textoDe(m[1]).trim();
  }
  return linhas;
}
const contar = (texto, trecho) => texto.split(trecho).length - 1;

async function fotografar(c, kid) {
  const parcelas = (await c.query('select numero, status, valor::text, valor_pago::text from parcelas where contrato_id=$1 order by numero', [kid])).rows;
  const recebimentos = (await c.query('select r.valor::text v, r.data::text d, r.forma_pagamento f from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1 order by r.data, r.valor', [kid])).rows;
  const contrato = (await c.query('select status, valor_final::text from contratos where id=$1', [kid])).rows[0];
  return JSON.stringify({ contrato, parcelas, recebimentos });
}

async function verificar() {
  const { A, B, hoje, ids } = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const falhas = [];
  const confere = (desc, ok, detalhe = '') => { console.log(`${ok ? '  OK ' : '  FALHA'}: ${desc}${ok ? '' : ' ' + detalhe}`); if (!ok) falhas.push(desc + ' ' + detalhe); };

  const c = await conn();
  const venc = (await c.query('select numero, vencimento::text v from parcelas where contrato_id=$1 order by numero', [ids.ativo.id])).rows;
  const recAtivo = (await c.query("select r.data::text d from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1", [ids.ativo.id])).rows;
  const recCanc = (await c.query("select r.valor::float v, r.data::text d from recebimentos r join parcelas p on p.id=r.parcela_id where p.contrato_id=$1 order by r.data", [ids.cancelado.id])).rows;
  const fotoAtivoAntes = await fotografar(c, ids.ativo.id);
  const fotoCancAntes = await fotografar(c, ids.cancelado.id);
  const statusCanc = (await c.query('select status from parcelas where contrato_id=$1 order by numero', [ids.cancelado.id])).rows.map((r) => r.status);

  const getA = await abrirSessao(A.email);
  const htmlAtivo = await getA(`/contratos/${ids.ativo.id}`);
  const htmlCanc = await getA(`/contratos/${ids.cancelado.id}`);
  const tCResumo = textoDe(await getA(`/contratos/${ids.cancelado.id}?aba=resumo`)); // itens contratados
  const tCPagamentos = textoDe(await getA(`/contratos/${ids.cancelado.id}?aba=pagamentos`)); // histórico de recebimentos
  const tA = textoDe(htmlAtivo);
  const tC = textoDe(htmlCanc);
  const lA = linhasDeParcelas(htmlAtivo);
  const lC = linhasDeParcelas(htmlCanc);

  console.log('== 1. Contrato ATIVO mantém todos os recursos ==');
  confere('mostra valor total, entrada e vencimento final', ['Valor total R$ 300,00', 'Entrada', 'Parcelado 3x de R$ 100,00', 'Vencimento final', 'Resumo', 'Pagamentos', 'Observações'].every((x) => tA.includes(x)));
  confere('resumo do contrato: recebido 40,00 e ação "Cancelar contrato" disponível', tA.includes('Recebido R$ 40,00') && tA.includes('Valor recebido R$ 40,00') && tA.includes('Cancelar contrato'));
  confere('resumo: A receber 100,00 (parcela a vencer) e Em atraso 160,00 (60 da parcial + 100 da pendente vencida)', tA.includes('A receber R$ 100,00') && tA.includes('Em atraso R$ 160,00'));
  confere('próxima parcela = parcela 1 (parcial, saldo 60,00) com "Venceu há N dias"; previsão com a parcela 3', tA.includes('Próxima parcela') && tA.includes(`${dataBR(venc[0].v)} Venceu há`) && tA.includes('Parcela 1/3 R$ 60,00') && tA.includes('Previsão de recebimentos') && tA.includes('Total a receber R$ 100,00'));
  confere('parcelas 1 e 2 aparecem como Em atraso (com dias de atraso) e a 3 como Pendente', /Em atraso/.test(lA[1] ?? '') && /dias em atraso/.test(lA[1] ?? '') && /Em atraso/.test(lA[2] ?? '') && /Pendente/.test(lA[3] ?? ''));
  confere('registro de pagamento disponível nas 3 parcelas, no cabeçalho e na próxima parcela (modal com forma de pagamento)', ['1', '2', '3'].every((n) => (lA[n] ?? '').includes('Registrar pagamento')) && tA.includes('Receber pagamento') && contar(tA, 'Confirmar pagamento') >= 5 && htmlAtivo.includes('name="forma_pagamento"'));
  confere('histórico de pagamentos da parcela 1 (R$ 40,00 — data — Pix)', (lA[1] ?? '').includes(`R$ 40,00 — ${dataBR(recAtivo[0].d)} — Pix`));
  confere('linha do tempo presente e sem aviso de cancelamento', tA.includes('Linha do tempo') && !tA.includes('Contrato cancelado') && !tA.includes('Cancelada com o contrato'));

  console.log('== 2. Contrato CANCELADO mostra o aviso ==');
  confere('destaque "Contrato cancelado" (alerta) + selo de status Cancelado', htmlCanc.includes('role="alert"') && tC.includes('Contrato cancelado') && /rounded-full[^>]*>\s*Cancelado\s*</.test(htmlCanc));
  confere('mostra dados do contrato: cliente, evento, valor original 400,00, parcelas originais, itens contratados',
    tC.includes('Cliente Contrato Cancelado') && tC.includes('Casamento') && tC.includes('Valor original R$ 400,00') && tC.includes('Parcelas originais 4') && tCResumo.includes('Itens contratados') && tCResumo.includes('Produto Contrato TESTE'));

  console.log('== 3. Sem próxima parcela ==');
  confere('não mostra "Próxima parcela" nem a mensagem de parcela em aberto', !tC.includes('Próxima parcela') && !tC.includes('Nenhuma parcela em aberto'));

  console.log('== 4. Sem atraso como cobrança atual ==');
  confere('não mostra "Em atraso", "A receber", "Saldo" nem selo "Vencida"', !/Em atraso/.test(tC) && !/A receber/.test(tC) && !/Saldo/.test(tC) && !/Vencida/.test(tC));
  confere('parcela 3 (venceu antes de hoje) não aparece como Vencida', (lC[3] ?? '').length > 0 && !/Vencida/.test(lC[3] ?? ''));
  confere('sem coluna Saldo na tabela de parcelas', !/<th[^>]*>Saldo<\/th>/.test(htmlCanc));

  console.log('== 5. Sem registro de pagamento pela interface ==');
  confere('sem "Registrar recebimento", "Confirmar recebimento" nem campos de valor/forma', !tC.includes('Registrar recebimento') && !tC.includes('Confirmar recebimento') && !htmlCanc.includes('name="valor"') && !htmlCanc.includes('name="forma_pagamento"'));
  // Defesa em profundidade: mesmo fora da interface, o banco recusa recebimento em contrato cancelado.
  const antesRec = (await c.query('select count(*)::int n from recebimentos')).rows[0].n;
  const pCanc = (await c.query('select id from parcelas where contrato_id=$1 order by numero', [ids.cancelado.id])).rows.map((r) => r.id);
  let recusado = false;
  try { await como(A.uid, (cc) => cc.query(`select registrar_recebimento($1,10,date '${hoje}','pix',null)`, [pCanc[2]])); } catch { recusado = true; }
  const depoisRec = (await c.query('select count(*)::int n from recebimentos')).rows[0].n;
  confere('o banco (RPC) também recusa registrar recebimento no contrato cancelado, sem criar registro', recusado && antesRec === depoisRec);

  console.log('== 6. Sem lembrete/cobrança ==');
  const botoes = [...htmlCanc.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textoDe(m[1]).trim());
  confere('sem lembrete, reenvio, "cobrar" ou link de WhatsApp', !/lembrete|reenviar|enviar|cobrar|wa\.me|api\.whatsapp/i.test(tC) && !/wa\.me|api\.whatsapp/i.test(htmlCanc));
  // Os únicos botões são os do layout: "Sair" e o "Menu" do celular (o painel do menu só existe aberto).
  confere(
    `nenhum botão de cobrança na página: só os botões do layout, "Sair" e "Menu" (encontrados: ${botoes.join(', ') || 'nenhum'})`,
    botoes.length === 2 && botoes.includes('Sair') && botoes.includes('Menu')
  );

  console.log('== 7. Recebimentos históricos visíveis ==');
  confere('recebido 140,00 no Financeiro e no resumo; valor original 400,00 no resumo', tC.includes('Recebido R$ 140,00') && contar(tC, 'R$ 140,00') >= 2 && tC.includes('Valor original R$ 400,00'));
  confere('histórico da parcela 1: R$ 100,00 — data — Pix (na linha da parcela e na aba Pagamentos)', recCanc.length === 2 && (lC[1] ?? '').includes(`R$ 100,00 — ${dataBR(recCanc[0].d)} — Pix`) && tCPagamentos.includes('Histórico de recebimentos') && tCPagamentos.includes(`${dataBR(recCanc[0].d)} Parcela 1/4 R$ 100,00 Pix`));
  confere('histórico da parcela 2 (pagamento parcial): R$ 40,00 — data — Dinheiro (na linha da parcela e na aba Pagamentos)', (lC[2] ?? '').includes(`R$ 40,00 — ${dataBR(recCanc[1].d)} — Dinheiro`) && tCPagamentos.includes(`${dataBR(recCanc[1].d)} Parcela 2/4 R$ 40,00 Dinheiro`));

  console.log('== 8. Parcelas pagas continuam pagas ==');
  confere('parcela 1: selo Pago, pago 100,00, sem "Cancelada com o contrato"', /Pago/.test(lC[1] ?? '') && !/Cancelada com o contrato/.test(lC[1] ?? '') && /Pago\s+R\$ 100,00 —/.test(lC[1] ?? ''));

  console.log('== 9. Parcelas não pagas só como histórico cancelado ==');
  confere('parcela 2 (parcial): "Cancelada com o contrato" + "Pagamento parcial preservado" + pago 40,00; sem selo Parcial/Pendente',
    /Cancelada com o contrato/.test(lC[2] ?? '') && /Pagamento parcial preservado/.test(lC[2] ?? '') && /Pagamento parcial preservado\s+R\$ 40,00 —/.test(lC[2] ?? '') && !/\bParcial\b|\bPendente\b/.test(lC[2] ?? ''));
  confere('parcelas 3 e 4 (pendentes): "Cancelada com o contrato", sem selo Pendente/Vencida', [3, 4].every((n) => /Cancelada com o contrato/.test(lC[n] ?? '') && !/\bPendente\b|Vencida/.test(lC[n] ?? '')));
  const tempo = tC.slice(tC.indexOf('Linha do tempo'));
  confere('linha do tempo deixa claro o cancelamento (parcelas não pagas e marco "Contrato cancelado")', tempo.includes('Cancelada com o contrato') && tempo.includes('Encerramento') && tempo.includes('Contrato cancelado'));
  const fotoCancDepois = await fotografar(c, ids.cancelado.id);
  const fotoAtivoDepois = await fotografar(c, ids.ativo.id);
  confere('nada foi alterado no banco: status gravado das parcelas segue pago/parcial/pendente/pendente e recebimentos intactos',
    fotoCancAntes === fotoCancDepois && fotoAtivoAntes === fotoAtivoDepois && JSON.stringify(statusCanc) === JSON.stringify(['pago', 'parcial', 'pendente', 'pendente']));

  console.log('== 10. Isolamento entre empresas ==');
  const getB = await abrirSessao(B.email);
  for (const [nome, k] of [['ativo', ids.ativo], ['cancelado', ids.cancelado]]) {
    const r = await getB.raw(`/contratos/${k.id}`);
    const t = textoDe(r.html);
    confere(`empresa B não acessa o contrato ${nome} da empresa A (HTTP ${r.status}, sem dados do cliente)`, (r.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404|could not be found|não encontrad/i.test(r.html)) && !t.includes(k.cliente) && !t.includes('Produto Contrato TESTE'));
  }
  const lista = textoDe((await getB.raw('/contratos')).html);
  confere('lista de contratos da empresa B não mostra contratos da empresa A', !lista.includes('Cliente Contrato'));
  const visiveisB = await como(B.uid, async (cc) => (await cc.query('select count(*)::int n from contratos where id = any($1) ', [[ids.ativo.id, ids.cancelado.id]])).rows[0].n);
  confere('no banco, a empresa B enxerga 0 dos contratos da empresa A (RLS)', visiveisB === 0);
  let bBloqueada = false;
  try { await como(B.uid, (cc) => cc.query(`select registrar_recebimento($1,10,date '${hoje}','pix',null)`, [pCanc[2]])); } catch { bBloqueada = true; }
  confere('empresa B também não registra recebimento em parcela da empresa A', bBloqueada);
  await c.end();

  if (falhas.length) { console.error(`\n${falhas.length} VERIFICAÇÃO(ÕES) COM FALHA`); process.exit(1); }
  console.log('\nTODAS AS VERIFICAÇÕES DO CONTRATO OK');
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
  if (!iguais || restantes !== 0 || usuariosRestantes) process.exit(1);
}

const modo = process.argv[2];
({ criar, verificar, limpar }[modo] || (() => { console.log('uso: criar | verificar | limpar'); return Promise.resolve(); }))().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
