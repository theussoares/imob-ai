import { errMessage } from '~~/server/utils/log'

/**
 * O que pode sair no log quando uma requisição falha.
 *
 * ## Por que isto existe
 *
 * Em 28/08 uma cliente tentou cadastrar um imóvel três vezes em oito segundos.
 * O código dela já existia, o Postgres recusou com 23505, e o que chegou até
 * nós foi um stack cru na Vercel: sem imobiliária, sem qual era o código, sem
 * o que ela tinha preenchido. O diagnóstico saiu de cruzar o log do Supabase
 * com o stack da Vercel à mão. Uma linha com o payload teria bastado.
 *
 * ## Lista de permissão, não de proibição
 *
 * A tentação é listar os campos proibidos (`ownerPhone`, `email`...) e deixar
 * o resto passar. Essa lista vaza sozinha: no dia em que alguém acrescentar
 * `ownerEmail` ao formulário, o campo não está na lista de proibidos e vai
 * inteiro para um log retido, sem ninguém decidir isso.
 *
 * Aqui é o contrário — chave que não está liberada vira presença
 * (`"preenchido"`/`"vazio"`), nunca valor. Campo novo falha fechado, e quem
 * quiser vê-lo no log precisa escrever o nome dele aqui de propósito.
 *
 * É a mesma lição que `property.mapper.ts` aprendeu na marra: lá as colunas
 * públicas são listadas uma a uma porque um `select('*')` publicou campo
 * interno sem que ninguém pedisse.
 *
 * ## O que entrou na lista
 *
 * Só o que já é público no site da imobiliária (código, tipo, pretensão,
 * preço, bairro) ou é classificação interna sem dono (etapa do lead, status).
 * `description` e `features` são públicos também, mas ficam de fora por
 * tamanho: log é linha, não documento.
 *
 * Fora da lista de propósito, ainda que seja tentador: `location` (endereço
 * exato do imóvel, que o site nunca publica) e tudo de pessoa — proprietário,
 * lead, corretor, membro.
 */
const CAMPOS_LIBERADOS = new Set([
  // Imóvel
  'id',
  'code',
  'title',
  'type',
  'purpose',
  'price',
  'area',
  'bedrooms',
  'suites',
  'bathrooms',
  'parking',
  'neighborhood',
  'city',
  'state',
  'highStandard',
  'featured',
  'status',
  'brokerId',
  'expectedUpdatedAt',
  // Lead
  'stage',
  'leadType',
  'source',
  'propertyCode',
  'nextContactAt',
  // Corretor, membro, configurações do tenant
  'active',
  'role',
  'slug',
  'heroImagePosition',
  'heroCtaHref',
])

/** Acima disto o valor é corte: uma descrição inteira afogaria a linha. */
const MAX_TEXTO = 120

function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/**
 * Só primitivo passa, mesmo em campo liberado.
 *
 * `code` está liberado esperando uma string. Se vier um objeto — payload
 * montado errado, cliente adulterado — deixar passar publicaria o que estiver
 * dentro dele sem checagem nenhuma, e a lista de permissão teria sido furada
 * por baixo.
 */
function valorSeguro(v: unknown): unknown {
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v !== 'string') return 'preenchido'
  return v.length > MAX_TEXTO ? `${v.slice(0, MAX_TEXTO)}…` : v
}

/** Corpo da requisição pronto para o log: valor onde é seguro, presença no resto. */
export function redactPayload(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(body as Record<string, unknown>)) {
    if (vazio(valor)) out[chave] = 'vazio'
    else if (CAMPOS_LIBERADOS.has(chave)) out[chave] = valorSeguro(valor)
    else out[chave] = 'preenchido'
  }
  return out
}

/**
 * Esta falha merece uma linha no log?
 *
 * 401 de sessão expirada, 422 de campo inválido e 409 de código repetido são o
 * sistema funcionando: a pessoa é avisada na tela e corrige. Registrar todo
 * 4xx faz volume, e log que ninguém lê não avisa nada — que é exatamente a
 * situação de onde este arquivo saiu.
 *
 * `unhandled` é a marca do Nitro para o que ninguém previu. Entra sempre,
 * qualquer que seja o status: é a categoria à qual o erro de 28/08 pertencia.
 */
export function shouldLog(statusCode: number, unhandled: boolean): boolean {
  return unhandled || statusCode >= 500
}

function causa(e: unknown): Record<string, unknown> | undefined {
  const c = (e as { cause?: unknown })?.cause
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : undefined
}

/**
 * O código do erro — `23505` (chave repetida), `22P02` (valor fora do enum).
 *
 * Nomeia a causa sem depender da frase, que muda com a versão do Postgres. O
 * Nitro embrulha o erro original em `cause` ao transformá-lo em H3Error, então
 * é lá que ele costuma estar; erro lançado direto traz no topo.
 */
export function errorCode(e: unknown): string | undefined {
  const code = causa(e)?.code ?? (e as { code?: unknown })?.code
  return typeof code === 'string' && code ? code : undefined
}

/**
 * A frase do erro, e só ela.
 *
 * `details` e `hint` do Postgres ficam de fora de propósito: o `details` ecoa
 * os valores da linha que falhou (`Key (tenant_id, owner_phone)=(…, 5567…)
 * already exists`). Ele entraria por trás da lista de permissão justamente com
 * o tipo de dado que ela barra na porta da frente.
 */
export function errorReason(e: unknown): string {
  const direta = e instanceof Error ? e.message : errMessage(e)
  if (direta && direta !== 'erro desconhecido') return direta
  const daCausa = causa(e)?.message
  return typeof daCausa === 'string' && daCausa ? daCausa : 'erro desconhecido'
}
