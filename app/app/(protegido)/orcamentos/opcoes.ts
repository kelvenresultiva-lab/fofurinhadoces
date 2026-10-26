// Espelha exatamente o CHECK constraint de public.orcamentos (orcamentos_status_check).
export const STATUS_ORCAMENTO = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_negociacao', label: 'Em negociação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'expirado', label: 'Expirado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const

export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number]['value']

export function labelStatusOrcamento(status: string): string {
  return STATUS_ORCAMENTO.find((s) => s.value === status)?.label ?? status
}

export function classesStatusOrcamento(status: string): string {
  switch (status) {
    case 'enviado':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
    case 'em_negociacao':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    case 'aprovado':
      return 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
    case 'recusado':
    case 'cancelado':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    case 'expirado':
      return 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  }
}

// O schema não define quando um orçamento deixa de ser editável — não há CHECK nem
// trigger que bloqueie UPDATE/INSERT em orcamento_itens por status. Esta é uma regra
// de aplicação, não do banco: uma vez "aprovado" (que já tem uma garantia real do banco
// via índice único parcial — só um orçamento aprovado por evento), "recusado",
// "expirado" ou "cancelado", o orçamento vira histórico e para de aceitar alteração de
// itens/desconto/observações. "rascunho", "enviado" e "em_negociacao" continuam
// editáveis porque ainda fazem parte da negociação comercial.
export function podeEditarOrcamento(status: string): boolean {
  return status === 'rascunho' || status === 'enviado' || status === 'em_negociacao'
}
