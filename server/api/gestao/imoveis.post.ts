import { criarImovel } from '~~/server/utils/gestao-imoveis'

/** Cadastra um imóvel no catálogo. Tenant e corretor vendedor (para quem só vê os seus) saem da sessão, não do corpo. */
export default defineEventHandler(async (event) => criarImovel(await contextoImoveis(event), await readBody(event)))
