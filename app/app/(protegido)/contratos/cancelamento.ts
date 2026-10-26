// Compartilhado entre a Server Action (contratos/actions.ts) e o formulário do modal.
// Fica fora do arquivo 'use server' porque esse só pode exportar funções assíncronas.
export const MOTIVO_CANCELAMENTO_MAX = 500

export type EstadoCancelamento = { erro?: string } | null
