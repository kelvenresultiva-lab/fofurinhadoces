import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR } from '../eventos/datas'
import { CardIndicador, formatarBRL } from '../dashboard/widgets'
import { PERIODOS_RECEBIMENTOS, mesAtual, resolverPeriodoRecebimentos } from '../dashboard/periodo'
import { totalRecebido } from '../financeiro/calculos'
import { FORMAS_PAGAMENTO, labelFormaPagamento } from '../contratos/opcoes'
import { lerTudo } from '../contratos/(lista)/leitura'

const ORDENS = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'antigos', label: 'Mais antigos' },
  { value: 'maior', label: 'Maior valor' },
  { value: 'menor', label: 'Menor valor' },
] as const

type Ordem = (typeof ORDENS)[number]['value']

type RecebimentoLido = {
  id: string
  parcela_id: string
  valor: string | number
  data: string
  forma_pagamento: string
  observacoes: string | null
  created_at: string
}

type Linha = {
  r: RecebimentoLido
  contratoId: string | null
  contratoNumero: number | null
  contratoCancelado: boolean
  cliente: string
  parcela: string
  textoBusca: string
}

// Busca sem diferenciar maiúsculas nem acentos ("joão" encontra "joao").
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Mesmo dia: o lançado por último primeiro (created_at desempata a data civil do recebimento).
function ordenar(linhas: Linha[], ordem: Ordem): Linha[] {
  const recente = (a: Linha, b: Linha) => b.r.data.localeCompare(a.r.data) || b.r.created_at.localeCompare(a.r.created_at)
  const copia = [...linhas]
  switch (ordem) {
    case 'antigos':
      return copia.sort((a, b) => recente(b, a))
    case 'maior':
      return copia.sort((a, b) => Number(b.r.valor) - Number(a.r.valor) || recente(a, b))
    case 'menor':
      return copia.sort((a, b) => Number(a.r.valor) - Number(b.r.valor) || recente(a, b))
    default:
      return copia.sort(recente)
  }
}

type Params = { periodo?: string; de?: string; ate?: string; q?: string; forma?: string; ordem?: string }

function montarHref(p: Params): string {
  const params = new URLSearchParams()
  if (p.periodo && p.periodo !== 'mes') params.set('periodo', p.periodo)
  if (p.periodo === 'personalizado') {
    if (p.de) params.set('de', p.de)
    if (p.ate) params.set('ate', p.ate)
  }
  if (p.q) params.set('q', p.q)
  if (p.forma) params.set('forma', p.forma)
  if (p.ordem && p.ordem !== 'recentes') params.set('ordem', p.ordem)
  const texto = params.toString()
  return texto ? `/recebimentos?${texto}` : '/recebimentos'
}

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

const seloCancelado = 'bg-zinc-100 text-zinc-600'
const botaoVer =
  'inline-block whitespace-nowrap rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50'

