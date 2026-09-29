import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { WHATSAPP_ENVIO, WHATSAPP_MIDIA_MIMES, caminhoDaMidia, mimeDoCaminho, prefixoDeEnvio, problemaNoAnexo } from '~~/shared/models/whatsapp'
import { stripComments } from '../helpers/strip-comments'

/**
 * Envio de arquivo pelo painel.
 *
 * Ameaças: o body apontar para um arquivo que OUTRO cliente mandou (ou de
 * outra imobiliária) e ele sair pelo WhatsApp para outra pessoa; o navegador
 * mentir o tipo ou o tamanho; o arquivo ficar no bucket sem mensagem que o
 * explique; e o envio passar pela função da Vercel, que recusa corpo acima de
 * 4,5 MB.
 */

const CONEXAO = { phoneNumberId: '111', wabaId: '222', accessToken: 'TOKEN' }

function fetchFalso() {
  const corpos: Record<string, unknown>[] = []
  const f = (async (_url: string, init: RequestInit) => {
    corpos.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify({ messages: [{ id: 'w' }] }))
  }) as unknown as typeof fetch
  return { f, corpos }
}

describe('o que pode ser enviado', () => {
  test('foto até 5 MB (limite da Meta), documento até 16 MB (o nosso)', () => {
    expect(problemaNoAnexo('image/jpeg', 4 * 1024 * 1024)).toBeNull()
    expect(problemaNoAnexo('image/jpeg', 6 * 1024 * 1024)).toMatch(/5 MB/)
    expect(problemaNoAnexo('application/pdf', 15 * 1024 * 1024)).toBeNull()
    expect(problemaNoAnexo('application/pdf', 17 * 1024 * 1024)).toMatch(/16 MB/)
  })

  test('webp e ogg ficam fora: chegariam como figurinha e como áudio quebrado', () => {
    expect(problemaNoAnexo('image/webp', 100)).toBeTruthy()
    expect(problemaNoAnexo('audio/ogg', 100)).toBeTruthy()
    expect(problemaNoAnexo('application/x-msdownload', 100)).toBeTruthy()
    expect(problemaNoAnexo('image/png', 0)).toBeTruthy()
  })

  test('todo formato de envio é aceito pelo bucket, e o caminho devolve o mesmo tipo', () => {
    for (const mime of Object.keys(WHATSAPP_ENVIO)) {
      expect(WHATSAPP_MIDIA_MIMES).toContain(mime)
      expect(mimeDoCaminho(caminhoDaMidia('t', 'c', 'out-x', mime))).toBe(mime)
    }
  })
})

describe('envio pela Meta', () => {
  test('por link; documento leva o nome; áudio vai sem legenda', async () => {
    const { f, corpos } = fetchFalso()
    const api = cloudApi(f)
    await api.enviarMidia(CONEXAO, '55', { tipo: 'image', link: 'https://x/s', legenda: 'Fachada', nomeDoArquivo: 'a.jpg' })
    await api.enviarMidia(CONEXAO, '55', { tipo: 'document', link: 'https://x/s', legenda: null, nomeDoArquivo: 'contrato.pdf' })
    await api.enviarMidia(CONEXAO, '55', { tipo: 'audio', link: 'https://x/s', legenda: 'ignorada', nomeDoArquivo: null })
    expect(corpos[0]).toMatchObject({ type: 'image', image: { link: 'https://x/s', caption: 'Fachada' } })
    expect(corpos[0]!.image).not.toHaveProperty('filename')
    expect(corpos[1]).toMatchObject({ type: 'document', document: { filename: 'contrato.pdf' } })
    expect(corpos[2]!.audio).toEqual({ link: 'https://x/s' })
  })
})

describe('endpoints', () => {
  const ler = (f: string) => stripComments(readFileSync(join(process.cwd(), 'server/api/admin/whatsapp/conversations/[id]', f), 'utf8'))

  test('o caminho do upload é decidido pelo servidor, nunca pelo body', () => {
    const src = ler('upload.post.ts')
    expect(src).not.toMatch(/body\??\.path/)
    expect(src).toContain('randomUUID()')
    expect(src).toContain('caminhoDaMidia(tenant.id, id,')
  })

  test('o envio só aceita arquivo da pasta de envio DESTA conversa deste tenant', () => {
    const src = ler('media.post.ts')
    expect(src).toContain('caminho.startsWith(prefixoDeEnvio(tenant.id, id))')
    // Um recebido (sem `out-`) ou de outra conversa não passa.
    expect(prefixoDeEnvio('t1', 'c1')).toBe('t1/c1/out-')
    expect(caminhoDaMidia('t1', 'c1', 'm1', 'image/jpeg').startsWith(prefixoDeEnvio('t1', 'c1'))).toBe(false)
  })

  test('tipo e tamanho vêm do objeto no Storage, e o arquivo sai do bucket se o envio falhar', () => {
    const src = ler('media.post.ts')
    expect(src).toContain('bucket.list(pasta')
    expect(src).toContain('objeto.metadata')
    const catchDoEnvio = src.slice(src.indexOf('enviarMidia('))
    expect(catchDoEnvio.indexOf('bucket.remove([caminho])')).toBeLessThan(catchDoEnvio.indexOf('erroDoEnvio('))
  })

  test('o arquivo não passa pela função: o navegador sobe direto com URL de uso único', () => {
    const tela = readFileSync(join(process.cwd(), 'app/pages/admin/conversas.vue'), 'utf8')
    expect(tela).toContain('uploadToSignedUrl(')
    expect(ler('upload.post.ts')).toContain('createSignedUploadUrl(')
  })
})
