import { criarProduto } from '../actions'
import { ProdutoForm } from '../ProdutoForm'

export default async function NovoProdutoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Novo produto</h1>
      <ProdutoForm action={criarProduto} erro={erro} textoBotao="Salvar produto" />
    </div>
  )
}
