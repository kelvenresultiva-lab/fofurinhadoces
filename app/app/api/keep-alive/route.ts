import { createClient } from '@supabase/supabase-js'

// Mantém o projeto do Supabase (plano gratuito) ativo: ele pausa após 7 dias sem uso. A Vercel chama
// esta rota uma vez por dia (vercel.json → crons). Faz só uma contagem leve, sem ler nem alterar dados.
// Se a variável CRON_SECRET estiver cadastrada na Vercel, só aceita chamadas com esse segredo
// (a própria Vercel envia "Authorization: Bearer <CRON_SECRET>" nas execuções do cron).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (segredo && request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return Response.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) {
    return Response.json({ ok: false, erro: 'configuração do Supabase ausente' }, { status: 500 })
  }

  const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })
  // Sem sessão, o RLS devolve zero linhas, mas a consulta chega ao banco — é isso que conta como uso.
  const { error } = await supabase.from('empresas').select('id', { count: 'exact', head: true })

  if (error) {
    console.error('[keep-alive] falha ao consultar o Supabase:', error.message)
    return Response.json({ ok: false, erro: 'falha ao consultar o banco' }, { status: 502 })
  }
  return Response.json({ ok: true, em: new Date().toISOString() })
}
