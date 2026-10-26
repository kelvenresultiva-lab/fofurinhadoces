// Prova real de atomicidade da RPC criar_empresa_e_usuario:
//   1) chamada duplicada sequencial -> segunda chamada é barrada, sem empresa órfã
//   2) corrida real (duas conexões concorrentes disputando o mesmo auth.uid())
//      -> uma vence, a outra falha, e a empresa da perdedora é desfeita junto
// Roda direto contra o Postgres do projeto (bypassa PostgREST) simulando o
// auth.uid() via a mesma GUC que a função auth.uid() do Supabase lê.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function connect() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  return client.connect().then(() => client);
}

async function countEmpresas(client) {
  const res = await client.query('select count(*)::int as n from public.empresas');
  return res.rows[0].n;
}

async function criarUsuarioTeste(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'senha-teste-' + Math.random().toString(36).slice(2),
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function chamarRpc(client, uid, nomeEmpresa) {
  await client.query('begin');
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  try {
    const res = await client.query(
      'select * from public.criar_empresa_e_usuario($1, $2, $3, $4)',
      [nomeEmpresa, 'Usuário Teste', 'teste@example.com', null]
    );
    await client.query('commit');
    return { ok: true, row: res.rows[0] };
  } catch (err) {
    await client.query('rollback');
    return { ok: false, error: err.message, code: err.code };
  }
}

async function limpar({ empresaIds, uids }) {
  const client = await connect();
  for (const id of empresaIds) {
    await client.query('delete from public.empresas where id = $1', [id]);
  }
  await client.end();
  for (const uid of uids) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

(async () => {
  let falhas = 0;
  const empresaIdsParaLimpar = [];
  const uidsParaLimpar = [];

  console.log('=== Teste 1: chamada duplicada sequencial (mesmo auth.uid()) ===');
  const uid1 = await criarUsuarioTeste(`teste-atomic-seq-${Date.now()}@example.com`);
  uidsParaLimpar.push(uid1);
  const baseline1 = await connect();
  const antes1 = await countEmpresas(baseline1);
  await baseline1.end();

  const c1 = await connect();
  const primeira = await chamarRpc(c1, uid1, 'Empresa Seq 1');
  await c1.end();
  console.log('  1ª chamada:', primeira.ok ? `OK (empresa ${primeira.row.empresa_id})` : `ERRO: ${primeira.error}`);
  if (!primeira.ok) { falhas++; console.log('  [FALHA] a primeira chamada deveria ter sucesso'); }
  else empresaIdsParaLimpar.push(primeira.row.empresa_id);

  const c2 = await connect();
  const segunda = await chamarRpc(c2, uid1, 'Empresa Seq 2 (não deveria existir)');
  await c2.end();
  console.log('  2ª chamada (duplicada):', segunda.ok ? `OK (inesperado! empresa ${segunda.row.empresa_id})` : `barrada com: ${segunda.error}`);
  if (segunda.ok) { falhas++; empresaIdsParaLimpar.push(segunda.row.empresa_id); console.log('  [FALHA] a segunda chamada deveria ser barrada'); }

  const depois1cli = await connect();
  const depois1 = await countEmpresas(depois1cli);
  await depois1cli.end();
  const delta1 = depois1 - antes1;
  console.log(`  empresas criadas nesta etapa: ${delta1} (esperado: 1)`);
  if (delta1 !== 1) { falhas++; console.log('  [FALHA] deveria ter criado exatamente 1 empresa, não uma órfã da tentativa duplicada'); }

  console.log('\n=== Teste 2: corrida real - duas conexões disputando o mesmo auth.uid() ===');
  const uid2 = await criarUsuarioTeste(`teste-atomic-race-${Date.now()}@example.com`);
  uidsParaLimpar.push(uid2);
  const baseline2 = await connect();
  const antes2 = await countEmpresas(baseline2);
  await baseline2.end();

  const [clienteA, clienteB] = await Promise.all([connect(), connect()]);
  const [resultadoA, resultadoB] = await Promise.all([
    chamarRpc(clienteA, uid2, 'Empresa Corrida A'),
    chamarRpc(clienteB, uid2, 'Empresa Corrida B'),
  ]);
  await Promise.all([clienteA.end(), clienteB.end()]);

  const vencedores = [resultadoA, resultadoB].filter((r) => r.ok);
  const perdedores = [resultadoA, resultadoB].filter((r) => !r.ok);
  console.log('  resultado A:', resultadoA.ok ? `OK (empresa ${resultadoA.row.empresa_id})` : `ERRO [${resultadoA.code}]: ${resultadoA.error}`);
  console.log('  resultado B:', resultadoB.ok ? `OK (empresa ${resultadoB.row.empresa_id})` : `ERRO [${resultadoB.code}]: ${resultadoB.error}`);

  if (vencedores.length !== 1 || perdedores.length !== 1) {
    falhas++;
    console.log(`  [FALHA] esperado exatamente 1 vencedor e 1 perdedor, obtido ${vencedores.length} vencedor(es) e ${perdedores.length} perdedor(es)`);
  } else {
    empresaIdsParaLimpar.push(vencedores[0].row.empresa_id);
    console.log('  -> exatamente 1 venceu e 1 perdeu, como esperado');
  }

  const depois2cli = await connect();
  const depois2 = await countEmpresas(depois2cli);
  const usuariosRes = await depois2cli.query('select count(*)::int as n from public.usuarios where id = $1', [uid2]);
  await depois2cli.end();
  const delta2 = depois2 - antes2;
  const nUsuarios = usuariosRes.rows[0].n;
  console.log(`  empresas criadas nesta etapa: ${delta2} (esperado: 1, provando que a empresa da perdedora foi desfeita)`);
  console.log(`  linhas em usuarios para este uid: ${nUsuarios} (esperado: 1)`);
  if (delta2 !== 1) { falhas++; console.log('  [FALHA] a empresa da transação perdedora não foi revertida (ficou órfã) OU nenhuma empresa foi criada'); }
  if (nUsuarios !== 1) { falhas++; console.log('  [FALHA] deveria existir exatamente 1 usuario para este auth.uid()'); }

  console.log('\n=== Limpando dados de teste ===');
  await limpar({ empresaIds: empresaIdsParaLimpar, uids: uidsParaLimpar });

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM — atomicidade confirmada.' : `\n${falhas} FALHA(S) — ver acima.`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Erro inesperado no teste:', err);
  process.exit(1);
});
