'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarPreco } from '../produtos/preco'
import { dataValida } from '../dashboard/periodo'
import { hojeISO } from '../eventos/datas'
import { FORMAS_PAGAMENTO } from '../contratos/opcoes'
import {
  CATEGORIAS_DESPESA,
  DESCRICAO_DESPESA_MAX,
  OBSERVACOES_DESPESA_MAX,
  type EstadoAcaoDespesa,
} from './opcoes'

// empresa_id nunca vem da tela: o default da coluna é current_empresa_id() e a RLS confere no
// WITH CHECK. As regras de status (nasce pendente; paga/cancelada não muda mais) também estão no
// banco (trigger despesas_protege_status); aqui só validamos para dar mensagens claras.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validarCampos(formData: FormData):
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'ok'; dados: { descricao: string; categoria: string; valor: string; vencimento: string; observacoes: string | null } } {
  const descricao = String(formData.get('descricao') ?? '').trim()
  const categoria = String(formData.get('categoria') ?? '')
  const vencimento = String(formData.get('vencimento') ?? '')
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!descricao) return { tipo: 'erro', mensagem: 'Descrição é obrigatória.' }
  if (descricao.length > DESCRICAO_DESPESA_MAX) {
    return { tipo: 'erro', mensagem: `A descrição deve ter no máximo ${DESCRICAO_DESPESA_MAX} caracteres.` }
  }
  if (!CATEGORIAS_DESPESA.some((c) => c.value === categoria)) return { tipo: 'erro', mensagem: 'Escolha uma categoria.' }

  const valor = normalizarPreco(String(formData.get('valor') ?? ''))
  if (!valor.ok || !valor.valor || Number(valor.valor) <= 0) {
    return { tipo: 'erro', mensagem: 'Informe um valor maior que zero, como 150,00.' }
  }
  if (!dataValida(vencimento)) return { tipo: 'erro', mensagem: 'Informe uma data de vencimento válida.' }
  if (observacoes.length > OBSERVACOES_DESPESA_MAX) {
    return { tipo: 'erro', mensagem: `As observações devem ter no máximo ${OBSERVACOES_DESPESA_MAX} caracteres.` }
  }

  return { tipo: 'ok', dados: { descricao, categoria, valor: valor.valor, vencimento, observacoes: observacoes || null } }
}

export async function criarDespesa(formData: FormData) {
  const resultado = validarCampos(formData)
  if (resultado.tipo === 'erro') {
    redirect(`/despesas/nova?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('despesas').insert(resultado.dados)
  if (error) {
    redirect(`/despesas/nova?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/despesas')
  redirect(`/despesas?sucesso=${encodeURIComponent('Despesa cadastrada.')}`)
}

export async function atualizarDespesa(id: string, formData: FormData) {
  if (!UUID.test(id)) redirect('/despesas')
  const resultado = validarCampos(formData)
  if (resultado.tipo === 'erro') {
    redirect(`/despesas/${id}?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  // Só despesa pendente é editável: o filtro por status faz a atualização não achar a linha se ela
  // tiver sido paga/cancelada nesse meio-tempo.
  const supabase = await createClient()
  const { data, error } = await supabase.from('despesas').update(resultado.dados).eq('id', id).eq('status', 'pendente').select('id')
  if (error) {
    redirect(`/despesas/${id}?erro=${encodeURIComponent(error.message)}`)
  }
  if (!data || data.length === 0) {
    redirect(`/despesas/${id}?erro=${encodeURIComponent('Só despesas pendentes podem ser editadas.')}`)
  }

  revalidatePath('/despesas')
  redirect(`/despesas?sucesso=${encodeURIComponent('Despesa atualizada.')}`)
}

export async function pagarDespesa(id: string, _estado: EstadoAcaoDespesa, formData: FormData): Promise<EstadoAcaoDespesa> {
  if (!UUID.test(id)) return { erro: 'Despesa inválida.' }
  const dataPagamento = String(formData.get('data_pagamento') ?? '')
  const forma = String(formData.get('forma_pagamento') ?? '')

  if (!dataValida(dataPagamento)) return { erro: 'Informe uma data de pagamento válida.' }
  if (dataPagamento > hojeISO()) return { erro: 'A data do pagamento não pode ser futura.' }
  if (!FORMAS_PAGAMENTO.some((f) => f.value === forma)) return { erro: 'Escolha a forma de pagamento.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('despesas')
    .update({ status: 'paga', data_pagamento: dataPagamento, forma_pagamento: forma })
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id')
  if (error) return { erro: error.message }
  if (!data || data.length === 0) return { erro: 'Esta despesa não está mais pendente.' }

  revalidatePath('/despesas')
  return { ok: true }
}

export async function cancelarDespesa(id: string, _estado: EstadoAcaoDespesa, _formData: FormData): Promise<EstadoAcaoDespesa> {
  void _formData
  if (!UUID.test(id)) return { erro: 'Despesa inválida.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', id).eq('status', 'pendente').select('id')
  if (error) return { erro: error.message }
  if (!data || data.length === 0) return { erro: 'Esta despesa não está mais pendente.' }

  revalidatePath('/despesas')
  return { ok: true }
}
