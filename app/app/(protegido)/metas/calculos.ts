import { hojeISO } from '../eventos/datas'
import { parcelasEmAberto, saldoTotal, somaMoeda, totalRecebido, type ParcelaFinanceira } from '../financeiro/calculos'

// Metas mensais. A tabela `metas` guarda só o objetivo; o realizado é SEMPRE calculado aqui, a
// partir dos dados atuais, em cada carregamento da página. Nada de resultado manual ou gravado.
//
// META DE CONTRATOS: soma de contratos.valor_final (valor contratado, já com desconto) dos contratos
//   ATIVOS criados no mês. O mês vem de contratos.created_at no fuso America/Sao_Paulo. Cada contrato
//   conta uma vez, pelo valor cheio, no mês em que foi fechado — parcelas e recebimentos não entram.
//   Contrato cancelado sai do realizado (em qualquer mês).
// META DE ENTRADAS: soma de recebimentos.valor com recebimentos.data no mês (entrada e parcelas,
//   tudo que foi efetivamente registrado). Recebimento de contrato cancelado depois continua
//   contando: o dinheiro entrou. Parcela não paga nunca entra no realizado, só na previsão.

type Numerico = number | string

export type ContratoMeta = { id: string; status: string; valor_final: Numerico; created_at: string }
export type RecebimentoMeta = { valor: Numerico; data: string }

// Mês como 'AAAA-MM'.
export const mesValido = (mes: string | undefined): mes is string => !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)

export const mesAtual = () => hojeISO().slice(0, 7)

export function somarMeses(mes: string, n: number): string {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m - 1 + n, 1)).toISOString().slice(0, 7)
}

export function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} de ${ano}`
}

// Instante (timestamptz) -> mês 'AAAA-MM' no fuso do negócio. Um contrato criado às 22h do dia 31
// em Brasília (01h do dia 1º em UTC) pertence ao mês do dia 31.
const formatoSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export const mesDoInstante = (instante: string) => formatoSP.format(new Date(instante)).slice(0, 7)

export function realizadoContratos(contratos: ContratoMeta[], mes: string) {
  const doMes = contratos.filter((c) => c.status === 'ativo' && mesDoInstante(c.created_at) === mes)
  const valor = somaMoeda(doMes.map((c) => c.valor_final))
  return { valor, qtd: doMes.length, media: media(valor, doMes.length) }
}

export function realizadoEntradas(recebimentos: RecebimentoMeta[], mes: string) {
  const doMes = recebimentos.filter((r) => r.data.slice(0, 7) === mes)
  const valor = totalRecebido(doMes)
  return { valor, qtd: doMes.length, media: media(valor, doMes.length) }
}

// Previsão: saldo das parcelas EM ABERTO (regra central: parcela não cancelada, contrato ativo,
// saldo > 0) com vencimento dentro do mês. Pagamento parcial conta só o saldo.
export function previsaoEntradas<T extends ParcelaFinanceira>(parcelas: T[], contratos: { id: string; status: string }[], mes: string) {
  const doMes = parcelasEmAberto(parcelas, contratos).filter((p) => p.vencimento.slice(0, 7) === mes)
  return { valor: saldoTotal(doMes), qtd: doMes.length }
}

function media(valor: number, qtd: number): number {
  return qtd > 0 ? Math.round((valor * 100) / qtd) / 100 : 0
}

// Progresso de UMA meta (as duas são independentes). Sem meta (0), não há percentual.
export function progresso(meta: number, realizado: number) {
  if (!(meta > 0)) return null
  return {
    percentual: (realizado / meta) * 100,
    falta: Math.max(0, Math.round((meta - realizado) * 100) / 100),
    atingida: realizado >= meta,
  }
}

export type Situacao = 'atingida' | 'nao_atingida' | 'andamento' | 'futura' | 'sem_meta'

export function situacaoMeta(meta: number, realizado: number, mes: string, atual: string = mesAtual()): Situacao {
  if (mes > atual) return 'futura'
  const p = progresso(meta, realizado)
  if (!p) return 'sem_meta'
  if (p.atingida) return 'atingida'
  return mes === atual ? 'andamento' : 'nao_atingida'
}

export function seloSituacao(s: Situacao): { label: string; classes: string } {
  switch (s) {
    case 'atingida':
      return { label: 'Atingida', classes: 'bg-green-50 text-green-700' }
    case 'nao_atingida':
      return { label: 'Não atingida', classes: 'bg-red-50 text-red-700' }
    case 'andamento':
      return { label: 'Em andamento', classes: 'bg-indigo-50 text-indigo-700' }
    case 'futura':
      return { label: 'Futura', classes: 'bg-zinc-100 text-zinc-600' }
    default:
      return { label: 'Sem meta', classes: 'bg-zinc-100 text-zinc-500' }
  }
}

export function formatarPercentual(p: number): string {
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export const numero = (v: Numerico | null | undefined) => Number(v ?? 0)
