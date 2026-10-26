import Link from 'next/link'
import { formatarPrecoParaExibicao } from '../produtos/preco'
import { CATEGORIAS_DESPESA, DESCRICAO_DESPESA_MAX, OBSERVACOES_DESPESA_MAX } from './opcoes'

type DespesaFormValores = {
  descricao?: string
  categoria?: string
  valor?: string | number
  vencimento?: string
  observacoes?: string | null
}

const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'
const rotulo = 'text-sm font-medium text-zinc-700'

// Usado em "Nova despesa" e na edição de despesa pendente. Status, pagamento e empresa não são
// campos do formulário: nova despesa sempre nasce pendente e a empresa vem do usuário logado.
export function DespesaForm({
  action,
  valores,
  erro,
  textoBotao,
}: {
  action: (formData: FormData) => void
  valores?: DespesaFormValores
  erro?: string
  textoBotao: string
}) {
  return (
    <form action={action} className="flex flex-col gap-6 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm sm:p-6">
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="descricao" className={rotulo}>
            Descrição
          </label>
          <input
            id="descricao"
            name="descricao"
            type="text"
            required
            maxLength={DESCRICAO_DESPESA_MAX}
            defaultValue={valores?.descricao ?? ''}
            placeholder="Ex.: Leite condensado e chocolate"
            className={campo}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoria" className={rotulo}>
            Categoria
          </label>
          <select id="categoria" name="categoria" required defaultValue={valores?.categoria ?? ''} className={campo}>
            <option value="" disabled>
              Selecione
            </option>
            {CATEGORIAS_DESPESA.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="valor" className={rotulo}>
            Valor (R$)
          </label>
          <input
            id="valor"
            name="valor"
            type="text"
            inputMode="decimal"
            required
            defaultValue={formatarPrecoParaExibicao(valores?.valor)}
            placeholder="0,00"
            className={campo}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="vencimento" className={rotulo}>
            Vencimento
          </label>
          <input id="vencimento" name="vencimento" type="date" required defaultValue={valores?.vencimento ?? ''} className={campo} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="observacoes" className={rotulo}>
            Observações <span className="text-zinc-400">(opcional)</span>
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={3}
            maxLength={OBSERVACOES_DESPESA_MAX}
            defaultValue={valores?.observacoes ?? ''}
            className={campo}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/despesas" className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04]">
          Voltar
        </Link>
        <button type="submit" className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
          {textoBotao}
        </button>
      </div>
    </form>
  )
}
