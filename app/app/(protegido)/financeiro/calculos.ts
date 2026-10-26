import { hojeISO } from '../eventos/datas'

export function saldoParcela(parcela: { valor: number | string; valor_pago: number | string }): number {
  return Number(parcela.valor) - Number(parcela.valor_pago)
}

// "Vencida" não é um valor de parcelas.status — é derivado (o schema não tem essa
// coluna). Comparação em string 'AAAA-MM-DD' (sem construir Date) evita qualquer
// deslocamento de fuso horário.
export function ehVencida(vencimento: string, saldo: number, status: string): boolean {
  return status !== 'cancelado' && saldo > 0 && vencimento < hojeISO()
}

export function situacaoParcela(parcela: { vencimento: string; valor: number | string; valor_pago: number | string; status: string }) {
  const saldo = Number(parcela.valor) - Number(parcela.valor_pago)
  if (ehVencida(parcela.vencimento, saldo, parcela.status)) {
    return { label: 'Vencida', classes: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' }
  }
  return null
}
