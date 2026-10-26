import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarPrecoParaExibicao } from '../produtos/preco'
import { formatarDataBR } from '../eventos/datas'
import { labelTipo } from '../eventos/opcoes'
import { STATUS_CONTRATO, labelStatusContrato, classesStatusContrato } from './opcoes'

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status: statusParam } = await searchParams
  const status = STATUS_CONTRATO.some((s) => s.value === statusParam) ? statusParam : undefined
  const supabase = await createClient()

  let query = supabase
    .from('contratos')
    .select('id, evento_id, valor_total, desconto, valor_final, status, created_at')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (q) {
    const termo = q.replace(/[,()]/g, '')
    const condicoes: string[] = []

    const numeroOrcamento = Number(termo)
    if (Number.isInteger(numeroOrcamento)) {
      const { data: orcamentosPorNumero } = await supabase
        .from('orcamentos')
        .select('contrato_id')
        .eq('numero', numeroOrcamento)
        .not('contrato_id', 'is', null)
      const idsContratos = (orcamentosPorNumero ?? []).map((o) => o.contrato_id)
      if (idsContratos.length > 0) condicoes.push(`id.in.(${idsContratos.join(',')})`)
    }

    const [{ data: clientesEncontrados }, { data: eventosEncontrados }] = await Promise.all([
      supabase.from('clientes').select('id').ilike('nome', `%${termo}%`),
      supabase.from('eventos').select('id').or(`tipo.ilike.%${termo}%,titulo.ilike.%${termo}%`),
    ])

    const idsClientes = (clientesEncontrados ?? []).map((c) => c.id)
    let idsEventosDoCliente: string[] = []
    if (idsClientes.length > 0) {
      const { data: eventosDoCliente } = await supabase.from('eventos').select('id').in('cliente_id', idsClientes)
      idsEventosDoCliente = (eventosDoCliente ?? []).map((e) => e.id)
    }
    const idsEventos = [...new Set([...(eventosEncontrados ?? []).map((e) => e.id), ...idsEventosDoCliente])]
    if (idsEventos.length > 0) condicoes.push(`evento_id.in.(${idsEventos.join(',')})`)

    if (condicoes.length > 0) {
      query = query.or(condicoes.join(','))
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: contratos } = await query

  const idsEventos = [...new Set((contratos ?? []).map((c) => c.evento_id))]
  const idsContratos = (contratos ?? []).map((c) => c.id)

  const [{ data: eventos }, { data: orcamentosVinculados }] = await Promise.all([
    idsEventos.length > 0
      ? supabase.from('eventos').select('id, tipo, titulo, data, cliente_id').in('id', idsEventos)
      : Promise.resolve({ data: [] as { id: string; tipo: string; titulo: string | null; data: string | null; cliente_id: string }[] }),
    idsContratos.length > 0
      ? supabase.from('orcamentos').select('numero, contrato_id').in('contrato_id', idsContratos)
      : Promise.resolve({ data: [] as { numero: number; contrato_id: string | null }[] }),
  ])

  const idsClientesDosEventos = [...new Set((eventos ?? []).map((e) => e.cliente_id))]
  const { data: clientes } =
    idsClientesDosEventos.length > 0
      ? await supabase.from('clientes').select('id, nome').in('id', idsClientesDosEventos)
      : { data: [] as { id: string; nome: string }[] }

  const eventoPorId = new Map((eventos ?? []).map((e) => [e.id, e]))
  const nomeClientePorId = new Map((clientes ?? []).map((c) => [c.id, c.nome]))
  const numeroOrcamentoPorContratoId = new Map((orcamentosVinculados ?? []).map((o) => [o.contrato_id as string, o.numero]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Contratos</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Contratos gerados a partir de orçamentos aprovados.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/contratos"
            className={`rounded-full px-3 py-1.5 font-medium ${
              !status
                ? 'bg-indigo-600 text-white'
                : 'border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]'
            }`}
          >
            Todos
          </Link>
          {STATUS_CONTRATO.map((s) => (
            <Link
              key={s.value}
              href={`/contratos?status=${s.value}`}
              className={`rounded-full px-3 py-1.5 font-medium ${
                status === s.value
                  ? 'bg-indigo-600 text-white'
                  : 'border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por cliente, evento ou nº do orçamento..."
            className="w-full max-w-xs rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Buscar
          </button>
        </form>
      </div>

      {!contratos || contratos.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-black/[.08] p-6 dark:border-white/[.145]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {q || status ? 'Nenhum contrato encontrado.' : 'Nenhum contrato gerado.'}
          </p>
          {!q && !status && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Os contratos são gerados a partir de orçamentos aprovados.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Orçamento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contratos.map((contrato) => {
                const evento = eventoPorId.get(contrato.evento_id)
                const numeroOrcamento = numeroOrcamentoPorContratoId.get(contrato.id)
                return (
                  <tr key={contrato.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                    <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                      {numeroOrcamento ? `#${numeroOrcamento}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {evento ? nomeClientePorId.get(evento.cliente_id) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {evento ? `${evento.titulo || labelTipo(evento.tipo)} — ${formatarDataBR(evento.data)}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      R$ {formatarPrecoParaExibicao(contrato.valor_final)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatusContrato(contrato.status)}`}
                      >
                        {labelStatusContrato(contrato.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/contratos/${contrato.id}`}
                        className="font-medium text-zinc-950 underline dark:text-zinc-50"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
