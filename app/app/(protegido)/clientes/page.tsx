import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatarBRL } from '../dashboard/widgets'
import { lerTudo } from '../contratos/(lista)/leitura'
import { paraContratoPlano, planoPagamento, SELECT_CONTRATO_PLANO, type ContratoLido, type PlanoPagamento } from './plano'

function SeloStatus({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        status === 'ativo' ? 'bg-green-50 text-green-700' : 'bg-zinc-100 text-zinc-600'
      }`}
    >
      {status === 'ativo' ? 'Ativo' : 'Inativo'}
    </span>
  )
}

// Entrada com a situação (paga/pendente) logo abaixo do valor.
function Entrada({ plano }: { plano: PlanoPagamento }) {
  if (!plano.entrada) return <span className="text-zinc-400">Sem entrada</span>
  return (
    <>
      <span className="font-medium text-zinc-950">{formatarBRL(plano.entrada.valor)}</span>
      <span className={`block text-xs ${plano.entrada.paga ? 'text-green-700' : 'text-amber-700'}`}>{plano.entrada.paga ? 'Paga' : 'Pendente'}</span>
    </>
  )
}

const semContrato = <span className="text-zinc-400">Sem contrato</span>

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('clientes').select('id, nome, telefone, whatsapp, cidade, status').order('nome')
  if (q) query = query.ilike('nome', `%${q}%`)

  // Contratos com evento, parcelas e nº do orçamento embutidos (uma consulta), em paralelo com os clientes.
  const [{ data: clientes, error: erroClientes }, contratosR] = await Promise.all([
    query,
    lerTudo<ContratoLido>((a, b) => supabase.from('contratos').select(SELECT_CONTRATO_PLANO).order('created_at', { ascending: false }).range(a, b)).then(
      (dados) => ({ ok: true as const, dados }),
      () => ({ ok: false as const })
    ),
  ])

  // Por cliente, o contrato mostrado é o ativo mais recente (ou o mais recente, se todos cancelados).
  const planosPorCliente = new Map<string, PlanoPagamento[]>()
  if (contratosR.ok) {
    for (const linha of contratosR.dados) {
      const c = paraContratoPlano(linha)
      if (!c.clienteId) continue
      const lista = planosPorCliente.get(c.clienteId) ?? []
      lista.push(planoPagamento(c))
      planosPorCliente.set(c.clienteId, lista)
    }
  }
  const principal = (clienteId: string) => {
    const lista = planosPorCliente.get(clienteId) ?? []
    return { plano: lista.find((p) => !p.cancelado) ?? lista[0] ?? null, total: lista.length }
  }

  const campo = 'w-full max-w-xs rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'
  const botaoVer = 'inline-block whitespace-nowrap rounded-full border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">Contato, valor do contrato, entrada e como o restante será pago.</p>
        </div>
        <Link href="/clientes/novo" className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
          Novo cliente
        </Link>
      </div>

      <form className="flex gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nome..." aria-label="Buscar clientes" className={campo} />
        <button type="submit" className="rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
          Buscar
        </button>
      </form>

      {(erroClientes || !contratosR.ok) && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar {erroClientes ? 'os clientes' : 'os contratos'}. Atualize a página; se continuar, tente novamente em instantes.
        </p>
      )}

      {!erroClientes && (!clientes || clientes.length === 0) ? (
        <p className="text-sm text-zinc-600">{q ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
      ) : clientes && clientes.length > 0 ? (
        <>
          {/* Telas largas: tabela. */}
          <div className="hidden overflow-hidden rounded-2xl border border-black/[.06] bg-white shadow-sm min-[1200px]:block">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3">
              <thead className="border-b border-black/[.06] bg-zinc-50/70 text-zinc-500">
                <tr>
                  <th className="py-3 font-medium">Nome</th>
                  <th className="py-3 font-medium">Contato</th>
                  <th className="py-3 text-right font-medium">Contrato</th>
                  <th className="py-3 font-medium">Entrada</th>
                  <th className="py-3 font-medium">Restante</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => {
                  const { plano, total } = principal(cliente.id)
                  return (
                    <tr key={cliente.id} className="border-t border-black/[.06] align-top hover:bg-zinc-50/60">
                      <td className="py-3 font-medium text-zinc-950">{cliente.nome}</td>
                      <td className="whitespace-nowrap py-3 text-zinc-600">{cliente.whatsapp || cliente.telefone || '—'}</td>
                      <td className="whitespace-nowrap py-3 text-right">
                        {plano ? (
                          <>
                            <span className={`font-medium ${plano.cancelado ? 'text-zinc-400 line-through' : 'text-zinc-950'}`}>{formatarBRL(plano.valor)}</span>
                            <span className="block text-xs text-zinc-500">
                              {plano.cancelado ? 'Cancelado' : `#${plano.numero ?? '—'}`}
                              {total > 1 && ` · +${total - 1} contrato${total > 2 ? 's' : ''}`}
                            </span>
                          </>
                        ) : (
                          semContrato
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3">{plano && !plano.cancelado ? <Entrada plano={plano} /> : '—'}</td>
                      <td className="max-w-[20rem] py-3 text-zinc-700">{plano && !plano.cancelado ? plano.restanteTexto : '—'}</td>
                      <td className="py-3">
                        <SeloStatus status={cliente.status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link href={`/clientes/${cliente.id}`} className={botaoVer}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Telas menores: um card por cliente. */}
          <ul className="grid gap-4 sm:grid-cols-2 min-[1200px]:hidden">
            {clientes.map((cliente) => {
              const { plano, total } = principal(cliente.id)
              return (
                <li key={cliente.id} className="flex flex-col gap-3 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-zinc-950">{cliente.nome}</p>
                      <p className="text-sm text-zinc-500">{cliente.whatsapp || cliente.telefone || 'Sem contato'}</p>
                    </div>
                    <SeloStatus status={cliente.status} />
                  </div>
                  {plano && !plano.cancelado ? (
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-zinc-500">Contrato #{plano.numero ?? '—'}</dt>
                        <dd className="font-medium text-zinc-950">{formatarBRL(plano.valor)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Entrada</dt>
                        <dd>
                          <Entrada plano={plano} />
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-zinc-500">Restante</dt>
                        <dd className="text-zinc-700">{plano.restanteTexto}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-zinc-500">{plano?.cancelado ? 'Contrato cancelado' : 'Sem contrato'}</p>
                  )}
                  {total > 1 && <p className="text-xs text-zinc-500">+{total - 1} outro(s) contrato(s) na ficha do cliente</p>}
                  <Link href={`/clientes/${cliente.id}`} className={`${botaoVer} text-center`}>
                    Abrir cliente
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}
