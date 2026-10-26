import { hojeISO } from '../eventos/datas'
import { dataValida, somarDias } from '../dashboard/periodo'
import { rotuloMes, somarMeses, ultimoDiaDoMes } from '../metas/calculos'

// Períodos de vencimento da página Parcelas. Sempre datas civis 'AAAA-MM-DD' (sem fuso); "hoje" vem
// de hojeISO (America/Sao_Paulo). `ref` é qualquer dia dentro do período e permite navegar
// (anterior/próximo) sem perder o tipo de período.
export const PERIODOS_PARCELAS = [
  { value: 'todos', label: 'Todas as datas' },
  { value: 'semana', label: 'Semanal' },
  { value: 'quinzena', label: 'Quinzenal' },
  { value: 'mes', label: 'Mensal' },
] as const

export type ChavePeriodoParcelas = 'semana' | 'quinzena' | 'mes'

export type PeriodoParcelas = {
  chave: ChavePeriodoParcelas
  inicio: string
  fim: string
  anterior: string
  proximo: string
  rotulo: string
  atual: boolean
}

const curta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

export function resolverPeriodoParcelas(chave: string | undefined, ref: string | undefined): PeriodoParcelas | null {
  if (chave !== 'semana' && chave !== 'quinzena' && chave !== 'mes') return null
  const hoje = hojeISO()
  const dia = dataValida(ref) ? ref : hoje
  const mes = dia.slice(0, 7)
  const contem = (inicio: string, fim: string) => hoje >= inicio && hoje <= fim

  if (chave === 'semana') {
    // Semana de segunda a domingo.
    const [a, m, d] = dia.split('-').map(Number)
    const diaDaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
    const inicio = somarDias(dia, -((diaDaSemana + 6) % 7))
    const fim = somarDias(inicio, 6)
    return {
      chave, inicio, fim,
      anterior: somarDias(inicio, -7),
      proximo: somarDias(inicio, 7),
      rotulo: `Semana de ${curta(inicio)} a ${curta(fim)}/${fim.slice(0, 4)}`,
      atual: contem(inicio, fim),
    }
  }

  if (chave === 'quinzena') {
    const primeira = Number(dia.slice(8, 10)) <= 15
    const inicio = primeira ? `${mes}-01` : `${mes}-16`
    const fim = primeira ? `${mes}-15` : ultimoDiaDoMes(mes)
    return {
      chave, inicio, fim,
      anterior: primeira ? `${somarMeses(mes, -1)}-16` : `${mes}-01`,
      proximo: primeira ? `${mes}-16` : `${somarMeses(mes, 1)}-01`,
      rotulo: `${primeira ? '1ª' : '2ª'} quinzena de ${rotuloMes(mes).toLowerCase()} (${curta(inicio)} a ${curta(fim)})`,
      atual: contem(inicio, fim),
    }
  }

  const inicio = `${mes}-01`
  const fim = ultimoDiaDoMes(mes)
  return {
    chave, inicio, fim,
    anterior: `${somarMeses(mes, -1)}-01`,
    proximo: `${somarMeses(mes, 1)}-01`,
    rotulo: rotuloMes(mes),
    atual: contem(inicio, fim),
  }
}
