// Espelha exatamente o CHECK constraint de public.contratos (contratos_status_check).
export const STATUS_CONTRATO = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'cancelado', label: 'Cancelado' },
] as const

export function labelStatusContrato(status: string): string {
  return STATUS_CONTRATO.find((s) => s.value === status)?.label ?? status
}

export function classesStatusContrato(status: string): string {
  return status === 'cancelado'
    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    : 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
}

// Espelha public.parcelas_status_check.
export function labelStatusParcela(status: string): string {
  switch (status) {
    case 'parcial':
      return 'Parcial'
    case 'pago':
      return 'Pago'
    case 'cancelado':
      return 'Cancelado'
    default:
      return 'Pendente'
  }
}

export function classesStatusParcela(status: string): string {
  switch (status) {
    case 'pago':
      return 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
    case 'parcial':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    case 'cancelado':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  }
}

// Situação financeira exibida na listagem de contratos (calculada em financeiro/calculos.ts).
export function labelSituacaoContrato(situacao: string): string {
  switch (situacao) {
    case 'pago':
      return 'Pago'
    case 'parcial':
      return 'Parcial'
    case 'em_atraso':
      return 'Em atraso'
    case 'cancelado':
      return 'Cancelado'
    default:
      return 'Em dia'
  }
}

export function classesSituacaoContrato(situacao: string): string {
  switch (situacao) {
    case 'pago':
      return 'bg-green-50 text-green-700'
    case 'parcial':
      return 'bg-amber-50 text-amber-700'
    case 'em_atraso':
      return 'bg-red-50 text-red-700'
    case 'cancelado':
      return 'bg-zinc-100 text-zinc-600'
    default:
      return 'bg-indigo-50 text-indigo-700'
  }
}

export const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'outros', label: 'Outros' },
] as const

export function labelFormaPagamento(forma: string): string {
  return FORMAS_PAGAMENTO.find((f) => f.value === forma)?.label ?? forma
}
