// Mesmo princípio de backup/produtos/preco.ts: nunca construir o valor final via
// Number()/parseFloat para depois gravar — sempre devolver uma string decimal exata
// que o Postgres (coluna numeric) interpreta sem risco de ponto flutuante.
export function normalizarPercentual(valor: string): { ok: true; valor: string } | { ok: false } {
  const bruto = valor.trim()
  if (bruto === '') return { ok: true, valor: '0' }

  const normalizado = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return { ok: false }
  if (Number(normalizado) > 100) return { ok: false }

  return { ok: true, valor: normalizado }
}
