import { createClient } from '@/lib/supabase/server'
import { criarOrcamento } from '../actions'
import { formatarDataBR } from '../../eventos/datas'
import { labelTipo } from '../../eventos/opcoes'

export default async function NovoOrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; evento?: string }>
}) {
  const { erro, evento: eventoIdPreSelecionado } = await searchParams
  const supabase = await createClient()

  let eventoPreSelecionado: {
    id: string
    tipo: string
    titulo: string | null
    data: string | null
    cliente_id: string
  } | null = null

  if (eventoIdPreSelecionado) {
    const { data } = await supabase
      .from('eventos')
      .select('id, tipo, titulo, data, cliente_id')
      .eq('id', eventoIdPreSelecionado)
      .maybeSingle()
    eventoPreSelecionado = data
  }

  let nomeClientePreSelecionado: string | null = null
  if (eventoPreSelecionado) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nome')
      .eq('id', eventoPreSelecionado.cliente_id)
      .maybeSingle()
    nomeClientePreSelecionado = cliente?.nome ?? null
  }

  // Sem evento pré-selecionado (ou parâmetro inválido/de outra empresa, que a busca
  // acima simplesmente não encontra): lista todos os eventos da empresa para escolha
  // manual. O schema não proíbe orçamento para evento cancelado, então não bloqueamos
  // isso aqui — só deixamos o status visível para quem está escolhendo decidir.
  const { data: eventosDisponiveis } = eventoPreSelecionado
    ? { data: null }
    : await supabase
        .from('eventos')
        .select('id, tipo, titulo, data, status, clientes(nome)')
        .order('data', { ascending: false, nullsFirst: true })

  const inputClasses =
    'rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50'
  const labelClasses = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Novo orçamento</h1>

      <form action={criarOrcamento} className="flex max-w-lg flex-col gap-6">
        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {erro}
          </p>
        )}

        {eventoPreSelecionado ? (
          <div className="flex flex-col gap-1.5">
            <span className={labelClasses}>Evento</span>
            <div className="rounded-lg border border-black/[.08] bg-black/[.02] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-white/[.04]">
              {eventoPreSelecionado.titulo || labelTipo(eventoPreSelecionado.tipo)} —{' '}
              {formatarDataBR(eventoPreSelecionado.data)}
              {nomeClientePreSelecionado ? ` · ${nomeClientePreSelecionado}` : ''}
            </div>
            <input type="hidden" name="evento_id" value={eventoPreSelecionado.id} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="evento_id" className={labelClasses}>
              Evento
            </label>
            <select id="evento_id" name="evento_id" required defaultValue="" className={inputClasses}>
              <option value="" disabled>
                Selecione um evento
              </option>
              {(eventosDisponiveis ?? []).map((evento) => {
                // Embed de FK sem tipos gerados: em tempo de execução vem como objeto,
                // mas o client não tipado infere array — tratamos os dois formatos.
                const clienteEmbed = evento.clientes as unknown as { nome: string } | { nome: string }[] | null
                const nomeCliente = Array.isArray(clienteEmbed) ? clienteEmbed[0]?.nome : clienteEmbed?.nome
                return (
                  <option key={evento.id} value={evento.id}>
                    {(evento.titulo || labelTipo(evento.tipo))} — {formatarDataBR(evento.data)}
                    {nomeCliente ? ` · ${nomeCliente}` : ''} ({evento.status})
                  </option>
                )
              })}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="observacoes" className={labelClasses}>
            Observações <span className="text-zinc-400">(opcional)</span>
          </label>
          <textarea id="observacoes" name="observacoes" rows={3} className={inputClasses} />
        </div>

        <button
          type="submit"
          className="self-start rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Criar orçamento
        </button>
      </form>
    </div>
  )
}
