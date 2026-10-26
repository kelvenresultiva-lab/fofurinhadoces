import { createClient } from '@/lib/supabase/server'

// Serve a logo da empresa do usuário logado a partir do bucket privado `documentos`. A RLS de empresas
// e a policy de Storage (pasta da própria empresa) impedem ler a logo de outra empresa. A URL usada no
// app leva ?v=<caminho>, que muda a cada troca de logo, então o navegador pode guardar em cache.
export async function GET() {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return new Response(null, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('empresas(logo)').eq('id', claims.claims.sub).maybeSingle()
  const empresa = usuario?.empresas as { logo: string | null } | { logo: string | null }[] | null | undefined
  const caminho = Array.isArray(empresa) ? empresa[0]?.logo : empresa?.logo
  if (!caminho) return new Response(null, { status: 404 })

  const { data: arquivo, error } = await supabase.storage.from('documentos').download(caminho)
  if (error || !arquivo) return new Response(null, { status: 404 })

  return new Response(arquivo, {
    headers: {
      'Content-Type': arquivo.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