export default async function RecebimentosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { periodo: periodoParam, de, ate, q: qParam, forma: formaParam, ordem: ordemParam } = await searchParams
  const periodo = resolverPeriodoRecebimentos(periodoParam, de, ate)
  const q = (qParam ?? '').trim()
  const forma = FORMAS_PAGAMENTO.find((f) => f.value === formaParam)?.value ?? ''
  const ordem: Ordem = ORDENS.find((o) => o.value === ordemParam)?.value ?? 'recentes'
  const mes = mesAtual()
  const supabase = await createClient()

  // Todas as consultas passam pelo cliente autenticado: a RLS já restringe à empresa do usuário.
  // Qualquer falha lança exceção (error.tsx): nunca mostramos totais zerados no lugar de um erro.
  const [recebimentos, parcelas, contratos, eventos, clientes, orcamentos] = await Promise.all([
    lerTudo<RecebimentoLido>((a, b) =>
      supabase.from('recebimentos').select('id, parcela_id, valor, data, forma_pagamento, observacoes, created_at').order('id').range(a, b)
    ),
    lerTudo<{ id: string; contrato_id: string; numero: number; descricao: string | null }>((a, b) =>
      supabase.from('parcelas').select('id, contrato_id, numero, descricao').order('id').range(a, b)
    ),
    lerTudo<{ id: string; evento_id: string; status: string }>((a, b) =>
      supabase.from('contratos').select('id, evento_id, status').order('id').range(a, b)
    ),
    lerTudo<{ id: string; cliente_id: string }>((a, b) => supabase.from('eventos').select('id, cliente_id').order('id').range(a, b)),
    lerTudo<{ id: string; nome: string }>((a, b) => supabase.from('clientes').select('id, nome').order('id').range(a, b)),
    lerTudo<{ numero: number; contrato_id: string }>((a, b) =>
      supabase.from('orcamentos').select('numero, contrato_id').not('contrato_id', 'is', null).order('id').range(a, b)
    ),
  ])

  const parcelaPorId = new Map(parcelas.map((p) => [p.id, p]))
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]))
  const clienteDoEvento = new Map(eventos.map((e) => [e.id, e.cliente_id]))
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]))
  const numeroPorContrato = new Map(orcamentos.map((o) => [o.contrato_id, o.numero]))

  // Recebimentos de contratos cancelados são histórico: continuam aqui, só identificados.
  const linhas: Linha[] = recebimentos.map((r) => {
    const parcela = parcelaPorId.get(r.parcela_id)
    const contrato = parcela ? contratoPorId.get(parcela.contrato_id) : undefined
    const clienteId = contrato ? clienteDoEvento.get(contrato.evento_id) : undefined
    const cliente = clienteId ? nomeCliente.get(clienteId) ?? '—' : '—'
    const contratoNumero = contrato ? numeroPorContrato.get(contrato.id) ?? null : null
    const descricao = parcela ? parcela.descricao ?? `Parcela ${parcela.numero}` : '—'
    return {
      r,
      contratoId: contrato?.id ?? null,
      contratoNumero,
      contratoCancelado: contrato?.status === 'cancelado',
      cliente,
      parcela: descricao,
      textoBusca: normalizar([cliente, descricao, contratoNumero ? `#${contratoNumero}` : ''].join(' ')),
    }
  })

  // Cards: todos os recebimentos da empresa nas datas do período (o do mês usa sempre o mês
  // corrente). Busca, forma de pagamento e ordenação só afetam a lista abaixo.
  const noPeriodo = recebimentos.filter((r) => r.data >= periodo.inicio && r.data <= periodo.fim)
  const recebidoPeriodo = totalRecebido(noPeriodo)
  const recebidoMes = totalRecebido(recebimentos.filter((r) => r.data >= mes.inicio && r.data <= mes.fim))
  const media = noPeriodo.length > 0 ? Math.round((recebidoPeriodo * 100) / noPeriodo.length) / 100 : 0

  // Busca: cliente, nº do contrato (nº do orçamento de origem) e descrição da parcela.
  const termo = normalizar(q).replace(/^#/, '')
  const soDigitos = /^\d+$/.test(termo)
  const visiveis = ordenar(
    linhas.filter((l) => {
      if (l.r.data < periodo.inicio || l.r.data > periodo.fim) return false
      if (forma && l.r.forma_pagamento !== forma) return false
      if (!termo) return true
      // Só dígitos (ou "#12") é número de contrato: não casa com o "1" de "Parcela 1/2".
      if (soDigitos) return l.contratoNumero === Number(termo)
      return l.textoBusca.includes(termo)
    }),
    ordem
  )

  const atuais: Params = {
    periodo: periodo.chave,
    de: periodo.chave === 'personalizado' ? periodo.inicio : undefined,
    ate: periodo.chave === 'personalizado' ? periodo.fim : undefined,
    q,
    forma,
    ordem,
  }
  const pilula = (ativa: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      ativa ? 'bg-indigo-600 text-white' : 'border border-black/[.08] bg-white text-zinc-600 hover:bg-black/[.04]'
    }`
  const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">Recebimentos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pagamentos registrados nas parcelas · {formatarDataBR(periodo.inicio)} a {formatarDataBR(periodo.fim)} (horário de Brasília)
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Período">
          {PERIODOS_RECEBIMENTOS.filter((p) => p.value !== 'personalizado').map((p) => (
            <Link key={p.value} href={montarHref({ ...atuais, periodo: p.value })} className={pilula(periodo.chave === p.value)}>
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          {q && <input type="hidden" name="q" value={q} />}
          {forma && <input type="hidden" name="forma" value={forma} />}
          {ordem !== 'recentes' && <input type="hidden" name="ordem" value={ordem} />}
          <span className={pilula(periodo.chave === 'personalizado')}>Personalizado</span>
          <input type="date" name="de" defaultValue={atuais.de ?? ''} required className={campo} aria-label="Data inicial" />
          <input type="date" name="ate" defaultValue={atuais.ate ?? ''} required className={campo} aria-label="Data final" />
          <button type="submit" className="rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
            Aplicar
          </button>
        </form>
        {periodo.erro && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{periodo.erro}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardIndicador titulo="Recebido no período" valor={formatarBRL(recebidoPeriodo)} tom="verde" detalhe="Pagamentos com data no período" />
        <CardIndicador titulo="Recebido neste mês" valor={formatarBRL(recebidoMes)} tom="roxo" detalhe={`${formatarDataBR(mes.inicio)} a ${formatarDataBR(mes.fim)}`} />
        <CardIndicador titulo="Recebimentos no período" valor={String(noPeriodo.length)} detalhe="Quantidade de pagamentos" />
        <CardIndicador
          titulo="Valor médio no período"
          valor={formatarBRL(media)}
          detalhe={noPeriodo.length > 0 ? 'Recebido no período ÷ quantidade' : 'Nenhum recebimento no período'}
        />
      </div>

      <div className="flex flex-col gap-4">
        <form className="flex w-full flex-wrap gap-2">
          {periodo.chave !== 'mes' && <input type="hidden" name="periodo" value={periodo.chave} />}
          {atuais.de && <input type="hidden" name="de" value={atuais.de} />}
          {atuais.ate && <input type="hidden" name="ate" value={atuais.ate} />}
          {ordem !== 'recentes' && <input type="hidden" name="ordem" value={ordem} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cliente, nº do contrato ou parcela"
            aria-label="Buscar recebimentos"
            className={`${campo} min-w-0 flex-1 basis-56`}
          />
          <select name="forma" defaultValue={forma} aria-label="Forma de pagamento" className={campo}>
            <option value="">Todas as formas</option>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label="Ordenação">
          <span className="text-zinc-500">Ordenar por:</span>
          {ORDENS.map((o) => (
            <Link
              key={o.value}
              href={montarHref({ ...atuais, ordem: o.value })}
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
              <p className="text-sm font-medium text-zinc-950">Nenhum recebimento registrado.</p>
              <p className="mt-1 text-sm text-zinc-500">Os pagamentos aparecerão aqui quando forem lançados nas parcelas.</p>
              <Link href="/parcelas" className={`${botaoVer} mt-4`}>
                Ver parcelas
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-950">Nenhum recebimento encontrado.</p>
              <p className="mt-1 text-sm text-zinc-500">Ajuste o período, a busca ou a forma de pagamento.</p>
              <Link href="/recebimentos" className={`${botaoVer} mt-4`}>
                Limpar filtros
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {visiveis.length} {visiveis.length === 1 ? 'recebimento' : 'recebimentos'} · {formatarBRL(totalRecebido(visiveis.map((l) => l.r)))}
          </p>

          {/* Telas largas (a partir de 1400px, já com o menu lateral): tabela. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1400px]:block">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:align-bottom">
              <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
                <tr>
                  <th className="py-3 font-medium">Data</th>
                  <th className="py-3 font-medium">Cliente</th>
                  <th className="py-3 font-medium" title="Número do orçamento de origem: contratos não têm numeração própria">
                    Contrato
                  </th>
                  <th className="py-3 font-medium">Parcela</th>
                  <th className="py-3 text-right font-medium">Valor</th>
                  <th className="py-3 font-medium">Forma</th>
                  <th className="py-3 font-medium">Observação</th>
                  <th className="py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.r.id} className="border-t border-black/[.06] hover:bg-zinc-50/60">
                    <td className="whitespace-nowrap py-3 text-zinc-950">{formatarDataBR(l.r.data)}</td>
                    <td className="py-3 text-zinc-950">{l.cliente}</td>
                    <td className="py-3 text-zinc-600">
                      <span className="whitespace-nowrap">{l.contratoNumero ? `#${l.contratoNumero}` : '—'}</span>
                      {l.contratoCancelado && (
                        <span className="mt-1 block">
                          <Selo classes={seloCancelado}>Contrato cancelado</Selo>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 text-zinc-600">{l.parcela}</td>
                    <td className="whitespace-nowrap py-3 text-right font-medium text-green-700">{formatarBRL(Number(l.r.valor))}</td>
                    <td className="whitespace-nowrap py-3 text-zinc-600">{labelFormaPagamento(l.r.forma_pagamento)}</td>
                    <td className="max-w-[14rem] py-3 text-zinc-500">
                      <span className="block truncate" title={l.r.observacoes ?? undefined}>
                        {l.r.observacoes || '—'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {l.contratoId && (
                        <Link href={`/contratos/${l.contratoId}`} className={botaoVer}>
                          Ver contrato
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telas menores (inclui celular): um card por recebimento, sem rolagem horizontal. */}
          <ul className="grid gap-4 sm:grid-cols-2 min-[1400px]:hidden">
            {visiveis.map((l) => (
              <li key={l.r.id} className="flex flex-col gap-3 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500">
                      {formatarDataBR(l.r.data)} · Contrato {l.contratoNumero ? `#${l.contratoNumero}` : '—'}
                    </p>
                    <p className="truncate text-base font-semibold text-zinc-950">{l.cliente}</p>
                    <p className="truncate text-sm text-zinc-500">
                      {l.parcela} · {labelFormaPagamento(l.r.forma_pagamento)}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-semibold text-green-700">{formatarBRL(Number(l.r.valor))}</p>
                </div>
                {l.r.observacoes && <p className="break-words text-sm text-zinc-500">{l.r.observacoes}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {l.contratoCancelado ? <Selo classes={seloCancelado}>Contrato cancelado</Selo> : <span />}
                  {l.contratoId && (
                    <Link href={`/contratos/${l.contratoId}`} className={botaoVer}>
                      Ver contrato
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
