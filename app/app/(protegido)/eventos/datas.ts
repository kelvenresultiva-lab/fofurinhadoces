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
