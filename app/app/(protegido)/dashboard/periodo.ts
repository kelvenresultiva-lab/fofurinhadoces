import { hojeISO } from '../eventos/datas'

export type ChavePeriodo = 'mes' | 'anterior' | 'proximos30' | 'personalizado'

export const PERIODOS: { value: ChavePeriodo; label: string }[] = [
  { value: 'mes', label: 'Este mês' },
  { value: 'anterior', label: 'Mês anterior' },
  { value: 'proximos30', label: 'Próximos 30 dias' },
  { value: 'personalizado', label: 'Período personalizado' },
]

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Toda a aritmética é sobre datas civis (AAAA-MM-DD) usando UTC só como calendário —
// nunca há conversão de fuso, então o dia não desloca.
function iso(ano: number, mes: number, dia: number): string {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10)
}

function partes(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia }
}

export function dataValida(data: string | undefined): data is string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const { ano, mes, dia } = partes(data)
  return iso(ano, mes, dia) === data
}

export function somarDias(data: string, dias: number): string {
  const { ano, mes, dia } = partes(data)
  return iso(ano, mes, dia + dias)
}

function intervaloDoMes(ano: number, mes: number) {
  return { inicio: iso(ano, mes, 1), fim: iso(ano, mes + 1, 0) }
}

export function resolverPeriodo(chave: string | undefined, de: string | undefined, ate: string | undefined) {
  const hoje = hojeISO()
  const { ano, mes } = partes(hoje)

  if (chave === 'anterior') return { chave: 'anterior' as const, ...intervaloDoMes(ano, mes - 1) }
  if (chave === 'proximos30') return { chave: 'proximos30' as const, inicio: hoje, fim: somarDias(hoje, 30) }

  if (chave === 'personalizado') {
    if (dataValida(de) && dataValida(ate) && de <= ate) {
      return { chave: 'personalizado' as const, inicio: de, fim: ate }
    }
    return {
      chave: 'mes' as const,
      ...intervaloDoMes(ano, mes),
      erro: 'Período personalizado inválido: informe duas datas válidas, com a inicial antes da final.',
    }
  }

  return { chave: 'mes' as const, ...intervaloDoMes(ano, mes) }
}

// Recebimentos olham para trás: em vez de "Próximos 30 dias", oferecem "Últimos 30 dias" (hoje
// incluído) e "Este ano". Mês, mês anterior e personalizado seguem a regra de resolverPeriodo.
export type ChavePeriodoRecebimentos = 'mes' | 'anterior' | 'ultimos30' | 'ano' | 'personalizado'

export const PERIODOS_RECEBIMENTOS: { value: ChavePeriodoRecebimentos; label: string }[] = [
  { value: 'mes', label: 'Este mês' },
  { value: 'anterior', label: 'Mês anterior' },
  { value: 'ultimos30', label: 'Últimos 30 dias' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Período personalizado' },
]

export function resolverPeriodoRecebimentos(
  chave: string | undefined,
  de: string | undefined,
  ate: string | undefined
): { chave: ChavePeriodoRecebimentos; inicio: string; fim: string; erro?: string } {
  const hoje = hojeISO()
  if (chave === 'ultimos30') return { chave: 'ultimos30', inicio: somarDias(hoje, -29), fim: hoje }
  if (chave === 'ano') return { chave: 'ano', ...anoAtual() }
  const p = resolverPeriodo(chave === 'proximos30' ? undefined : chave, de, ate)
  return { ...p, chave: p.chave === 'proximos30' ? 'mes' : p.chave }
}

// Despesas olham para os vencimentos: os períodos do Dashboard (inclui "Próximos 30 dias") mais
// "Este ano".
export type ChavePeriodoDespesas = ChavePeriodo | 'ano'

export const PERIODOS_DESPESAS: { value: ChavePeriodoDespesas; label: string }[] = [
  { value: 'mes', label: 'Este mês' },
  { value: 'anterior', label: 'Mês anterior' },
  { value: 'proximos30', label: 'Próximos 30 dias' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Período personalizado' },
]

export function resolverPeriodoDespesas(
  chave: string | undefined,
  de: string | undefined,
  ate: string | undefined
): { chave: ChavePeriodoDespesas; inicio: string; fim: string; erro?: string } {
  if (chave === 'ano') return { chave: 'ano', ...anoAtual() }
  return resolverPeriodo(chave, de, ate)
}

// Ano corrente inteiro (fuso America/Sao_Paulo).
function anoAtual() {
  const { ano } = partes(hojeISO())
  return { inicio: iso(ano, 1, 1), fim: iso(ano, 12, 31) }
}

// Mês corrente (fuso America/Sao_Paulo), para o card "Recebido neste mês".
export function mesAtual() {
  const { ano, mes } = partes(hojeISO())
  return intervaloDoMes(ano, mes)
}

// Últimos n meses terminando no mês atual, do mais antigo para o mais novo.
export function ultimosMeses(n: number): { chave: string; label: string }[] {
  const { ano, mes } = partes(hojeISO())
  return Array.from({ length: n }, (_, i) => {
    const data = iso(ano, mes - (n - 1 - i), 1)
    const p = partes(data)
    return { chave: data.slice(0, 7), label: `${MESES_ABREV[p.mes - 1]}/${String(p.ano).slice(2)}` }
  })
}
