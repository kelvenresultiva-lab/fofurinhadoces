import { formatarPrecoParaExibicao } from './preco'

const SUGESTOES_UNIDADE = ['unidade', 'kg', 'g', 'litro', 'ml', 'dúzia', 'pacote', 'fatia', 'cento']

type ProdutoFormValues = {
  nome?: string
  categoria?: string
  unidade?: string
  preco?: string | number | null
  dias_antecedencia_producao?: number | string
}

export function ProdutoForm({
  action,
  valores,
  erro,
  textoBotao,
}: {
  action: (formData: FormData) => void
  valores?: ProdutoFormValues
  erro?: string
  textoBotao: string
}) {
  return (
    <form action={action} className="flex flex-col gap-6">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="nome" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nome
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            defaultValue={valores?.nome ?? ''}
            required
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoria" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Categoria <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            id="categoria"
            name="categoria"
            type="text"
            defaultValue={valores?.categoria ?? ''}
            placeholder="Bolo, doce, salgado..."
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="unidade" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Unidade
          </label>
          <input
            id="unidade"
            name="unidade"
            type="text"
            list="sugestoes-unidade"
            defaultValue={valores?.unidade ?? 'unidade'}
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
          <datalist id="sugestoes-unidade">
            {SUGESTOES_UNIDADE.map((sugestao) => (
              <option key={sugestao} value={sugestao} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="preco" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Preço (R$) <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            id="preco"
            name="preco"
            type="text"
            inputMode="decimal"
            defaultValue={formatarPrecoParaExibicao(valores?.preco ?? null)}
            placeholder="0,00"
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="dias_antecedencia_producao"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Antecedência de produção (dias)
          </label>
          <input
            id="dias_antecedencia_producao"
            name="dias_antecedencia_producao"
            type="number"
            min={0}
            step={1}
            defaultValue={valores?.dias_antecedencia_producao ?? 2}
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
          />
        </div>
      </fieldset>

      <button
        type="submit"
        className="self-start rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        {textoBotao}
      </button>
    </form>
  )
}
