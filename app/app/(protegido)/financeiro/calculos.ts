import { hojeISO } from '../eventos/datas'

// Regras financeiras compartilhadas por Dashboard, Financeiro e Contratos.
// Qualquer total de "valor futuro" (a receber, em atraso, próximos vencimentos) DEVE passar
// por aqui — nenhuma página reimplementa a regra.
//
// REGRA CENTRAL: uma parcela só representa valor futuro (está "em aberto") quando
//   1. a própria parcela não está cancelada,
//   2. o CONTRATO dela não está cancelado (mesmo que a parcela continue pendente/parcial), e
//   3. ainda tem saldo restante (valor - valor_pago > 0; pagamento parcial conta só o saldo).
// Recebimentos já registrados NÃO passam por essa regra: o histórico de "recebido" vem do
// ledger (`recebimentos`) e permanece íntegro mesmo que o contrato seja cancelado depois.

type Numerico = number | string

export type ParcelaFinanceira = {
  contrato_id: string
  vencimento: string
  valor: Numerico
  valor_pago: Numerico
  status: string
}

export function saldoParcela(parcela: { valor: Numerico; valor_pago: Numerico }): number {
  return Number(parcela.valor) - Number(parcela.valor_pago)
}

// Soma em centavos inteiros: evita resíduos de ponto flutuante (0,1 + 0,2) nos totais.
export function somaMoeda(valores: Numerico[]): number {
  return valores.reduce<number>((total, v) => total + Math.round(Number(v) * 100), 0) / 100
}

// "Vencida" não é um valor de parcelas.status — é derivado (o schema não tem essa
// coluna). Comparação em string 'AAAA-MM-DD' (sem construir Date) evita qualquer
// deslocamento de fuso horário.
export function ehVencida(vencimento: string, saldo: number, status: string, hoje: string = hojeISO()): boolean {
  return status !== 'cancelado' && saldo > 0 && vencimento < hoje
}

export function situacaoParcela(parcela: { vencimento: string; valor: Numerico; valor_pago: Numerico; status: string }) {
  if (ehVencida(parcela.vencimento, saldoParcela(parcela), parcela.status)) {
    return { label: 'Vencida', classes: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' }
  }
  return null
}

export function idsContratosCancelados(contratos: { id: string; status: string }[]): Set<string> {
  return new Set(contratos.filter((c) => c.status === 'cancelado').map((c) => c.id))
}

export function ehParcelaEmAberto(parcela: ParcelaFinanceira, cancelados: Set<string>): boolean {
  return parcela.status !== 'cancelado' && !cancelados.has(parcela.contrato_id) && saldoParcela(parcela) > 0
}

export function parcelasEmAberto<T extends ParcelaFinanceira>(parcelas: T[], contratos: { id: string; status: string }[]): T[] {
  const cancelados = idsContratosCancelados(contratos)
  return parcelas.filter((p) => ehParcelaEmAberto(p, cancelados))
}

export function saldoTotal(parcelas: { valor: Numerico; valor_pago: Numerico }[]): number {
  return somaMoeda(parcelas.map(saldoParcela))
}

// `abertas` já deve ter passado por parcelasEmAberto. aVencer = vencimento de hoje em diante,
// então aReceber === emAtraso + aVencer.
export function resumoFuturo<T extends ParcelaFinanceira>(abertas: T[], hoje: string = hojeISO()) {
  const vencidas = abertas.filter((p) => ehVencida(p.vencimento, saldoParcela(p), p.status, hoje))
  const aVencer = abertas.filter((p) => p.vencimento >= hoje)
  return {
    aReceber: saldoTotal(abertas),
    qtdAReceber: abertas.length,
    emAtraso: saldoTotal(vencidas),
    qtdEmAtraso: vencidas.length,
    aVencer: saldoTotal(aVencer),
    qtdAVencer: aVencer.length,
  }
}

export function vencendoEntre<T extends ParcelaFinanceira>(abertas: T[], inicio: string, fim: string): T[] {
  return abertas.filter((p) => p.vencimento >= inicio && p.vencimento <= fim)
}

export function totalRecebido(recebimentos: { valor: Numerico }[]): number {
  return somaMoeda(recebimentos.map((r) => r.valor))
}

// Página do contrato cancelado (visão histórica): parcela não quitada vira "Cancelada com o
// contrato" só na exibição — o status gravado em parcelas.status não é alterado. Parcela paga
// continua "Paga"; parcela já cancelada individualmente mantém o próprio status.
export function situacaoHistorica(
  parcela: { valor: Numerico; valor_pago: Numerico; status: string },
  contratoCancelado: boolean
) {
  if (!contratoCancelado || parcela.status === 'pago' || parcela.status === 'cancelado' || saldoParcela(parcela) <= 0) {
    return null
  }
  return {
    label: 'Cancelada com o contrato',
    classes: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    pagoParcialmente: Number(parcela.valor_pago) > 0,
  }
}

// Listagem do Financeiro: uma parcela com saldo de contrato cancelado não é cobrança e sai da
// lista (todos os filtros). Parcelas quitadas ou canceladas continuam visíveis como histórico.
export function aparecemNaListaFinanceira(parcela: ParcelaFinanceira, cancelados: Set<string>): boolean {
  return !(cancelados.has(parcela.contrato_id) && parcela.status !== 'cancelado' && saldoParcela(parcela) > 0)
}
