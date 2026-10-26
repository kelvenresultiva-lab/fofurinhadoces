import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Visão geral</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Clientes</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{count ?? 0}</p>
        </div>
      </div>
    </div>
  )
}
