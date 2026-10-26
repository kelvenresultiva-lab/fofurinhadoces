'use client'

import { useActionState } from 'react'
import { definirNovaSenha } from './actions'

const campo =
  'rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-600 disabled:opacity-60 dark:border-white/[.145]'
const rotulo = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'

export function FormularioNovaSenha() {
  const [estado, acao, pendente] = useActionState(definirNovaSenha, null)
  return (
    <form action={acao} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className={rotulo}>
          Nova senha
        </label>
        <input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" disabled={pendente} className={campo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmacao" className={rotulo}>
          Repita a nova senha
        </label>
        <input id="confirmacao" name="confirmacao" type="password" required minLength={8} autoComplete="new-password" disabled={pendente} className={campo} />
      </div>
      {estado?.erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="mt-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {pendente ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  )
}
