// Converte a entrada de preço (formato brasileiro, ex: "1.234,56" ou "45,9") para uma
// string decimal ("1234.56") que o Postgres lê exatamente na coluna numeric, sem passar
// por Number/parseFloat — evita qualquer erro de arredondamento de ponto flutuante.
export function normalizarPreco(valor: string): { ok: true; valor: string | null } | { ok: false } {
  const bruto = valor.trim()
  if (bruto === '') {
    return { ok: true, valor: null }
  }

  let normalizado = bruto
  const temVirgula = bruto.includes(',')
  const temPonto = bruto.includes('.')

  if (temVirgula && temPonto) {
    normalizado = bruto.replace(/\./g, '').replace(',', '.')
  } else if (temVirgula) {
    normalizado = bruto.replace(',', '.')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return { ok: false }
  }

  return { ok: true, valor: normalizado }
}

export function formatarPrecoParaExibicao(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const numero = typeof valor === 'string' ? Number(valor) : valor
  if (Number.isNaN(numero)) return ''
  return numero.toFixed(2).replace('.', ',')
}
