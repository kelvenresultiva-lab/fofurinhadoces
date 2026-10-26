import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/cadastro', '/auth/confirm']

// Resposta de erro legível (sem stack nem valores de configuração): na hospedagem, um 500 em branco
// não diz nada; o detalhe técnico vai para o log do servidor.
function erroDeConfiguracao(mensagem: string) {
  return new NextResponse(mensagem, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const faltando = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !chave && 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(Boolean)
  if (faltando.length > 0) {
    console.error(`[proxy] variáveis de ambiente ausentes: ${faltando.join(', ')}`)
    return erroDeConfiguracao(
      `Configuração do servidor incompleta: faltam as variáveis ${faltando.join(' e ')}. Cadastre-as na hospedagem e faça um novo deploy.`
    )
  }

  try {
    return await atualizarSessao(request, url!, chave!)
  } catch (erro) {
    console.error('[proxy] falha ao validar a sessão:', erro)
    return erroDeConfiguracao('Não foi possível validar a sessão (falha ao falar com o Supabase). Veja o log do servidor.')
  }
}

async function atualizarSessao(request: NextRequest, supabaseUrl: string, supabaseChave: string) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseChave,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims valida a assinatura do JWT localmente (chaves assimétricas ES256 do projeto, JWKS em
  // cache) e renova a sessão quando o token expira — sem ida ao servidor de Auth a cada clique.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
