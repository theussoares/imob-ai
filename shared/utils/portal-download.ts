/**
 * Duas peças puras do caminho de download do portal. Aqui e não no handler
 * porque handler de rota não se testa sozinho, e as duas erram de formas que
 * só um teste pega.
 */

/** O id tem forma de uuid? */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Serve para responder 404 sem ir ao banco.
 *
 * `portal_documents.id` é `uuid`. Mandar `'../algo'` para `.eq('id', ...)` faz o
 * Postgres devolver 22P02 (sintaxe inválida), o repositório dá `throw error` e o
 * handler responde **500** — quando a resposta certa é a mesma de qualquer id
 * que não existe: 404. Um 500 aqui ainda diria, a quem estivesse sondando, que
 * aquele id é diferente dos outros.
 */
export function ehUuid(valor: string): boolean {
  return UUID.test((valor || '').trim())
}

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
