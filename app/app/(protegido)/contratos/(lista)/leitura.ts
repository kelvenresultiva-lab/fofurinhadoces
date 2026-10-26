// A API do Supabase devolve no máximo 1000 linhas por consulta. Os totais da listagem somam todas as
// parcelas e recebimentos da empresa, então lemos em páginas até acabar — nunca um total calculado
// sobre dados cortados. Qualquer erro vira exceção (error.tsx), nunca um valor zerado.
const PAGINA = 1000

export async function lerTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) throw new Error('Falha ao ler os dados dos contratos.')
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return linhas
  }
}
