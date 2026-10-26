import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarPrecoParaExibicao } from '../produtos/preco'
import { formatarDataBR } from '../eventos/datas'
import { labelTipo } from '../eventos/opcoes'
import { STATUS_ORCAMENTO, labelStatusOrcamento, classesStatusOrcamento } from './opcoes'

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status: statusParam } = await searchParams
  const status = STATUS_ORCAMENTO.some((s) => s.value === statusParam) ? statusParam : undefined
  const supabase = await createClient()

  let query = supabase
    .from('orcamentos')
    .select(
      'id, numero, cliente_id, evento_id, status, subtotal, desconto_tipo, desconto_valor, valor_total, data_emissao, cliente:clientes(id, nome), evento:eventos(id, tipo, titulo, data)'
    )
    .order('numero', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (q) {
    const termo = q.replace(/[,()]/g, '')
    const condicoes: string[] = []

    const numero = Number(termo)
    if (Number.isInteger(numero)) {
      condicoes.push(`numero.eq.${numero}`)
    }

    const [{ data: clientesEncontrados }, { data: eventosEncontrados }] = await Promise.all([
      supabase.from('clientes').select('id').ilike('nome', `%${termo}%`),
      supabase.from('eventos').select('id').or(`tipo.ilike.%${termo}%,titulo.ilike.%${termo}%`),
    ])

    const idsClientes = (clientesEncontrados ?? []).map((c) => c.id)
    const idsEventos = (eventosEncontrados ?? []).map((e) => e.id)
    if (idsClientes.length > 0) condicoes.push(`cliente_id.in.(${idsClientes.join(',')})`)
    if (idsEventos.length > 0) condicoes.push(`evento_id.in.(${idsEventos.join(',')})`)

    if (condicoes.length > 0) {
      query = query.or(condicoes.join(','))
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: orcamentos } = await query

  // Cliente e evento vêm embutidos no orçamento (sem segunda etapa de consultas).
  type EventoRef = { id: string; tipo: string; titulo: string | null; data: string | null }
  const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
  const clientes = (orcamentos ?? []).map((o) => um<{ id: string; nome: string }>(o.cliente)).filter((c) => c !== null)
  const eventos = (orcamentos ?? []).map((o) => um<EventoRef>(o.evento)).filter((e) => e !== null)

  const nomeClientePorId = new Map(clientes.map((c) => [c.id, c.nome]))
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Orçamentos</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Propostas comerciais vinculadas a eventos.</p>
        </div>
        <Link
          href="/orcamentos/novo"
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Novo orçamento
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/orcamentos"
            className={`rounded-full px-3 py-1.5 font-medium ${
              !status
                ? 'bg-indigo-600 text-white'
                : 'border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]'
            }`}
          >
            Todos
          </Link>
          {STATUS_ORCAMENTO.map((s) => (
            <Link
              key={s.value}
              href={`/orcamentos?status=${s.value}`}
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
            placeholder="Buscar por número, cliente ou evento..."
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

      {!orcamentos || orcamentos.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {q || status ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento cadastrado.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Subtotal</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orcamentos.map((orcamento) => {
                const evento = eventoPorId.get(orcamento.evento_id)
                return (
                  <tr key={orcamento.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                    <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">#{orcamento.numero}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {nomeClientePorId.get(orcamento.cliente_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {evento ? `${evento.titulo || labelTipo(evento.tipo)} — ${formatarDataBR(evento.data)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatusOrcamento(orcamento.status)}`}
                      >
                        {labelStatusOrcamento(orcamento.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      R$ {formatarPrecoParaExibicao(orcamento.subtotal)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      R$ {formatarPrecoParaExibicao(orcamento.valor_total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/orcamentos/${orcamento.id}`}
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
