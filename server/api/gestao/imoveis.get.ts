import { listarImoveis } from '~~/server/utils/gestao-imoveis'

/** Lista os imóveis que a sessão enxerga (corretor: só os dele). Escopo e limite no núcleo. */
export default defineEventHandler(async (event) => listarImoveis(await contextoImoveis(await requireGestaoMember(event))))
