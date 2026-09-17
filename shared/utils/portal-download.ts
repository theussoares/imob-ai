/**
 * O nome do arquivo que o cliente baixa. Aqui e não no handler porque handler
 * de rota não se testa sozinho, e esta função erra de um jeito que só um teste
 * pega.
 *
 * (A checagem de uuid que morava aqui virou `shared/utils/uuid.ts`: ela não é
 * do download, serve todo caminho que recebe id de rota.)
 */

/** Só o que pode viver num nome de arquivo sem quebrar o cabeçalho. */
const PROIBIDO = /[\\/\r\n\t\x00-\x1f"]+/g

/**
 * Nome do arquivo que o navegador vai salvar.
 *
 * O título é digitado pela imobiliária, então vai para um `Content-Disposition`
 * — barra, aspas e quebra de linha saem antes. A extensão vem do caminho no
 * bucket, não do título: é ela que faz o sistema operacional abrir o PDF no
 * leitor certo em vez de perguntar o que fazer com o arquivo.
 */
export function nomeDeDownload(titulo: string, storagePath: string): string {
  const limpo = (titulo || '').replace(PROIBIDO, ' ').trim().slice(0, 120)
  const base = limpo || 'documento'

  const arquivo = (storagePath || '').split('/').pop() || ''
  const ponto = arquivo.lastIndexOf('.')
  const ext = ponto > 0 ? arquivo.slice(ponto).toLowerCase() : ''

  // Extensão só entra se for plausível: `.pdf`, `.jpeg`. Sem isso, um caminho
  // com ponto no meio do nome viraria uma extensão inventada.
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) return base
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`
}
