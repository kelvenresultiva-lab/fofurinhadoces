import Link from 'next/link'
import { formatarBRL } from '../dashboard/widgets'
import { BarraProgresso } from './BarraProgresso'
import { carregarDadosMetas } from './dados'
import { mesAtual, numero, progresso, realizadoContratos, realizadoEntradas, rotuloMes } from './calculos'

type ResultadoMetas = { ok: true; dados: Awaited<ReturnType<typeof carregarDadosMetas>> } | { ok: false }

export function ResumoMetasCarregando() {
  return <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/70" aria-busy="true" aria-label="Carregando metas" />
}

// Resumo compacto das metas do MÊS ATUAL para o Dashboard (independe do filtro de período dele).
// Recebe a leitura já iniciada pelo Dashboard (em paralelo com as outras consultas) e é mostrado
// dentro de um Suspense. Falha de leitura fica contida neste bloco: o resto do Dashboard aparece.
export async function ResumoMetas({ dados: leitura }: { dados: Promise<ResultadoMetas> }) {
  const mes = mesAtual()
  const resultado = await leitura
  if (!resultado.ok) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Não foi possível carregar as metas do mês. Atualize a página; se continuar, abra a página de Metas.
      </section>
    )
  }

  const { dados } = resultado
  const meta = dados.metaPorMes.get(mes)
  const metas = [
    { titulo: 'Meta de contratos', meta: numero(meta?.meta_contratos), realizado: realizadoContratos(dados.contratos, mes).valor, rotulo: 'contratado' },
    { titulo: 'Meta de entradas', meta: numero(meta?.meta_entradas), realizado: realizadoEntradas(dados.recebimentos, mes).valor, rotulo: 'recebido' },
  ]

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-950">
          Metas de {rotuloMes(mes)}
        </h2>
        <Link href={meta ? '/metas' : '/metas?editar=1#definir'} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          {meta ? 'Ver metas' : 'Definir metas do mês'}
        </Link>
      </div>
      {!meta ? (
        <p className="text-sm text-zinc-500">
          Nenhuma meta definida para este mês.{' '}
          <Link href="/metas?editar=1#definir" className="font-medium text-indigo-700 hover:underline">
            Definir metas do mês
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {metas.map((m) => {
            const p = progresso(m.meta, m.realizado)
            return (
              <div key={m.titulo} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium text-zinc-700">{m.titulo}</p>
                  <p className="text-xs text-zinc-500">
                    {formatarBRL(m.realizado)} {m.rotulo} · meta {m.meta > 0 ? formatarBRL(m.meta) : 'não definida'}
                  </p>
                </div>
                {p ? (
                  <BarraProgresso percentual={p.percentual} atingida={p.atingida} rotulo={m.titulo} />
                ) : (
                  <p className="text-sm text-zinc-500">Meta não definida.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
