'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarPreco } from '../produtos/preco'

// Fina de propósito: toda a regra financeira (trava de linha, saldo, sincronia
// parcelas.valor_pago/status, bloqueio de parcela/contrato cancelado) vive só na
// RPC registrar_recebimento. Não duplicamos nada disso aqui.
export async function registrarRecebimento(parcelaId: string, contratoId: string, formData: FormData) {
  const supabase = await createClient()

  // Quem abre o formulário pela listagem de Parcelas volta para ela (com busca/filtros preservados);
  // qualquer outro valor cai na página do contrato. Só aceitamos caminhos de /parcelas.
  const retornoParam = String(formData.get('retorno') ?? '')
  const retorno = /^\/parcelas(\?[^#]*)?$/.test(retornoParam) ? retornoParam : `/contratos/${contratoId}`
  const destino = (chave: 'erro' | 'sucesso', mensagem: string) => {
    const url = new URL(retorno, 'http://local')
    url.searchParams.delete('erro')
    url.searchParams.delete('sucesso')
    url.searchParams.set(chave, mensagem)
    return `${url.pathname}${url.search}`
  }

  const valorNormalizado = normalizarPreco(String(formData.get('valor') ?? ''))
  if (!valorNormalizado.ok || !valorNormalizado.valor) {
    redirect(destino('erro', 'Informe um valor válido para o recebimento.'))
  }

  const data = String(formData.get('data') ?? '').trim() || null
  const formaPagamento = String(formData.get('forma_pagamento') ?? '').trim() || null
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null

  const { error } = await supabase.rpc('registrar_recebimento', {
    p_parcela_id: parcelaId,
    p_valor: valorNormalizado.valor,
    p_data: data,
    p_forma_pagamento: formaPagamento,
    p_observacoes: observacoes,
  })

  if (error) {
    redirect(destino('erro', error.message))
  }

  revalidatePath(`/contratos/${contratoId}`)
  revalidatePath('/financeiro')
  revalidatePath('/parcelas')
  redirect(destino('sucesso', 'Recebimento registrado com sucesso.'))
}
