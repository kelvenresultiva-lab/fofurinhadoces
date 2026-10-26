import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarEvento } from '../actions'
import { EventoForm } from '../EventoForm'
import { formatarPrecoParaExibicao } from '../../produtos/preco'
import { labelStatusOrcamento, classesStatusOrcamento } from '../../orcamentos/opcoes'
import { labelStatusContrato, classesStatusContrato } from '../../contratos/opcoes'

export default async function EditarEventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  // Tudo depende só do id do evento: uma etapa, consultas em paralelo (o cliente vem embutido).
  const [{ data: eventoComCliente }, { data: clientesAtivos }, { data: orcamentosDoEvento }, { data: contratoDoEvento }] = await Promise.all([
    supabase.from('eventos').select('*, cliente:clientes(id, nome, status)').eq('id', id).maybeSingle(),
    supabase.from('clientes').select('id, nome').eq('status', 'ativo').order('nome'),
    supabase.from('orcamentos').select('id, numero, status, valor_total').eq('evento_id', id).order('numero', { ascending: false }),
    supabase.from('contratos').select('id, status, valor_final').eq('evento_id', id).maybeSingle(),
  ])

  if (!eventoComCliente) {
    notFound()
  }

  const { cliente: clienteEmbutido, ...evento } = eventoComCliente
  const cliente = (Array.isArray(clienteEmbutido) ? clienteEmbutido[0] : clienteEmbutido) as { id: string; nome: string; status: string } | null

  // Se o cliente deste evento foi inativado depois, ele continua aparecendo aqui
  // (não perdemos o histórico só porque o cadastro do cliente mudou de status).
  const clientesDisponiveis = clientesAtivos ?? []
  if (cliente && !clientesDisponiveis.some((c) => c.id === cliente.id)) {
    clientesDisponiveis.unshift(cliente)
  }

  const atualizarComId = atualizarEvento.bind(null, id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Editar evento</h1>
        {cliente && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Cliente: <span className="font-medium text-zinc-950 dark:text-zinc-50">{cliente.nome}</span>
              {cliente.status === 'inativo' && ' (inativo)'}
            </span>
            <Link
              href={`/clientes/${cliente.id}`}
              className="rounded-full border border-black/[.08] px-3 py-1.5 font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Ver cliente
            </Link>
          </div>
        )}
      </div>
      <EventoForm
        action={atualizarComId}
        clientesDisponiveis={clientesDisponiveis}
        valores={evento}
        erro={erro}
        textoBotao="Salvar alterações"
      />

      <div className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Orçamentos</h2>
          <Link
            href={`/orcamentos/novo?evento=${id}`}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Novo orçamento
          </Link>
        </div>

        {!orcamentosDoEvento || orcamentosDoEvento.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum orçamento para este evento.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orcamentosDoEvento.map((orcamento) => (
              <li
                key={orcamento.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">#{orcamento.numero}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatusOrcamento(orcamento.status)}`}>
                    {labelStatusOrcamento(orcamento.status)}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    R$ {formatarPrecoParaExibicao(orcamento.valor_total)}
                  </span>
                </div>
                <Link
                  href={`/orcamentos/${orcamento.id}`}
                  className="font-medium text-zinc-950 underline dark:text-zinc-50"
                >
                  Ver orçamento
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {contratoDoEvento && (
        <div className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Contrato</h2>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatusContrato(contratoDoEvento.status)}`}>
                {labelStatusContrato(contratoDoEvento.status)}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                R$ {formatarPrecoParaExibicao(contratoDoEvento.valor_final)}
              </span>
            </div>
            <Link
              href={`/contratos/${contratoDoEvento.id}`}
              className="font-medium text-zinc-950 underline dark:text-zinc-50"
            >
              Ver contrato
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
