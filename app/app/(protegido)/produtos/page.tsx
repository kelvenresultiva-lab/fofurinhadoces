import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarPrecoParaExibicao } from './preco'

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('produtos')
    .select('id, nome, preco, unidade, dias_antecedencia_producao, ativo')
    .order('nome')

  if (q) {
    query = query.ilike('nome', `%${q}%`)
  }

  const { data: produtos } = await query

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Produtos</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Catálogo de produtos e serviços oferecidos pela empresa.
          </p>
        </div>
        <Link
          href="/produtos/novo"
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Novo produto
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="w-full max-w-xs rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
        />
        <button
          type="submit"
          className="rounded-lg border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          Buscar
        </button>
      </form>

      {!produtos || produtos.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-black/[.08] p-6 dark:border-white/[.145]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {q
              ? 'Nenhum produto encontrado.'
              : 'Nenhum produto cadastrado. Cadastre os produtos oferecidos pela empresa para utilizá-los posteriormente nos orçamentos.'}
          </p>
          {!q && (
            <Link
              href="/produtos/novo"
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Adicionar produto
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Preço</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Antecedência</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {produtos.map((produto) => (
                <tr key={produto.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                  <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">{produto.nome}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {produto.preco !== null ? `R$ ${formatarPrecoParaExibicao(produto.preco)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{produto.unidade}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {produto.dias_antecedencia_producao} {produto.dias_antecedencia_producao === 1 ? 'dia' : 'dias'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        produto.ativo
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {produto.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/produtos/${produto.id}`}
                      className="font-medium text-zinc-950 underline dark:text-zinc-50"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
