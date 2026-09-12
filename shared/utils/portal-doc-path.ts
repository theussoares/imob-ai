/**
 * O caminho do arquivo dentro do bucket privado `portal-docs`.
 *
 * Formato: `<slug>/<contract_id>/<uuid>.<ext>`
 *
 * O primeiro segmento é o slug da imobiliária porque é DELE que as policies de
 * storage da 0028 partem: `is_member_of_slug((storage.foldername(name))[1])`.
 * Mudar a posição do slug aqui desliga as quatro policies de membro de uma vez,
 * sem erro — o upload simplesmente passa a ser recusado, ou pior, aceito na
 * pasta errada.
 *
 * O segundo segmento é o contrato, e ele é o que torna o path conferível: dado
 * um documento, dá para saber se o arquivo pertence ao contrato que a linha diz
 * pertencer, sem consultar mais nada.
 */

/** Extensões que a imobiliária realmente sobe. Nada executável. */
const EXTENSOES_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']

/** Um segmento de path seguro: sem `/`, sem `..`, sem espaço. */
const SEGMENTO_RE = /^[A-Za-z0-9_-]+$/

export function portalDocPath(
  slug: string,
  contractId: string,
  fileId: string,
  ext: string,
): string {
  return `${slug}/${contractId}/${fileId}.${ext.toLowerCase()}`
}

/** A extensão, em minúsculas e sem ponto. Vazio quando o nome não tem uma. */
export function extensionOf(fileName: string): string {
  const parte = fileName.split('.').pop() || ''
  return parte === fileName ? '' : parte.toLowerCase()
}

export function isAllowedDocExtension(ext: string): boolean {
  return EXTENSOES_PERMITIDAS.includes(ext.toLowerCase())
}

/**
 * Este path pertence a ESTE contrato desta imobiliária?
 *
 * ⚠️ É a guarda que impede o vazamento entre imobiliárias pela porta dos metadados.
 *
 * As policies de storage impedem que um membro SUBA arquivo na pasta de outra
 * imobiliária. Elas não dizem nada sobre a coluna `storage_path`, que é texto
 * livre: um membro poderia cadastrar um documento apontando para o arquivo de
 * outro tenant, publicá-lo para si mesmo e baixá-lo pelo portal — porque
 * `portal_can_read_doc_path` casa `storage.objects.name` com
 * `portal_documents.storage_path`, e passaria a casar.
 *
 * Nenhuma policy pega isso, porque do ponto de vista do banco é uma linha
 * válida. A conferência tem que acontecer antes da escrita.
 */
export function isPortalDocPathFor(path: string, slug: string, contractId: string): boolean {
  if (!path || !slug || !contractId) return false

  const partes = path.split('/')
  if (partes.length !== 3) return false

  const [pastaSlug, pastaContrato, arquivo] = partes as [string, string, string]
  if (pastaSlug !== slug) return false
  if (pastaContrato !== contractId) return false

  // `..` e `/` já caíram na contagem de segmentos; o resto é garantir que o nome
  // do arquivo não carregue nada estranho para dentro do bucket.
  const ponto = arquivo.lastIndexOf('.')
  if (ponto <= 0) return false
  const nome = arquivo.slice(0, ponto)
  const ext = arquivo.slice(ponto + 1)

  return SEGMENTO_RE.test(nome) && isAllowedDocExtension(ext)
}
