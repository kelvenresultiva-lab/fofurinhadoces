import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, hojeISO } from '../../eventos/datas'
import { labelTipo } from '../../eventos/opcoes'
import { CardIndicador, formatarBRL } from '../../dashboard/widgets'
import {
  parcelasEmAberto,
  resumoFuturo,
  situacaoFinanceiraContrato,
  somaMoeda,
  totalRecebido,
  type SituacaoContrato,
} from '../../financeiro/calculos'
import {
  classesSituacaoContrato,
  classesStatusContrato,
  labelSituacaoContrato,
  labelStatusContrato,
} from '../opcoes'
import { lerTudo } from './leitura'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativos', label: 'Ativos' },
  { value: 'pagos', label: 'Pagos' },
  { value: 'saldo', label: 'Com saldo' },
  { value: 'atraso', label: 'Em atraso' },
  { value: 'cancelados', label: 'Cancelados' },
] as const

const ORDENS = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'evento', label: 'Evento mais próximo' },
  { value: 'valor', label: 'Maior valor' },
  { value: 'saldo', label: 'Maior saldo' },
] as const

type Filtro = (typeof FILTROS)[number]['value']
type Ordem = (typeof ORDENS)[number]['value']

type Linha = {
  id: string
  numero: number | null
  cliente: string
  tipo: string | null
  titulo: string | null
  dataEvento: string | null
  valorTotal: number
  recebido: number
  saldo: number
  situacao: SituacaoContrato
  status: string
  criadoEm: string
  textoBusca: string
}

// Busca sem diferenciar maiúsculas nem acentos ("chá" encontra "cha").
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function passaFiltro(filtro: Filtro, c: Linha): boolean {
  switch (filtro) {
    case 'ativos':
      return c.status === 'ativo'
    case 'pagos':
      return c.situacao === 'pago'
    case 'saldo':
      return c.status === 'ativo' && c.saldo > 0
    case 'atraso':
      return c.situacao === 'em_atraso'
    case 'cancelados':
      return c.status === 'cancelado'
    default:
      return true
  }
}

// Evento mais próximo: primeiro os de hoje em diante (do mais perto ao mais longe), depois os já
// realizados (do mais recente ao mais antigo), por último os sem data.
function chaveEvento(data: string | null, hoje: string): [number, string] {
  if (!data) return [2, '']
  if (data >= hoje) return [0, data]
  return [1, data]
}

function ordenar(linhas: Linha[], ordem: Ordem, hoje: string): Linha[] {
  const maisRecente = (a: Linha, b: Linha) => b.criadoEm.localeCompare(a.criadoEm)
  const copia = [...linhas]
  switch (ordem) {
    case 'evento':
      return copia.sort((a, b) => {
        const [ga, da] = chaveEvento(a.dataEvento, hoje)
        const [gb, db] = chaveEvento(b.dataEvento, hoje)
        if (ga !== gb) return ga - gb
        if (da !== db) return ga === 0 ? da.localeCompare(db) : db.localeCompare(da)
        return maisRecente(a, b)
      })
    case 'valor':
      return copia.sort((a, b) => b.valorTotal - a.valorTotal || maisRecente(a, b))
    case 'saldo':
      return copia.sort((a, b) => b.saldo - a.saldo || maisRecente(a, b))
    default:
      return copia.sort(maisRecente)
  }
}

function agrupar<T>(itens: T[], chave: (item: T) => string | undefined): Map<string, T[]> {
  const grupos = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    if (!k) continue
    const lista = grupos.get(k)
    if (lista) lista.push(item)
    else grupos.set(k, [item])
  }
  return grupos
}

function montarHref(p: { q?: string; filtro?: string; ordem?: string }): string {
  const params = new URLSearchParams()
  if (p.q) params.set('q', p.q)
  if (p.filtro && p.filtro !== 'todos') params.set('filtro', p.filtro)
  if (p.ordem && p.ordem !== 'recentes') params.set('ordem', p.ordem)
  const texto = params.toString()
  return texto ? `/contratos?${texto}` : '/contratos'
}

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

