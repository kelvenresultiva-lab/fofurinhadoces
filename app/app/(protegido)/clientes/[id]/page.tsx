import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarCliente, alternarStatusCliente } from '../actions'
import { ClienteForm } from '../ClienteForm'
import { formatarDataBR } from '../../eventos/datas'
import { labelTipo, classesStatus } from '../../eventos/opcoes'
import { formatarBRL } from '../../dashboard/widgets'
import { paraContratoPlano, planoPagamento, SELECT_CONTRATO_PLANO, type ContratoLido } from '../plano'

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

  // As consultas dependem só do id: em paralelo. Contratos do cliente pelo evento (relação embutida).
  const [{ data: cliente }, { data: eventosDoCliente }, contratosR] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', id).maybeSingle(),
    supabase.from('eventos').select('id, tipo, titulo, data, status').eq('cliente_id', id).order('data', { ascending: false, nullsFirst: false }),
    supabase
      .from('contratos')
      .select(SELECT_CONTRATO_PLANO.replace('evento:eventos(', 'evento:eventos!inner('))
      .eq('evento.cliente_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!cliente) {
    notFound()
  }

  const planos = (contratosR.data ?? []).map((l) => planoPagamento(paraContratoPlano(l as unknown as ContratoLido)))

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
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-950">Contratos e pagamento</h2>
        {contratosR.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível carregar os contratos deste cliente. Atualize a página.</p>
        ) : planos.length === 0 ? (
          <p className="text-sm text-zinc-600">Nenhum contrato ainda. O contrato é gerado a partir de um orçamento aprovado.</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {planos.map((p) => (
              <li key={p.id} className={`flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm ${p.cancelado ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Contrato #{p.numero ?? '—'}</p>
                    <p className={`text-2xl font-semibold ${p.cancelado ? 'text-zinc-400 line-through' : 'text-indigo-700'}`}>{formatarBRL(p.valor)}</p>
                  </div>
                  {p.cancelado && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">Cancelado</span>}
                </div>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">Entrada</dt>
                    <dd className="font-medium text-zinc-950">
                      {p.entrada ? (
                        <>
                          {formatarBRL(p.entrada.valor)}{' '}
                          <span className={`text-xs font-normal ${p.entrada.paga ? 'text-green-700' : 'text-amber-700'}`}>
                            {p.entrada.paga ? '· paga' : `· pendente (vence ${formatarDataBR(p.entrada.vencimento)})`}
                          </span>
                        </>
                      ) : (
                        'Sem entrada'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Restante</dt>
                    <dd className="font-medium text-zinc-950">{p.restanteTexto}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Já recebido</dt>
                    <dd className="font-medium text-green-700">{formatarBRL(p.recebido)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Falta receber</dt>
                    <dd className="font-medium text-zinc-950">{p.cancelado ? '—' : formatarBRL(p.saldo)}</dd>
                  </div>
                </dl>
                <Link href={`/contratos/${p.id}`} className="self-start rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
                  Ver contrato
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
