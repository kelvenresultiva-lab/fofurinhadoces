import { FormularioNovaSenha } from './FormularioNovaSenha'
import { LogoMarca } from '../LogoMarca'

// Destino do link de redefinição de senha (via /auth/confirm, que já abriu a sessão de recuperação).
// Sem sessão, o proxy manda para /login.
export default function RedefinirSenhaPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
        <LogoMarca />
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Nova senha</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Crie a nova senha da sua conta. Ela passa a valer na hora.</p>
        <FormularioNovaSenha />
      </div>
    </div>
  )
}
