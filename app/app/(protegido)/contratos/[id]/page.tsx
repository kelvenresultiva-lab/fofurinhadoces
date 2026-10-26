import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Check, ChevronRight, CircleAlert, Mail, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, formatarDataHoraBR, diasEntre, hojeISO } from '../../eventos/datas'
import { labelTipo } from '../../eventos/opcoes'
import { formatarBRL } from '../../dashboard/widgets'
import {
  parcelasEmAberto,
  resumoFuturo,
  saldoParcela,
  situacaoHistorica,
  situacaoParcela,
  totalRecebido,
} from '../../financeiro/calculos'
import CancelarContrato from './CancelarContrato'
import RegistrarPagamento from './RegistrarPagamento'
import {
  labelStatusContrato,
  classesStatusContrato,
  labelStatusParcela,
  classesStatusParcela,
  labelFormaPagamento,
} from '../opcoes'

const ABAS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'parcelas', label: 'Parcelas' },
  { value: 'pagamentos', label: 'Pagamentos' },
  { value: 'observacoes', label: 'Observações' },
] as const

const cartao = 'rounded-2xl border border-black/[.06] bg-white shadow-sm'

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block w-fit whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

function Metrica({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className="mt-0.5 whitespace-nowrap text-base font-semibold text-zinc-950">{children}</dd>
    </div>
  )
}

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string; aba?: string }>
}) {
  const { id } = await params
  const { erro, sucesso, aba: abaParam } = await searchParams
  const aba = ABAS.find((a) => a.value === abaParam)?.value ?? 'parcelas'
  const hoje = hojeISO()
  const supabase = await createClient()

  const { data: contrato, error: erroContrato } = await supabase.from('contratos').select('*').eq('id', id).maybeSingle()
  if (erroContrato) throw new Error('Falha ao ler o contrato.')
  if (!contrato) notFound()

  const [eventoR, orcamentoR, itensR, parcelasR] = await Promise.all([
    supabase.from('eventos').select('id, tipo, titulo, data, cliente_id').eq('id', contrato.evento_id).maybeSingle(),
    supabase.from('orcamentos').select('id, numero').eq('contrato_id', id).maybeSingle(),
    supabase.from('contrato_itens').select('id, produto_id, quantidade, valor_unitario, subtotal, status_producao').eq('contrato_id', id).order('created_at'),
    supabase.from('parcelas').select('id, contrato_id, numero, descricao, vencimento, valor, valor_pago, status').eq('contrato_id', id).order('numero'),
  ])
  if (eventoR.error || orcamentoR.error || itensR.error || parcelasR.error) throw new Error('Falha ao ler o contrato.')
  const evento = eventoR.data
  const orcamento = orcamentoR.data
  const itens = itensR.data ?? []
  const listaParcelas = parcelasR.data ?? []

  const cliente = evento
    ? (await supabase.from('clientes').select('id, nome, email, telefone, whatsapp').eq('id', evento.cliente_id).maybeSingle()).data
    : null
  const responsavelCancelamento =
    contrato.status === 'cancelado' && contrato.cancelado_por
      ? (await supabase.from('usuarios').select('nome, email').eq('id', contrato.cancelado_por).maybeSingle()).data
      : null

  const idsProdutos = [...new Set(itens.map((i) => i.produto_id))]
  const { data: produtos } =
    idsProdutos.length > 0 ? await supabase.from('produtos').select('id, nome').in('id', idsProdutos) : { data: [] }
  const nomeProdutoPorId = new Map((produtos ?? []).map((p) => [p.id, p.nome]))

  const idsParcelas = listaParcelas.map((p) => p.id)
  const recebimentosR =
    idsParcelas.length > 0
      ? await supabase
          .from('recebimentos')
          .select('id, parcela_id, valor, data, forma_pagamento, observacoes')
          .in('parcela_id', idsParcelas)
          .order('data', { ascending: false })
      : { data: [] as { id: string; parcela_id: string; valor: number; data: string; forma_pagamento: string; observacoes: string | null }[], error: null }
  if (recebimentosR.error) throw new Error('Falha ao ler os recebimentos.')
  const recebimentos = recebimentosR.data ?? []
  const recebimentosPorParcela = new Map<string, typeof recebimentos>()
  for (const r of recebimentos) {
    const lista = recebimentosPorParcela.get(r.parcela_id) ?? []
    lista.push(r)
    recebimentosPorParcela.set(r.parcela_id, lista)
  }
  const numeroParcelaPorId = new Map(listaParcelas.map((p) => [p.id, p.descricao ?? `Parcela ${p.numero}`]))

  // Contrato cancelado = visão histórica, não cobrança. Valor futuro pela regra central
  // (financeiro/calculos.ts): sem parcela em aberto não há próxima parcela, atraso nem previsão.
  const cancelado = contrato.status === 'cancelado'
  const abertas = parcelasEmAberto(listaParcelas, [contrato])
  const idsAbertas = new Set(abertas.map((p) => p.id))
  const proximaParcela = [...abertas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
  const futuro = resumoFuturo(abertas, hoje)
  const previsao = abertas.filter((p) => p.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const recebidoTotal = totalRecebido(recebimentos)
  const valorContrato = Number(contrato.valor_final)
  const pct = (v: number) => (valorContrato > 0 ? Math.min(100, Math.max(0, (v / valorContrato) * 100)) : 0)
  const pctRecebido = pct(recebidoTotal)
  const pctAtraso = pct(futuro.emAtraso)
  const pctConcluido = Math.round(pctRecebido)
  const rosca = cancelado
    ? `conic-gradient(#16a34a 0 ${pctRecebido}%, #e5e7eb ${pctRecebido}% 100%)`
    : `conic-gradient(#16a34a 0 ${pctRecebido}%, #ef4444 ${pctRecebido}% ${pctRecebido + pctAtraso}%, #6366f1 ${pctRecebido + pctAtraso}% 100%)`

  const titulo = evento ? evento.titulo || labelTipo(evento.tipo) : 'Contrato'
  const numeroContrato = orcamento ? `#${orcamento.numero}` : null
  const parcelaEntrada = listaParcelas.find((p) => p.descricao === 'Entrada')
  const normais = listaParcelas.filter((p) => p.descricao !== 'Entrada')
  const uniforme = normais.length > 0 && normais.every((p) => Number(p.valor) === Number(normais[0].valor))
  const parcelado = normais.length === 0 ? '—' : uniforme ? `${normais.length}x de ${formatarBRL(Number(normais[0].valor))}` : `${normais.length} parcelas`
  const vencimentoFinal = listaParcelas.map((p) => p.vencimento).sort().at(-1)
  const criadoEm = formatarDataHoraBR(contrato.created_at).split(' às ')[0]
  const iniciais = (cliente?.nome ?? '?').split(' ').filter(Boolean).slice(0, 2).map((parte: string) => parte[0].toUpperCase()).join('')
  const telefone = cliente?.whatsapp || cliente?.telefone

  const linhas = listaParcelas.map((p) => {
    const vencida = idsAbertas.has(p.id) && !!situacaoParcela(p)
    const historica = situacaoHistorica(p, cancelado)
    const selo = vencida
      ? { label: 'Em atraso', classes: 'bg-red-50 text-red-700' }
      : historica
        ? { label: historica.label, classes: historica.classes }
        : { label: labelStatusParcela(p.status), classes: classesStatusParcela(p.status) }
    return {
      p,
      vencida,
      historica,
      selo,
      recs: recebimentosPorParcela.get(p.id) ?? [],
      aberta: idsAbertas.has(p.id),
      dias: vencida ? diasEntre(p.vencimento, hoje) : 0,
      titulo: p.descricao ?? `Parcela ${p.numero}`,
    }
  })
  const corLinha = (l: (typeof linhas)[number]) =>
    l.vencida ? 'bg-red-500' : l.p.status === 'pago' ? 'bg-green-500' : l.p.status === 'parcial' ? 'bg-amber-500' : 'bg-zinc-300'
  const corTrecho = (l: (typeof linhas)[number]) => (l.vencida ? 'bg-red-300' : l.p.status === 'pago' ? 'bg-green-400' : 'bg-zinc-200')

  const hrefAba = (valor: string) => `/contratos/${id}?aba=${valor}`
  const textoPrazo = (data: string) => {
    const d = diasEntre(hoje, data)
    if (d < 0) return { texto: `Venceu há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, classes: 'bg-red-50 text-red-700' }
    if (d === 0) return { texto: 'Vence hoje', classes: 'bg-amber-50 text-amber-700' }
    return { texto: `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}`, classes: 'bg-zinc-100 text-zinc-600' }
  }

  const linhasRecebimento = (recs: typeof recebimentos) =>
    recs.map((r) => (
      <p key={r.id} className="text-xs text-zinc-600">
        <span className="font-medium text-zinc-950">{formatarBRL(Number(r.valor))}</span> — {formatarDataBR(r.data)} — {labelFormaPagamento(r.forma_pagamento)}
        {r.observacoes ? ` — ${r.observacoes}` : ''}
      </p>
    ))

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Navegação" className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/contratos" className="inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Contratos
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-semibold text-zinc-950">Contrato {numeroContrato ?? ''}</span>
      </nav>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {sucesso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{sucesso}</p>}

      <div className={`${cartao} flex flex-col gap-6 p-6 xl:flex-row xl:items-center`}>
        <div className="flex items-start gap-4 xl:w-[22rem] xl:shrink-0">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl font-semibold text-indigo-700">
            {iniciais}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-950">
                {cliente ? (
                  <Link href={`/clientes/${cliente.id}`} className="hover:text-indigo-700">
                    {cliente.nome}
                  </Link>
                ) : (
                  titulo
                )}
              </h1>
              <Selo classes={classesStatusContrato(contrato.status)}>{labelStatusContrato(contrato.status)}</Selo>
            </div>
            {evento && (
              <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
                <CalendarDays className="h-4 w-4 text-zinc-400" />
                <Link href={`/eventos/${evento.id}`} className="hover:text-indigo-700">
                  {titulo}
                </Link>
                <span aria-hidden>•</span>
                {formatarDataBR(evento.data)}
              </p>
            )}
            {cliente?.email && (
              <p className="mt-1 flex items-center gap-2 break-all text-sm text-zinc-600">
                <Mail className="h-4 w-4 shrink-0 text-zinc-400" />
                {cliente.email}
              </p>
            )}
            {telefone && (
              <p className="mt-1 flex items-center gap-2 text-sm text-zinc-600">
                <Phone className="h-4 w-4 shrink-0 text-zinc-400" />
                {telefone}
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 xl:flex-1 xl:border-l xl:border-black/[.06] xl:pl-8">
          <Metrica rotulo={cancelado ? 'Valor original' : 'Valor total'}>{formatarBRL(valorContrato)}</Metrica>
          <Metrica rotulo={cancelado ? 'Entrada original' : 'Entrada'}>{parcelaEntrada ? formatarBRL(Number(parcelaEntrada.valor)) : '—'}</Metrica>
          <Metrica rotulo={cancelado ? 'Parcelas originais' : 'Parcelado'}>{cancelado ? String(listaParcelas.length) : parcelado}</Metrica>
          <Metrica rotulo="Contrato criado em">{criadoEm}</Metrica>
          <Metrica rotulo="Orçamento">
            {orcamento ? (
              <Link href={`/orcamentos/${orcamento.id}`} className="text-indigo-700 hover:underline">
                #{orcamento.numero}
              </Link>
            ) : (
              '—'
            )}
          </Metrica>
          <Metrica rotulo={cancelado ? 'Último vencimento original' : 'Vencimento final'}>{vencimentoFinal ? formatarDataBR(vencimentoFinal) : '—'}</Metrica>
        </dl>

        {!cancelado && (
          <div className="flex flex-wrap items-center gap-3 xl:flex-col xl:items-stretch">
            {proximaParcela && (
              <RegistrarPagamento
                parcelaId={proximaParcela.id}
                instancia="cabecalho"
                contratoId={contrato.id}
                titulo={proximaParcela.descricao ?? `Parcela ${proximaParcela.numero}`}
                saldo={formatarBRL(saldoParcela(proximaParcela)).replace('R$', '').trim()}
                variante="cabecalho"
                texto="Receber pagamento"
              />
            )}
            <CancelarContrato contratoId={contrato.id} />
          </div>
        )}
      </div>

      {cancelado && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-base font-semibold text-red-800">Contrato cancelado</h2>
          <p className="mt-1 text-sm text-red-700">
            Esta página é apenas o registro histórico do contrato. As parcelas não pagas foram encerradas junto com ele e não entram em
            cobrança, atraso nem previsão de recebimento. Os recebimentos já registrados continuam preservados abaixo.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-red-700/80">Cancelado em</dt>
              <dd className="font-medium text-red-900">{contrato.cancelado_em ? formatarDataHoraBR(contrato.cancelado_em) : 'Data não registrada'}</dd>
            </div>
            <div>
              <dt className="text-xs text-red-700/80">Cancelado por</dt>
              <dd className="font-medium text-red-900">{responsavelCancelamento?.nome || responsavelCancelamento?.email || 'Usuário não identificado'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-red-700/80">Motivo</dt>
              <dd className="whitespace-pre-line font-medium text-red-900">{contrato.motivo_cancelamento || 'Motivo não registrado'}</dd>
            </div>
          </dl>
        </div>
      )}

      <nav aria-label="Seções do contrato" className="flex gap-1 overflow-x-auto border-b border-black/[.08]">
        {ABAS.map((a) => (
          <Link
            key={a.value}
            href={hrefAba(a.value)}
            aria-current={aba === a.value ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              aba === a.value ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {aba === 'parcelas' && (
            <>
              <section className={`${cartao} p-5`}>
                <h2 className="text-base font-semibold text-zinc-950">Parcelas do contrato</h2>
                {linhas.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">Nenhuma parcela registrada.</p>
                ) : (
                  <>
                    <div className="mt-4 hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 text-xs text-zinc-500">
                          <tr>
                            <th className="rounded-l-lg px-3 py-2.5 font-medium">#</th>
                            <th className="px-3 py-2.5 font-medium">Descrição</th>
                            <th className="px-3 py-2.5 font-medium">Vencimento</th>
                            <th className="px-3 py-2.5 font-medium">Valor</th>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                            <th className="px-3 py-2.5 font-medium">Pago em</th>
                            <th className="rounded-r-lg px-3 py-2.5 text-right font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((l) => (
                            <Fragment key={l.p.id}>
                              <tr className={`border-t border-black/[.06] align-top ${l.vencida ? 'bg-red-50/60' : ''}`}>
                                <td className="px-3 py-3 text-zinc-500">{l.p.numero}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-medium text-zinc-950">{l.titulo}</td>
                                <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                                  {formatarDataBR(l.p.vencimento)}
                                  {l.vencida && <span className="block text-xs text-red-600">{l.dias} {l.dias === 1 ? 'dia' : 'dias'} em atraso</span>}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 font-medium text-zinc-950">{formatarBRL(Number(l.p.valor))}</td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-col gap-1">
                                    <Selo classes={l.selo.classes}>
                                      {l.p.status === 'pago' && <Check className="mr-1 inline h-3 w-3" />}
                                      {l.selo.label}
                                    </Selo>
                                    {l.historica?.pagoParcialmente && <span className="text-xs text-zinc-500">Pagamento parcial preservado</span>}
                                  </div>
                                </td>
                                <td className="px-3 py-3">{l.recs.length > 0 ? <div className="flex flex-col gap-0.5">{linhasRecebimento(l.recs)}</div> : <span className="text-zinc-400">—</span>}</td>
                                <td className="px-3 py-3 text-right">
                                  {!cancelado && l.aberta && (
                                    <RegistrarPagamento parcelaId={l.p.id} instancia="linha" contratoId={contrato.id} titulo={l.titulo} saldo={formatarBRL(saldoParcela(l.p)).replace('R$', '').trim()} variante="linha" />
                                  )}
                                </td>
                              </tr>
                              {l.vencida && (
                                <tr className="bg-red-50/60">
                                  <td colSpan={7} className="px-3 pb-3">
                                    <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                      <CircleAlert className="h-4 w-4 shrink-0" />
                                      Esta parcela venceu há {l.dias} {l.dias === 1 ? 'dia' : 'dias'}.
                                    </p>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <ul className="mt-4 flex flex-col gap-3 md:hidden">
                      {linhas.map((l) => (
                        <li key={l.p.id} className={`flex flex-col gap-2 rounded-xl border p-3 ${l.vencida ? 'border-red-200 bg-red-50/60' : 'border-black/[.06]'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-zinc-950">{l.titulo}</p>
                              <p className="text-xs text-zinc-500">
                                {formatarDataBR(l.p.vencimento)}
                                {l.vencida && <span className="text-red-600"> · {l.dias} {l.dias === 1 ? 'dia' : 'dias'} em atraso</span>}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-zinc-950">{formatarBRL(Number(l.p.valor))}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Selo classes={l.selo.classes}>{l.selo.label}</Selo>
                            {l.historica?.pagoParcialmente && <span className="text-xs text-zinc-500">Pagamento parcial preservado</span>}
                          </div>
                          {l.recs.length > 0 && <div className="flex flex-col gap-0.5">{linhasRecebimento(l.recs)}</div>}
                          {!cancelado && l.aberta && (
                            <div>
                              <RegistrarPagamento parcelaId={l.p.id} instancia="cartao" contratoId={contrato.id} titulo={l.titulo} saldo={formatarBRL(saldoParcela(l.p)).replace('R$', '').trim()} variante="linha" />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {linhas.length > 0 && (
                <section id="linha-do-tempo" className={`${cartao} p-5`}>
                  <h2 className="text-base font-semibold text-zinc-950">Linha do tempo de pagamentos</h2>
                  <ol className="mt-5 flex overflow-x-auto pb-2">
                    {linhas.map((l, i) => (
                      <li key={l.p.id} className="flex min-w-28 flex-1 flex-col items-center text-center text-xs">
                        <div className="flex w-full items-center">
                          <span className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : corTrecho(linhas[i - 1])}`} />
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${corLinha(l)}`}>
                            {l.p.status === 'pago' ? <Check className="h-4 w-4" /> : l.vencida ? <span className="font-bold">!</span> : null}
                          </span>
                          <span className={`h-0.5 flex-1 ${i === linhas.length - 1 && !cancelado ? 'invisible' : corTrecho(l)}`} />
                        </div>
                        <span className="mt-2 text-zinc-500">{formatarDataBR(l.p.vencimento)}</span>
                        <span className="font-medium text-zinc-950">{l.titulo}</span>
                        <span className="text-zinc-600">{formatarBRL(Number(l.p.valor))}</span>
                        {l.vencida && <span className="font-medium text-red-600">Atrasada</span>}
                        {l.historica && <span className="text-[10px] text-zinc-500">{l.historica.label}</span>}
                      </li>
                    ))}
                    {cancelado && (
                      <li className="flex min-w-28 flex-1 flex-col items-center text-center text-xs">
                        <div className="flex w-full items-center">
                          <span className="h-0.5 flex-1 bg-zinc-200" />
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                            <span className="font-bold">×</span>
                          </span>
                          <span className="h-0.5 flex-1 invisible" />
                        </div>
                        <span className="mt-2 text-zinc-500">Encerramento</span>
                        <span className="font-medium text-red-700">Contrato cancelado</span>
                      </li>
                    )}
                  </ol>
                </section>
              )}
            </>
          )}

          {aba === 'resumo' && (
            <section className={`${cartao} flex flex-col gap-4 p-5`}>
              <h2 className="text-base font-semibold text-zinc-950">Itens contratados</h2>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                Contrato é um documento comercial fechado, gerado a partir do orçamento aprovado — os itens e valores abaixo são histórico e não podem ser editados por aqui.
              </p>
              {itens.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum item registrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-500">
                      <tr>
                        <th className="rounded-l-lg px-3 py-2.5 font-medium">Produto</th>
                        <th className="px-3 py-2.5 font-medium">Quantidade</th>
                        <th className="px-3 py-2.5 font-medium">Unitário</th>
                        <th className="px-3 py-2.5 font-medium">Subtotal</th>
                        <th className="rounded-r-lg px-3 py-2.5 font-medium">Produção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item) => (
                        <tr key={item.id} className="border-t border-black/[.06]">
                          <td className="px-3 py-3 text-zinc-950">{nomeProdutoPorId.get(item.produto_id) ?? '—'}</td>
                          <td className="px-3 py-3 text-zinc-600">{item.quantidade}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{formatarBRL(Number(item.valor_unitario))}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium text-zinc-950">{formatarBRL(Number(item.subtotal))}</td>
                          <td className="px-3 py-3 text-zinc-600">{item.status_producao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <dl className="grid gap-3 rounded-xl border border-black/[.06] p-4 text-sm sm:grid-cols-3">
                <Metrica rotulo="Subtotal">{formatarBRL(Number(contrato.valor_total))}</Metrica>
                <Metrica rotulo="Desconto">{formatarBRL(Number(contrato.desconto))}</Metrica>
                <Metrica rotulo={cancelado ? 'Valor original do contrato' : 'Valor do contrato'}>{formatarBRL(valorContrato)}</Metrica>
              </dl>
            </section>
          )}

          {aba === 'pagamentos' && (
            <section className={`${cartao} p-5`}>
              <h2 className="text-base font-semibold text-zinc-950">Histórico de recebimentos</h2>
              {recebimentos.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">Nenhum pagamento registrado.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-500">
                      <tr>
                        <th className="rounded-l-lg px-3 py-2.5 font-medium">Data</th>
                        <th className="px-3 py-2.5 font-medium">Parcela</th>
                        <th className="px-3 py-2.5 font-medium">Valor</th>
                        <th className="px-3 py-2.5 font-medium">Forma</th>
                        <th className="rounded-r-lg px-3 py-2.5 font-medium">Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recebimentos.map((r) => (
                        <tr key={r.id} className="border-t border-black/[.06]">
                          <td className="whitespace-nowrap px-3 py-3 text-zinc-700">{formatarDataBR(r.data)}</td>
                          <td className="px-3 py-3 text-zinc-700">{numeroParcelaPorId.get(r.parcela_id) ?? '—'}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium text-green-700">{formatarBRL(Number(r.valor))}</td>
                          <td className="px-3 py-3 text-zinc-700">{labelFormaPagamento(r.forma_pagamento)}</td>
                          <td className="px-3 py-3 text-zinc-500">{r.observacoes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {aba === 'observacoes' && (
            <section className={`${cartao} p-5`}>
              <h2 className="text-base font-semibold text-zinc-950">Observações</h2>
              <p className="mt-3 whitespace-pre-line text-sm text-zinc-700">{contrato.observacoes || 'Nenhuma observação neste contrato.'}</p>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className={`${cartao} p-5`}>
            <h2 className="mb-4 text-sm font-semibold text-zinc-950">Resumo do contrato</h2>
            <div className="flex items-center gap-5">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: rosca }}>
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-xl font-semibold text-zinc-950">{pctConcluido}%</span>
                  <span className="text-[10px] text-zinc-500">{cancelado ? 'recebido' : 'concluído'}</span>
                </div>
              </div>
              <dl className="flex flex-1 flex-col gap-2 text-xs">
                {cancelado && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1.5 text-zinc-500">
                      <span className="h-2.5 w-2.5 rounded-sm bg-zinc-300" />
                      Valor original
                    </dt>
                    <dd className="font-medium text-zinc-950">{formatarBRL(valorContrato)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-zinc-500">
                    <span className="h-2.5 w-2.5 rounded-sm bg-green-600" />
                    Recebido
                  </dt>
                  <dd className="font-medium text-green-700">{formatarBRL(recebidoTotal)}</dd>
                </div>
                {!cancelado && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-zinc-500">
                        <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />A receber
                      </dt>
                      <dd className="font-medium text-zinc-950">{formatarBRL(futuro.aVencer)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-zinc-500">
                        <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                        Em atraso
                      </dt>
                      <dd className="font-medium text-red-700">{formatarBRL(futuro.emAtraso)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-green-50 px-4 py-3">
              <div>
                <p className="text-xs text-green-800">Valor recebido</p>
                <p className="text-lg font-semibold text-green-800">{formatarBRL(recebidoTotal)}</p>
              </div>
              <Link href={`/contratos/${id}?aba=parcelas#linha-do-tempo`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
                Ver timeline <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className={`${cartao} p-5`}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-950">{cancelado ? 'Situação do contrato' : 'Próxima parcela'}</h2>
            {cancelado ? (
              <p className="text-sm text-zinc-600">Contrato cancelado. Nenhuma parcela em cobrança.</p>
            ) : proximaParcela ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                  <CalendarDays className="h-4 w-4 text-zinc-400" />
                  {formatarDataBR(proximaParcela.vencimento)}
                  <Selo classes={textoPrazo(proximaParcela.vencimento).classes}>{textoPrazo(proximaParcela.vencimento).texto}</Selo>
                </div>
                <p className="text-sm text-zinc-500">{proximaParcela.descricao ?? `Parcela ${proximaParcela.numero}`}</p>
                <p className="text-2xl font-semibold text-zinc-950">{formatarBRL(saldoParcela(proximaParcela))}</p>
                <div className="mt-2">
                  <RegistrarPagamento
                    parcelaId={proximaParcela.id}
                    instancia="proxima"
                    contratoId={contrato.id}
                    titulo={proximaParcela.descricao ?? `Parcela ${proximaParcela.numero}`}
                    saldo={formatarBRL(saldoParcela(proximaParcela)).replace('R$', '').trim()}
                    variante="principal"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Nenhuma parcela em aberto.</p>
            )}
          </div>

          {!cancelado && (
            <div className={`${cartao} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-zinc-950">Previsão de recebimentos</h2>
              {previsao.length === 0 ? (
                <p className="text-sm text-zinc-600">Nenhum recebimento previsto.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2 text-sm">
                    {previsao.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="text-zinc-700">{formatarDataBR(p.vencimento)}</span>
                        <span className="text-xs text-zinc-500">{p.descricao ?? `Parcela ${p.numero}`}</span>
                        <span className="font-medium text-zinc-950">{formatarBRL(saldoParcela(p))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between border-t border-black/[.06] pt-3 text-sm">
                    <span className="text-zinc-600">Total a receber</span>
                    <span className="font-semibold text-indigo-700">{formatarBRL(futuro.aVencer)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {contrato.observacoes && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-950">Observações</h2>
              <p className="whitespace-pre-line text-sm text-zinc-700">{contrato.observacoes}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
