import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatarDataBR, formatarDataHoraBR, hojeISO } from '../../eventos/datas'
import { formatarBRL } from '../../dashboard/widgets'
import { labelFormaPagamento } from '../../contratos/opcoes'
import { atualizarDespesa } from '../actions'
import { DespesaForm } from '../DespesaForm'
import { labelCategoriaDespesa, situacaoDespesa } from '../opcoes'

export default async function DespesaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()

  // A RLS só devolve despesa da própria empresa: a de outra empresa cai no 404.
  const supabase = await createClient()
  const { data: despesa, error } = await supabase
    .from('despesas')
    .select('id, descricao, categoria, valor, vencimento, status, data_pagamento, forma_pagamento, observacoes, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Falha ao ler a despesa.')
  if (!despesa) notFound()

  if (despesa.status === 'pendente') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Editar despesa</h1>
          <p className="mt-1 text-sm text-zinc-500">Só despesas pendentes podem ser editadas.</p>
        </div>
        <DespesaForm action={atualizarDespesa.bind(null, despesa.id)} valores={despesa} erro={erro} textoBotao="Salvar alterações" />
      </div>
    )
  }

  // Paga ou cancelada: somente leitura (histórico).
  const situacao = situacaoDespesa(despesa, hojeISO())
  const linhas: [string, string][] = [
    ['Categoria', labelCategoriaDespesa(despesa.categoria)],
    ['Valor', formatarBRL(Number(despesa.valor))],
    ['Vencimento', formatarDataBR(despesa.vencimento)],
    ...(despesa.status === 'paga'
      ? ([
          ['Data do pagamento', formatarDataBR(despesa.data_pagamento)],
          ['Forma de pagamento', despesa.forma_pagamento ? labelFormaPagamento(despesa.forma_pagamento) : '—'],
        ] as [string, string][])
      : []),
    ['Cadastrada em', formatarDataHoraBR(despesa.created_at)],
    ['Observações', despesa.observacoes || '—'],
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold text-zinc-950">{despesa.descricao}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {despesa.status === 'paga'
              ? 'Despesa paga: os dados não podem mais ser alterados.'
              : 'Despesa cancelada: mantida apenas como histórico.'}
          </p>
        </div>
        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${situacao.classes}`}>{situacao.label}</span>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm sm:grid-cols-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className={rotulo === 'Observações' ? 'sm:col-span-2' : ''}>
            <dt className="text-xs text-zinc-500">{rotulo}</dt>
            <dd className="mt-0.5 whitespace-pre-line break-words text-sm font-medium text-zinc-950">{valor}</dd>
          </div>
        ))}
      </dl>

      <Link href="/despesas" className="self-start rounded-full border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
        Voltar para despesas
      </Link>
    </div>
  )
}
