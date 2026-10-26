import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  adicionarItem,
  atualizarDadosOrcamento,
  atualizarQuantidadeItem,
  atualizarStatusOrcamento,
  removerItem,
} from '../actions'
import { formatarPrecoParaExibicao } from '../../produtos/preco'
import { formatarDataBR } from '../../eventos/datas'
import { labelTipo } from '../../eventos/opcoes'
import { STATUS_ORCAMENTO, labelStatusOrcamento, podeEditarOrcamento } from '../opcoes'
import { gerarContrato } from '../../contratos/actions'

export default async function OrcamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  // Uma etapa só, tudo em paralelo: evento e cliente embutidos no orçamento, nome do produto nos
  // itens e nome do autor no histórico.
  const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
  const [{ data: orcamentoCompleto }, { data: itens }, { data: historico }, { data: produtosAtivos }] = await Promise.all([
    supabase.from('orcamentos').select('*, evento:eventos(id, tipo, titulo, data), cliente:clientes(id, nome)').eq('id', id).maybeSingle(),
    supabase
      .from('orcamento_itens')
      .select('id, produto_id, quantidade, valor_unitario, subtotal, produto:produtos(nome)')
      .eq('orcamento_id', id)
      .order('created_at'),
    supabase
      .from('orcamento_historico')
      .select('id, texto, created_at, usuario_id, usuario:usuarios(nome)')
      .eq('orcamento_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('produtos').select('id, nome, preco').eq('ativo', true).order('nome'),
  ])

  if (!orcamentoCompleto) {
    notFound()
  }

  const { evento: eventoEmbutido, cliente: clienteEmbutido, ...orcamento } = orcamentoCompleto
  const evento = um(eventoEmbutido as { id: string; tipo: string; titulo: string | null; data: string | null } | null)
  const cliente = um(clienteEmbutido as { id: string; nome: string } | null)
  const editavel = podeEditarOrcamento(orcamento.status)

  const nomeProdutoPorId = new Map(
    (itens ?? []).map((i) => [i.produto_id, um<{ nome: string }>(i.produto)?.nome ?? ''] as const).filter(([, nome]) => nome)
  )
  const nomeUsuarioPorId = new Map(
    (historico ?? [])
      .map((h) => [h.usuario_id, um<{ nome: string }>(h.usuario)?.nome ?? ''] as const)
      .filter((par): par is readonly [string, string] => !!par[0] && !!par[1])
  )

  // Só produtos ativos entram como opção para item novo (histórico continua mostrando
  // o nome de produtos já inativados, via nomeProdutoPorId acima).
  const produtosDisponiveis = editavel ? produtosAtivos : []

  const inputClasses =
    'rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50'
  const labelClasses = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'

  const atualizarStatusComId = atualizarStatusOrcamento.bind(null, id)
  const adicionarItemComId = adicionarItem.bind(null, id)
  const atualizarDadosComId = atualizarDadosOrcamento.bind(null, id)
  const gerarContratoComId = gerarContrato.bind(null, id)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Orçamento #{orcamento.numero}</h1>
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
                <Link
                  href={`/eventos/${evento.id}`}
                  className="font-medium text-zinc-950 underline dark:text-zinc-50"
                >
                  {evento.titulo || labelTipo(evento.tipo)} — {formatarDataBR(evento.data)}
                </Link>
              </span>
            )}
          </div>
        </div>

        <form action={atualizarStatusComId} className="flex items-center gap-2">
          <select name="status" defaultValue={orcamento.status} className={inputClasses}>
            {STATUS_ORCAMENTO.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Atualizar status
          </button>
        </form>
      </div>

      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      {!editavel && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          Este orçamento está com status <strong>{labelStatusOrcamento(orcamento.status)}</strong> e não pode mais
          ter itens, desconto ou observações alterados. Só o status pode ser mudado a partir daqui.
        </p>
      )}

      {orcamento.status === 'aprovado' && (
        <section className="flex flex-col gap-4 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]">
          {orcamento.contrato_id ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Contrato gerado</span>
              <Link
                href={`/contratos/${orcamento.contrato_id}`}
                className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Ver contrato
              </Link>
            </div>
          ) : (
            <form action={gerarContratoComId} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Gerar contrato</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Esta ação cria o contrato e as parcelas a partir deste orçamento. Não é possível desfazer pela
                interface — confira os dados antes de confirmar.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="numero_parcelas" className={labelClasses}>
                    Número de parcelas
                  </label>
                  <input
                    id="numero_parcelas"
                    name="numero_parcelas"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={1}
                    className={inputClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="primeiro_vencimento" className={labelClasses}>
                    1º vencimento
                  </label>
                  <input id="primeiro_vencimento" name="primeiro_vencimento" type="date" required className={inputClasses} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="entrada" className={labelClasses}>
                    Entrada (R$) <span className="text-zinc-400">(opcional)</span>
                  </label>
                  <input
                    id="entrada"
                    name="entrada"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className={inputClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="data_entrada" className={labelClasses}>
                    Data da entrada <span className="text-zinc-400">(opcional)</span>
                  </label>
                  <input id="data_entrada" name="data_entrada" type="date" className={inputClasses} />
                </div>
              </div>
              <button
                type="submit"
                className="self-start rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Gerar contrato
              </button>
            </form>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Itens</h2>

        {!itens || itens.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum item adicionado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.02] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Unitário</th>
                  <th className="px-4 py-3 font-medium">Subtotal</th>
                  {editavel && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="border-t border-black/[.08] dark:border-white/[.145]">
                    <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                      {nomeProdutoPorId.get(item.produto_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {editavel ? (
                        <form
                          action={atualizarQuantidadeItem.bind(null, item.id, id)}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="number"
                            name="quantidade"
                            min={0.01}
                            step="0.01"
                            defaultValue={item.quantidade}
                            className="w-20 rounded-lg border border-black/[.08] bg-transparent px-2 py-1 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-black/[.08] px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                          >
                            Salvar
                          </button>
                        </form>
                      ) : (
                        item.quantidade
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      R$ {formatarPrecoParaExibicao(item.valor_unitario)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      R$ {formatarPrecoParaExibicao(item.subtotal)}
                    </td>
                    {editavel && (
                      <td className="px-4 py-3 text-right">
                        <form action={removerItem.bind(null, item.id, id)}>
                          <button type="submit" className="font-medium text-red-700 underline dark:text-red-400">
                            Remover
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editavel && (
          <form action={adicionarItemComId} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="produto_id" className={labelClasses}>
                Produto
              </label>
              <select id="produto_id" name="produto_id" required defaultValue="" className={inputClasses}>
                <option value="" disabled>
                  Selecione um produto
                </option>
                {(produtosDisponiveis ?? []).map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                    {produto.preco !== null ? ` — R$ ${formatarPrecoParaExibicao(produto.preco)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="quantidade" className={labelClasses}>
                Quantidade
              </label>
              <input
                id="quantidade"
                name="quantidade"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={1}
                className={`${inputClasses} w-28`}
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Adicionar produto
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Valores</h2>

        {editavel ? (
          <form action={atualizarDadosComId} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="desconto_tipo" className={labelClasses}>
                  Tipo de desconto
                </label>
                <select
                  id="desconto_tipo"
                  name="desconto_tipo"
                  defaultValue={orcamento.desconto_tipo}
                  className={inputClasses}
                >
                  <option value="valor">Valor (R$)</option>
                  <option value="percentual">Percentual (%)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="desconto_valor" className={labelClasses}>
                  Desconto
                </label>
                <input
                  id="desconto_valor"
                  name="desconto_valor"
                  type="text"
                  inputMode="decimal"
                  defaultValue={formatarPrecoParaExibicao(orcamento.desconto_valor)}
                  placeholder="0,00"
                  className={inputClasses}
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  Em valor: informe reais (ex: 20,00). Em percentual: um número de 0 a 100.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="data_validade" className={labelClasses}>
                  Validade <span className="text-zinc-400">(opcional)</span>
                </label>
                <input
                  id="data_validade"
                  name="data_validade"
                  type="date"
                  defaultValue={orcamento.data_validade ?? ''}
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="observacoes" className={labelClasses}>
                Observações
              </label>
              <textarea
                id="observacoes"
                name="observacoes"
                rows={3}
                defaultValue={orcamento.observacoes ?? ''}
                className={inputClasses}
              />
            </div>

            <button
              type="submit"
              className="self-start rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Salvar desconto e observações
            </button>
          </form>
        ) : (
          orcamento.observacoes && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Observações: {orcamento.observacoes}</p>
          )
        )}

        <dl className="grid grid-cols-1 gap-2 rounded-2xl border border-black/[.08] p-4 text-sm sm:grid-cols-3 dark:border-white/[.145]">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Subtotal</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(orcamento.subtotal)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Desconto</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {orcamento.desconto_tipo === 'percentual'
                ? `${formatarPrecoParaExibicao(orcamento.desconto_valor)}%`
                : `R$ ${formatarPrecoParaExibicao(orcamento.desconto_valor)}`}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Total</dt>
            <dd className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              R$ {formatarPrecoParaExibicao(orcamento.valor_total)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Histórico</h2>
        {!historico || historico.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum registro ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {historico.map((registro) => (
              <li key={registro.id} className="rounded-lg border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
                <span className="text-zinc-950 dark:text-zinc-50">{registro.texto}</span>
                <span className="text-zinc-500 dark:text-zinc-500">
                  {' — '}
                  {registro.usuario_id ? nomeUsuarioPorId.get(registro.usuario_id) ?? 'Usuário removido' : 'Sistema'}
                  {', '}
                  {new Date(registro.created_at).toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
