import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatarPrecoParaExibicao } from '../../produtos/preco'
import { formatarDataBR } from '../../eventos/datas'
import { labelTipo } from '../../eventos/opcoes'
import { registrarRecebimento } from '../../financeiro/actions'
import { ehVencida, situacaoParcela } from '../../financeiro/calculos'
import {
  labelStatusContrato,
  classesStatusContrato,
  labelStatusParcela,
  classesStatusParcela,
} from '../opcoes'

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'outros', label: 'Outros' },
] as const

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { id } = await params
  const { erro, sucesso } = await searchParams
  const supabase = await createClient()

  const { data: contrato } = await supabase.from('contratos').select('*').eq('id', id).maybeSingle()

  if (!contrato) {
    notFound()
  }

  const [{ data: evento }, { data: orcamento }, { data: itens }, { data: parcelas }] = await Promise.all([
    supabase.from('eventos').select('id, tipo, titulo, data, cliente_id').eq('id', contrato.evento_id).maybeSingle(),
    supabase.from('orcamentos').select('id, numero').eq('contrato_id', id).maybeSingle(),
    supabase
      .from('contrato_itens')
      .select('id, produto_id, quantidade, valor_unitario, subtotal, status_producao')
      .eq('contrato_id', id)
      .order('created_at'),
    supabase.from('parcelas').select('id, numero, descricao, vencimento, valor, valor_pago, status').eq('contrato_id', id).order('numero'),
  ])

  const cliente = evento
    ? (await supabase.from('clientes').select('id, nome, email, telefone, whatsapp').eq('id', evento.cliente_id).maybeSingle()).data
    : null

  const idsProdutos = [...new Set((itens ?? []).map((i) => i.produto_id))]
  const { data: produtos } =
    idsProdutos.length > 0 ? await supabase.from('produtos').select('id, nome').in('id', idsProdutos) : { data: [] }
  const nomeProdutoPorId = new Map((produtos ?? []).map((p) => [p.id, p.nome]))

  const idsParcelas = (parcelas ?? []).map((p) => p.id)
  const { data: recebimentos } =
    idsParcelas.length > 0
      ? await supabase
          .from('recebimentos')
          .select('id, parcela_id, valor, data, forma_pagamento, observacoes')
          .in('parcela_id', idsParcelas)
          .order('data', { ascending: false })
      : { data: [] as { id: string; parcela_id: string; valor: number; data: string; forma_pagamento: string; observacoes: string | null }[] }

  const recebimentosPorParcela = new Map<string, typeof recebimentos>()
  for (const r of recebimentos ?? []) {
    const lista = recebimentosPorParcela.get(r.parcela_id) ?? []
    lista.push(r)
    recebimentosPorParcela.set(r.parcela_id, lista)
  }

  const totalRecebido = (recebimentos ?? []).reduce((soma, r) => soma + Number(r.valor), 0)
  const saldoContrato = Number(contrato.valor_final) - totalRecebido

  const titulo = evento ? evento.titulo || labelTipo(evento.tipo) : 'Contrato'

  const listaParcelas = parcelas ?? []
  const saldoDe = (p: { valor: number | string; valor_pago: number | string }) => Number(p.valor) - Number(p.valor_pago)
  const proximaParcela = listaParcelas
    .filter((p) => p.status !== 'cancelado' && saldoDe(p) > 0)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
  const saldoEmAtraso = listaParcelas
    .filter((p) => ehVencida(p.vencimento, saldoDe(p), p.status))
    .reduce((soma, p) => soma + saldoDe(p), 0)
  const valorContrato = Number(contrato.valor_final)
  const percentualRecebido = valorContrato > 0 ? Math.min(100, Math.round((totalRecebido / valorContrato) * 100)) : 0
  const parcelaEntrada = listaParcelas.find((p) => p.descricao === 'Entrada')
  const vencimentoFinal = listaParcelas.map((p) => p.vencimento).sort().at(-1)
  const iniciaisCliente = (cliente?.nome ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte: string) => parte[0].toUpperCase())
    .join('')
  const inputClasses =
    'rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50'
  const labelClasses = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-black/[.06] bg-white p-6 shadow-sm dark:border-white/[.1] dark:bg-zinc-950">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {iniciaisCliente}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Contrato — {titulo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            {cliente && (
              <span>
                Cliente:{' '}
                <Link href={`/clientes/${cliente.id}`} className="font-medium text-zinc-950 underline dark:text-zinc-50">
                  {cliente.nome}
                </Link>
              </span>
            )}
            {evento && (
              <span>
                Evento:{' '}
                <Link href={`/eventos/${evento.id}`} className="font-medium text-zinc-950 underline dark:text-zinc-50">
                  {titulo} — {formatarDataBR(evento.data)}
                </Link>
              </span>
            )}
            {orcamento && (
              <span>
                Orçamento de origem:{' '}
                <Link
                  href={`/orcamentos/${orcamento.id}`}
                  className="font-medium text-zinc-950 underline dark:text-zinc-50"
                >
                  #{orcamento.numero}
                </Link>
              </span>
            )}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${classesStatusContrato(contrato.status)}`}>
          {labelStatusContrato(contrato.status)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-black/[.06] bg-white p-6 shadow-sm sm:grid-cols-4 dark:border-white/[.1] dark:bg-zinc-950">
        <div>
          <dt className="text-xs text-zinc-500">Valor total</dt>
          <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            R$ {formatarPrecoParaExibicao(contrato.valor_final)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Entrada</dt>
          <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {parcelaEntrada ? `R$ ${formatarPrecoParaExibicao(parcelaEntrada.valor)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Parcelas</dt>
          <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{listaParcelas.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Vencimento final</dt>
          <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {vencimentoFinal ? formatarDataBR(vencimentoFinal) : '—'}
          </dd>
        </div>
        <div className="col-span-2 text-xs text-zinc-500 sm:col-span-4">
          Contrato criado em {new Date(contrato.created_at).toLocaleDateString('pt-BR')}
          {cliente?.email ? ` · ${cliente.email}` : ''}
          {cliente?.whatsapp || cliente?.telefone ? ` · ${cliente.whatsapp || cliente.telefone}` : ''}
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-8">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {sucesso}
        </p>
      )}

      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        Contrato é um documento comercial fechado, gerado a partir do orçamento aprovado — os itens e valores abaixo
        são histórico e não podem ser editados por aqui.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Itens contratados</h2>

        {!itens || itens.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum item registrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Unitário</th>
                  <th className="px-4 py-3 font-medium">Subtotal</th>
                  <th className="px-4 py-3 font-medium">Produção</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                    <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                      {nomeProdutoPorId.get(item.produto_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{item.quantidade}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      R$ {formatarPrecoParaExibicao(item.valor_unitario)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      R$ {formatarPrecoParaExibicao(item.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{item.status_producao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-2 rounded-2xl border border-black/[.08] p-4 text-sm sm:grid-cols-3 dark:border-white/[.145]">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Subtotal</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(contrato.valor_total)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Desconto</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(contrato.desconto)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Valor do contrato</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(contrato.valor_final)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Financeiro</h2>
        <dl className="grid grid-cols-1 gap-2 rounded-2xl border border-black/[.08] p-4 text-sm sm:grid-cols-3 dark:border-white/[.145]">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Valor contratado</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(contrato.valor_final)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Recebido</dt>
            <dd className="text-lg font-semibold text-green-700 dark:text-green-400">
              R$ {formatarPrecoParaExibicao(totalRecebido)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Saldo</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(saldoContrato)}
            </dd>
          </div>
        </dl>

        {!parcelas || parcelas.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma parcela registrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 font-medium">Saldo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {parcelas.map((parcela) => {
                  const saldo = Number(parcela.valor) - Number(parcela.valor_pago)
                  const situacao = situacaoParcela(parcela)
                  const podeReceber = contrato.status !== 'cancelado' && parcela.status !== 'cancelado' && saldo > 0
                  const historicoDaParcela = recebimentosPorParcela.get(parcela.id) ?? []
                  const registrarComId = registrarRecebimento.bind(null, parcela.id, id)

                  return (
                    <tr key={parcela.id} className="border-t border-black/[.08] dark:border-white/[.145] align-top">
                      <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">{parcela.numero}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatarDataBR(parcela.vencimento)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        R$ {formatarPrecoParaExibicao(parcela.valor)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        R$ {formatarPrecoParaExibicao(parcela.valor_pago)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        R$ {formatarPrecoParaExibicao(saldo)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <span
                            className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                              situacao ? situacao.classes : classesStatusParcela(parcela.status)
                            }`}
                          >
                            {situacao ? situacao.label : labelStatusParcela(parcela.status)}
                          </span>

                          {(podeReceber || historicoDaParcela.length > 0) && (
                            <details className="text-xs">
                              <summary className="cursor-pointer font-medium text-zinc-950 underline dark:text-zinc-50">
                                {podeReceber ? 'Registrar recebimento' : 'Histórico de recebimentos'}
                              </summary>

                              <div className="mt-3 flex max-w-sm flex-col gap-3">
                                {historicoDaParcela.length > 0 && (
                                  <ul className="flex flex-col gap-1">
                                    {historicoDaParcela.map((r) => (
                                      <li
                                        key={r.id}
                                        className="rounded-lg border border-black/[.08] px-2 py-1.5 dark:border-white/[.145]"
                                      >
                                        <span className="font-medium text-zinc-950 dark:text-zinc-50">
                                          R$ {formatarPrecoParaExibicao(r.valor)}
                                        </span>{' '}
                                        <span className="text-zinc-600 dark:text-zinc-400">
                                          — {formatarDataBR(r.data)} —{' '}
                                          {FORMAS_PAGAMENTO.find((f) => f.value === r.forma_pagamento)?.label ??
                                            r.forma_pagamento}
                                          {r.observacoes ? ` — ${r.observacoes}` : ''}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {podeReceber && (
                                  <form action={registrarComId} className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className={labelClasses}>Valor (R$)</label>
                                      <input
                                        name="valor"
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        required
                                        className={inputClasses}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className={labelClasses}>Data</label>
                                      <input name="data" type="date" className={inputClasses} />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className={labelClasses}>Forma de pagamento</label>
                                      <select name="forma_pagamento" required defaultValue="" className={inputClasses}>
                                        <option value="" disabled>
                                          Selecione
                                        </option>
                                        {FORMAS_PAGAMENTO.map((f) => (
                                          <option key={f.value} value={f.value}>
                                            {f.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className={labelClasses}>
                                        Observações <span className="text-zinc-400">(opcional)</span>
                                      </label>
                                      <input name="observacoes" type="text" className={inputClasses} />
                                    </div>
                                    <button
                                      type="submit"
                                      className="self-start rounded-full bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                                    >
                                      Confirmar recebimento
                                    </button>
                                  </form>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {listaParcelas.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Linha do tempo</h2>
          <ol className="flex gap-6 overflow-x-auto pb-2">
            {listaParcelas.map((p) => {
              const vencida = ehVencida(p.vencimento, saldoDe(p), p.status)
              const cor = vencida
                ? 'bg-red-500'
                : p.status === 'pago'
                  ? 'bg-green-500'
                  : p.status === 'parcial'
                    ? 'bg-amber-500'
                    : 'bg-zinc-300 dark:bg-zinc-600'
              return (
                <li key={p.id} className="flex min-w-24 flex-col items-center gap-1 text-center text-xs">
                  <span className={`h-3 w-3 rounded-full ${cor}`} />
                  <span className="text-zinc-500">{formatarDataBR(p.vencimento)}</span>
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">{p.descricao ?? `Parcela ${p.numero}`}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">R$ {formatarPrecoParaExibicao(p.valor)}</span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm dark:border-white/[.1] dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Resumo do contrato</h2>
          <div className="flex items-center gap-5">
            <div
              className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#16a34a ${percentualRecebido}%, #e5e7eb 0)` }}
            >
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-950">
                <span className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">{percentualRecebido}%</span>
                <span className="text-[10px] text-zinc-500">recebido</span>
              </div>
            </div>
            <dl className="flex flex-1 flex-col gap-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Recebido</dt>
                <dd className="font-medium text-green-700 dark:text-green-400">R$ {formatarPrecoParaExibicao(totalRecebido)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">A receber</dt>
                <dd className="font-medium text-zinc-950 dark:text-zinc-50">R$ {formatarPrecoParaExibicao(saldoContrato)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Em atraso</dt>
                <dd className="font-medium text-red-700 dark:text-red-400">R$ {formatarPrecoParaExibicao(saldoEmAtraso)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm dark:border-white/[.1] dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Próxima parcela</h2>
          {proximaParcela ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                {formatarDataBR(proximaParcela.vencimento)}
                {situacaoParcela(proximaParcela) && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                    Vencida
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">{proximaParcela.descricao ?? `Parcela ${proximaParcela.numero}`}</p>
              <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                R$ {formatarPrecoParaExibicao(saldoDe(proximaParcela))}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma parcela em aberto.</p>
          )}
        </div>

        {contrato.observacoes && (
          <div className="rounded-2xl border border-black/[.06] bg-amber-50 p-5 dark:border-white/[.1] dark:bg-amber-950/20">
            <h2 className="mb-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Observações</h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{contrato.observacoes}</p>
          </div>
        )}
      </aside>
      </div>
    </div>
  )
}
