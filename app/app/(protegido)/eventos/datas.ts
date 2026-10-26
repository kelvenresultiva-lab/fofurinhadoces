// eventos.data é uma DATA CIVIL (coluna `date`, sem timezone). Tratamos sempre como
// string "AAAA-MM-DD" e nunca construímos um objeto Date a partir dela — evitar isso
// evita o clássico bug de o dia deslocar (virar o dia anterior/seguinte) por causa de
// fuso horário.
export function formatarDataBR(dataISO: string | null | undefined): string {
  if (!dataISO) return '—'
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

// eventos.horario é `time without time zone`, vem como "HH:MM:SS" — o input[type=time]
// aceita "HH:MM", então só cortamos os segundos.
export function formatarHorarioInput(horario: string | null | undefined): string {
  if (!horario) return ''
  return horario.slice(0, 5)
}

// "Hoje" sempre no fuso do negócio (America/Sao_Paulo), independente do fuso do servidor.
// en-CA formata como AAAA-MM-DD.
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Instante (timestamptz) no fuso do negócio: "25/10/2026 às 14:32".
export function formatarDataHoraBR(instante: string | null | undefined): string {
  if (!instante) return '—'
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instante))
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`
}

// Dias corridos entre duas datas civis AAAA-MM-DD (positivo se `ate` é depois de `de`).
// Aritmética em UTC só como calendário, sem fuso, então o dia nunca desloca.
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000)
}
