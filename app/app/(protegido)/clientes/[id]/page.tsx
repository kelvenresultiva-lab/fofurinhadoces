import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarCliente, alternarStatusCliente } from '../actions'
import { ClienteForm } from '../ClienteForm'
import { formatarDataBR } from '../../eventos/datas'
import { labelTipo, classesStatus } from '../../eventos/opcoes'

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  // As duas consultas dependem só do id: em paralelo.
  const [{ data: cliente }, { data: eventosDoCliente }] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', id).maybeSingle(),
    supabase.from('eventos').select('id, tipo, titulo, data, status').eq('cliente_id', id).order('data', { ascending: false, nullsFirst: false }),
  ])

  if (!cliente) {
    notFound()
  }

  const atualizarComId = atualizarCliente.bind(null, id)
  const alternarStatusComId = alternarStatusCliente.bind(null, id, cliente.status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Editar cliente</h1>
        <form action={alternarStatusComId}>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {cliente.status === 'ativo' ? 'Inativar cliente' : 'Reativar cliente'}
          </button>
        </form>
      </div>
      <ClienteForm action={atualizarComId} valores={cliente} erro={erro} textoBotao="Salvar alterações" />

      <div className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Eventos</h2>
          <Link
            href={`/eventos/novo?cliente=${cliente.id}`}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Novo evento
          </Link>
        </div>

        {!eventosDoCliente || eventosDoCliente.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum evento cadastrado para este cliente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventosDoCliente.map((evento) => (
              <li
                key={evento.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    {evento.titulo || labelTipo(evento.tipo)}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">{formatarDataBR(evento.data)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatus(evento.status)}`}>
                    {evento.status}
                  </span>
                </div>
                <Link href={`/eventos/${evento.id}`} className="font-medium text-zinc-950 underline dark:text-zinc-50">
                  Ver evento
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
