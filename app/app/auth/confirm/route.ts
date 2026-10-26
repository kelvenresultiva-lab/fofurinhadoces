import type { EmailOtpType } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'
  // Só caminhos internos (evita redirecionar para outro site pelo parâmetro).
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  // Link de redefinição de senha no formato PKCE (?code=...): troca o código pela sessão de
  // recuperação e segue para a tela de nova senha. O verificador do código fica no cookie gravado
  // quando o link foi pedido, por isso o link precisa ser aberto no mesmo navegador.
  if (code && !tokenHash) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect(next)
    redirect(`/login?erro=${encodeURIComponent('Link inválido ou expirado. Peça um novo link em Configurações.')}`)
  }

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: usuarioExistente } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (!usuarioExistente) {
          const meta = user.user_metadata as {
            nome_empresa?: string
            nome_usuario?: string
            telefone?: string | null
          }

          await supabase.rpc('criar_empresa_e_usuario', {
            p_nome_empresa: meta.nome_empresa ?? '',
            p_nome_usuario: meta.nome_usuario ?? '',
            p_email: user.email ?? '',
            p_telefone: meta.telefone ?? null,
          })
        }
      }

      redirect(next)
    }
  }

  redirect(`/login?erro=${encodeURIComponent('Link de confirmação inválido ou expirado.')}`)
}
