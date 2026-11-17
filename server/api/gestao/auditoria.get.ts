import { auditoria } from '~~/server/utils/gestao-leituras'

/** Histórico de alterações do tenant (até 200). Só quem tem `auditoria`; filtros `quem`, `de`, `ate`. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const q = getQuery(event)
  const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return auditoria(ctx, { quem: s(q.quem), de: s(q.de), ate: s(q.ate) })
})
