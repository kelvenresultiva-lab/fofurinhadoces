'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TIPOS_EVENTO, STATUS_EVENTO } from './opcoes'

function lerCampos(formData: FormData) {
  const campo = (nome: string) => {
    const valor = String(formData.get(nome) ?? '').trim()
    return valor === '' ? null : valor
  }

  return {
    cliente_id: campo('cliente_id'),
    tipo: campo('tipo'),
    titulo: campo('titulo'),
    data: campo('data'),
    horario: campo('horario'),
    local: campo('local'),
    cidade: campo('cidade'),
    numeroConvidadosBruto: campo('numero_convidados'),
    status: campo('status'),
    observacoes: campo('observacoes'),
  }
}

function validarCampos(
  campos: ReturnType<typeof lerCampos>
):
  | { tipo: 'erro'; mensagem: string }
  | {
      tipo: 'ok'
      dados: {
        cliente_id: string
        tipo: string
        titulo: string | null
        data: string | null
        horario: string | null
        local: string | null
        cidade: string | null
        numero_convidados: number | null
        status: string
        observacoes: string | null
      }
    } {
  if (!campos.cliente_id) {
    return { tipo: 'erro', mensagem: 'Selecione um cliente.' }
  }

  const tipoValido = TIPOS_EVENTO.some((t) => t.value === campos.tipo)
  if (!campos.tipo || !tipoValido) {
    return { tipo: 'erro', mensagem: 'Tipo de evento inválido.' }
  }

  const statusValido = campos.status && STATUS_EVENTO.some((s) => s.value === campos.status)
  const status = statusValido ? campos.status! : 'planejado'

  let numeroConvidados: number | null = null
  if (campos.numeroConvidadosBruto !== null) {
    const numero = Number(campos.numeroConvidadosBruto)
    if (!Number.isInteger(numero) || numero < 0) {
      return { tipo: 'erro', mensagem: 'Número de convidados precisa ser um número válido (0 ou mais).' }
    }
    numeroConvidados = numero
  }

  return {
    tipo: 'ok',
    dados: {
      cliente_id: campos.cliente_id,
      tipo: campos.tipo,
      titulo: campos.titulo,
      data: campos.data,
      horario: campos.horario,
      local: campos.local,
      cidade: campos.cidade,
      numero_convidados: numeroConvidados,
      status,
      observacoes: campos.observacoes,
    },
  }
}

export async function criarEvento(formData: FormData) {
  const resultado = validarCampos(lerCampos(formData))

  if (resultado.tipo === 'erro') {
    redirect(`/eventos/novo?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('eventos').insert(resultado.dados)

  if (error) {
    redirect(`/eventos/novo?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/eventos')
  redirect('/eventos')
}

export async function atualizarEvento(id: string, formData: FormData) {
  const resultado = validarCampos(lerCampos(formData))

  if (resultado.tipo === 'erro') {
    redirect(`/eventos/${id}?erro=${encodeURIComponent(resultado.mensagem)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('eventos').update(resultado.dados).eq('id', id)

  if (error) {
    redirect(`/eventos/${id}?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/eventos')
  revalidatePath(`/clientes/${resultado.dados.cliente_id}`)
  redirect('/eventos')
}
