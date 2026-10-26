'use client'

import Image from 'next/image'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Building2, ImageUp, KeyRound, Trash2 } from 'lucide-react'
import { enviarLogo, enviarRedefinicaoSenha, removerLogo, salvarConta, salvarEmpresa } from './actions'
import { LIMITES, LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_TIPOS, type EstadoFormulario } from './regras'

const campo = 'w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600 disabled:bg-zinc-50 disabled:text-zinc-500'
const rotulo = 'text-sm font-medium text-zinc-700'
const botaoPrincipal =
  'inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'
const botaoSecundario =
  'inline-flex items-center justify-center gap-2 rounded-full border border-black/[.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60'

function Aviso({ estado }: { estado: EstadoFormulario }) {
  return (
    <div aria-live="polite">
      {estado?.erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.erro}
        </p>
      )}
      {estado?.sucesso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{estado.sucesso}</p>}
    </div>
  )
}

function Campo({
  nome,
  titulo,
  valor,
  obrigatorio,
  tipo = 'text',
  dica,
  maximo,
  pendente,
  largo,
}: {
  nome: string
  titulo: string
  valor: string | null
  obrigatorio?: boolean
  tipo?: string
  dica?: string
  maximo?: number
  pendente: boolean
  largo?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${largo ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={`cfg-${nome}`} className={rotulo}>
        {titulo} {obrigatorio ? <span className="text-red-600">*</span> : <span className="font-normal text-zinc-400">(opcional)</span>}
      </label>
      <input
        id={`cfg-${nome}`}
        name={nome}
        type={tipo}
        required={obrigatorio}
        maxLength={maximo}
        defaultValue={valor ?? ''}
        disabled={pendente}
        className={campo}
      />
      {dica && <p className="text-xs text-zinc-500">{dica}</p>}
    </div>
  )
}

export type DadosEmpresa = {
  nome: string
  nome_fantasia: string | null
  cnpj: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  endereco: string | null
}

export function FormularioEmpresa({ empresa }: { empresa: DadosEmpresa }) {
  const [estado, acao, pendente] = useActionState(salvarEmpresa, null)
  // Depois de um erro, o formulário volta com o que a pessoa enviou (não com o que está salvo).
  const v = (k: keyof DadosEmpresa) => (estado?.erro && estado.valores ? estado.valores[k] ?? null : empresa[k])

  return (
    <form action={acao} className="flex flex-col gap-5">
      <fieldset disabled={pendente} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo nome="nome_fantasia" titulo="Nome fantasia" valor={v('nome_fantasia')} maximo={LIMITES.nome_fantasia} pendente={pendente} dica="Aparece no menu. Se ficar vazio, usamos a razão social." />
        <Campo nome="nome" titulo="Razão social / nome de registro" valor={v('nome')} obrigatorio maximo={LIMITES.nome} pendente={pendente} />
        <Campo nome="cnpj" titulo="CNPJ ou CPF" valor={v('cnpj')} maximo={LIMITES.cnpj} pendente={pendente} dica="Com ou sem pontuação." />
        <Campo nome="email" titulo="E-mail comercial" tipo="email" valor={v('email')} maximo={LIMITES.email} pendente={pendente} />
        <Campo nome="telefone" titulo="Telefone" tipo="tel" valor={v('telefone')} maximo={LIMITES.telefone} pendente={pendente} />
        <Campo nome="whatsapp" titulo="WhatsApp" tipo="tel" valor={v('whatsapp')} maximo={LIMITES.whatsapp} pendente={pendente} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="cfg-endereco" className={rotulo}>
            Endereço completo <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <textarea
            id="cfg-endereco"
            name="endereco"
            rows={2}
            maxLength={LIMITES.endereco}
            defaultValue={v('endereco') ?? ''}
            disabled={pendente}
            placeholder="Rua, número, bairro, cidade - UF, CEP"
            className={campo}
          />
        </div>
      </fieldset>
      <Aviso estado={estado} />
      <div className="flex justify-end">
        <button type="submit" disabled={pendente} className={botaoPrincipal}>
          {pendente ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}

export function FormularioConta({ nome, email, nomeEmpresa }: { nome: string | null; email: string; nomeEmpresa: string }) {
  const [estado, acao, pendente] = useActionState(salvarConta, null)
  const [estadoSenha, acaoSenha, enviandoSenha] = useActionState(enviarRedefinicaoSenha, null)
  const nomeAtual = estado?.erro && estado.valores ? estado.valores.nome ?? '' : nome

  return (
    <div className="flex flex-col gap-6">
      <form action={acao} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo nome="nome" titulo="Seu nome" valor={nomeAtual} obrigatorio maximo={LIMITES.nomeUsuario} pendente={pendente} largo />
          <div className="flex flex-col gap-1.5">
            <span className={rotulo}>E-mail da conta</span>
            <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{email}</p>
            <p className="text-xs text-zinc-500">Usado para entrar. Não pode ser alterado por aqui.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={rotulo}>Empresa vinculada</span>
            <p className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 break-words">{nomeEmpresa}</span>
            </p>
          </div>
        </div>
        <Aviso estado={estado} />
        <div className="flex justify-end">
          <button type="submit" disabled={pendente} className={botaoPrincipal}>
            {pendente ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      <form action={acaoSenha} className="flex flex-col gap-3 border-t border-black/[.06] pt-5">
        <div>
          <p className="text-sm font-semibold text-zinc-950">Senha</p>
          <p className="text-sm text-zinc-500">Enviamos um link para o e-mail da conta. Pelo link você cria uma senha nova; a senha atual não é mostrada nem pedida aqui.</p>
        </div>
        <Aviso estado={estadoSenha} />
        <div>
          <button type="submit" disabled={enviandoSenha} className={botaoSecundario}>
            <KeyRound className="h-4 w-4" />
            {enviandoSenha ? 'Enviando…' : 'Enviar link para redefinir senha'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Validação no navegador só para avisar antes do envio; a Server Action valida tudo de novo
// (tamanho, tipo informado e assinatura do arquivo).
function validarArquivo(arquivo: File): string | null {
  if (!LOGO_TIPOS.includes(arquivo.type as (typeof LOGO_TIPOS)[number])) return 'Formato inválido. Envie uma imagem PNG, JPG ou WebP.'
  if (arquivo.size > LOGO_MAX_BYTES) return 'A imagem passa de 2 MB. Envie um arquivo menor.'
  return null
}

export function LogoEmpresa({ logoUrl }: { logoUrl: string | null }) {
  const [estadoEnvio, acaoEnvio, enviando] = useActionState(enviarLogo, null)
  const [estadoRemocao, acaoRemocao, removendo] = useActionState(removerLogo, null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const ocupado = enviando || removendo

  // Libera a URL temporária da prévia quando ela muda ou o componente sai da tela.
  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa)
  }, [previa])

  // Envio concluído com sucesso: limpa a escolha (a logo nova já vem do servidor).
  const [estadoVisto, setEstadoVisto] = useState(estadoEnvio)
  if (estadoEnvio !== estadoVisto) {
    setEstadoVisto(estadoEnvio)
    if (estadoEnvio?.sucesso) setPrevia(null)
  }

  const exibida = previa ?? logoUrl
  const estado = erroLocal ? { erro: erroLocal } : estadoEnvio?.erro || estadoEnvio?.sucesso ? estadoEnvio : estadoRemocao

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-black/[.12] bg-zinc-50">
        {exibida ? (
          <Image src={exibida} alt={previa ? 'Prévia da nova logo' : 'Logo atual da empresa'} width={128} height={128} unoptimized className="h-full w-full object-contain p-2" />
        ) : (
          <span className="px-3 text-center text-xs text-zinc-400">Sem logo</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-zinc-500">PNG, JPG ou WebP, até 2 MB. Imagens quadradas ficam melhores no menu.</p>
        <form
          action={acaoEnvio}
          onSubmit={(e) => {
            const arquivo = entrada.current?.files?.[0]
            const problema = arquivo ? validarArquivo(arquivo) : 'Escolha uma imagem PNG, JPG ou WebP.'
            if (problema) {
              e.preventDefault()
              setErroLocal(problema)
            }
          }}
          className="flex flex-col gap-3"
        >
          <input
            ref={entrada}
            type="file"
            name="logo"
            accept={LOGO_ACCEPT}
            disabled={ocupado}
            aria-label="Arquivo da logo"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              setErroLocal(null)
              setPrevia(null)
              if (!arquivo) return
              const problema = validarArquivo(arquivo)
              if (problema) {
                setErroLocal(problema)
                e.target.value = ''
                return
              }
              setPrevia(URL.createObjectURL(arquivo))
            }}
            className="block w-full min-w-0 text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={ocupado || !previa} className={botaoPrincipal}>
              <ImageUp className="h-4 w-4" />
              {enviando ? 'Enviando…' : logoUrl ? 'Substituir logo' : 'Enviar logo'}
            </button>
          </div>
        </form>
        {logoUrl && !previa && (
          <form action={acaoRemocao}>
            <button type="submit" disabled={ocupado} className={`${botaoSecundario} text-red-700`}>
              <Trash2 className="h-4 w-4" />
              {removendo ? 'Removendo…' : 'Remover logo'}
            </button>
          </form>
        )}
        <Aviso estado={estado} />
      </div>
    </div>
  )
}
