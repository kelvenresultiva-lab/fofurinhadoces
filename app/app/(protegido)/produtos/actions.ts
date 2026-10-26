'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarPreco } from './preco'

function lerCampos(formData: FormData) {
  const campo = (nome: string) => {
    const valor = String(formData.get(nome) ?? '').trim()
    return valor === '' ? null : valor
  }

  return {
    nome: campo('nome'),
    categoria: campo('categoria'),
    unidade: campo('unidade'),
    precoBruto: String(formData.get('preco') ?? ''),
    diasAntecedenciaBruto: String(formData.get('dias_antecedencia_producao') ?? ''),
  }
}

function validarCampos(
  campos: ReturnType<typeof lerCampos>
):
  | { tipo: 'erro'; mensagem: string }
  | {
      tipo: 'ok'
      dados: {
        nome: string
        categoria: string | null
        unidade: string
        preco: string | null
        dias_antecedencia_producao: number
      }
    } {
  if (!campos.nome) {
    return { tipo: 'erro', mensagem: 'Nome é obrigatório.' }
  }

  const preco = normalizarPreco(campos.precoBruto)
  if (!preco.ok) {
    return { tipo: 'erro', mensagem: 'Preço inválido. Use um valor como 45,90.' }
  }

  let diasAntecedencia = 2
  if (campos.diasAntecedenciaBruto.trim() !== '') {
    const numero = Number(campos.diasAntecedenciaBruto)
    if (!Number.isInteger(numero) || numero < 0) {
      return {
        tipo: 'erro',
        mensagem: 'Antecedência de produção precisa ser um número de dias válido (0 ou mais).',
      }
    }
    diasAntecedencia = numero
  }

  return {
    tipo: 'ok',
    dados: {
      nome: campos.nome,
      categoria: campos.categoria,
      unidade: campos.unidade ?? 'unidade',
      preco: preco.valor,
      dias_antecedencia_producao: diasAntecedencia,
    },
  }
}

export async function criarProduto(formData: FormData) {
  const resultado = validarCampos(lerCampos(formData))

  if (resultado.tipo === 'erro') {
    redirect(`/produtos/novo?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('produtos').insert(resultado.dados)

  if (error) {
    redirect(`/produtos/novo?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/produtos')
  redirect('/produtos')
}

export async function atualizarProduto(id: string, formData: FormData) {
  const resultado = validarCampos(lerCampos(formData))

  if (resultado.tipo === 'erro') {
    redirect(`/produtos/${id}?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('produtos').update(resultado.dados).eq('id', id)

  if (error) {
    redirect(`/produtos/${id}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/produtos')
  redirect('/produtos')
}

export async function alternarStatusProduto(id: string, ativoAtual: boolean) {
  const supabase = await createClient()
  await supabase.from('produtos').update({ ativo: !ativoAtual }).eq('id', id)
  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
}
