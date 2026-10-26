import { createClient } from '@/lib/supabase/server'
import { criarEvento } from '../actions'
import { EventoForm } from '../EventoForm'

export default async function NovoEventoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; cliente?: string }>
}) {
  const { erro, cliente: clienteIdPreSelecionado } = await searchParams
  const supabase = await createClient()

  // A empresa é garantida pelo RLS de "clientes" (só devolve clientes da própria
  // empresa) e, na hora de salvar, pelo RLS de "eventos" (WITH CHECK exige que o
  // cliente_id pertença à empresa atual) — o valor de "cliente" na URL é só uma
  // conveniência de UI, nunca é confiado como validação.
  const { data: clientesAtivos } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('status', 'ativo')
    .order('nome')

  const clientesDisponiveis = clientesAtivos ?? []
  let nomeClientePreSelecionado: string | null = null

  if (clienteIdPreSelecionado) {
    const { data: clientePreSelecionado } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('id', clienteIdPreSelecionado)
      .maybeSingle()

    if (clientePreSelecionado) {
      nomeClientePreSelecionado = clientePreSelecionado.nome
      if (!clientesDisponiveis.some((c) => c.id === clientePreSelecionado.id)) {
        clientesDisponiveis.unshift(clientePreSelecionado)
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {nomeClientePreSelecionado ? `Novo evento para ${nomeClientePreSelecionado}` : 'Novo evento'}
      </h1>
      <EventoForm
        action={criarEvento}
        clientesDisponiveis={clientesDisponiveis}
        valores={clienteIdPreSelecionado ? { cliente_id: clienteIdPreSelecionado } : undefined}
        erro={erro}
        textoBotao="Salvar evento"
      />
    </div>
  )
}