const botaoVer =
  'inline-block whitespace-nowrap rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50'

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string; ordem?: string }>
}) {
  const { q: qParam, filtro: filtroParam, ordem: ordemParam } = await searchParams
  const q = (qParam ?? '').trim()
  const filtro: Filtro = FILTROS.find((f) => f.value === filtroParam)?.value ?? 'todos'
  const ordem: Ordem = ORDENS.find((o) => o.value === ordemParam)?.value ?? 'recentes'
  const hoje = hojeISO()
  const supabase = await createClient()

  // Todas as consultas passam pelo cliente autenticado: a RLS já restringe à empresa do usuário.
  // Qualquer falha lança exceção (error.tsx): nunca mostramos totais zerados no lugar de um erro.
  const [contratos, parcelas, recebimentos, eventos, clientes, orcamentos] = await Promise.all([
    lerTudo<{ id: string; evento_id: string; valor_final: string | number; status: string; created_at: string }>((a, b) =>
      supabase.from('contratos').select('id, evento_id, valor_final, status, created_at').order('id').range(a, b)
    ),
    lerTudo<{ id: string; contrato_id: string; vencimento: string; valor: string | number; valor_pago: string | number; status: string }>((a, b) =>
      supabase.from('parcelas').select('id, contrato_id, vencimento, valor, valor_pago, status').order('id').range(a, b)
    ),
    lerTudo<{ id: string; parcela_id: string; valor: string | number }>((a, b) =>
      supabase.from('recebimentos').select('id, parcela_id, valor').order('id').range(a, b)
    ),
    lerTudo<{ id: string; tipo: string; titulo: string | null; data: string | null; cliente_id: string }>((a, b) =>
      supabase.from('eventos').select('id, tipo, titulo, data, cliente_id').order('id').range(a, b)
    ),
    lerTudo<{ id: string; nome: string }>((a, b) => supabase.from('clientes').select('id, nome').order('id').range(a, b)),
    lerTudo<{ numero: number; contrato_id: string }>((a, b) =>
      supabase.from('orcamentos').select('numero, contrato_id').not('contrato_id', 'is', null).order('id').range(a, b)
    ),
  ])

  const eventoPorId = new Map(eventos.map((e) => [e.id, e]))
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]))
  const numeroPorContrato = new Map(orcamentos.map((o) => [o.contrato_id, o.numero]))
  const contratoDaParcela = new Map(parcelas.map((p) => [p.id, p.contrato_id]))

  const parcelasPorContrato = agrupar(parcelas, (p) => p.contrato_id)
  const recebimentosPorContrato = agrupar(recebimentos, (r) => contratoDaParcela.get(r.parcela_id))

  const linhas: Linha[] = contratos.map((c) => {
    const evento = eventoPorId.get(c.evento_id)
    const cliente = evento ? nomeCliente.get(evento.cliente_id) ?? '—' : '—'
    const numero = numeroPorContrato.get(c.id) ?? null
    // Valor futuro pela regra central (financeiro/calculos.ts): contrato cancelado não tem saldo.
    const abertas = parcelasEmAberto(parcelasPorContrato.get(c.id) ?? [], [c])
    const recebido = totalRecebido(recebimentosPorContrato.get(c.id) ?? [])
    const saldo = resumoFuturo(abertas, hoje).aReceber
    return {
      id: c.id,
      numero,
      cliente,
      tipo: evento?.tipo ?? null,
      titulo: evento?.titulo ?? null,
      dataEvento: evento?.data ?? null,
      valorTotal: Number(c.valor_final),
      recebido,
      saldo,
      situacao: situacaoFinanceiraContrato(c.status, abertas, recebido, hoje),
      status: c.status,
      criadoEm: c.created_at,
      textoBusca: normalizar([numero ? `#${numero}` : '', cliente, evento ? labelTipo(evento.tipo) : '', evento?.tipo ?? '', evento?.titulo ?? ''].join(' ')),
    }
  })

  // Cards: sempre o total da empresa, independente da busca e dos filtros da lista abaixo.
  const ativos = linhas.filter((l) => l.status === 'ativo')
  const cancelados = linhas.filter((l) => l.status === 'cancelado')
  const futuro = resumoFuturo(parcelasEmAberto(parcelas, contratos), hoje)
  const recebidoTotal = totalRecebido(recebimentos)
  const recebidoCancelados = somaMoeda(cancelados.map((l) => l.recebido))
  const valorContratado = somaMoeda(ativos.map((l) => l.valorTotal))

  // Busca: número do contrato (nº do orçamento de origem), cliente e tipo do evento.
  const termo = normalizar(q).replace(/^#/, '')
  const soDigitos = /^\d+$/.test(termo)
  const visiveis = ordenar(
    linhas.filter((l) => {
      if (!passaFiltro(filtro, l)) return false
      if (!termo) return true
      if (soDigitos && l.numero === Number(termo)) return true
      return l.textoBusca.includes(termo)
    }),
    ordem,
    hoje
  )

  const pilula = (ativa: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      ativa ? 'bg-indigo-600 text-white' : 'border border-black/[.08] bg-white text-zinc-600 hover:bg-black/[.04]'
    }`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">Contratos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Contratos gerados a partir de orçamentos aprovados: acompanhe valores, recebimentos e saldos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <CardIndicador titulo="Contratos ativos" valor={String(ativos.length)} detalhe="Em andamento" />
        <CardIndicador titulo="Valor total contratado" valor={formatarBRL(valorContratado)} tom="roxo" detalhe="Soma dos contratos ativos" />
        <CardIndicador
          titulo="Total recebido"
          valor={formatarBRL(recebidoTotal)}
          tom="verde"
          detalhe={recebidoCancelados > 0 ? `Inclui ${formatarBRL(recebidoCancelados)} de contratos cancelados` : 'Todos os recebimentos registrados'}
        />
        <CardIndicador titulo="Saldo a receber" valor={formatarBRL(futuro.aReceber)} tom="roxo" detalhe={`${futuro.qtdAReceber} parcela(s) em aberto`} />
        <CardIndicador titulo="Contratos cancelados" valor={String(cancelados.length)} detalhe="Somente histórico" />
      </div>

      <div className="flex flex-col gap-4">
        <form className="flex w-full max-w-xl gap-2">
          {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
          {ordem !== 'recentes' && <input type="hidden" name="ordem" value={ordem} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nº, cliente ou tipo de evento"
            aria-label="Buscar contratos"
            className="min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-2" aria-label="Filtros">
          {FILTROS.map((f) => (
            <Link key={f.value} href={montarHref({ q, filtro: f.value, ordem })} className={pilula(filtro === f.value)}>
              {f.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label="Ordenação">
          <span className="text-zinc-500">Ordenar por:</span>
          {ORDENS.map((o) => (
            <Link
              key={o.value}
              href={montarHref({ q, filtro, ordem: o.value })}
              className={ordem === o.value ? 'font-semibold text-indigo-700 underline underline-offset-4' : 'text-zinc-600 hover:text-indigo-700'}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-black/[.06] bg-white p-8 text-center shadow-sm">
          {linhas.length === 0 ? (
            <>
              <p className="text-sm font-medium text-zinc-950">Nenhum contrato gerado ainda.</p>
              <p className="mt-1 text-sm text-zinc-500">Os contratos são gerados a partir de orçamentos aprovados.</p>
              <Link href="/orcamentos" className={`${botaoVer} mt-4`}>
                Ver orçamentos
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-950">Nenhum contrato encontrado.</p>
              <p className="mt-1 text-sm text-zinc-500">Ajuste a busca ou os filtros.</p>
              <Link href="/contratos" className={`${botaoVer} mt-4`}>
                Limpar busca e filtros
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {visiveis.length} {visiveis.length === 1 ? 'contrato' : 'contratos'}
          </p>

          {/* Telas largas (a partir de 1400px, já com o menu lateral): tabela. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1400px]:block">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:align-bottom">
              <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium" title="Número do orçamento de origem: contratos não têm numeração própria">
                    Nº do contrato
                  </th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Tipo do evento</th>
                  <th className="px-4 py-3 font-medium">Data do evento</th>
                  <th className="px-4 py-3 text-right font-medium">Valor total</th>
                  <th className="px-4 py-3 text-right font-medium">Recebido</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  <th className="px-4 py-3 font-medium">Situação financeira</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} className={`border-t border-black/[.06] hover:bg-zinc-50/60 ${c.status === 'cancelado' ? 'text-zinc-500' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-950">{c.numero ? `#${c.numero}` : '—'}</td>
                    <td className="min-w-[9rem] px-4 py-3 text-zinc-950">{c.cliente}</td>
                    <td className="px-4 py-3">
                      {c.tipo ? labelTipo(c.tipo) : '—'}
                      {c.titulo && <span className="block text-xs text-zinc-500">{c.titulo}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatarDataBR(c.dataEvento)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-zinc-950">{formatarBRL(c.valorTotal)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-green-700">{formatarBRL(c.recebido)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-zinc-950">{c.status === 'cancelado' ? '—' : formatarBRL(c.saldo)}</td>
                    <td className="px-4 py-3">
                      <Selo classes={classesSituacaoContrato(c.situacao)}>{labelSituacaoContrato(c.situacao)}</Selo>
                    </td>
                    <td className="px-4 py-3">
                      <Selo classes={classesStatusContrato(c.status)}>{labelStatusContrato(c.status)}</Selo>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/contratos/${c.id}`} className={botaoVer}>
                        Ver contrato
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telas menores (inclui celular): um card por contrato, sem rolagem horizontal. */}
          <ul className="grid gap-4 sm:grid-cols-2 min-[1400px]:hidden">
            {visiveis.map((c) => (
              <li key={c.id} className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500">Contrato {c.numero ? `#${c.numero}` : '—'}</p>
                    <p className="truncate text-base font-semibold text-zinc-950">{c.cliente}</p>
                    <p className="text-sm text-zinc-500">
                      {c.tipo ? labelTipo(c.tipo) : '—'} · {formatarDataBR(c.dataEvento)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Selo classes={classesSituacaoContrato(c.situacao)}>{labelSituacaoContrato(c.situacao)}</Selo>
                    <Selo classes={classesStatusContrato(c.status)}>{labelStatusContrato(c.status)}</Selo>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-500">Valor total</dt>
                    <dd className="font-medium text-zinc-950">{formatarBRL(c.valorTotal)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Recebido</dt>
                    <dd className="font-medium text-green-700">{formatarBRL(c.recebido)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Saldo</dt>
                    <dd className="font-medium text-zinc-950">{c.status === 'cancelado' ? '—' : formatarBRL(c.saldo)}</dd>
                  </div>
                </dl>
                <Link href={`/contratos/${c.id}`} className={`${botaoVer} text-center`}>
                  Ver contrato
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
