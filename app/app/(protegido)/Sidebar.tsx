'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  FileSignature,
  FileText,
  HandCoins,
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react'
import { logout } from './actions'

const ITENS = [
  { href: '/dashboard', label: 'Dashboard', icone: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icone: Users },
  { href: '/eventos', label: 'Eventos', icone: CalendarDays },
  { href: '/orcamentos', label: 'Orçamentos', icone: FileText },
  { href: '/contratos', label: 'Contratos', icone: FileSignature },
  { href: '/parcelas', label: 'Parcelas', icone: Receipt },
  { href: '/recebimentos', label: 'Recebimentos', icone: HandCoins },
  { href: '/financeiro', label: 'Financeiro', icone: Wallet },
  { href: '/produtos', label: 'Produtos', icone: Package },
]

export function Sidebar({ nomeEmpresa }: { nomeEmpresa: string }) {
  const pathname = usePathname()

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/[.06] bg-white px-3 py-5 lg:flex dark:border-white/[.1] dark:bg-zinc-950">
        <div className="mb-6 flex items-center gap-2 px-3">
          <Heart className="h-6 w-6 text-indigo-600" />
          <div className="leading-tight">
            <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{nomeEmpresa}</p>
            <p className="text-xs text-indigo-600">Financeiro</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {ITENS.map(({ href, label, icone: Icone }) => {
            const ativo = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  ativo
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                    : 'text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]'
                }`}
              >
                <Icone className="h-[18px] w-[18px]" />
                {label}
              </Link>
            )
          })}
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sair
          </button>
        </form>
      </aside>

      <nav className="flex gap-1 overflow-x-auto border-b border-black/[.06] bg-white px-3 py-2 lg:hidden dark:border-white/[.1] dark:bg-zinc-950">
        {ITENS.map(({ href, label, icone: Icone }) => {
          const ativo = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                ativo
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Icone className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
