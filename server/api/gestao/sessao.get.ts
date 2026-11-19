import { requireGestaoMember, respostaSessao } from '~~/server/utils/gestao-auth'

/** Quem está logado, com que perfil e com qual matriz. A tela recarrega daqui; nada disso vem do navegador. */
export default defineEventHandler(async (event) => respostaSessao(await requireGestaoMember(event)))
