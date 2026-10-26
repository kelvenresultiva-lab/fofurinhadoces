// Apoio das validações de Dashboard/Financeiro: entra no app como um usuário de TESTE (mesmo
// fluxo de cookies do @supabase/ssr que o navegador usa), baixa as páginas e extrai os números.
// Precisa do servidor em APP_URL (padrão http://localhost:3000) e das variáveis de .env.novo
// já carregadas pelo script que o chama.
const path = require('path');
const { createServerClient } = require(path.join(__dirname, '..', 'app', 'node_modules', '@supabase', 'ssr'));

const APP = process.env.APP_URL || 'http://localhost:3000';
const SENHA = 'senhaTeste123!';

function mais(data, n) { const [a, m, d] = data.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); }

function textoDe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}
const brl = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
const M = '([\\d.]*\\d,\\d{2})';

function pegar(texto, re, rotulo) {
  const m = texto.match(re);
  if (!m) throw new Error(`não achei "${rotulo}" na página`);
  return m;
}

async function abrirSessao(email) {
  const jar = new Map();
  const sb = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error('login do usuário de teste falhou: ' + error.message);
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
  // As páginas avisam quando uma consulta falha (ex.: oscilação de rede com o Supabase). Nesse caso
  // a leitura é repetida: um valor parcial nunca pode ser comparado como se fosse o definitivo.
  const get = async (rota) => {
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      try {
        const r = await fetch(APP + rota, { headers: { cookie }, redirect: 'manual' });
        if (r.status !== 200) throw new Error(`GET ${rota} -> HTTP ${r.status}`);
        const html = await r.text();
        if (!textoDe(html).includes('Não foi possível carregar')) return html;
      } catch (e) {
        if (tentativa === 5) throw e;
      }
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    throw new Error(`GET ${rota}: a página continuou avisando falha de carregamento após 5 tentativas`);
  };
  // Resposta crua (sem repetir e sem exigir 200): usada para conferir bloqueios como o 404.
  get.raw = async (rota) => {
    const r = await fetch(APP + rota, { headers: { cookie }, redirect: 'manual' });
    return { status: r.status, html: await r.text() };
  };
  return get;
}

function cartoesFinanceiro(html) {
  const t = textoDe(html);
  const aReceber = pegar(t, new RegExp(`A receber R\\$ ${M} (\\d+) parcela`), 'A receber (Financeiro)');
  const recebido = pegar(t, new RegExp(`Recebido R\\$ ${M}`), 'Recebido (Financeiro)');
  const atraso = pegar(t, new RegExp(`Em atraso R\\$ ${M} (\\d+) parcela`), 'Em atraso (Financeiro)');
  const prox = pegar(t, new RegExp(`Próximos vencimentos R\\$ ${M} (\\d+) parcela`), 'Próximos vencimentos (Financeiro)');
  return { aReceber: brl(aReceber[1]), qtdAReceber: +aReceber[2], recebido: brl(recebido[1]), emAtraso: brl(atraso[1]), qtdEmAtraso: +atraso[2], proximos: brl(prox[1]), qtdProximos: +prox[2] };
}

function cartoesDashboard(html) {
  const t = textoDe(html);
  const rec = pegar(t, new RegExp(`Recebido no período R\\$ ${M}`), 'Recebido no período');
  const aRec = pegar(t, new RegExp(`A receber R\\$ ${M} (\\d+) parcela`), 'A receber (Dashboard)');
  const atr = pegar(t, new RegExp(`Em atraso R\\$ ${M} (\\d+) parcela`), 'Em atraso (Dashboard)');
  const prox = pegar(t, new RegExp(`Próximos vencimentos R\\$ ${M} (\\d+) parcela`), 'Próximos vencimentos (Dashboard)');
  const ativos = pegar(t, /Contratos ativos (\d+)/, 'Contratos ativos');
  const resRec = pegar(t, new RegExp(`Recebido \\(total\\) \\(\\d+%\\) R\\$ ${M}`), 'Resumo: recebido total');
  const resPrazo = pegar(t, new RegExp(`A receber no prazo \\(\\d+%\\) R\\$ ${M}`), 'Resumo: a receber no prazo');
  const resAtraso = pegar(t, new RegExp(`Em atraso \\(\\d+%\\) R\\$ ${M}`), 'Resumo: em atraso');
  const contratosNaLista = [...new Set([...html.matchAll(/href="\/contratos\/([0-9a-f-]{36})"/g)].map((m) => m[1]))];
  return {
    recebidoPeriodo: brl(rec[1]), aReceber: brl(aRec[1]), qtdAReceber: +aRec[2], emAtraso: brl(atr[1]), qtdEmAtraso: +atr[2],
    proximos: brl(prox[1]), qtdProximos: +prox[2], contratosAtivos: +ativos[1],
    resumoRecebido: brl(resRec[1]), resumoAPrazo: brl(resPrazo[1]), resumoAtraso: brl(resAtraso[1]), contratosNaLista,
  };
}

function linhasFinanceiro(html) {
  const chaves = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const link = m[1].match(/href="\/contratos\/([0-9a-f-]{36})"/);
    const num = textoDe(m[1]).match(/#(\d+)/);
    if (link && num) chaves.push(`${link[1]}#${num[1]}`);
  }
  return chaves.sort();
}

module.exports = { APP, SENHA, mais, textoDe, brl, abrirSessao, cartoesFinanceiro, cartoesDashboard, linhasFinanceiro };
