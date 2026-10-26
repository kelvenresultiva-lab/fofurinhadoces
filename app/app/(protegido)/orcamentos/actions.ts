'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { STATUS_ORCAMENTO, labelStatusOrcamento, podeEditarOrcamento } from './opcoes'
import { normalizarPercentual } from './desconto'
import { normalizarPreco } from '../produtos/preco'

async function buscarOrcamentoOuSair(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orcamentoId: string
) {
  const { data: orcamento } = await supabase
    .from('orcamentos')
    .select('status')
    .eq('id', orcamentoId)
    .maybeSingle()

  if (!orcamento) {
    redirect('/orcamentos')
  }

  return orcamento
}

function garantirEditavel(orcamentoId: string, status: string) {
  if (!podeEditarOrcamento(status)) {
    redirect(
      `/orcamentos/${orcamentoId}?erro=${encodeURIComponent(
        `Orçamento com status "${labelStatusOrcamento(status)}" não pode mais ser alterado.`
      )}`
    )
  }
}

export async function criarOrcamento(formData: FormData) {
  const eventoId = String(formData.get('evento_id') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null

  if (!eventoId) {
    redirect(`/orcamentos/novo?erro=${encodeURIComponent('Selecione um evento.')}`)
  }

  const supabase = await createClient()

  // Confiança zero no query param / no valor enviado: o evento é buscado sob RLS —
  // se pertencer a outra empresa, a busca simplesmente não encontra nada.
  const { data: evento } = await supabase.from('eventos').select('cliente_id').eq('id', eventoId).maybeSingle()

  if (!evento) {
    redirect(`/orcamentos/novo?erro=${encodeURIComponent('Evento inválido.')}`)
  }

  const { data: orcamento, error } = await supabase
    .from('orcamentos')
    .insert({ evento_id: eventoId, cliente_id: evento.cliente_id, observacoes })
    .select('id')
    .single()

  if (error) {
    const mensagem =
      error.code === '23505'
        ? 'Não foi possível gerar o número do orçamento agora (conflito de numeração). Tente novamente.'
        : error.message
    redirect(`/orcamentos/novo?erro=${encodeURIComponent(mensagem)}`)
  }

  redirect(`/orcamentos/${orcamento.id}`)
}

export async function adicionarItem(orcamentoId: string, formData: FormData) {
  const supabase = await createClient()
  const orcamento = await buscarOrcamentoOuSair(supabase, orcamentoId)
  garantirEditavel(orcamentoId, orcamento.status)

  const produtoId = String(formData.get('produto_id') ?? '').trim()
  const quantidade = Number(formData.get('quantidade'))

  if (!produtoId) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Selecione um produto.')}`)
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Quantidade precisa ser maior que zero.')}`)
  }

  // Repete a checagem que a RLS também aplica (produto precisa ser da mesma empresa) e
  // além disso exige ativo=true — um produto inativo não deve ser oferecido para itens
  // novos, mesmo que a RLS sozinha já bloquearia produto de outra empresa.
  const { data: produto } = await supabase
    .from('produtos')
    .select('id, preco')
    .eq('id', produtoId)
    .eq('ativo', true)
    .maybeSingle()

  if (!produto) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Produto inválido ou inativo.')}`)
  }

  // valor_unitario é gravado agora (snapshot) — se o preço do produto mudar depois no
  // catálogo, este item continua com o valor de quando foi adicionado.
  const { error } = await supabase.from('orcamento_itens').insert({
    orcamento_id: orcamentoId,
    produto_id: produtoId,
    quantidade,
    valor_unitario: produto.preco ?? 0,
  })

  if (error) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/orcamentos/${orcamentoId}`)
  redirect(`/orcamentos/${orcamentoId}`)
}

export async function atualizarQuantidadeItem(itemId: string, orcamentoId: string, formData: FormData) {
  const supabase = await createClient()
  const orcamento = await buscarOrcamentoOuSair(supabase, orcamentoId)
  garantirEditavel(orcamentoId, orcamento.status)

  const quantidade = Number(formData.get('quantidade'))
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Quantidade precisa ser maior que zero.')}`)
  }

  await supabase.from('orcamento_itens').update({ quantidade }).eq('id', itemId).eq('orcamento_id', orcamentoId)

  revalidatePath(`/orcamentos/${orcamentoId}`)
  redirect(`/orcamentos/${orcamentoId}`)
}

