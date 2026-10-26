import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'

export default async function ProtegidoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, empresa_id, cargo')
    .eq('id', user.id)
    .maybeSingle()

  const { data: empresa } = usuario
    ? await supabase.from('empresas').select('nome').eq('id', usuario.empresa_id).maybeSingle()
    : { data: null }

  const iniciais = (usuario?.nome ?? user.email ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte: string) => parte[0].toUpperCase())
    .join('')

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#f8f9fc] lg:flex-row">
      <Sidebar nomeEmpresa={empresa?.nome ?? 'Fofurinha Doces'} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-black/[.06] bg-white px-6 py-3 dark:border-white/[.1] dark:bg-zinc-950">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{usuario?.nome ?? user.email}</p>
            <p className="text-xs capitalize text-zinc-500">{usuario?.cargo ?? ''}</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {iniciais}
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
