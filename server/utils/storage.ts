import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { logWarn, errMessage } from '~~/server/utils/log'

export const PROPERTY_IMAGES_BUCKET = 'property-images'

/** Prefixo da URL pública do Storage: `<projeto>/storage/v1/object/public/<bucket>/<path>`. */
const PUBLIC_PREFIX = `/storage/v1/object/public/${PROPERTY_IMAGES_BUCKET}/`

/**
 * O path do arquivo dentro do bucket, a partir da URL guardada em
 * `property_images.url`/`url_sm`. Devolve null quando a URL não aponta para
 * este bucket.
 *
 * O null é o ponto todo da função: nem toda imagem de imóvel é nossa. O
 * uploader aceita URL colada à mão ("ou cole uma URL de imagem", em
 * `ImageUploader.vue`) e a seed usa fotos do Unsplash — hoje 48 das 543 linhas
 * apontam para fora. Sem esse filtro, a limpeza mandaria `unsplash.com/...`
 * para o `remove()` do Storage: não apagaria nada, mas encheria o retorno de
 * erros e esconderia a falha que importa.
 *
 * Não há decode de percent-encoding de propósito: os paths que geramos são
 * `<slug>/<timestamp>-<rand>[@sm].<ext>`, que nunca são escapados na URL.
 * Decodificar só abriria a chance de um `decodeURIComponent` lançar no meio de
 * um salvamento que já deu certo.
 */
export function propertyImagePath(url: string | null | undefined): string | null {
  if (!url) return null
  const at = url.indexOf(PUBLIC_PREFIX)
  if (at === -1) return null
  // Querystring aparece na URL de transformação (`?width=…`) e em cache-buster;
  // o objeto no bucket é o mesmo.
  const path = url.slice(at + PUBLIC_PREFIX.length).split('?')[0]
  return path || null
}

/** Os paths (grande + miniatura) que uma imagem ocupa no bucket. */
export function imagePaths(image: { url?: string | null; urlSm?: string | null }): string[] {
  return [propertyImagePath(image.url), propertyImagePath(image.urlSm)].filter((p): p is string => p !== null)
}

/**
 * Apaga objetos do bucket de imagens. Nunca lança.
 *
 * A limpeza é consequência do salvamento, não o objetivo dele. Quando ela roda,
 * o imóvel JÁ foi salvo ou apagado — propagar uma falha do Storage aqui
 * mostraria uma tela de erro para uma operação que deu certo, e a pessoa
 * tentaria de novo achando que perdeu o trabalho.
 *
 * O preço de engolir é um arquivo órfão, que custa centavos e que a varredura
 * de `0028_orphan_property_images.sql` recolhe depois. Por isso é `logWarn` e
 * não `logError`: é degradação prevista, com rede embaixo.
 */
export async function removePropertyImages(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<void> {
  if (!paths.length) return
  try {
    const { error } = await client.storage.from(PROPERTY_IMAGES_BUCKET).remove(paths)
    if (error) logWarn('storage.cleanup_failed', { count: paths.length, reason: error.message })
  } catch (e) {
    logWarn('storage.cleanup_failed', { count: paths.length, reason: errMessage(e) })
  }
}
