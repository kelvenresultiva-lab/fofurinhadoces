type ClienteFormValues = {
  nome?: string
  cpf?: string
  telefone?: string
  whatsapp?: string
  email?: string
  instagram?: string
  data_nascimento?: string
  endereco?: string
  cidade?: string
  estado?: string
  cep?: string
  origem?: string
  profissao?: string
  observacoes?: string
}

export function ClienteForm({
  action,
  valores,
  erro,
  textoBotao,
}: {
  action: (formData: FormData) => void
  valores?: ClienteFormValues
  erro?: string
  textoBotao: string
}) {
  const campo = (name: keyof ClienteFormValues) => valores?.[name] ?? ''

  return (
    <form action={action} className="flex flex-col gap-6">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Nome" name="nome" defaultValue={campo('nome')} required />
        <Campo label="CPF" name="cpf" defaultValue={campo('cpf')} />
        <Campo
          label="Data de nascimento"
          name="data_nascimento"
          type="date"
          defaultValue={campo('data_nascimento')}
        />
        <Campo label="Profissão" name="profissao" defaultValue={campo('profissao')} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Telefone" name="telefone" type="tel" defaultValue={campo('telefone')} />
        <Campo label="WhatsApp" name="whatsapp" type="tel" defaultValue={campo('whatsapp')} />
        <Campo label="E-mail" name="email" type="email" defaultValue={campo('email')} />
        <Campo label="Instagram" name="instagram" defaultValue={campo('instagram')} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          label="Endereço"
          name="endereco"
          defaultValue={campo('endereco')}
          className="sm:col-span-2"
        />
        <Campo label="Cidade" name="cidade" defaultValue={campo('cidade')} />
        <Campo label="Estado" name="estado" defaultValue={campo('estado')} />
        <Campo label="CEP" name="cep" defaultValue={campo('cep')} />
        <Campo
          label="Origem"
          name="origem"
          defaultValue={campo('origem')}
          placeholder="Indicação, Instagram, site..."
        />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="observacoes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Observações
        </label>
        <textarea
          id="observacoes"
          name="observacoes"
          defaultValue={campo('observacoes')}
          rows={3}
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
        />
      </div>

      <button
        type="submit"
        className="self-start rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        {textoBotao}
      </button>
    </form>
  )
}

function Campo({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  placeholder,
  className,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  required?: boolean
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50"
      />
    </div>
  )
}
