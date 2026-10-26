import Link from 'next/link'

export default function VerifiqueEmailPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 text-center shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Confirme seu e-mail</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Enviamos um link de confirmação para o e-mail informado. Abra-o para ativar
          sua conta — sua empresa e seu acesso serão criados assim que o link for confirmado.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          Voltar para o login
        </Link>
      </div>
    </div>
  )
}
