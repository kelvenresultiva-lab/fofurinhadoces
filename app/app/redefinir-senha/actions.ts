'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EstadoNovaSenha = { erro?: string } | null

// Chamada depois que o link de redefinição abriu a sessão de recuperação (/auth/confirm). Usa o
// fluxo oficial (auth.updateUser) na sessão do próprio usuário; a senha atual não é pedida nem lida.
export async function definirNovaSenha(_estado: EstadoNovaSenha, formData: FormData): Promise<EstadoNovaSenha> {
  const senha = String(formData.get('senha') ?? '')
  const confirmacao = String(formData.get('confirmacao') ?? '')
  if (senha.length < 8) return { erro: 'A nova senha precisa ter pelo menos 8 caracteres.' }
  if (senha !== confirmacao) return { erro: 'As senhas não coincidem.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return { erro: 'O link expirou. Peça um novo link em Configurações.' }

  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) return { erro: `Não foi possível salvar a nova senha: ${error.message}` }
  redirect(`/configuracoes?senha=${encodeURIComponent('Senha alterada com sucesso.')}`)
}
