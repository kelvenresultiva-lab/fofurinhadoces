'use client'

export default function ErroMetas({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6">
      <h1 className="text-lg font-semibold text-red-800">Não foi possível carregar as metas</h1>
      <p className="text-sm text-red-700">
        Houve um problema ao buscar os dados. Seus dados continuam seguros — tente novamente.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Tentar novamente
      </button>
    </div>
  )
}
