// Regras compartilhadas entre as Server Actions de Configurações e os formulários (fora do arquivo
// 'use server', que só pode exportar funções assíncronas).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_ACCEPT = LOGO_TIPOS.join(',')

export const LIMITES = {
  nome: 150,
  nome_fantasia: 150,
  cnpj: 20,
  telefone: 30,
  whatsapp: 30,
  email: 150,
  endereco: 300,
  nomeUsuario: 100,
} as const

// `valores`: o que foi enviado, devolvido junto com um erro para o formulário não perder o que a
// pessoa digitou (o React reinicia o formulário depois de cada envio).
export type EstadoFormulario = { erro?: string; sucesso?: string; valores?: Record<string, string | null> } | null

// Assinatura dos primeiros bytes: confere que o conteúdo é mesmo PNG, JPEG ou WebP (o tipo informado
// pelo navegador vem do nome do arquivo e pode não corresponder).
export function tipoPelaAssinatura(bytes: Uint8Array): (typeof LOGO_TIPOS)[number] | null {
  const b = (i: number) => bytes[i]
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  const ascii = (i: number, n: number) => String.fromCharCode(...bytes.slice(i, i + n))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  return null
}
