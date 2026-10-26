import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, hojeISO } from '../eventos/datas'
import { CardIndicador, formatarBRL } from '../dashboard/widgets'
import { PERIODOS_DESPESAS, resolverPeriodoDespesas } from '../dashboard/periodo'
import { somaMoeda } from '../financeiro/calculos'
import { labelFormaPagamento } from '../contratos/opcoes'
import { lerTudo } from '../contratos/(lista)/leitura'
import { CATEGORIAS_DESPESA, labelCategoriaDespesa, situacaoDespesa } from './opcoes'
import AcoesDespesa from './AcoesDespesa'

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'pagas', label: 'Pagas' },
  { value: 'atraso', label: 'Em atraso' },
  { value: 'canceladas', label: 'Canceladas' },
] as const

const ORDENS = [
  { value: 'vencimento', label: 'Vencimento mais próximo' },
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'maior', label: 'Maior valor' },
  { value: 'menor', label: 'Menor valor' },
] as const

type Filtro = (typeof FILTROS)[number]['value']
type Ordem = (typeof ORDENS)[number]['value']

type Despesa = {
  id: string
  descricao: string
  categoria: string
  valor: string | number
  vencimento: string
  status: string
  data_pagamento: string | null
  forma_pagamento: string | null
  observacoes: string | null
  created_at: string
}

// Busca sem diferenciar maiúsculas nem acentos ("açúcar" encontra "acucar").
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const emAtraso = (d: Despesa, hoje: string) => d.status === 'pendente' && d.vencimento < hoje

function passaFiltro(filtro: Filtro, d: Despesa, hoje: string): boolean {
  switch (filtro) {
    case 'pendentes':
      return d.status === 'pendente'
    case 'pagas':
      return d.status === 'paga'
    case 'atraso':
      return emAtraso(d, hoje)
    case 'canceladas':
      return d.status === 'cancelada'
    default:
      return true
  }
}

function ordenar(despesas: Despesa[], ordem: Ordem): Despesa[] {
  const recente = (a: Despesa, b: Despesa) => b.created_at.localeCompare(a.created_at)
  const copia = [...despesas]
  switch (ordem) {
    case 'recentes':
      return copia.sort(recente)
    case 'maior':
      return copia.sort((a, b) => Number(b.valor) - Number(a.valor) || recente(a, b))
    case 'menor':
      return copia.sort((a, b) => Number(a.valor) - Number(b.valor) || recente(a, b))
    default:
      return copia.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || recente(a, b))
  }
}

type Params = { periodo?: string; de?: string; ate?: string; q?: string; filtro?: string; categoria?: string; ordem?: string; sucesso?: string }

function montarHref(p: Params): string {
  const params = new URLSearchParams()
  if (p.periodo && p.periodo !== 'mes') params.set('periodo', p.periodo)
  if (p.periodo === 'personalizado') {
    if (p.de) params.set('de', p.de)
    if (p.ate) params.set('ate', p.ate)
  }
  if (p.q) params.set('q', p.q)
  if (p.filtro && p.filtro !== 'todas') params.set('filtro', p.filtro)
  if (p.categoria) params.set('categoria', p.categoria)
  if (p.ordem && p.ordem !== 'vencimento') params.set('ordem', p.ordem)
  const texto = params.toString()
  return texto ? `/despesas?${texto}` : '/despesas'
}

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

const botaoVer =
  'inline-block whitespace-nowrap rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50'

const valorSemMoeda = (valor: number) => formatarBRL(valor).replace('R$', '').trim()

