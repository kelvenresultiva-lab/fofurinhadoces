'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { LIMITES, LOGO_MAX_BYTES, LOGO_TIPOS, tipoPelaAssinatura, type EstadoFormulario } from './regras'

// Toda escrita usa o cliente autenticado (nunca service_role). A empresa vem sempre do usuário logado
// (usuarios.empresa_id lido pela RLS), nunca do formulário; as policies empresas_update_own e
// usuarios_update_self e os triggers de backup/configuracoes_empresa.sql garantem o resto no banco.
const BUCKET = 'documentos'
const EXTENSAO: Record<(typeof LOGO_TIPOS)[number], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

async function contexto() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return { erro: 'Sua sessão expirou. Entre novamente.' } as const
  const { data: usuario, error } = await supabase.from('usuarios').select('empresa_id').eq('id', claims.sub).maybeSingle()
  if (error || !usuario?.empresa_id) return { erro: 'Não foi possível identificar a sua empresa.' } as const
  return { supabase, usuarioId: claims.sub, email: claims.email as string | undefined, empresaId: usuario.empresa_id as string }
}

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? '').trim()

// Menu e cabeçalho mostram nome e logo: revalida o layout inteiro.
const atualizarTela = () => revalidatePath('/', 'layout')

export async function salvarEmpresa(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const dados = {
    nome: texto(formData, 'nome'),
    nome_fantasia: texto(formData, 'nome_fantasia') || null,
    cnpj: texto(formData, 'cnpj') || null,
    telefone: texto(formData, 'telefone') || null,
    whatsapp: texto(formData, 'whatsapp') || null,
    email: texto(formData, 'email') || null,
    endereco: texto(formData, 'endereco') || null,
  }

  if (!dados.nome) return { erro: 'Informe a razão social ou o nome de registro da empresa.', valores: dados }
  for (const [campo, valor] of Object.entries(dados)) {
    const limite = LIMITES[campo as keyof typeof LIMITES]
    if (valor && limite && valor.length > limite) return { erro: `O campo ficou maior que o permitido (${limite} caracteres).`, valores: dados }
  }
  if (dados.cnpj) {
    const digitos = dados.cnpj.replace(/\D/g, '')
    if (digitos.length !== 11 && digitos.length !== 14) return { erro: 'CNPJ ou CPF inválido: informe 14 dígitos (CNPJ) ou 11 dígitos (CPF).', valores: dados }
  }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return { erro: 'Informe um e-mail comercial válido.', valores: dados }

  const ctx = await contexto()
  if ('erro' in ctx) return { erro: ctx.erro, valores: dados }
  const { data, error } = await ctx.supabase.from('empresas').update(dados).eq('id', ctx.empresaId).select('id')
  if (error) return { erro: error.message, valores: dados }
  if (!data || data.length === 0) return { erro: 'Não foi possível salvar os dados da empresa.', valores: dados }

  atualizarTela()
  return { sucesso: 'Dados da empresa salvos.' }
}

export async function salvarConta(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const nome = texto(formData, 'nome')
  if (!nome) return { erro: 'Informe o seu nome.', valores: { nome } }
  if (nome.length > LIMITES.nomeUsuario) return { erro: `O nome deve ter no máximo ${LIMITES.nomeUsuario} caracteres.` }

  const ctx = await contexto()
  if ('erro' in ctx) return { erro: ctx.erro, valores: { nome } }
  const { data, error } = await ctx.supabase.from('usuarios').update({ nome }).eq('id', ctx.usuarioId).select('id')
  if (error) return { erro: error.message, valores: { nome } }
  if (!data || data.length === 0) return { erro: 'Não foi possível salvar a sua conta.', valores: { nome } }

  atualizarTela()
  return { sucesso: 'Nome atualizado.' }
}

