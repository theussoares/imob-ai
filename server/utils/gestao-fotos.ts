import type { SupabaseClient } from '@supabase/supabase-js'
import type { FotoNova } from '~~/layers/gestao/domain/imoveis-fotos'

/**
 * Fotos de imóvel do painel de gestão. A foto chega como data URL (as duas versões
 * que `resizeForUpload` já gera: 1600 px e 640 px) e o SERVIDOR a grava no bucket
 * `property-images`, o mesmo do `/admin`.
 *
 * Alternativa descartada: URL assinada para o navegador subir direto. O corretor não
 * é `tenant_members`, então não passa na policy de storage da 0012, e o caminho viria
 * do cliente. Aqui o caminho é montado no servidor com o slug do tenant da sessão.
 * O custo é o corpo da requisição passar pela função (teto de 4,5 MB na Vercel), daí
 * `FOTOS_POR_ENVIO_MAX`.
 */

export const FOTOS_IMOVEL_MAX_SERVIDOR = 20
export const FOTOS_POR_ENVIO_MAX = 4
/** Teto do data URL (base64) de cada versão: 600k chars ≈ 450 KB de imagem, como no mock. */
export const FOTO_URL_MAX_CHARS = 600_000
export const FOTO_URL_SM_MAX_CHARS = 150_000
export const BUCKET_FOTOS_IMOVEL = 'property-images'

export type TipoFoto = 'image/webp' | 'image/jpeg'
const EXTENSAO: Record<TipoFoto, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }

export interface FotoDecodificada {
  bytes: Buffer
  tipo: TipoFoto
}

/**
 * Tipo pelos BYTES, não pelo cabeçalho do data URL: `data:image/jpeg;base64,<svg…>`
 * é o truque clássico para subir HTML/SVG num bucket público (script no domínio do
 * Storage). Só WebP e JPEG, que é o que a redução do `/admin` produz; SVG e HEIC
 * já são recusados na tela.
 */
export function tipoPelosBytes(b: Buffer): TipoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function decodificarFoto(dataUrl: unknown, maxChars: number): { ok: true; foto: FotoDecodificada } | { ok: false; erro: string } {
  if (typeof dataUrl !== 'string') return { ok: false, erro: 'O arquivo precisa ser uma imagem.' }
  const m = /^data:image\/(?:webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m) return { ok: false, erro: 'Use fotos em JPG, PNG ou WebP.' }
  if (dataUrl.length >= maxChars) return { ok: false, erro: 'A foto é grande demais depois de reduzida.' }
  const bytes = Buffer.from(m[1]!, 'base64')
  const tipo = tipoPelosBytes(bytes)
  if (!tipo) return { ok: false, erro: 'Use fotos em JPG, PNG ou WebP.' }
  return { ok: true, foto: { bytes, tipo } }
}

export interface FotoPronta {
  lg: FotoDecodificada
  sm: FotoDecodificada | null
  alt: string | null
}

/** Valida o lote inteiro antes de subir qualquer coisa: falha na 3ª foto não deixa 2 órfãs no bucket. */
export function prepararFotos(raw: unknown): { ok: true; fotos: FotoPronta[] } | { ok: false; erro: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, erro: 'Envie ao menos uma foto.' }
  if (raw.length > FOTOS_POR_ENVIO_MAX) return { ok: false, erro: `Envie até ${FOTOS_POR_ENVIO_MAX} fotos por vez.` }
  const fotos: FotoPronta[] = []
  for (const item of raw as Partial<FotoNova>[]) {
    if (!item || typeof item !== 'object') return { ok: false, erro: 'O arquivo precisa ser uma imagem.' }
    const lg = decodificarFoto(item.url, FOTO_URL_MAX_CHARS)
    if (!lg.ok) return lg
    let sm: FotoDecodificada | null = null
    if (item.urlSm !== null && item.urlSm !== undefined) {
      const r = decodificarFoto(item.urlSm, FOTO_URL_SM_MAX_CHARS)
      if (!r.ok) return r
      sm = r.foto
    }
    const alt = typeof item.alt === 'string' && item.alt.trim() ? item.alt.trim().slice(0, 200) : null
    fotos.push({ lg: lg.foto, sm, alt })
  }
  return { ok: true, fotos }
}

export interface FotoArmazenada {
  url: string
  urlSm: string | null
}

/** Sobe as duas versões e devolve as URLs públicas. Caminho: `<slug>/<ts>-<rand>.<ext>` e `…@sm.<ext>`, igual ao `/admin`. */
export async function armazenarFotoImovel(db: SupabaseClient, slug: string, foto: FotoPronta): Promise<FotoArmazenada> {
  const bucket = db.storage.from(BUCKET_FOTOS_IMOVEL)
  const base = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}`
  const subir = async (caminho: string, f: FotoDecodificada) => {
    const { error } = await bucket.upload(caminho, f.bytes, { cacheControl: '31536000', upsert: false, contentType: f.tipo })
    if (error) throw error
    return bucket.getPublicUrl(caminho).data.publicUrl
  }
  const url = await subir(`${base}.${EXTENSAO[foto.lg.tipo]}`, foto.lg)
  const urlSm = foto.sm ? await subir(`${base}@sm.${EXTENSAO[foto.sm.tipo]}`, foto.sm) : null
  return { url, urlSm }
}
