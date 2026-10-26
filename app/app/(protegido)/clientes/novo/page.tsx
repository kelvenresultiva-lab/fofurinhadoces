import { criarCliente } from '../actions'
import { ClienteForm } from '../ClienteForm'

export default async function NovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Novo cliente</h1>
      <ClienteForm action={criarCliente} erro={erro} textoBotao="Salvar cliente" />
    </div>
  )
}
