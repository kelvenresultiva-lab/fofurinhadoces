import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarProduto, alternarStatusProduto } from '../actions'
import { ProdutoForm } from '../ProdutoForm'

export default async function EditarProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  const { data: produto } = await supabase.from('produtos').select('*').eq('id', id).maybeSingle()

  if (!produto) {
    notFound()
  }

  const atualizarComId = atualizarProduto.bind(null, id)
  const alternarStatusComId = alternarStatusProduto.bind(null, id, produto.ativo)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Editar produto</h1>
        <form action={alternarStatusComId}>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {produto.ativo ? 'Inativar produto' : 'Reativar produto'}
          </button>
        </form>
      </div>
      <ProdutoForm action={atualizarComId} valores={produto} erro={erro} textoBotao="Salvar alterações" />
    </div>
  )
}
