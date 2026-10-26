'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarPreco } from '../produtos/preco'

// Não reproduz a lógica interna da RPC converter_orcamento_em_contrato (numeração de
// parcela, cópia de itens, vínculo com o orçamento) — só valida o que dá pra checar
// antes de gastar uma chamada, e delega o resto pro banco.
export async function gerarContrato(orcamentoId: string, formData: FormData) {
  const supabase = await createClient()

  const { data: orcamento } = await supabase
    .from('orcamentos')
    .select('status, contrato_id')
    .eq('id', orcamentoId)
    .maybeSingle()

  if (!orcamento) {
    redirect('/orcamentos')
  }

  if (orcamento.status !== 'aprovado') {
    redirect(
      `/orcamentos/${orcamentoId}?erro=${encodeURIComponent(
        'Este orçamento precisa estar aprovado antes de gerar o contrato.'
      )}`
    )
  }

  if (orcamento.contrato_id) {
    redirect(`/contratos/${orcamento.contrato_id}`)
  }

  const primeiroVencimento = String(formData.get('primeiro_vencimento') ?? '').trim()
  if (!primeiroVencimento) {
    redirect(
      `/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Informe a data do primeiro vencimento.')}`
    )
  }

  const numeroParcelas = Number(formData.get('numero_parcelas') ?? 1)
  if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Número de parcelas inválido.')}`)
  }

  const entradaNormalizada = normalizarPreco(String(formData.get('entrada') ?? ''))
  if (!entradaNormalizada.ok) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Valor de entrada inválido.')}`)
  }

  const dataEntrada = String(formData.get('data_entrada') ?? '').trim() || null

  const { data: contratoId, error } = await supabase.rpc('converter_orcamento_em_contrato', {
    p_orcamento_id: orcamentoId,
    p_entrada: entradaNormalizada.valor ?? '0',
    p_data_entrada: dataEntrada,
    p_numero_parcelas: numeroParcelas,
    p_primeiro_vencimento: primeiroVencimento,
  })

  if (error) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/orcamentos/${orcamentoId}`)
  revalidatePath('/contratos')
  redirect(`/contratos/${contratoId}`)
}
