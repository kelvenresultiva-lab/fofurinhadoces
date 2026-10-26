import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, hojeISO } from '../eventos/datas'
import { labelTipo, labelStatusEvento, classesStatus } from '../eventos/opcoes'
import { labelStatusOrcamento, classesStatusOrcamento } from '../orcamentos/opcoes'
import { labelStatusParcela, classesStatusParcela } from '../contratos/opcoes'
import {
  ehVencida,
  parcelasEmAberto,
  resumoFuturo,
  saldoParcela,
  saldoTotal,
  totalRecebido,
  vencendoEntre,
} from '../financeiro/calculos'
import { PERIODOS, resolverPeriodo, ultimosMeses } from './periodo'
import { BarraEmpilhada, CardIndicador, GraficoBarras, Secao, Vazio, formatarBRL } from './widgets'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>
}) {
  const { periodo: periodoParam, de, ate } = await searchParams
  const periodo = resolverPeriodo(periodoParam, de, ate)
  const hoje = hojeISO()
  const meses = ultimosMeses(6)
  const supabase = await createClient()

  // Todas as consultas passam pelo cliente autenticado: a RLS já restringe à empresa do usuário.
  const [parcelasR, recebimentosR, contratosR, clientesR, eventosR, orcamentosR] = await Promise.all([
    supabase.from('parcelas').select('id, contrato_id, numero, vencimento, valor, valor_pago, status'),
    supabase.from('recebimentos').select('valor, data'),
    supabase.from('contratos').select('id, evento_id, status'),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase
      .from('eventos')
      .select('id, cliente_id, tipo, titulo, data, horario, local, cidade, status', { count: 'exact' })
      .gte('data', hoje)
      .neq('status', 'cancelado')
      .order('data')
      .order('horario')
      .limit(5),
    supabase
      .from('orcamentos')
      .select('id, numero, cliente_id, evento_id, valor_total, status, updated_at', { count: 'exact' })
      .in('status', ['enviado', 'em_negociacao'])
      .order('updated_at', { ascending: false })
      .limit(5),
  ])

  const falhou = [parcelasR, recebimentosR, contratosR, clientesR, eventosR, orcamentosR].some((r) => r.error)

  const parcelas = parcelasR.data ?? []
  const recebimentos = recebimentosR.data ?? []
  const contratos = contratosR.data ?? []
  const eventosFuturos = eventosR.data ?? []
  const orcamentosAtencao = orcamentosR.data ?? []

  // Valores futuros: regra única em financeiro/calculos.ts (parcela e contrato não cancelados,
  // só o saldo restante). Os recebimentos abaixo NÃO passam por ela: o histórico de "recebido"
  // permanece íntegro mesmo que o contrato seja cancelado depois.
  const abertas = parcelasEmAberto(parcelas, contratos)
  const futuro = resumoFuturo(abertas, hoje)
  const venceNoPeriodo = vencendoEntre(abertas, periodo.inicio, periodo.fim)
  const { aReceber, emAtraso } = futuro
  const proximosVencimentos = saldoTotal(venceNoPeriodo)

  const recebidoPeriodo = totalRecebido(recebimentos.filter((r) => r.data >= periodo.inicio && r.data <= periodo.fim))
  const recebidoTotal = totalRecebido(recebimentos)
  const recebidoPorMes = meses.map((m) => ({
    label: m.label,
    atual: m.chave === hoje.slice(0, 7),
    valor: totalRecebido(recebimentos.filter((r) => r.data.startsWith(m.chave))),
  }))

  const contratosComSaldo = new Set(abertas.map((p) => p.contrato_id))
  const contratosAtivos = contratos.filter((c) => c.status === 'ativo' && contratosComSaldo.has(c.id)).length

  const listaVencimentos = [...abertas].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6)

  // Nomes: duas consultas em lote (eventos, depois clientes) — sem N+1.
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]))
  const idsEventos = [
    ...new Set([
      ...listaVencimentos.map((p) => contratoPorId.get(p.contrato_id)?.evento_id).filter(Boolean),
      ...orcamentosAtencao.map((o) => o.evento_id),
    ]),
  ] as string[]
  const { data: eventosRef } =
    idsEventos.length > 0
      ? await supabase.from('eventos').select('id, tipo, titulo, data, cliente_id').in('id', idsEventos)
      : { data: [] as { id: string; tipo: string; titulo: string | null; data: string | null; cliente_id: string }[] }
  const eventoPorId = new Map((eventosRef ?? []).map((e) => [e.id, e]))

  const idsClientes = [
    ...new Set([
      ...(eventosRef ?? []).map((e) => e.cliente_id),
      ...eventosFuturos.map((e) => e.cliente_id),
      ...orcamentosAtencao.map((o) => o.cliente_id),
    ]),
  ]
  const { data: clientesRef } =
    idsClientes.length > 0
      ? await supabase.from('clientes').select('id, nome').in('id', idsClientes)
      : { data: [] as { id: string; nome: string }[] }
  const nomeCliente = new Map((clientesRef ?? []).map((c) => [c.id, c.nome]))
  const tituloEvento = (e?: { titulo: string | null; tipo: string }) => (e ? e.titulo || labelTipo(e.tipo) : '—')

  const totalEventosFuturos = eventosR.count ?? 0
  const totalOrcamentosAtencao = orcamentosR.count ?? 0

  const pilula = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${
      ativo ? 'bg-indigo-600 text-white' : 'border border-black/[.08] bg-white text-zinc-600 hover:bg-black/[.04]'
    }`
  const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-600'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Período: {formatarDataBR(periodo.inicio)} a {formatarDataBR(periodo.fim)} (horário de Brasília)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.filter((p) => p.value !== 'personalizado').map((p) => (
            <Link key={p.value} href={`/dashboard?periodo=${p.value}`} className={pilula(periodo.chave === p.value)}>
              {p.label}
            </Link>
          ))}
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="periodo" value="personalizado" />
            <span className={pilula(periodo.chave === 'personalizado')}>Personalizado</span>
            <input type="date" name="de" defaultValue={periodo.chave === 'personalizado' ? periodo.inicio : ''} required className={campo} aria-label="Data inicial" />
            <input type="date" name="ate" defaultValue={periodo.chave === 'personalizado' ? periodo.fim : ''} required className={campo} aria-label="Data final" />
            <button type="submit" className="rounded-lg border border-black/[.08] bg-white px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
              Aplicar
            </button>
          </form>
        </div>

        {'erro' in periodo && periodo.erro && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{periodo.erro}</p>
        )}
        {falhou && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Não foi possível carregar alguns indicadores. Atualize a página; se continuar, tente novamente em instantes.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardIndicador titulo="Recebido no período" valor={formatarBRL(recebidoPeriodo)} tom="verde" detalhe="Pagamentos registrados nas datas do período" />
        <CardIndicador titulo="A receber" valor={formatarBRL(aReceber)} tom="roxo" detalhe={`${abertas.length} parcela(s) em aberto (saldo restante)`} />
        <CardIndicador titulo="Em atraso" valor={formatarBRL(emAtraso)} tom="vermelho" detalhe={`${futuro.qtdEmAtraso} parcela(s) vencida(s)`} />
        <CardIndicador titulo="Próximos vencimentos" valor={formatarBRL(proximosVencimentos)} tom="roxo" detalhe={`${venceNoPeriodo.length} parcela(s) vencendo no período`} />
        <CardIndicador titulo="Contratos ativos" valor={String(contratosAtivos)} detalhe="Ativos e com saldo a receber" />
        <CardIndicador titulo="Orçamentos em negociação" valor={String(totalOrcamentosAtencao)} detalhe="Enviados ou em negociação" />
        <CardIndicador titulo="Próximos eventos" valor={String(totalEventosFuturos)} detalhe="A partir de hoje, sem cancelados" />
        <CardIndicador titulo="Clientes ativos" valor={String(clientesR.count ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Secao titulo="Fluxo de recebimentos (últimos 6 meses)">
          <GraficoBarras dados={recebidoPorMes} />
        </Secao>

        <Secao titulo="Resumo financeiro">
          <BarraEmpilhada
            partes={[
              { label: 'Recebido (total)', valor: recebidoTotal, cor: 'bg-green-500', texto: 'text-green-700' },
              { label: 'A receber no prazo', valor: futuro.aVencer, cor: 'bg-indigo-500', texto: 'text-indigo-700' },
              { label: 'Em atraso', valor: emAtraso, cor: 'bg-red-500', texto: 'text-red-700' },
            ]}
          />
        </Secao>
      </div>

      <Secao titulo="Próximos vencimentos" acao={{ href: '/financeiro', label: 'Ver Financeiro' }}>
        {listaVencimentos.length === 0 ? (
          <Vazio>Nenhuma parcela em aberto. As contas a receber aparecem aqui quando um contrato é gerado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Contrato</th>
                  <th className="py-2 pr-4 font-medium">Vencimento</th>
                  <th className="py-2 pr-4 font-medium">Valor</th>
                  <th className="py-2 pr-4 font-medium">Recebido</th>
                  <th className="py-2 pr-4 font-medium">Saldo</th>
                  <th className="py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {listaVencimentos.map((p) => {
                  const contrato = contratoPorId.get(p.contrato_id)
                  const evento = contrato ? eventoPorId.get(contrato.evento_id) : undefined
                  const vencida = ehVencida(p.vencimento, saldoParcela(p), p.status)
                  return (
                    <tr key={p.id} className={`border-t border-black/[.06] ${vencida ? 'bg-red-50/60' : ''}`}>
                      <td className="py-3 pr-4 text-zinc-950">{evento ? nomeCliente.get(evento.cliente_id) ?? '—' : '—'}</td>
                      <td className="py-3 pr-4">
                        <Link href={`/contratos/${p.contrato_id}`} className="font-medium text-indigo-600 hover:underline">
                          {tituloEvento(evento)} · parcela {p.numero}
                        </Link>
                      </td>
                      <td className={`py-3 pr-4 ${vencida ? 'font-medium text-red-700' : 'text-zinc-600'}`}>{formatarDataBR(p.vencimento)}</td>
                      <td className="py-3 pr-4 text-zinc-600">{formatarBRL(Number(p.valor))}</td>
                      <td className="py-3 pr-4 text-zinc-600">{formatarBRL(Number(p.valor_pago))}</td>
                      <td className="py-3 pr-4 font-medium text-zinc-950">{formatarBRL(saldoParcela(p))}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${vencida ? 'bg-red-100 text-red-700' : classesStatusParcela(p.status)}`}>
                          {vencida ? 'Vencida' : labelStatusParcela(p.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Secao titulo="Próximos eventos" acao={{ href: '/eventos', label: 'Ver Eventos' }}>
          {eventosFuturos.length === 0 ? (
            <Vazio>Nenhum evento futuro. Cadastre um evento para acompanhá-lo aqui.</Vazio>
          ) : (
            <ul className="flex flex-col gap-2">
              {eventosFuturos.map((e) => (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[.06] px-4 py-3 text-sm hover:bg-black/[.02]">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-950">
                        {e.titulo || labelTipo(e.tipo)} · {nomeCliente.get(e.cliente_id) ?? '—'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatarDataBR(e.data)}
                        {e.horario ? ` às ${e.horario.slice(0, 5)}` : ''}
                        {[e.local, e.cidade].filter(Boolean).length > 0 ? ` · ${[e.local, e.cidade].filter(Boolean).join(' — ')}` : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatus(e.status)}`}>{labelStatusEvento(e.status)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Orçamentos que exigem atenção" acao={{ href: '/orcamentos', label: 'Ver Orçamentos' }}>
          {orcamentosAtencao.length === 0 ? (
            <Vazio>Nenhum orçamento enviado ou em negociação.</Vazio>
          ) : (
            <ul className="flex flex-col gap-2">
              {orcamentosAtencao.map((o) => {
                const evento = eventoPorId.get(o.evento_id)
                return (
                  <li key={o.id}>
                    <Link href={`/orcamentos/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[.06] px-4 py-3 text-sm hover:bg-black/[.02]">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-950">
                          #{o.numero} · {nomeCliente.get(o.cliente_id) ?? '—'}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {tituloEvento(evento)} · atualizado em{' '}
                          {new Date(o.updated_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-zinc-950">{formatarBRL(Number(o.valor_total))}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classesStatusOrcamento(o.status)}`}>{labelStatusOrcamento(o.status)}</span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {totalOrcamentosAtencao > orcamentosAtencao.length && (
            <p className="text-xs text-zinc-500">Mostrando {orcamentosAtencao.length} de {totalOrcamentosAtencao}.</p>
          )}
        </Secao>
      </div>
    </div>
  )
}
