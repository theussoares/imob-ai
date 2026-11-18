import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { lerSettings } from '~~/server/repositories/gestao-settings.repository'

/** Configurações da imobiliária no painel (`admin`). Sem linha salva, o padrão do domínio. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'admin')
  return { config: (await lerSettings(ctx.db, ctx.tenant.id, ctx.tenant.name)).config }
})
