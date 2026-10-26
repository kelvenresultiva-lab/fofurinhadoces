import { criarDespesa } from '../actions'
import { DespesaForm } from '../DespesaForm'

export default async function NovaDespesaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">Nova despesa</h1>
        <p className="mt-1 text-sm text-zinc-500">Toda despesa nova começa como pendente.</p>
      </div>
      <DespesaForm action={criarDespesa} erro={erro} textoBotao="Salvar despesa" />
    </div>
  )
}
