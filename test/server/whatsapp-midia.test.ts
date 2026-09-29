import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { cloudApi, lotesDoWebhook, urlDaMeta } from '~~/server/services/whatsapp/cloud-api'
import { MidiaGrandeDemais } from '~~/server/services/whatsapp/provider'
import { processarLoteWhatsapp } from '~~/server/utils/whatsapp-inbox'
import { purgeOrphanConversations } from '~~/server/repositories/whatsapp.repository'
import { WHATSAPP_MIDIA_MAX_BYTES, WHATSAPP_MIDIA_MIMES, caminhoDaMidia, mimeBase } from '~~/shared/models/whatsapp'
import { fakeSupabase } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

/**
 * Mídia das conversas (0060).
 *
 * Ameaças: o token da imobiliária ir para um host que não é da Meta (o
 * endereço de download vem num JSON); o nome de arquivo do cliente virar
 * caminho no bucket; um vídeo gigante consumir a função; a foto ficar no
 * bucket depois de a política prometer que sumiu; e o download travar o
 * webhook a ponto de a Meta reenviar.
 */

const CONEXAO = { phoneNumberId: '111', wabaId: '222', accessToken: 'TOKEN' }

function fetchFalso(respostas: (object | { __bytes: number; __status?: number })[]) {
  const chamadas: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init })
    const r = respostas.shift() ?? {}
    if ('__bytes' in r) return new Response(new Uint8Array(r.__bytes), { status: r.__status ?? 200, headers: { 'content-type': 'image/jpeg' } })
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof fetch
  return { f, chamadas }
}

describe('download da mídia', () => {
  test('o token só vai para host da Meta', () => {
    expect(urlDaMeta('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1')).toBe(true)
    expect(urlDaMeta('https://graph.facebook.com/x')).toBe(true)
    expect(urlDaMeta('http://lookaside.fbsbx.com/x')).toBe(false)
    expect(urlDaMeta('https://fbsbx.com.evil.example/x')).toBe(false)
    expect(urlDaMeta('https://evilfbsbx.com/x')).toBe(false)
    expect(urlDaMeta('lixo')).toBe(false)
  })

  test('endereço fora da Meta: nem tenta baixar', async () => {
    const { f, chamadas } = fetchFalso([{ url: 'https://evil.example/f', mime_type: 'image/jpeg', file_size: 10 }])
    await expect(cloudApi(f).baixarMidia(CONEXAO, 'm1', 1000, 5000)).rejects.toThrow()
    expect(chamadas).toHaveLength(1) // só a consulta à Graph API
  })

  test('grande demais pelo tamanho informado: recusa ANTES de baixar', async () => {
    const { f, chamadas } = fetchFalso([{ url: 'https://lookaside.fbsbx.com/f', mime_type: 'video/mp4', file_size: 50_000_000 }])
    await expect(cloudApi(f).baixarMidia(CONEXAO, 'm1', WHATSAPP_MIDIA_MAX_BYTES, 5000)).rejects.toBeInstanceOf(MidiaGrandeDemais)
    expect(chamadas).toHaveLength(1)
  })

  test('grande demais sem tamanho informado: recusa pelo que chegou', async () => {
    const { f } = fetchFalso([{ url: 'https://lookaside.fbsbx.com/f', mime_type: 'image/jpeg' }, { __bytes: 2000 }])
    await expect(cloudApi(f).baixarMidia(CONEXAO, 'm1', 1000, 5000)).rejects.toBeInstanceOf(MidiaGrandeDemais)
  })

  test('baixa com o token no cabeçalho e devolve o tipo', async () => {
    const { f, chamadas } = fetchFalso([{ url: 'https://lookaside.fbsbx.com/f', mime_type: 'audio/ogg; codecs=opus', file_size: 3 }, { __bytes: 3 }])
    const r = await cloudApi(f).baixarMidia(CONEXAO, 'm1', 1000, 5000)
    expect(r.bytes.byteLength).toBe(3)
    expect(r.mime).toBe('audio/ogg; codecs=opus')
    expect((chamadas[1]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
  })
})

describe('caminho no bucket', () => {
  test('pasta do tenant em cima, e só ids — nunca o nome que o cliente deu', () => {
    expect(caminhoDaMidia('t1', 'c1', 'm1', 'image/jpeg')).toBe('t1/c1/m1.jpg')
    expect(caminhoDaMidia('t1', 'c1', 'm1', 'audio/ogg; codecs=opus')).toBe('t1/c1/m1.ogg')
    expect(caminhoDaMidia('t1', 'c1', 'm1', 'application/x-desconhecido')).toBe('t1/c1/m1.bin')
  })

  test('áudio de voz passa na lista do bucket depois de tirar o codecs', () => {
    expect(WHATSAPP_MIDIA_MIMES).toContain(mimeBase('audio/ogg; codecs=opus'))
  })

  test('a lista e o teto do código batem com os da migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0060_conversas_whatsapp_midia.sql'), 'utf8')
    expect(sql).toContain(`${WHATSAPP_MIDIA_MAX_BYTES / 1024 / 1024} * 1024 * 1024`)
    for (const m of WHATSAPP_MIDIA_MIMES) expect(sql).toContain(`'${m}'`)
  })
})

