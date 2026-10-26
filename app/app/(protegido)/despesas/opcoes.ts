// Espelha os CHECKs de public.despesas (backup/tabela_despesas.sql).
export const CATEGORIAS_DESPESA = [
  { value: 'ingredientes', label: 'Ingredientes' },
  { value: 'embalagens', label: 'Embalagens' },
  { value: 'funcionarios', label: 'Funcionários' },
  { value: 'agua_luz_internet', label: 'Água, luz e internet' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'impostos_taxas', label: 'Impostos e taxas' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'outros', label: 'Outros' },
] as const

export function labelCategoriaDespesa(categoria: string): string {
  return CATEGORIAS_DESPESA.find((c) => c.value === categoria)?.label ?? categoria
}

export const DESCRICAO_DESPESA_MAX = 200
export const OBSERVACOES_DESPESA_MAX = 1000

// Estado das ações do modal (pagar/cancelar). Fica fora do arquivo 'use server', que só pode
// exportar funções assíncronas.
export type EstadoAcaoDespesa = { erro?: string; ok?: boolean } | null

// "Em atraso" não é status gravado: é a situação visual de uma despesa pendente vencida
// (comparação de datas civis em texto AAAA-MM-DD, sem fuso).
export function situacaoDespesa(despesa: { status: string; vencimento: string }, hoje: string) {
  switch (despesa.status) {
    case 'paga':
      return { label: 'Paga', classes: 'bg-green-50 text-green-700' }
    case 'cancelada':
      return { label: 'Cancelada', classes: 'bg-zinc-100 text-zinc-600' }
    default:
      return despesa.vencimento < hoje
        ? { label: 'Em atraso', classes: 'bg-red-50 text-red-700' }
        : { label: 'Pendente', classes: 'bg-amber-50 text-amber-700' }
  }
}
