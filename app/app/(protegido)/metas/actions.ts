'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarPreco } from '../produtos/preco'
import { mesValido } from './calculos'

// Grava só as METAS do mês (nunca o realizado, que é calculado). empresa_id vem do default
// current_empresa_id() e a RLS confere; a UNIQUE (empresa_id, mes_referencia) permite o upsert:
// definir de novo o mesmo mês edita a meta existente.
export async function salvarMeta(formData: FormData) {
  const mes = String(formData.get('mes') ?? '')
  const voltar = (chave: 'erro' | 'sucesso', msg: string, editar = false) =>
    redirect(`/metas?mes=${mesValido(mes) ? mes : ''}${editar ? '&editar=1' : ''}&${chave}=${encodeURIComponent(msg)}`)

  if (!mesValido(mes)) voltar('erro', 'Informe o mês e o ano da meta.', true)

  const lerValor = (campo: string) => {
    const bruto = String(formData.get(campo) ?? '')
    const v = normalizarPreco(bruto)
    return v.ok ? v.valor ?? '0' : null
  }
  const metaContratos = lerValor('meta_contratos')
  const metaEntradas = lerValor('meta_entradas')
  if (metaContratos === null || metaEntradas === null) {
    voltar('erro', 'Valores inválidos. Use valores como 50.000,00 (deixe 0 para não definir uma das metas).', true)
  }
  if (!(Number(metaContratos) > 0 || Number(metaEntradas) > 0)) {
    voltar('erro', 'Informe pelo menos uma meta maior que zero.', true)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('metas')
    .upsert(
      { mes_referencia: `${mes}-01`, meta_contratos: metaContratos, meta_entradas: metaEntradas },
      { onConflict: 'empresa_id,mes_referencia' }
    )
  if (error) voltar('erro', error.message, true)

  revalidatePath('/metas')
  revalidatePath('/dashboard')
  voltar('sucesso', 'Metas salvas.')
}
