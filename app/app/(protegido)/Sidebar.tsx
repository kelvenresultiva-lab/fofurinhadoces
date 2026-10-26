'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BanknoteArrowDown,
  CalendarDays,
  FileSignature,
  FileText,
  HandCoins,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Target,
  Users,
  X,
} from 'lucide-react'
import { logout } from './actions'

// Navegação agrupada por seção. A página /financeiro continua existindo e acessível pela URL, mas
// não aparece no menu: o conteúdo dela já está no Dashboard, em Parcelas e em Recebimentos.
const SECOES = [
  {
    titulo: 'Visão geral',
    itens: [
      { href: '/dashboard', label: 'Dashboard', icone: LayoutDashboard },
      { href: '/metas', label: 'Metas', icone: Target },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { href: '/clientes', label: 'Clientes', icone: Users },
      { href: '/eventos', label: 'Eventos', icone: CalendarDays },
      { href: '/orcamentos', label: 'Orçamentos', icone: FileText },
      { href: '/contratos', label: 'Contratos', icone: FileSignature },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { href: '/parcelas', label: 'Parcelas', icone: Receipt },
      { href: '/recebimentos', label: 'Recebimentos', icone: HandCoins },
      { href: '/despesas', label: 'Despesas', icone: BanknoteArrowDown },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [{ href: '/produtos', label: 'Produtos', icone: Package }],
  },
]

const classeItem = (ativo: boolean) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
    ativo
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
      : 'text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]'
  }`

const classeSair =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]'

function Marca({ nomeEmpresa }: { nomeEmpresa: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Heart className="h-6 w-6 shrink-0 text-indigo-600" />
      <div className="min-w-0 leading-tight">
        <p className="break-words text-base font-semibold text-zinc-950 dark:text-zinc-50">{nomeEmpresa}</p>
        <p className="text-xs text-indigo-600">Financeiro</p>
      </div>
    </div>
  )
}

// Seções com título discreto. `aoNavegar` fecha o menu do celular ao escolher um item.
function Secoes({ pathname, aoNavegar }: { pathname: string; aoNavegar?: () => void }) {
  return (
    <>
      {SECOES.map((secao, i) => (
        <div key={secao.titulo} className={`flex flex-col gap-0.5 ${i > 0 ? 'mt-4' : ''}`}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{secao.titulo}</p>
          {secao.itens.map(({ href, label, icone: Icone }) => {
            const ativo = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link key={href} href={href} onClick={aoNavegar} aria-current={ativo ? 'page' : undefined} className={classeItem(ativo)}>
                <Icone className="h-[18px] w-[18px]" />
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </>
  )
}

export function Sidebar({ nomeEmpresa }: { nomeEmpresa: string }) {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)

  // Mudou de página (link, voltar do navegador, redirect): o menu do celular fecha.
  const [rotaVista, setRotaVista] = useState(pathname)
  if (pathname !== rotaVista) {
    setRotaVista(pathname)
    setAberto(false)
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-black/[.06] bg-white px-3 py-5 lg:flex dark:border-white/[.1] dark:bg-zinc-950">
        <div className="mb-5 px-3">
          <Marca nomeEmpresa={nomeEmpresa} />
        </div>

        <nav aria-label="Menu principal" className="flex flex-1 flex-col">
          <Secoes pathname={pathname} />
        </nav>

        <form action={logout} className="mt-4 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
          <button type="submit" className={classeSair}>
            <LogOut className="h-[18px] w-[18px]" />
            Sair
          </button>
        </form>
      </aside>

      {/* Celular e tablet: barra com botão Menu; o painel abre abaixo, com rolagem vertical própria. */}
      <div className="border-b border-black/[.06] bg-white lg:hidden dark:border-white/[.1] dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Marca nomeEmpresa={nomeEmpresa} />
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls="menu-celular"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-black/[.08] px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300"
          >
            {aberto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            {aberto ? 'Fechar' : 'Menu'}
          </button>
        </div>

        {aberto && (
          <nav
            id="menu-celular"
            aria-label="Menu principal"
            className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-y-auto overscroll-contain border-t border-black/[.06] px-3 py-3 dark:border-white/[.1]"
          >
            <Secoes pathname={pathname} aoNavegar={() => setAberto(false)} />
            <form action={logout} className="mt-4 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
              <button type="submit" className={classeSair}>
                <LogOut className="h-[18px] w-[18px]" />
                Sair
              </button>
            </form>
          </nav>
        )}
      </div>
    </>
  )
}