// Logo no bucket privado `documentos`, na pasta da própria empresa (a policy de Storage exige que a
// 1ª pasta seja current_empresa_id()). empresas.logo guarda o caminho do arquivo; a imagem é servida
// por /configuracoes/logo. Não há policy de UPDATE no Storage: trocar = enviar arquivo novo (nome
// único), apontar empresas.logo para ele e só então apagar o antigo.
export async function enviarLogo(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const arquivo = formData.get('logo')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Escolha uma imagem PNG, JPG ou WebP.' }
  if (arquivo.size > LOGO_MAX_BYTES) return { erro: 'A imagem passa de 2 MB. Envie um arquivo menor.' }

  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const tipo = tipoPelaAssinatura(bytes)
  if (!tipo || !LOGO_TIPOS.includes(arquivo.type as (typeof LOGO_TIPOS)[number])) {
    return { erro: 'Formato inválido. Envie uma imagem PNG, JPG ou WebP.' }
  }

  const ctx = await contexto()
  if ('erro' in ctx) return { erro: ctx.erro }
  const { data: empresa, error: erroLeitura } = await ctx.supabase.from('empresas').select('logo').eq('id', ctx.empresaId).maybeSingle()
  if (erroLeitura || !empresa) return { erro: 'Não foi possível ler os dados da empresa.' }

  const caminho = `${ctx.empresaId}/logo/logo-${Date.now()}.${EXTENSAO[tipo]}`
  const { error: erroUpload } = await ctx.supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: false })
  if (erroUpload) return { erro: `Não foi possível enviar a imagem: ${erroUpload.message}` }

  const { data, error } = await ctx.supabase.from('empresas').update({ logo: caminho }).eq('id', ctx.empresaId).select('id')
  if (error || !data || data.length === 0) {
    await ctx.supabase.storage.from(BUCKET).remove([caminho])
    return { erro: 'Não foi possível salvar a logo.' }
  }
  if (empresa.logo && empresa.logo !== caminho && empresa.logo.startsWith(`${ctx.empresaId}/`)) {
    await ctx.supabase.storage.from(BUCKET).remove([empresa.logo])
  }

  atualizarTela()
  return { sucesso: empresa.logo ? 'Logo substituída.' : 'Logo enviada.' }
}

export async function removerLogo(_estado: EstadoFormulario, _formData: FormData): Promise<EstadoFormulario> {
  void _formData
  const ctx = await contexto()
  if ('erro' in ctx) return { erro: ctx.erro }
  const { data: empresa, error: erroLeitura } = await ctx.supabase.from('empresas').select('logo').eq('id', ctx.empresaId).maybeSingle()
  if (erroLeitura || !empresa) return { erro: 'Não foi possível ler os dados da empresa.' }
  if (!empresa.logo) return { sucesso: 'A empresa já está sem logo.' }

  const { error } = await ctx.supabase.from('empresas').update({ logo: null }).eq('id', ctx.empresaId)
  if (error) return { erro: error.message }
  if (empresa.logo.startsWith(`${ctx.empresaId}/`)) await ctx.supabase.storage.from(BUCKET).remove([empresa.logo])

  atualizarTela()
  return { sucesso: 'Logo removida. O menu volta a mostrar a identidade padrão.' }
}

// Fluxo oficial do Supabase Auth: envia ao e-mail da conta um link de redefinição. O link volta para
// /auth/confirm, que abre a sessão de recuperação e leva a /redefinir-senha. A senha atual nunca passa por aqui.
export async function enviarRedefinicaoSenha(_estado: EstadoFormulario, _formData: FormData): Promise<EstadoFormulario> {
  void _formData
  const ctx = await contexto()
  if ('erro' in ctx) return { erro: ctx.erro }
  if (!ctx.email) return { erro: 'A conta não tem e-mail cadastrado.' }

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000'
  const { error } = await ctx.supabase.auth.resetPasswordForEmail(ctx.email, { redirectTo: `${origin}/auth/confirm?next=/redefinir-senha` })
  if (error) return { erro: `Não foi possível enviar o link: ${error.message}` }
  return { sucesso: `Enviamos um link para ${ctx.email}. Abra-o neste mesmo navegador para criar a nova senha.` }
}
