import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, hojeISO } from './datas'
import { labelTipo, classesStatus } from './opcoes'

const PERIODOS = [
  { value: 'proximos', label: 'Próximos' },
  { value: 'passados', label: 'Passados' },
  { value: 'todos', label: 'Todos' },
] as const

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; periodo?: string }>
}) {
  const { q, periodo: periodoParam } = await searchParams
  const periodo = PERIODOS.some((p) => p.value === periodoParam) ? periodoParam! : 'proximos'
  const supabase = await createClient()
  const hoje = hojeISO()

  let query = supabase
    .from('eventos')
    .select('id, cliente_id, tipo, titulo, data, horario, local, cidade, status')

  if (periodo === 'proximos') {
    query = query.or(`data.gte.${hoje},data.is.null`)
  } else if (periodo === 'passados') {
    query = query.lt('data', hoje)
  }

  if (q) {
    const termo = q.replace(/[,()]/g, '')
    const { data: clientesEncontrados } = await supabase.from('clientes').select('id').ilike('nome', `%${termo}%`)
    const idsClientes = (clientesEncontrados ?? []).map((c) => c.id)

    const condicoes = [`local.ilike.%${termo}%`, `tipo.ilike.%${termo}%`, `titulo.ilike.%${termo}%`]
    if (idsClientes.length > 0) {
      condicoes.push(`cliente_id.in.(${idsClientes.join(',')})`)
    }
    query = query.or(condicoes.join(','))
  }

  const { data: eventos } = await query

  const idsClientesDosEventos = [...new Set((eventos ?? []).map((e) => e.cliente_id))]
  const { data: clientesDosEventos } =
    idsClientesDosEventos.length > 0
      ? await supabase.from('clientes').select('id, nome').in('id', idsClientesDosEventos)
      : { data: [] }
  const nomeClientePorId = new Map((clientesDosEventos ?? []).map((c) => [c.id, c.nome]))

  // Ordenação operacional: eventos futuros (mais próximos primeiro), depois passados
  // (mais recentes primeiro), e sem data por último. Feito em memória porque o
  // PostgREST/.order() só ordena por coluna simples, não por essa regra bidirecional.
  const eventosOrdenados = [...(eventos ?? [])].sort((a, b) => {
    if (!a.data && !b.data) return 0
    if (!a.data) return 1
    if (!b.data) return -1
    const aFuturo = a.data >= hoje
    const bFuturo = b.data >= hoje
    if (aFuturo && bFuturo) return a.data.localeCompare(b.data)
    if (!aFuturo && !bFuturo) return b.data.localeCompare(a.data)
    return aFuturo ? -1 : 1
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Eventos</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Casamentos, aniversários e outras celebrações a organizar.
          </p>
        </div>
        <Link
          href="/eventos/novo"
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Novo evento
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 text-sm">
          {PERIODOS.map((p) => (
            <Link
              key={p.value}
              href={`/eventos?periodo=${p.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`rounded-full px-3 py-1.5 font-medium ${
                periodo === p.value
                  ? 'bg-indigo-600 text-white'
                  : 'border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <form className="flex gap-2">
          <input type="hidden" name="periodo" value={periodo} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por cliente, tipo ou local..."
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

      {eventosOrdenados.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {q ? 'Nenhum evento encontrado.' : 'Nenhum evento cadastrado.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Local</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {eventosOrdenados.map((evento) => (
                <tr key={evento.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                  <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                    {evento.titulo || labelTipo(evento.tipo)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {nomeClientePorId.get(evento.cliente_id) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatarDataBR(evento.data)}
                    {evento.horario ? ` às ${evento.horario.slice(0, 5)}` : ''}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {[evento.local, evento.cidade].filter(Boolean).join(' — ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatus(evento.status)}`}>
                      {evento.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/eventos/${evento.id}`}
                      className="font-medium text-zinc-950 underline dark:text-zinc-50"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
