/**
 * Casca do `server/utils/gestao-auth.ts` da F1, usada pelo vitest SÓ enquanto o
 * arquivo real não existe (ver `vitest.config.ts`). Nunca executa de verdade: os
 * testes que importam endpoints a substituem com `vi.mock`.
 */
export async function requireGestaoMember(): Promise<never> {
  throw new Error('F1 ausente: requireGestaoMember deve ser simulado com vi.mock')
}
export function exigirPermissao(): void {
  throw new Error('F1 ausente: exigirPermissao deve ser simulado com vi.mock')
}