export async function removerItem(itemId: string, orcamentoId: string) {
  const supabase = await createClient()
  const orcamento = await buscarOrcamentoOuSair(supabase, orcamentoId)
  garantirEditavel(orcamentoId, orcamento.status)

  await supabase.from('orcamento_itens').delete().eq('id', itemId).eq('orcamento_id', orcamentoId)

  revalidatePath(`/orcamentos/${orcamentoId}`)
  redirect(`/orcamentos/${orcamentoId}`)
}

export async function atualizarDadosOrcamento(orcamentoId: string, formData: FormData) {
  const supabase = await createClient()
  const orcamento = await buscarOrcamentoOuSair(supabase, orcamentoId)
  garantirEditavel(orcamentoId, orcamento.status)

  const descontoTipo = String(formData.get('desconto_tipo') ?? 'valor')
  if (descontoTipo !== 'valor' && descontoTipo !== 'percentual') {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Tipo de desconto inválido.')}`)
  }

  const descontoValorBruto = String(formData.get('desconto_valor') ?? '')
  const descontoNormalizado =
    descontoTipo === 'percentual' ? normalizarPercentual(descontoValorBruto) : normalizarPreco(descontoValorBruto)

  if (!descontoNormalizado.ok) {
    redirect(
      `/orcamentos/${orcamentoId}?erro=${encodeURIComponent(
        descontoTipo === 'percentual'
          ? 'Desconto percentual inválido (use um número entre 0 e 100).'
          : 'Desconto em valor inválido.'
      )}`
    )
  }

  const dataValidade = String(formData.get('data_validade') ?? '').trim() || null
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null

  const { error } = await supabase
    .from('orcamentos')
    .update({
      desconto_tipo: descontoTipo,
      desconto_valor: descontoNormalizado.valor ?? '0',
      data_validade: dataValidade,
      observacoes,
    })
    .eq('id', orcamentoId)

  if (error) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/orcamentos/${orcamentoId}`)
  redirect(`/orcamentos/${orcamentoId}`)
}

export async function atualizarStatusOrcamento(orcamentoId: string, formData: FormData) {
  const novoStatus = String(formData.get('status') ?? '')
  if (!STATUS_ORCAMENTO.some((s) => s.value === novoStatus)) {
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent('Status inválido.')}`)
  }

  const supabase = await createClient()
  const orcamento = await buscarOrcamentoOuSair(supabase, orcamentoId)

  if (orcamento.status === novoStatus) {
    redirect(`/orcamentos/${orcamentoId}`)
  }

  const { error } = await supabase.from('orcamentos').update({ status: novoStatus }).eq('id', orcamentoId)

  if (error) {
    const mensagem =
      error.code === '23505'
        ? 'Este evento já possui outro orçamento aprovado. Só é permitido um orçamento aprovado por evento.'
        : error.message
    redirect(`/orcamentos/${orcamentoId}?erro=${encodeURIComponent(mensagem)}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('orcamento_historico').insert({
    orcamento_id: orcamentoId,
    usuario_id: user?.id ?? null,
    texto: `Status alterado de "${labelStatusOrcamento(orcamento.status)}" para "${labelStatusOrcamento(novoStatus)}".`,
  })

  revalidatePath(`/orcamentos/${orcamentoId}`)
  revalidatePath('/orcamentos')
  redirect(`/orcamentos/${orcamentoId}`)
}
