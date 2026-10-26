import Link from 'next/link'
import { cadastrar } from './actions'

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Criar conta</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Cadastre sua empresa na Fofurinha Doces.
        </p>

        {erro && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {erro}
          </p>
        )}

        <form action={cadastrar} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nome_empresa" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nome da empresa
            </label>
            <input
              id="nome_empresa"
              name="nome_empresa"
              type="text"
              required
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nome_usuario" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Seu nome
            </label>
            <input
              id="nome_usuario"
              name="nome_usuario"
              type="text"
              required
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="telefone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Telefone <span className="text-zinc-400">(opcional)</span>
            </label>
            <input
              id="telefone"
              name="telefone"
              type="tel"
              autoComplete="tel"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password_confirmacao" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Confirmar senha
            </label>
            <input
              id="password_confirmacao"
              name="password_confirmacao"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Criar conta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-zinc-950 dark:text-zinc-50">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
