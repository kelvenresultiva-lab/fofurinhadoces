import Link from 'next/link'
import { ChevronLeft, ChevronRight, Target } from 'lucide-react'
import { formatarDataBR } from '../eventos/datas'
import { formatarBRL } from '../dashboard/widgets'
import { formatarPrecoParaExibicao } from '../produtos/preco'
import { somaMoeda } from '../financeiro/calculos'
import { BarraProgresso } from './BarraProgresso'
import { salvarMeta } from './actions'
import { carregarDadosMetas } from './dados'
import {
  formatarPercentual,
  mesAtual,
  mesDoInstante,
  mesValido,
  numero,
  previsaoEntradas,
  progresso,
  realizadoContratos,
  realizadoEntradas,
  rotuloMes,
  seloSituacao,
  situacaoMeta,
  somarMeses,
  ultimoDiaDoMes,
} from './calculos'

const cartao = 'rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm'
const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'
const botaoSecundario = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-black/[.04]'

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

function Dados({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-xs text-zinc-500">{rotulo}</dt>
          <dd className="truncate font-medium text-zinc-950">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

// Um bloco por meta. As duas são independentes: cada uma tem a própria barra e percentual.
function BlocoMeta({
  titulo,
  explicacao,
  meta,
  realizado,
  rotuloRealizado,
  itens,
  children,
}: {
  titulo: string
  explicacao: string
  meta: number
  realizado: number
  rotuloRealizado: string
  itens: [string, string][]
  children?: React.ReactNode
}) {
  const p = progresso(meta, realizado)
  return (
    <section className={`${cartao} flex flex-col gap-5`}>
      <div>
        <h2 className="text-base font-semibold text-zinc-950">{titulo}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{explicacao}</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{rotuloRealizado}</p>
          <p className={`text-3xl font-semibold ${p?.atingida ? 'text-green-700' : 'text-indigo-700'}`}>{formatarBRL(realizado)}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-zinc-500">Meta do mês</p>
          <p className="text-lg font-semibold text-zinc-950">{meta > 0 ? formatarBRL(meta) : 'Não definida'}</p>
        </div>
      </div>
      {p ? (
        <BarraProgresso percentual={p.percentual} atingida={p.atingida} rotulo={`Progresso: ${titulo}`} />
      ) : (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">Defina esta meta para acompanhar o percentual.</p>
      )}
      <Dados
        itens={[
          ['Quanto falta', p ? (p.atingida ? 'Nada — meta atingida' : formatarBRL(p.falta)) : '—'],
          ['Percentual alcançado', p ? formatarPercentual(p.percentual) : '—'],
          ...itens,
        ]}
      />
      {children}
    </section>
  )
}

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; editar?: string; erro?: string; sucesso?: string }>
}) {
  const { mes: mesParam, editar, erro, sucesso } = await searchParams
  const atual = mesAtual()
  const mes = mesValido(mesParam) ? mesParam : atual

  // Qualquer falha de leitura lança exceção (error.tsx): nunca mostramos realizado zerado no lugar de um erro.
  const { metaPorMes, contratos, recebimentos, parcelas } = await carregarDadosMetas()

  const meta = metaPorMes.get(mes)
  const metaContratos = numero(meta?.meta_contratos)
  const metaEntradas = numero(meta?.meta_entradas)
  const contratado = realizadoContratos(contratos, mes)
  const recebido = realizadoEntradas(recebimentos, mes)

  // Previsão só faz sentido do mês atual em diante.
  const comPrevisao = mes >= atual
  const previsto = previsaoEntradas(parcelas, contratos, mes)
  const potencial = somaMoeda([recebido.valor, previsto.valor])
  const faltaComPrevisao = metaEntradas > 0 ? Math.max(0, Math.round((metaEntradas - potencial) * 100) / 100) : null

  // Histórico: meses com meta ou com algum realizado, mais o mês atual (mais recente primeiro).
  const meses = new Set<string>([atual, ...metaPorMes.keys()])
  contratos.filter((c) => c.status === 'ativo').forEach((c) => meses.add(mesDoInstante(c.created_at)))
  recebimentos.forEach((r) => meses.add(r.data.slice(0, 7)))
  const historico = [...meses]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 24)
    .map((m) => {
      const mm = metaPorMes.get(m)
      const mc = numero(mm?.meta_contratos)
      const me = numero(mm?.meta_entradas)
      const c = realizadoContratos(contratos, m).valor
      const r = realizadoEntradas(recebimentos, m).valor
      return {
        mes: m,
        mc,
        me,
        c,
        r,
        pc: progresso(mc, c),
        pe: progresso(me, r),
        sc: seloSituacao(situacaoMeta(mc, c, m, atual)),
        se: seloSituacao(situacaoMeta(me, r, m, atual)),
      }
    })

  const abrirFormulario = editar === '1' || !!erro

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Metas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Metas mensais de contratos fechados e de entradas. O realizado é calculado automaticamente a partir dos contratos e recebimentos.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/metas?mes=${somarMeses(mes, -1)}`} className={botaoSecundario} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Anterior</span>
            </Link>
            <p className="min-w-[9rem] text-center text-base font-semibold text-zinc-950 sm:text-lg">{rotuloMes(mes)}</p>
            <Link href={`/metas?mes=${somarMeses(mes, 1)}`} className={botaoSecundario} aria-label="Próximo mês">
              <span className="hidden sm:inline">Próximo</span> <ChevronRight className="h-4 w-4" />
            </Link>
            {mes !== atual && (
              <Link href="/metas" className="text-sm font-medium text-indigo-700 hover:underline">
                Voltar para o mês atual
              </Link>
            )}
          </div>
          <Link
            href={`/metas?mes=${mes}&editar=1#definir`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Target className="h-4 w-4" />
            {meta ? 'Editar metas' : 'Definir metas'}
          </Link>
        </div>
      </div>

      {sucesso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{sucesso}</p>}

      {abrirFormulario && (
        <form id="definir" action={salvarMeta} className={`${cartao} flex flex-col gap-4`}>
          <div>
            <h2 className="text-base font-semibold text-zinc-950">{meta ? 'Editar metas' : 'Definir metas'}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Só os objetivos são editáveis; os valores realizados vêm dos contratos e recebimentos. Deixe 0 para não definir uma das metas.
            </p>
          </div>
          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mes" className="text-sm font-medium text-zinc-700">
                Mês e ano
              </label>
              <input id="mes" name="mes" type="month" required defaultValue={mes} className={campo} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meta_contratos" className="text-sm font-medium text-zinc-700">
                Meta de contratos (R$)
              </label>
              <input
                id="meta_contratos"
                name="meta_contratos"
                type="text"
                inputMode="decimal"
                placeholder="50.000,00"
                defaultValue={metaContratos > 0 ? formatarPrecoParaExibicao(metaContratos) : ''}
                className={campo}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meta_entradas" className="text-sm font-medium text-zinc-700">
                Meta de entradas (R$)
              </label>
              <input
                id="meta_entradas"
                name="meta_entradas"
                type="text"
                inputMode="decimal"
                placeholder="30.000,00"
                defaultValue={metaEntradas > 0 ? formatarPrecoParaExibicao(metaEntradas) : ''}
                className={campo}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={`/metas?mes=${mes}`} className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
              Cancelar
            </Link>
            <button type="submit" className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
              Salvar metas
            </button>
          </div>
        </form>
      )}

      {!meta && !abrirFormulario && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          Nenhuma meta definida para {rotuloMes(mes)}. Os valores realizados abaixo já são calculados — defina as metas para acompanhar o progresso.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BlocoMeta
          titulo="Meta de contratos"
          explicacao="Valor total dos contratos ativos fechados no mês (data de criação do contrato). Cancelados não contam."
          meta={metaContratos}
          realizado={contratado.valor}
          rotuloRealizado="Contratado no mês"
          itens={[
            ['Contratos fechados', String(contratado.qtd)],
            ['Ticket médio', contratado.qtd > 0 ? formatarBRL(contratado.media) : '—'],
          ]}
        />
        <BlocoMeta
          titulo="Meta de entradas"
          explicacao="Pagamentos efetivamente registrados no mês (data do recebimento), incluindo entradas e parcelas."
          meta={metaEntradas}
          realizado={recebido.valor}
          rotuloRealizado="Recebido no mês"
          itens={[
            ['Recebimentos', String(recebido.qtd)],
            ['Média por lançamento', recebido.qtd > 0 ? formatarBRL(recebido.media) : '—'],
          ]}
        >
          {comPrevisao && (
            <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-950">Previsão até {formatarDataBR(ultimoDiaDoMes(mes))}</p>
              <Dados
                itens={[
                  ['Já entrou', formatarBRL(recebido.valor)],
                  ['Previsto até o fim do mês', `${formatarBRL(previsto.valor)} (${previsto.qtd} parcela${previsto.qtd === 1 ? '' : 's'})`],
                  ['Total potencial do mês', formatarBRL(potencial)],
                  ['Falta mesmo com o previsto', faltaComPrevisao === null ? '—' : faltaComPrevisao === 0 ? 'Nada — meta alcançável' : formatarBRL(faltaComPrevisao)],
                ]}
              />
              <p className="text-xs text-zinc-500">
                Previsto: saldo das parcelas em aberto de contratos ativos com vencimento neste mês. Só entra no realizado quando o pagamento for registrado.
              </p>
            </div>
          )}
        </BlocoMeta>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-zinc-950">Histórico mensal</h2>

        {/* Telas largas (a partir de 1400px, já com o menu lateral): tabela. */}
        <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1400px]:block">
          <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:align-bottom">
            <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
              <tr>
                <th className="py-3 font-medium">Mês</th>
                <th className="py-3 text-right font-medium">Meta de contratos</th>
                <th className="py-3 text-right font-medium">Contratado</th>
                <th className="py-3 text-right font-medium">% contratos</th>
                <th className="py-3 text-right font-medium">Meta de entradas</th>
                <th className="py-3 text-right font-medium">Recebido</th>
                <th className="py-3 text-right font-medium">% entradas</th>
                <th className="py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.mes} className={`border-t border-black/[.06] hover:bg-zinc-50/60 ${h.mes === mes ? 'bg-indigo-50/40' : ''}`}>
                  <td className="whitespace-nowrap py-3 font-medium text-zinc-950">
                    <Link href={`/metas?mes=${h.mes}`} className="hover:text-indigo-700 hover:underline">
                      {rotuloMes(h.mes)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right text-zinc-600">{h.mc > 0 ? formatarBRL(h.mc) : '—'}</td>
                  <td className="whitespace-nowrap py-3 text-right font-medium text-zinc-950">{formatarBRL(h.c)}</td>
                  <td className={`whitespace-nowrap py-3 text-right font-medium ${h.pc?.atingida ? 'text-green-700' : 'text-zinc-700'}`}>
                    {h.pc ? formatarPercentual(h.pc.percentual) : '—'}
                  </td>
                  <td className="whitespace-nowrap py-3 text-right text-zinc-600">{h.me > 0 ? formatarBRL(h.me) : '—'}</td>
                  <td className="whitespace-nowrap py-3 text-right font-medium text-zinc-950">{formatarBRL(h.r)}</td>
                  <td className={`whitespace-nowrap py-3 text-right font-medium ${h.pe?.atingida ? 'text-green-700' : 'text-zinc-700'}`}>
                    {h.pe ? formatarPercentual(h.pe.percentual) : '—'}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Selo classes={h.sc.classes}>Contratos: {h.sc.label}</Selo>
                      <Selo classes={h.se.classes}>Entradas: {h.se.label}</Selo>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Telas menores: um card por mês, sem rolagem horizontal. */}
        <ul className="grid gap-4 sm:grid-cols-2 min-[1400px]:hidden">
          {historico.map((h) => (
            <li key={h.mes} className={`${cartao} flex flex-col gap-3 p-4 ${h.mes === mes ? 'ring-1 ring-indigo-200' : ''}`}>
              <Link href={`/metas?mes=${h.mes}`} className="text-base font-semibold text-zinc-950 hover:text-indigo-700">
                {rotuloMes(h.mes)}
              </Link>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs text-zinc-500">Contratos</p>
                  <p className="font-medium text-zinc-950">{formatarBRL(h.c)}</p>
                  <p className="text-xs text-zinc-500">
                    meta {h.mc > 0 ? formatarBRL(h.mc) : '—'}
                    {h.pc && ` · ${formatarPercentual(h.pc.percentual)}`}
                  </p>
                  <Selo classes={h.sc.classes}>{h.sc.label}</Selo>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs text-zinc-500">Entradas</p>
                  <p className="font-medium text-zinc-950">{formatarBRL(h.r)}</p>
                  <p className="text-xs text-zinc-500">
                    meta {h.me > 0 ? formatarBRL(h.me) : '—'}
                    {h.pe && ` · ${formatarPercentual(h.pe.percentual)}`}
                  </p>
                  <Selo classes={h.se.classes}>{h.se.label}</Selo>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
