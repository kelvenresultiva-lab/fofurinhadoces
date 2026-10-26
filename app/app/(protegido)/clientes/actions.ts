'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function lerCampos(formData: FormData) {
  const campo = (nome: string) => {
    const valor = String(formData.get(nome) ?? '').trim()
    return valor === '' ? null : valor
  }

  return {
    nome: campo('nome'),
    cpf: campo('cpf'),
    telefone: campo('telefone'),
    whatsapp: campo('whatsapp'),
    email: campo('email'),
    instagram: campo('instagram'),
    data_nascimento: campo('data_nascimento'),
    endereco: campo('endereco'),
    cidade: campo('cidade'),
    estado: campo('estado'),
    cep: campo('cep'),
    origem: campo('origem'),
    profissao: campo('profissao'),
    observacoes: campo('observacoes'),
  }
}

export async function criarCliente(formData: FormData) {
  const dados = lerCampos(formData)

  if (!dados.nome) {
    redirect(`/clientes/novo?erro=${encodeURIComponent('Nome é obrigatório.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').insert(dados)

  if (error) {
    redirect(`/clientes/novo?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/clientes')
  redirect('/clientes')
}

export async function atualizarCliente(id: string, formData: FormData) {
  const dados = lerCampos(formData)

  if (!dados.nome) {
    redirect(`/clientes/${id}?erro=${encodeURIComponent('Nome é obrigatório.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update(dados).eq('id', id)

  if (error) {
    redirect(`/clientes/${id}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/clientes')
  redirect('/clientes')
}

export async function alternarStatusCliente(id: string, statusAtual: string) {
  const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo'
  const supabase = await createClient()
  await supabase.from('clientes').update({ status: novoStatus }).eq('id', id)
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
}
