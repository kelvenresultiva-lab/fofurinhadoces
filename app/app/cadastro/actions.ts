'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function cadastrar(formData: FormData) {
  const nomeEmpresa = String(formData.get('nome_empresa') ?? '').trim()
  const nomeUsuario = String(formData.get('nome_usuario') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const telefone = String(formData.get('telefone') ?? '').trim() || null
  const password = String(formData.get('password') ?? '')
  const confirmacao = String(formData.get('password_confirmacao') ?? '')

  if (password !== confirmacao) {
    redirect(`/cadastro?erro=${encodeURIComponent('As senhas não coincidem.')}`)
  }

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000'
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nome_empresa: nomeEmpresa, nome_usuario: nomeUsuario, telefone },
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
    },
  })

  if (error) {
    redirect(`/cadastro?erro=${encodeURIComponent(error.message)}`)
  }

  // Se o projeto exigir confirmação de e-mail, ainda não há sessão aqui:
  // a empresa + usuario só são criados em /auth/confirm, quando o link é aberto.
  if (!data.session) {
    redirect('/cadastro/verifique-email')
  }

  const { error: rpcError } = await supabase.rpc('criar_empresa_e_usuario', {
    p_nome_empresa: nomeEmpresa,
    p_nome_usuario: nomeUsuario,
    p_email: email,
    p_telefone: telefone,
  })

  if (rpcError) {
    redirect(`/cadastro?erro=${encodeURIComponent(rpcError.message)}`)
  }

  redirect('/dashboard')
}
