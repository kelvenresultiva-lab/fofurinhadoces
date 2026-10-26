import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarPrecoParaExibicao } from '../produtos/preco'
import { formatarDataBR, hojeISO } from '../eventos/datas'
import { labelTipo } from '../eventos/opcoes'
import { labelStatusParcela, classesStatusParcela } from '../contratos/opcoes'
import { ehVencida, situacaoParcela } from './calculos'

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'parciais', label: 'Parciais' },
  { value: 'pagas', label: 'Pagas' },
  { value: 'vencidas', label: 'Vencidas' },
] as const

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string }>
}) {
  const { q, filtro: filtroParam } = await searchParams
  const filtro = FILTROS.some((f) => f.value === filtroParam) ? filtroParam! : 'todas'
  const supabase = await createClient()
  const hoje = hojeISO()

  // Cards sempre refletem o total da empresa, independente do filtro/busca da
  // listagem abaixo — por isso essa busca é separada.
  const [{ data: todasParcelas }, { data: todosRecebimentos }] = await Promise.all([
    supabase.from('parcelas').select('valor, valor_pago, status, vencimento'),
    supabase.from('recebimentos').select('valor'),
  ])

  const recebido = (todosRecebimentos ?? []).reduce((soma, r) => soma + Number(r.valor), 0)
  const aReceber = (todasParcelas ?? [])
    .filter((p) => p.status !== 'cancelado')
    .reduce((soma, p) => soma + (Number(p.valor) - Number(p.valor_pago)), 0)
  const emAtraso = (todasParcelas ?? [])
    .filter((p) => ehVencida(p.vencimento, Number(p.valor) - Number(p.valor_pago), p.status))
    .reduce((soma, p) => soma + (Number(p.valor) - Number(p.valor_pago)), 0)
  const proximosVencimentos = (todasParcelas ?? []).filter(
    (p) => p.status !== 'cancelado' && Number(p.valor) - Number(p.valor_pago) > 0 && p.vencimento >= hoje
  ).length

  // Listagem filtrada/buscada
  let query = supabase
    .from('parcelas')
    .select('id, numero, vencimento, valor, valor_pago, status, contrato_id')

  if (filtro === 'pendentes') query = query.eq('status', 'pendente')
  else if (filtro === 'parciais') query = query.eq('status', 'parcial')
  else if (filtro === 'pagas') query = query.eq('status', 'pago')
  else if (filtro === 'vencidas') query = query.in('status', ['pendente', 'parcial']).lt('vencimento', hoje)

  if (q) {
    const termo = q.replace(/[,()]/g, '')
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

    let idsContratos: string[] = []
    if (idsEventos.length > 0) {
      const { data: contratosEncontrados } = await supabase.from('contratos').select('id').in('evento_id', idsEventos)
      idsContratos = (contratosEncontrados ?? []).map((c) => c.id)
    }

    if (idsContratos.length > 0) {
      query = query.in('contrato_id', idsContratos)
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: parcelas } = await query

  // Ordenação operacional: vencidas primeiro, depois vencimento mais próximo.
  const parcelasOrdenadas = [...(parcelas ?? [])].sort((a, b) => {
    const saldoA = Number(a.valor) - Number(a.valor_pago)
    const saldoB = Number(b.valor) - Number(b.valor_pago)
    const vencidaA = ehVencida(a.vencimento, saldoA, a.status)
    const vencidaB = ehVencida(b.vencimento, saldoB, b.status)
    if (vencidaA !== vencidaB) return vencidaA ? -1 : 1
    return a.vencimento.localeCompare(b.vencimento)
  })

  const idsContratosDaLista = [...new Set(parcelasOrdenadas.map((p) => p.contrato_id))]
  const { data: contratos } =
    idsContratosDaLista.length > 0
      ? await supabase.from('contratos').select('id, evento_id').in('id', idsContratosDaLista)
      : { data: [] as { id: string; evento_id: string }[] }

  const idsEventosDaLista = [...new Set((contratos ?? []).map((c) => c.evento_id))]
  const { data: eventos } =
    idsEventosDaLista.length > 0
      ? await supabase.from('eventos').select('id, tipo, titulo, cliente_id').in('id', idsEventosDaLista)
      : { data: [] as { id: string; tipo: string; titulo: string | null; cliente_id: string }[] }

  const idsClientesDaLista = [...new Set((eventos ?? []).map((e) => e.cliente_id))]
  const { data: clientes } =
    idsClientesDaLista.length > 0
      ? await supabase.from('clientes').select('id, nome').in('id', idsClientesDaLista)
      : { data: [] as { id: string; nome: string }[] }

  const contratoPorId = new Map((contratos ?? []).map((c) => [c.id, c]))
  const eventoPorId = new Map((eventos ?? []).map((e) => [e.id, e]))
  const nomeClientePorId = new Map((clientes ?? []).map((c) => [c.id, c.nome]))

  const cardClasses = 'rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Financeiro</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Contas a receber dos contratos.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClasses}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">A receber</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            R$ {formatarPrecoParaExibicao(aReceber)}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Recebido</p>
          <p className="mt-1 text-2xl font-semibold text-green-700 dark:text-green-400">
            R$ {formatarPrecoParaExibicao(recebido)}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Em atraso</p>
          <p className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-400">
            R$ {formatarPrecoParaExibicao(emAtraso)}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Próximos vencimentos</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{proximosVencimentos}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {FILTROS.map((f) => (
            <Link
              key={f.value}
              href={`/financeiro?filtro=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`rounded-full px-3 py-1.5 font-medium ${
                filtro === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <form className="flex gap-2">
          <input type="hidden" name="filtro" value={filtro} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por cliente ou evento..."
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

      {parcelasOrdenadas.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {q || filtro !== 'todas' ? 'Nenhuma parcela encontrada.' : 'Nenhuma conta a receber.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Parcela</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Recebido</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {parcelasOrdenadas.map((parcela) => {
                const contrato = contratoPorId.get(parcela.contrato_id)
                const evento = contrato ? eventoPorId.get(contrato.evento_id) : undefined
                const saldo = Number(parcela.valor) - Number(parcela.valor_pago)
                const situacao = situacaoParcela(parcela)
                return (
                  <tr key={parcela.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                    <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                      {evento ? nomeClientePorId.get(evento.cliente_id) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {evento ? evento.titulo || labelTipo(evento.tipo) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">#{parcela.numero}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatarDataBR(parcela.vencimento)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      R$ {formatarPrecoParaExibicao(parcela.valor)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      R$ {formatarPrecoParaExibicao(parcela.valor_pago)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      R$ {formatarPrecoParaExibicao(saldo)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          situacao ? situacao.classes : classesStatusParcela(parcela.status)
                        }`}
                      >
                        {situacao ? situacao.label : labelStatusParcela(parcela.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {contrato && (
                        <Link
                          href={`/contratos/${contrato.id}`}
                          className="font-medium text-zinc-950 underline dark:text-zinc-50"
                        >
                          Abrir contrato
                        </Link>
                      )}
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
