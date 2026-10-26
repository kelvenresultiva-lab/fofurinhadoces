import { createClient } from '@/lib/supabase/server'
import { FormularioConta, FormularioEmpresa, LogoEmpresa } from './Formularios'

const cartao = 'flex flex-col gap-5 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm sm:p-6'

function Titulo({ id, titulo, descricao }: { id: string; titulo: string; descricao: string }) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold text-zinc-950">{titulo}</h2>
      <p className="mt-0.5 text-sm text-zinc-500">{descricao}</p>
    </div>
  )
}

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const { senha } = await searchParams
  const supabase = await createClient()
  const { data: sessao } = await supabase.auth.getClaims()
  const claims = sessao?.claims

  // Usuário e a própria empresa numa consulta (RLS: só a empresa do usuário logado).
  const { data: usuario, error } = claims
    ? await supabase
        .from('usuarios')
        .select('nome, empresa:empresas(nome, nome_fantasia, cnpj, telefone, whatsapp, email, endereco, logo)')
        .eq('id', claims.sub)
        .maybeSingle()
    : { data: null, error: null }
  const embutida = usuario?.empresa
  const empresa = (Array.isArray(embutida) ? embutida[0] : embutida) as
    | { nome: string; nome_fantasia: string | null; cnpj: string | null; telefone: string | null; whatsapp: string | null; email: string | null; endereco: string | null; logo: string | null }
    | null
    | undefined

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-500">Dados da empresa e da sua conta.</p>
      </div>

      {senha && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{senha}</p>}

      {/* Falha de leitura: nunca mostramos o formulário vazio, que pareceria dados apagados. */}
      {error || !claims || !usuario || !empresa ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-800">Não foi possível carregar as configurações</h2>
          <p className="text-sm text-red-700">Seus dados continuam salvos. Atualize a página; se continuar, tente novamente em instantes.</p>
        </div>
      ) : (
        <>
          <section className={cartao} aria-labelledby="titulo-empresa">
            <Titulo id="titulo-empresa" titulo="Dados da empresa" descricao="Aparecem no menu e servirão de base para documentos." />
            <div className="flex flex-col gap-3 rounded-xl bg-zinc-50/70 p-4">
              <p className="text-sm font-medium text-zinc-700">Logo</p>
              <LogoEmpresa logoUrl={empresa.logo ? `/configuracoes/logo?v=${encodeURIComponent(empresa.logo)}` : null} />
            </div>
            <FormularioEmpresa
              empresa={{
                nome: empresa.nome,
                nome_fantasia: empresa.nome_fantasia,
                cnpj: empresa.cnpj,
                telefone: empresa.telefone,
                whatsapp: empresa.whatsapp,
                email: empresa.email,
                endereco: empresa.endereco,
              }}
            />
          </section>

          <section className={cartao} aria-labelledby="titulo-conta">
            <Titulo id="titulo-conta" titulo="Minha conta" descricao="Seus dados de acesso ao Ateliê ERP." />
            <FormularioConta nome={usuario.nome} email={(claims.email as string | undefined) ?? '—'} nomeEmpresa={empresa.nome_fantasia || empresa.nome} />
          </section>
        </>
      )}
    </div>
  )
}