export default async function DespesasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { periodo: periodoParam, de, ate, q: qParam, filtro: filtroParam, categoria: categoriaParam, ordem: ordemParam, sucesso } =
    await searchParams
  const periodo = resolverPeriodoDespesas(periodoParam, de, ate)
  const q = (qParam ?? '').trim()
  const filtro: Filtro = FILTROS.find((f) => f.value === filtroParam)?.value ?? 'todas'
  const categoria = CATEGORIAS_DESPESA.find((c) => c.value === categoriaParam)?.value ?? ''
  const ordem: Ordem = ORDENS.find((o) => o.value === ordemParam)?.value ?? 'vencimento'
  const hoje = hojeISO()
  const supabase = await createClient()

  // A RLS restringe à empresa do usuário. Qualquer falha lança exceção (error.tsx): nunca
  // mostramos totais zerados no lugar de um erro.
  const despesas = await lerTudo<Despesa>((a, b) =>
    supabase
      .from('despesas')
      .select('id, descricao, categoria, valor, vencimento, status, data_pagamento, forma_pagamento, observacoes, created_at')
      .order('id')
      .range(a, b)
  )

  // Cards: despesas com vencimento no período; canceladas não entram em nenhum total. Busca,
  // filtros de status/categoria e ordenação só afetam a lista.
  const noPeriodo = despesas.filter((d) => d.vencimento >= periodo.inicio && d.vencimento <= periodo.fim)
  const validas = noPeriodo.filter((d) => d.status !== 'cancelada')
  const total = (lista: Despesa[]) => somaMoeda(lista.map((d) => d.valor))
  const pagas = validas.filter((d) => d.status === 'paga')
  const pendentes = validas.filter((d) => d.status === 'pendente')
  const atrasadas = pendentes.filter((d) => emAtraso(d, hoje))

  const termo = normalizar(q)
  const visiveis = ordenar(
    noPeriodo.filter((d) => {
      if (!passaFiltro(filtro, d, hoje)) return false
      if (categoria && d.categoria !== categoria) return false
      if (!termo) return true
      return normalizar(`${d.descricao} ${d.observacoes ?? ''}`).includes(termo)
    }),
    ordem
  )

  const atuais: Params = {
    periodo: periodo.chave,
    de: periodo.chave === 'personalizado' ? periodo.inicio : undefined,
    ate: periodo.chave === 'personalizado' ? periodo.fim : undefined,
    q,
    filtro,
    categoria,
    ordem,
  }
  const pilula = (ativa: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      ativa ? 'bg-indigo-600 text-white' : 'border border-black/[.08] bg-white text-zinc-600 hover:bg-black/[.04]'
    }`
  const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'

  const acoes = (d: Despesa, instancia: string) =>
    d.status === 'pendente' ? (
      <AcoesDespesa
        id={d.id}
        descricao={d.descricao}
        valor={valorSemMoeda(Number(d.valor))}
        hoje={hoje}
        instancia={instancia}
        emLinha={instancia === 'tabela'}
      />
    ) : (
      <Link href={`/despesas/${d.id}`} className={botaoVer}>
        Detalhes
      </Link>
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Despesas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Contas a pagar da empresa · vencimentos de {formatarDataBR(periodo.inicio)} a {formatarDataBR(periodo.fim)} (horário de Brasília)
          </p>
        </div>
        <Link
          href="/despesas/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nova despesa
        </Link>
      </div>

      {sucesso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{sucesso}</p>}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Período">
          {PERIODOS_DESPESAS.filter((p) => p.value !== 'personalizado').map((p) => (
            <Link key={p.value} href={montarHref({ ...atuais, periodo: p.value })} className={pilula(periodo.chave === p.value)}>
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          {q && <input type="hidden" name="q" value={q} />}
          {filtro !== 'todas' && <input type="hidden" name="filtro" value={filtro} />}
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          {ordem !== 'vencimento' && <input type="hidden" name="ordem" value={ordem} />}
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
        <CardIndicador titulo="Total de despesas" valor={formatarBRL(total(validas))} tom="roxo" detalhe={`${validas.length} despesa(s) no período, sem canceladas`} />
        <CardIndicador titulo="Total pago" valor={formatarBRL(total(pagas))} tom="verde" detalhe={`${pagas.length} despesa(s) paga(s)`} />
        <CardIndicador titulo="Total pendente" valor={formatarBRL(total(pendentes))} detalhe={`${pendentes.length} despesa(s) a pagar`} />
        <CardIndicador titulo="Total em atraso" valor={formatarBRL(total(atrasadas))} tom="vermelho" detalhe={`${atrasadas.length} despesa(s) vencida(s)`} />
      </div>

      <div className="flex flex-col gap-4">
        <form className="flex w-full flex-wrap gap-2">
          {periodo.chave !== 'mes' && <input type="hidden" name="periodo" value={periodo.chave} />}
          {atuais.de && <input type="hidden" name="de" value={atuais.de} />}
          {atuais.ate && <input type="hidden" name="ate" value={atuais.ate} />}
          {filtro !== 'todas' && <input type="hidden" name="filtro" value={filtro} />}
          {ordem !== 'vencimento' && <input type="hidden" name="ordem" value={ordem} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Descrição ou observações"
            aria-label="Buscar despesas"
            className={`${campo} min-w-0 flex-1 basis-56`}
          />
          <select name="categoria" defaultValue={categoria} aria-label="Categoria" className={campo}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_DESPESA.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-2" aria-label="Filtros">
          {FILTROS.map((f) => (
            <Link key={f.value} href={montarHref({ ...atuais, filtro: f.value })} className={pilula(filtro === f.value)}>
              {f.label}
            </Link>
          ))}
        </div>

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
          {despesas.length === 0 ? (
            <>
              <p className="text-sm font-medium text-zinc-950">Nenhuma despesa cadastrada.</p>
              <p className="mt-1 text-sm text-zinc-500">Registre as despesas da empresa para acompanhar os pagamentos.</p>
              <Link href="/despesas/nova" className={`${botaoVer} mt-4`}>
                Nova despesa
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-950">Nenhuma despesa encontrada.</p>
              <p className="mt-1 text-sm text-zinc-500">Ajuste o período, a busca ou os filtros.</p>
              <Link href="/despesas" className={`${botaoVer} mt-4`}>
                Limpar filtros
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {visiveis.length} {visiveis.length === 1 ? 'despesa' : 'despesas'}
          </p>

          {/* Telas largas (a partir de 1400px, já com o menu lateral): tabela. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1400px]:block">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:align-bottom">
              <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
                <tr>
                  <th className="py-3 font-medium">Descrição</th>
                  <th className="py-3 font-medium">Categoria</th>
                  <th className="py-3 font-medium">Vencimento</th>
                  <th className="py-3 text-right font-medium">Valor</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium">Pagamento</th>
                  <th className="py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((d) => {
                  const situacao = situacaoDespesa(d, hoje)
                  return (
                    <tr key={d.id} className={`border-t border-black/[.06] hover:bg-zinc-50/60 ${d.status === 'cancelada' ? 'text-zinc-500' : ''}`}>
                      <td className="max-w-[13rem] py-3">
                        <span className={`block truncate font-medium ${d.status === 'cancelada' ? 'line-through' : 'text-zinc-950'}`} title={d.descricao}>
                          {d.descricao}
                        </span>
                        {d.observacoes && (
                          <span className="block truncate text-xs text-zinc-500" title={d.observacoes}>
                            {d.observacoes}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-zinc-600">{labelCategoriaDespesa(d.categoria)}</td>
                      <td className="whitespace-nowrap py-3 text-zinc-600">{formatarDataBR(d.vencimento)}</td>
                      <td className="whitespace-nowrap py-3 text-right font-medium text-zinc-950">{formatarBRL(Number(d.valor))}</td>
                      <td className="py-3">
                        <Selo classes={situacao.classes}>{situacao.label}</Selo>
                      </td>
                      <td className="whitespace-nowrap py-3 text-zinc-600">
                        {d.data_pagamento ? (
                          <>
                            {formatarDataBR(d.data_pagamento)}
                            {d.forma_pagamento && <span className="block text-xs text-zinc-500">{labelFormaPagamento(d.forma_pagamento)}</span>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end">{acoes(d, 'tabela')}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Telas menores (inclui celular): um card por despesa, sem rolagem horizontal. */}
          <ul className="grid gap-4 sm:grid-cols-2 min-[1400px]:hidden">
            {visiveis.map((d) => {
              const situacao = situacaoDespesa(d, hoje)
              return (
                <li key={d.id} className="flex flex-col gap-3 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-500">
                        {labelCategoriaDespesa(d.categoria)} · vence {formatarDataBR(d.vencimento)}
                      </p>
                      <p className={`truncate text-base font-semibold ${d.status === 'cancelada' ? 'text-zinc-500 line-through' : 'text-zinc-950'}`}>
                        {d.descricao}
                      </p>
                      {d.observacoes && <p className="truncate text-sm text-zinc-500">{d.observacoes}</p>}
                    </div>
                    <Selo classes={situacao.classes}>{situacao.label}</Selo>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-zinc-500">Valor</dt>
                      <dd className="font-medium text-zinc-950">{formatarBRL(Number(d.valor))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Pago em</dt>
                      <dd className="font-medium text-zinc-950">{formatarDataBR(d.data_pagamento)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Forma</dt>
                      <dd className="truncate font-medium text-zinc-950">{d.forma_pagamento ? labelFormaPagamento(d.forma_pagamento) : '—'}</dd>
                    </div>
                  </dl>
                  {acoes(d, 'cartao')}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
