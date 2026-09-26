/**
 * Formatos aceitos nos documentos da Área do Cliente, pelo CONTEÚDO do arquivo.
 *
 * O sintoma: um `.exe` subiu, foi gravado como `application/octet-stream` e
 * publicado para os clientes. Só o `accept` do `<input>` filtrava — e ele é
 * sugestão ao seletor de arquivos, não controle: arrastar, trocar o filtro ou
 * chamar a API direto passam por cima. O `type` que o navegador informa também
 * não serve de prova, porque vem da extensão do nome.
 *
 * Por isso a decisão é pelos primeiros bytes (a "assinatura" do formato): um
 * executável renomeado para `.pdf` continua começando com `MZ`.
 *
 * A lista é curta de propósito: é o que uma imobiliária manda ao cliente
 * (contrato e boleto em PDF, vistoria e comprovante em foto). HEIC fica de fora
 * pelo mesmo motivo da 0048 — o Chrome não abre, e o cliente receberia um
 * arquivo que não consegue ver.
 */
export const FORMATOS_DE_DOCUMENTO = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
} as const

export type MimeDeDocumento = keyof typeof FORMATOS_DE_DOCUMENTO

/** Para o `accept` do input: as mesmas quatro, e nada de `image/*`. */
export const ACCEPT_DE_DOCUMENTO = Object.keys(FORMATOS_DE_DOCUMENTO).join(',')

/** 20 MB: um contrato escaneado em PDF passa folgado; vídeo não. */
export const TAMANHO_MAX_DOCUMENTO = 20 * 1024 * 1024

/** O formato real do arquivo, pelos primeiros bytes. Nulo = não aceito. */
export function formatoPelaAssinatura(b: Uint8Array): MimeDeDocumento | null {
  const comeca = (...bytes: number[]) => bytes.every((x, i) => b[i] === x)
  // %PDF-
  if (comeca(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'
  if (comeca(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  // RIFF....WEBP
  if (comeca(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
