import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, hojeISO } from '../eventos/datas'
import { CardIndicador, formatarBRL } from '../dashboard/widgets'
import {
  aparecemNaListaFinanceira,
  ehParcelaEmAberto,
  ehVencida,
  idsContratosCancelados,
  parcelasEmAberto,
  resumoFuturo,
  saldoParcela,
  saldoTotal,
  situacaoParcela,
  somaMoeda,
  totalRecebido,
} from '../financeiro/calculos'
import { rotuloMes, somarMeses } from '../metas/calculos'
import { PERIODOS_PARCELAS, resolverPeriodoParcelas } from './periodo'
import { classesStatusParcela, labelStatusParcela } from '../contratos/opcoes'
import { lerTudo } from '../contratos/(lista)/leitura'
import RegistrarPagamento from '../contratos/[id]/RegistrarPagamento'

// Mesmos filtros e mesma semântica do /financeiro.
const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'parciais', label: 'Parciais' },
  { value: 'pagas', label: 'Pagas' },
  { value: 'vencidas', label: 'Vencidas' },
] as const

const ORDENS = [
  { value: 'proximo', label: 'Vencimento mais próximo' },
  { value: 'distante', label: 'Vencimento mais distante' },
  { value: 'valor', label: 'Maior valor' },
  { value: 'saldo', label: 'Maior saldo' },
] as const

type Filtro = (typeof FILTROS)[number]['value']
type Ordem = (typeof ORDENS)[number]['value']

type ParcelaLida = {
  id: string
  contrato_id: string
  numero: number
  descricao: string | null
  vencimento: string
  valor: string | number
  valor_pago: string | number
  status: string
}

type Linha = {
  p: ParcelaLida
  titulo: string
  contratoNumero: number | null
  clienteId: string | null
  cliente: string
  saldo: number
  vencida: boolean
  cobravel: boolean
  textoBusca: string
}

// Busca sem diferenciar maiúsculas nem acentos ("joão" encontra "joao").
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function passaFiltro(filtro: Filtro, l: Linha): boolean {
  switch (filtro) {
    case 'pendentes':
      return l.p.status === 'pendente'
    case 'parciais':
      return l.p.status === 'parcial'
    case 'pagas':
      return l.p.status === 'pago'
    case 'vencidas':
      return l.vencida
    default:
      return true
  }
}

function ordenar(linhas: Linha[], ordem: Ordem): Linha[] {
  const porVencimento = (a: Linha, b: Linha) => a.p.vencimento.localeCompare(b.p.vencimento) || a.p.numero - b.p.numero
  const copia = [...linhas]
  switch (ordem) {
    case 'distante':
      return copia.sort((a, b) => porVencimento(b, a))
    case 'valor':
      return copia.sort((a, b) => Number(b.p.valor) - Number(a.p.valor) || porVencimento(a, b))
    case 'saldo':
      return copia.sort((a, b) => b.saldo - a.saldo || porVencimento(a, b))
    default:
      return copia.sort(porVencimento)
  }
}

type Params = { q?: string; filtro?: string; ordem?: string; periodo?: string; ref?: string }

function montarHref(p: Params): string {
  const params = new URLSearchParams()
  if (p.periodo && p.periodo !== 'todos') {
    params.set('periodo', p.periodo)
    if (p.ref) params.set('ref', p.ref)
  }
  if (p.q) params.set('q', p.q)
  if (p.filtro && p.filtro !== 'todas') params.set('filtro', p.filtro)
  if (p.ordem && p.ordem !== 'proximo') params.set('ordem', p.ordem)
  const texto = params.toString()
  return texto ? `/parcelas?${texto}` : '/parcelas'
}

// Status exibido: "Vencida" é derivada (financeiro/calculos.ts); os demais vêm de parcelas.status.
function statusVisual(p: ParcelaLida) {
  const situacao = situacaoParcela(p)
  if (situacao) return situacao
  return {
    label: p.status === 'cancelado' ? 'Cancelada' : labelStatusParcela(p.status),
    classes: classesStatusParcela(p.status),
  }
}

