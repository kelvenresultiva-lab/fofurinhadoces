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

export function hojeISO(): string {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