describe('webhook com mídia', () => {
  test('lê a foto, o áudio e o documento com nome', () => {
    const lotes = lotesDoWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '111' }, messages: [
        { from: '1', id: 'a', type: 'image', image: { id: 'img1', mime_type: 'image/jpeg', caption: 'A fachada' } },
        { from: '1', id: 'b', type: 'audio', audio: { id: 'aud1', mime_type: 'audio/ogg; codecs=opus' } },
        { from: '1', id: 'c', type: 'document', document: { id: 'doc1', mime_type: 'application/pdf', filename: 'holerite.pdf' } },
      ] } }] }],
    })
    const r = lotes[0]!.recebidas
    expect(r[0]).toMatchObject({ texto: 'A fachada', midia: { id: 'img1', mime: 'image/jpeg', nomeDoArquivo: null } })
    expect(r[1]).toMatchObject({ texto: null, midia: { id: 'aud1' } })
    expect(r[2]).toMatchObject({ midia: { id: 'doc1', nomeDoArquivo: 'holerite.pdf' } })
  })

  test('mensagem nova com foto: gravada como pendente e devolvida para baixar', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_conversations: [
        { data: [{ id: 'c1', lead_id: 'l1', last_inbound_at: null, first_response_at: null, unread_count: 0, wa_id: '1', account_id: 'a1' }], error: null },
        { data: null, error: null },
      ],
      whatsapp_messages: { data: { id: 'm1' }, error: null },
    })
    const conta = { id: 'a1', tenantId: 't1', phoneNumberId: '111', wabaId: '2', displayPhone: null, verifiedName: null, accessTokenEnc: 'x', ativo: true }
    const pendentes = await processarLoteWhatsapp(client, conta, {
      phoneNumberId: '111',
      recebidas: [{ wamid: 'w', de: '1', nomeDoPerfil: null, tipo: 'image', texto: null, midia: { id: 'img1', mime: 'image/jpeg', nomeDoArquivo: null }, quando: new Date().toISOString() }],
      ecos: [],
      status: [],
    })
    expect(pendentes).toEqual([{ messageId: 'm1', conversationId: 'c1', mediaId: 'img1' }])
    const insert = calls.find((c) => c.table === 'whatsapp_messages' && c.method === 'insert')!.args[0] as Record<string, unknown>
    expect(insert).toMatchObject({ media_id: 'img1', media_status: 'pendente', tenant_id: 't1' })
  })

  test('o download vem depois de gravar e fora do try do 500', () => {
    // Uma foto lenta não pode virar 500: o reenvio seria ignorado pelo wamid e
    // a foto não viria de novo.
    const src = stripComments(readFileSync(join(process.cwd(), 'server/api/webhooks/whatsapp/index.post.ts'), 'utf8'))
    const fimDoTry = src.indexOf("statusMessage: 'Falha ao processar'")
    expect(src.indexOf('baixarMidiasDoWebhook(')).toBeGreaterThan(fimDoTry)
  })
})

describe('retenção', () => {
  test('pela pasta da conversa, paginado: pega também o upload que nunca virou mensagem', async () => {
    const nomes = (n: number, de: number) => Array.from({ length: n }, (_, k) => ({ name: `out-${de + k}.jpg` }))
    const { client, calls } = fakeSupabase({
      whatsapp_conversations: [{ data: [{ id: 'c1', tenant_id: 't1' }], error: null }, { data: null, error: null }],
    })
    const listadas: { pasta: string; offset: number }[] = []
    const paginas = [nomes(1000, 0), nomes(5, 1000)]
    const removidos: string[] = []
    let apagouAntesDeRemover = false
    client.storage = {
      from: () => ({
        list: async (pasta: string, o: { offset: number }) => {
          listadas.push({ pasta, offset: o.offset })
          return { data: paginas.shift() ?? [], error: null }
        },
        remove: async (p: string[]) => {
          if (calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'delete')) apagouAntesDeRemover = true
          removidos.push(...p)
          return { error: null }
        },
      }),
    }
    await purgeOrphanConversations(client, '2026-07-01T00:00:00Z')
    expect(listadas.map((l) => l.pasta)).toEqual(['t1/c1', 't1/c1'])
    expect(removidos).toHaveLength(1005)
    expect(removidos[0]).toBe('t1/c1/out-0.jpg')
    expect(apagouAntesDeRemover).toBe(false)
    expect(calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'delete')).toBe(true)
  })

  test('se a remoção de arquivo falhar, as conversas ficam para o cron de amanhã', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_conversations: [{ data: [{ id: 'c1', tenant_id: 't1' }], error: null }] })
    client.storage = {
      from: () => ({
        list: async () => ({ data: [{ name: 'm.jpg' }], error: null }),
        remove: async () => ({ error: { message: 'storage fora' } }),
      }),
    }
    await expect(purgeOrphanConversations(client, '2026-07-01T00:00:00Z')).rejects.toBeTruthy()
    expect(calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'delete')).toBe(false)
  })

  test('apaga os arquivos antes das linhas', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'server/repositories/whatsapp.repository.ts'), 'utf8'))
    const corpo = src.slice(src.indexOf('export async function purgeOrphanConversations'))
    expect(corpo.indexOf(".remove(")).toBeGreaterThan(0)
    expect(corpo.indexOf(".remove(")).toBeLessThan(corpo.indexOf('.delete()'))
  })
})

describe('0060: bucket privado', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0060_conversas_whatsapp_midia.sql'), 'utf8').replace(/--.*$/gm, '')
  test('privado, e a única policy é de leitura, por pasta do tenant do membro', () => {
    expect(sql).toMatch(/'whatsapp-media',\s*'whatsapp-media',\s*false/)
    expect(sql).toMatch(/set public = false/)
    const policies = sql.match(/create policy[\s\S]*?;/g) ?? []
    expect(policies).toHaveLength(1)
    expect(policies[0]).toMatch(/for select to authenticated/)
    expect(policies[0]).toMatch(/m\.user_id = auth\.uid\(\)/)
    expect(policies[0]).toMatch(/\(storage\.foldername\(name\)\)\[1\]/)
  })
})