function Selo({ classes, children }: { classes: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

const botaoVer =
  'inline-block whitespace-nowrap rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50'

const valorSemMoeda = (valor: number) => formatarBRL(valor).replace('R$', '').trim()

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// Resumo de cobrança de um conjunto de parcelas EM ABERTO (já filtradas pela regra central:
// parcela não cancelada, contrato ativo, saldo > 0). "Entrada" é a parcela criada pela RPC de
// conversão com essa descrição.
function resumoCobranca(abertas: Linha[]) {
  const entradas = abertas.filter((l) => l.p.descricao === 'Entrada')
  const porCliente = new Map<string, { chave: string; nome: string; valor: number; entrada: boolean }>()
  for (const l of abertas) {
    const chave = l.clienteId ?? l.cliente
    const atual = porCliente.get(chave) ?? { chave, nome: l.cliente, valor: 0, entrada: false }
    atual.valor = somaMoeda([atual.valor, l.saldo])
    atual.entrada ||= l.p.descricao === 'Entrada'
    porCliente.set(chave, atual)
  }
  return {
    valor: saldoTotal(abertas.map((l) => l.p)),
    parcelas: abertas.length,
    clientes: [...porCliente.values()].sort((a, b) => b.valor - a.valor),
    entradas: { qtd: entradas.length, valor: saldoTotal(entradas.map((l) => l.p)) },
  }
}

export default async function ParcelasPage({
  searchParams,
}: {
  searchParams: Promise<Params & { erro?: string; sucesso?: string }>
}) {
  const { q: qParam, filtro: filtroParam, ordem: ordemParam, periodo: periodoParam, ref, erro, sucesso } = await searchParams
  const q = (qParam ?? '').trim()
  const filtro: Filtro = FILTROS.find((f) => f.value === filtroParam)?.value ?? 'todas'
  const ordem: Ordem = ORDENS.find((o) => o.value === ordemParam)?.value ?? 'proximo'
  const periodo = resolverPeriodoParcelas(periodoParam, ref)
  const hoje = hojeISO()
  const supabase = await createClient()

  // Todas as consultas passam pelo cliente autenticado: a RLS já restringe à empresa do usuário.
  // Qualquer falha lança exceção (error.tsx): nunca mostramos totais zerados no lugar de um erro.
  const [parcelas, contratos, recebimentos, eventos, clientes, orcamentos] = await Promise.all([
    lerTudo<ParcelaLida>((a, b) =>
      supabase.from('parcelas').select('id, contrato_id, numero, descricao, vencimento, valor, valor_pago, status').order('id').range(a, b)
    ),
    lerTudo<{ id: string; evento_id: string; status: string }>((a, b) =>
      supabase.from('contratos').select('id, evento_id, status').order('id').range(a, b)
    ),
    lerTudo<{ id: string; valor: string | number }>((a, b) => supabase.from('recebimentos').select('id, valor').order('id').range(a, b)),
    lerTudo<{ id: string; cliente_id: string }>((a, b) => supabase.from('eventos').select('id, cliente_id').order('id').range(a, b)),
    lerTudo<{ id: string; nome: string }>((a, b) => supabase.from('clientes').select('id, nome').order('id').range(a, b)),
    lerTudo<{ numero: number; contrato_id: string }>((a, b) =>
      supabase.from('orcamentos').select('numero, contrato_id').not('contrato_id', 'is', null).order('id').range(a, b)
    ),
  ])

  // Cards: regra única de financeiro/calculos.ts (a mesma do Dashboard e do Financeiro), sempre
  // sobre a empresa inteira, independente da busca e dos filtros da lista.
  const futuro = resumoFuturo(parcelasEmAberto(parcelas, contratos), hoje)
  const recebido = totalRecebido(recebimentos)

  const cancelados = idsContratosCancelados(contratos)
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]))
  const clienteDoEvento = new Map(eventos.map((e) => [e.id, e.cliente_id]))
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]))
  const numeroPorContrato = new Map(orcamentos.map((o) => [o.contrato_id, o.numero]))

  // Parcela com saldo de contrato cancelado não é cobrança e sai da lista; quitadas seguem no histórico.
  const linhas: Linha[] = parcelas
    .filter((p) => aparecemNaListaFinanceira(p, cancelados))
    .map((p) => {
      const contrato = contratoPorId.get(p.contrato_id)
      const clienteId = contrato ? clienteDoEvento.get(contrato.evento_id) : undefined
      const cliente = clienteId ? nomeCliente.get(clienteId) ?? '—' : '—'
      const contratoNumero = numeroPorContrato.get(p.contrato_id) ?? null
      const titulo = p.descricao ?? `Parcela ${p.numero}`
      const saldo = saldoParcela(p)
      return {
        p,
        titulo,
        contratoNumero,
        clienteId: clienteId ?? null,
        cliente,
        saldo,
        vencida: ehVencida(p.vencimento, saldo, p.status, hoje),
        cobravel: ehParcelaEmAberto(p, cancelados),
        textoBusca: normalizar([titulo, cliente, contratoNumero ? `#${contratoNumero}` : ''].join(' ')),
      }
    })

  // Busca: cliente, nº do contrato (nº do orçamento de origem) e descrição da parcela.
  const termo = normalizar(q).replace(/^#/, '')
  const soDigitos = /^\d+$/.test(termo)
  const noPeriodo = (l: Linha) => !periodo || (l.p.vencimento >= periodo.inicio && l.p.vencimento <= periodo.fim)
  const visiveis = ordenar(
    linhas.filter((l) => {
      if (!noPeriodo(l)) return false
      if (!passaFiltro(filtro, l)) return false
      if (!termo) return true
      // Só dígitos (ou "#12") é número de contrato: não casa com o "1" de "Parcela 1/2".
      if (soDigitos) return l.contratoNumero === Number(termo)
      return l.textoBusca.includes(termo)
    }),
    ordem
  )

  // Cobrança do período escolhido (independe da busca e dos filtros de status da lista).
  const abertas = linhas.filter((l) => l.cobravel)
  const cobrancaPeriodo = periodo ? resumoCobranca(abertas.filter(noPeriodo)) : null
  const pagoNoPeriodo = periodo ? somaMoeda(linhas.filter(noPeriodo).map((l) => l.p.valor_pago)) : 0

  // Previsão por mês: saldo em aberto agrupado pelo mês de vencimento, do mês atual em diante
  // (pelo menos 6 meses, no máximo 12), e o que já está atrasado de meses anteriores.
  const mesHoje = hoje.slice(0, 7)
  const ultimoMesComSaldo = abertas.reduce((m, l) => (l.p.vencimento.slice(0, 7) > m ? l.p.vencimento.slice(0, 7) : m), mesHoje)
  const meses: string[] = []
  for (let m = mesHoje; meses.length < 12 && (meses.length < 6 || m <= ultimoMesComSaldo); m = somarMeses(m, 1)) meses.push(m)
  const atrasadoAntes = resumoCobranca(abertas.filter((l) => l.p.vencimento.slice(0, 7) < mesHoje))
  const previsaoMensal = meses.map((m) => ({ mes: m, ...resumoCobranca(abertas.filter((l) => l.p.vencimento.slice(0, 7) === m)) }))

  const atuais: Params = { q, filtro, ordem, periodo: periodo?.chave, ref: periodo?.inicio }
  const retorno = montarHref(atuais)
  const pilula = (ativa: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      ativa ? 'bg-indigo-600 text-white' : 'border border-black/[.08] bg-white text-zinc-600 hover:bg-black/[.04]'
    }`

  const acoes = (l: Linha, instancia: string, disposicao = 'flex-wrap') => (
    <div className={`flex items-center gap-2 ${disposicao}`}>
      {l.cobravel && (
        <RegistrarPagamento
          parcelaId={l.p.id}
          instancia={instancia}
          contratoId={l.p.contrato_id}
          titulo={`${l.titulo}${l.contratoNumero ? ` · contrato #${l.contratoNumero}` : ''}`}
          saldo={valorSemMoeda(l.saldo)}
          variante="linha"
          retorno={retorno}
        />
      )}
      <Link href={`/contratos/${l.p.contrato_id}`} className={botaoVer}>
        Ver contrato
      </Link>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">Parcelas</h1>
        <p className="mt-1 text-sm text-zinc-500">Todas as parcelas dos contratos: vencimentos, recebimentos e saldos.</p>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {sucesso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{sucesso}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardIndicador titulo="Total a receber" valor={formatarBRL(futuro.aReceber)} tom="roxo" detalhe={`${futuro.qtdAReceber} parcela(s) em aberto`} />
        <CardIndicador titulo="Recebido" valor={formatarBRL(recebido)} tom="verde" detalhe="Todos os recebimentos registrados" />
        <CardIndicador titulo="Em atraso" valor={formatarBRL(futuro.emAtraso)} tom="vermelho" detalhe={`${futuro.qtdEmAtraso} parcela(s) vencida(s)`} />
        <CardIndicador titulo="Próximos vencimentos" valor={formatarBRL(futuro.aVencer)} detalhe={`${futuro.qtdAVencer} parcela(s) a partir de hoje`} />
      </div>

      {/* Quanto vai entrar por mês: saldo em aberto pelo mês de vencimento. */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Previsão por mês</h2>
          <p className="text-xs text-zinc-500">Saldo das parcelas em aberto de contratos ativos, pelo mês de vencimento. Clique em um mês para ver as parcelas.</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {atrasadoAntes.parcelas > 0 && (
            <li>
              <Link
                href={montarHref({ ...atuais, periodo: undefined, filtro: 'vencidas' })}
                className="flex h-full flex-col gap-1 rounded-2xl border border-red-200 bg-red-50/60 p-4 transition-colors hover:bg-red-50"
              >
                <p className="text-sm font-medium text-red-800">Atrasado (antes de {rotuloMes(mesHoje).toLowerCase()})</p>
                <p className="text-xl font-semibold text-red-700">{formatarBRL(atrasadoAntes.valor)}</p>
                <p className="text-xs text-red-700">
                  {plural(atrasadoAntes.parcelas, 'parcela', 'parcelas')} · {plural(atrasadoAntes.clientes.length, 'cliente', 'clientes')}
                </p>
              </Link>
            </li>
          )}
          {previsaoMensal.map((m) => {
            const selecionado = periodo?.chave === 'mes' && periodo.inicio.slice(0, 7) === m.mes
            return (
              <li key={m.mes}>
                <Link
                  href={montarHref({ ...atuais, periodo: 'mes', ref: `${m.mes}-01` })}
                  className={`flex h-full flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-indigo-300 ${
                    selecionado ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-black/[.06]'
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-700">
                    {rotuloMes(m.mes)}
                    {m.mes === mesHoje && <span className="ml-1 text-xs font-normal text-zinc-500">(mês atual)</span>}
                  </p>
                  <p className={`text-xl font-semibold ${m.valor > 0 ? 'text-indigo-700' : 'text-zinc-400'}`}>{formatarBRL(m.valor)}</p>
                  <p className="text-xs text-zinc-500">
                    {plural(m.parcelas, 'parcela', 'parcelas')} · {plural(m.clientes.length, 'cliente', 'clientes')}
                  </p>
                  {m.entradas.qtd > 0 && (
                    <p className="text-xs font-medium text-amber-700">
                      {plural(m.entradas.qtd, 'entrada pendente', 'entradas pendentes')} ({formatarBRL(m.entradas.valor)})
                    </p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Filtro de período (vencimento): semanal, quinzenal e mensal, com navegação. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Período de vencimento">
          {PERIODOS_PARCELAS.map((p) => (
            <Link
              key={p.value}
              href={montarHref({ ...atuais, periodo: p.value, ref: periodo?.inicio })}
              className={pilula((periodo?.chave ?? 'todos') === p.value)}
            >
              {p.label}
            </Link>
          ))}
        </div>

        {periodo && cobrancaPeriodo && (
          <div className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <Link href={montarHref({ ...atuais, ref: periodo.anterior })} className="shrink-0 rounded-full border border-black/[.08] p-1.5 text-zinc-700 hover:bg-black/[.04]" aria-label="Período anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <p className="min-w-0 text-sm font-semibold text-zinc-950 sm:text-base">{periodo.rotulo}</p>
                <Link href={montarHref({ ...atuais, ref: periodo.proximo })} className="shrink-0 rounded-full border border-black/[.08] p-1.5 text-zinc-700 hover:bg-black/[.04]" aria-label="Próximo período">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              {!periodo.atual && (
                <Link href={montarHref({ ...atuais, ref: undefined })} className="text-sm font-medium text-indigo-700 hover:underline">
                  Voltar para hoje
                </Link>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">Vai entrar no período</dt>
                <dd className="text-xl font-semibold text-indigo-700">{formatarBRL(cobrancaPeriodo.valor)}</dd>
                <dd className="text-xs text-zinc-500">{plural(cobrancaPeriodo.parcelas, 'parcela em aberto', 'parcelas em aberto')}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Clientes que precisam pagar</dt>
                <dd className="text-xl font-semibold text-zinc-950">{cobrancaPeriodo.clientes.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Entradas pendentes</dt>
                <dd className={`text-xl font-semibold ${cobrancaPeriodo.entradas.qtd > 0 ? 'text-amber-700' : 'text-zinc-950'}`}>{cobrancaPeriodo.entradas.qtd}</dd>
                <dd className="text-xs text-zinc-500">{formatarBRL(cobrancaPeriodo.entradas.valor)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Já pago (parcelas do período)</dt>
                <dd className="text-xl font-semibold text-green-700">{formatarBRL(pagoNoPeriodo)}</dd>
              </div>
            </dl>

            {cobrancaPeriodo.clientes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-zinc-500">Quem precisa pagar</p>
                <ul className="flex flex-wrap gap-2">
                  {cobrancaPeriodo.clientes.map((c) => (
                    <li key={c.chave} className="rounded-full bg-zinc-50 px-3 py-1 text-sm text-zinc-700 ring-1 ring-black/[.06]">
                      {c.nome} · <span className="font-medium text-zinc-950">{formatarBRL(c.valor)}</span>
                      {c.entrada && <span className="ml-1 text-xs font-medium text-amber-700">(entrada)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4">
        <form className="flex w-full max-w-xl gap-2">
          {periodo && <input type="hidden" name="periodo" value={periodo.chave} />}
          {periodo && <input type="hidden" name="ref" value={periodo.inicio} />}
          {filtro !== 'todas' && <input type="hidden" name="filtro" value={filtro} />}
          {ordem !== 'proximo' && <input type="hidden" name="ordem" value={ordem} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cliente, nº do contrato ou parcela"
            aria-label="Buscar parcelas"
            className="min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600"
          />
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
          <p className="text-sm font-medium text-zinc-950">Nenhuma parcela encontrada.</p>
          {linhas.length === 0 ? (
            <>
              <p className="mt-1 text-sm text-zinc-500">As parcelas são criadas quando um orçamento aprovado é transformado em contrato.</p>
              <Link href="/orcamentos" className={`${botaoVer} mt-4`}>
                Ver orçamentos
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500">{periodo ? 'Nenhuma parcela vence neste período com a busca e os filtros atuais.' : 'Ajuste a busca ou os filtros.'}</p>
              <Link href="/parcelas" className={`${botaoVer} mt-4`}>
                Limpar busca e filtros
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {visiveis.length} {visiveis.length === 1 ? 'parcela' : 'parcelas'}
          </p>

          {/* Telas largas (a partir de 1400px, já com o menu lateral): tabela. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1400px]:block">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:align-bottom">
              <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
                <tr>
                  <th className="py-3 font-medium">Parcela</th>
                  <th className="py-3 font-medium" title="Número do orçamento de origem: contratos não têm numeração própria">
                    Contrato
                  </th>
                  <th className="py-3 font-medium">Cliente</th>
                  <th className="py-3 font-medium">Vencimento</th>
                  <th className="py-3 text-right font-medium">Valor</th>
                  <th className="py-3 text-right font-medium">Recebido</th>
                  <th className="py-3 text-right font-medium">Saldo</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const status = statusVisual(l.p)
                  return (
                    <tr key={l.p.id} className="border-t border-black/[.06] hover:bg-zinc-50/60">
                      <td className="whitespace-nowrap py-3 font-medium text-zinc-950">{l.titulo}</td>
                      <td className="whitespace-nowrap py-3 text-zinc-600">{l.contratoNumero ? `#${l.contratoNumero}` : '—'}</td>
                      <td className="py-3 text-zinc-950">{l.cliente}</td>
                      <td className="whitespace-nowrap py-3 text-zinc-600">{formatarDataBR(l.p.vencimento)}</td>
                      <td className="whitespace-nowrap py-3 text-right font-medium text-zinc-950">{formatarBRL(Number(l.p.valor))}</td>
                      <td className="whitespace-nowrap py-3 text-right text-green-700">{formatarBRL(Number(l.p.valor_pago))}</td>
                      <td className="whitespace-nowrap py-3 text-right font-medium text-zinc-950">
                        {l.p.status === 'cancelado' ? '—' : formatarBRL(l.saldo)}
                      </td>
                      <td className="py-3">
                        <Selo classes={status.classes}>{status.label}</Selo>
                      </td>
                      <td className="py-3">{acoes(l, 'tabela', 'justify-end')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Telas menores (inclui celular): um card por parcela, sem rolagem horizontal. */}
          <ul className="grid gap-4 sm:grid-cols-2 min-[1400px]:hidden">
            {visiveis.map((l) => {
              const status = statusVisual(l.p)
              return (
                <li key={l.p.id} className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-500">
                        Contrato {l.contratoNumero ? `#${l.contratoNumero}` : '—'} · vence {formatarDataBR(l.p.vencimento)}
                      </p>
                      <p className="truncate text-base font-semibold text-zinc-950">{l.titulo}</p>
                      <p className="truncate text-sm text-zinc-500">{l.cliente}</p>
                    </div>
                    <Selo classes={status.classes}>{status.label}</Selo>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-zinc-500">Valor</dt>
                      <dd className="font-medium text-zinc-950">{formatarBRL(Number(l.p.valor))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Recebido</dt>
                      <dd className="font-medium text-green-700">{formatarBRL(Number(l.p.valor_pago))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Saldo</dt>
                      <dd className="font-medium text-zinc-950">{l.p.status === 'cancelado' ? '—' : formatarBRL(l.saldo)}</dd>
                    </div>
                  </dl>
                  {acoes(l, 'cartao')}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
