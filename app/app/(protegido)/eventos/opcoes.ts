// Espelha exatamente os CHECK constraints de public.eventos (eventos_tipo_check e
// eventos_status_check) — não são enums inventados na aplicação, são os únicos valores
// que o banco aceita.
export const TIPOS_EVENTO = [
  { value: 'casamento', label: 'Casamento' },
  { value: 'cha_revelacao', label: 'Chá revelação' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: '15_anos', label: '15 anos' },
  { value: 'batizado', label: 'Batizado' },
  { value: 'outro', label: 'Outro' },
] as const

export const STATUS_EVENTO = [
  { value: 'planejado', label: 'Planejado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'realizado', label: 'Realizado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const

export type TipoEvento = (typeof TIPOS_EVENTO)[number]['value']
export type StatusEvento = (typeof STATUS_EVENTO)[number]['value']

export function labelTipo(tipo: string): string {
  return TIPOS_EVENTO.find((t) => t.value === tipo)?.label ?? tipo
}

export function classesStatus(status: string): string {
  switch (status) {
    case 'confirmado':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
    case 'realizado':
      return 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
    case 'cancelado':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  }
}
