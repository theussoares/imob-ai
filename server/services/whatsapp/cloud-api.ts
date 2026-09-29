import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WhatsappMessageStatus, WhatsappTemplateCategory, WhatsappTemplateStatus } from '~~/shared/models/whatsapp'
import { variaveisDoModelo } from '~~/shared/models/whatsapp'
import {
  ErroDoWhatsapp,
  type Conexao,
  type LoteDoWebhook,
  type MensagemEcoada,
  type MensagemRecebida,
  type MidiaRecebida,
  MidiaGrandeDemais,
  type Enviada,
  type ModeloDaMeta,
  type TrocaDeCodigo,
  type MudancaDeStatus,
  type WhatsappProvider,
} from './provider'

/**
 * Adaptador da Cloud API oficial da Meta.
 *
 * Versão fixa da Graph API, e não "a mais recente": a Meta muda formato de
 * payload entre versões, e uma troca silenciosa quebraria o webhook sem aviso.
 * Cada versão vale ~2 anos; subir é um PR com os testes do payload.
 */
const GRAPH = 'https://graph.facebook.com/v24.0'

/** Teto de cada chamada. A função da Vercel tem minutos; o painel, paciência de segundos. */
const TIMEOUT_MS = 10_000

type Fetch = typeof fetch

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * O corpo veio da Meta? HMAC-SHA256 do corpo CRU com o App Secret.
 *
 * Corpo cru, e não o JSON re-serializado: `JSON.stringify(JSON.parse(x))`
 * muda espaçamento e escape de unicode, e a assinatura de um nome com acento
 * deixaria de bater — o webhook recusaria justamente as mensagens em português.
 *
 * Tempo constante, pelo mesmo motivo do `mesmoSegredo` do Asaas.
 */
export function assinaturaValida(corpoCru: string, cabecalho: string | null | undefined, appSecret: string): boolean {
  if (!appSecret || !cabecalho?.startsWith('sha256=')) return false
  const esperado = createHmac('sha256', appSecret).update(corpoCru, 'utf8').digest()
  let recebido: Buffer
  try {
    recebido = Buffer.from(cabecalho.slice('sha256='.length), 'hex')
  } catch {
    return false
  }
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

// Formato do payload da Meta — só o que lemos. Tudo opcional: é dado externo.
interface MetaTexto { body?: string }
interface MetaMensagem {
  id?: string
  from?: string
  to?: string
  timestamp?: string
  type?: string
  text?: MetaTexto
  button?: { text?: string; payload?: string }
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }
  image?: MetaArquivo
  video?: MetaArquivo
  document?: MetaArquivo
  audio?: MetaArquivo
  sticker?: MetaArquivo
}
interface MetaArquivo { id?: string; mime_type?: string; caption?: string; filename?: string }
interface MetaStatus {
  id?: string
  status?: string
  errors?: { code?: number; title?: string; message?: string }[]
}
interface MetaHistorico {
  metadata?: { progress?: number }
  errors?: { code?: number }[]
  threads?: { id?: string; messages?: MetaMensagem[] }[]
}
interface MetaValor {
  metadata?: { phone_number_id?: string }
  history?: MetaHistorico[]
  state_sync?: { type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }[]
  contacts?: { wa_id?: string; profile?: { name?: string } }[]
  messages?: MetaMensagem[]
  message_echoes?: MetaMensagem[]
  statuses?: MetaStatus[]
}
interface MetaPayload {
  object?: string
  entry?: { changes?: { field?: string; value?: MetaValor }[] }[]
}

function quando(ts: string | undefined): string {
  const s = Number(ts)
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : new Date().toISOString()
}

/** O texto que a pessoa leu, qualquer que seja o tipo que o carrega. */
function textoDe(m: MetaMensagem): string | null {
  const t =
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    null
  return t && t.trim() ? t : null
}

function midiaDe(m: MetaMensagem): MidiaRecebida | null {
  const a = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker
  if (!a?.id) return null
  return { id: a.id, mime: a.mime_type ?? null, nomeDoArquivo: a.filename?.slice(0, 200) ?? null }
}

const STATUS: Record<string, WhatsappMessageStatus> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'falhou',
}

/**
 * Normaliza o payload do webhook em lotes por número conectado.
 *
 * Nunca lança: o que não entende, ignora. Um campo novo que a Meta passe a
 * mandar não pode virar 500 — ela reenviaria para sempre e, depois de
 * falhas seguidas, desliga o webhook do app inteiro, de TODAS as imobiliárias.
 */
export function lotesDoWebhook(payload: unknown): LoteDoWebhook[] {
  const p = payload as MetaPayload
  if (!p || p.object !== 'whatsapp_business_account' || !Array.isArray(p.entry)) return []

  const porNumero = new Map<string, LoteDoWebhook>()
  const lote = (id: string) => {
    let l = porNumero.get(id)
    if (!l) porNumero.set(id, (l = { phoneNumberId: id, recebidas: [], ecos: [], status: [] }))
    return l
  }

  for (const entry of p.entry) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value
      const numero = v?.metadata?.phone_number_id
      if (!v || !numero) continue

      if (change.field === 'messages') {
        const nomes = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]))
        for (const m of v.messages ?? []) {
          if (!m.id || !m.from) continue
          const r: MensagemRecebida = {
            wamid: m.id,
            de: m.from,
            nomeDoPerfil: nomes.get(m.from) ?? null,
            tipo: m.type ?? 'unknown',
            texto: textoDe(m),
            respostaId: m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.button?.payload ?? null,
            midia: midiaDe(m),
            quando: quando(m.timestamp),
          }
          lote(numero).recebidas.push(r)
        }
        for (const s of v.statuses ?? []) {
          const status = s.status ? STATUS[s.status] : undefined
          if (!s.id || !status) continue
          const e = s.errors?.[0]
          const mudanca: MudancaDeStatus = {
            wamid: s.id,
            status,
            erro: e ? [e.code, e.title ?? e.message].filter(Boolean).join(' — ') : null,
          }
          lote(numero).status.push(mudanca)
        }
      } else if (change.field === 'history') {
        const l = lote(numero)
        l.historico ??= []
        for (const h of v.history ?? []) {
          // 2593109: o compartilhamento de histórico está desligado no app.
          const recusado = (h.errors ?? []).some((e) => e.code === 2593109)
          const conversas = (h.threads ?? [])
            .filter((t) => t.id)
            .map((t) => ({
              waId: t.id!,
              mensagens: (t.messages ?? [])
                .filter((m) => m.id)
                .map((m) => ({
                  wamid: m.id!,
                  // No histórico o contato é o dono da "thread": o que veio
                  // dele é entrada; o resto saiu do app da imobiliária.
                  doContato: m.from === t.id,
                  tipo: m.type ?? 'unknown',
                  texto: textoDe(m),
                  midia: midiaDe(m),
                  quando: quando(m.timestamp),
                })),
            }))
          const progresso = typeof h.metadata?.progress === 'number' ? h.metadata.progress : null
          l.historico.push({ progresso, recusado, conversas })
        }
      } else if (change.field === 'smb_app_state_sync') {
        const l = lote(numero)
        l.contatos ??= []
        for (const e of v.state_sync ?? []) {
          const tel = e.contact?.phone_number?.replace(/\D/g, '')
          const nome = (e.contact?.full_name || e.contact?.first_name || '').trim()
          if (e.type === 'contact' && e.action !== 'remove' && tel && nome) l.contatos.push({ waId: tel, nome: nome.slice(0, 120) })
        }
      } else if (change.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          if (!m.id || !m.to) continue
          const eco: MensagemEcoada = { wamid: m.id, para: m.to, tipo: m.type ?? 'unknown', texto: textoDe(m), midia: midiaDe(m), quando: quando(m.timestamp) }
          lote(numero).ecos.push(eco)
        }
      }
    }
  }
  return [...porNumero.values()]
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

interface MetaModelo {
  name?: string
  language?: string
  status?: string
  category?: string
  parameter_format?: string
  components?: {
    type?: string
    format?: string
    text?: string
    buttons?: { type?: string; url?: string }[]
  }[]
}

const STATUS_DO_MODELO: Record<string, WhatsappTemplateStatus> = {
  APPROVED: 'aprovado',
  PENDING: 'em_analise',
  IN_APPEAL: 'em_analise',
  REJECTED: 'recusado',
  PAUSED: 'pausado',
  DISABLED: 'pausado',
}

const CATEGORIAS: WhatsappTemplateCategory[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION']

/**
 * Normaliza um modelo da Graph API. Nunca lança; o que não reconhece vira
 * `suportado: false` e a tela mostra sem oferecer o envio.
 */
export function modeloDaMeta(m: MetaModelo): ModeloDaMeta | null {
  if (!m?.name || !m.language) return null
  const comps = m.components ?? []
  const corpo = comps.find((c) => c.type === 'BODY')?.text ?? ''
  const cabecalho = comps.find((c) => c.type === 'HEADER')
  const botoes = comps.find((c) => c.type === 'BUTTONS')?.buttons ?? []
  // Só o corpo tem variáveis preenchíveis pela tela. Cabeçalho de mídia ou
  // com variável, e botão de link com variável, pedem parâmetros próprios.
  const cabecalhoOk = !cabecalho || (cabecalho.format === 'TEXT' && !/\{\{/.test(cabecalho.text ?? ''))
  const botoesOk = botoes.every((b) => !(b.type === 'URL' && /\{\{/.test(b.url ?? '')))
  const categoria = CATEGORIAS.includes(m.category as WhatsappTemplateCategory) ? (m.category as WhatsappTemplateCategory) : 'MARKETING'
  return {
    name: m.name,
    language: m.language,
    category: categoria,
    status: STATUS_DO_MODELO[m.status ?? ''] ?? 'outro',
    body: corpo,
    variables: variaveisDoModelo(corpo),
    nomeado: m.parameter_format === 'NAMED',
    // Autenticação é código de login: não é o que uma imobiliária manda pelo painel.
    suportado: Boolean(corpo) && cabecalhoOk && botoesOk && categoria !== 'AUTHENTICATION',
  }
}

// ---------------------------------------------------------------------------
// Chamadas à Graph API
// ---------------------------------------------------------------------------

interface ErroDaMeta { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string } }

async function chamar<T>(f: Fetch, c: Conexao, caminho: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await f(`${GRAPH}${caminho}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new ErroDoWhatsapp(`Não foi possível falar com o WhatsApp agora (${errMessage(e)}).`)
  }
  const json = (await res.json().catch(() => ({}))) as T & ErroDaMeta
  if (!res.ok) {
    const code = json.error?.code
    const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`
    const e = new ErroDoWhatsapp(msg, res.status === 401 || res.status === 403 || code === 190, code === 131047)
    e.subcodigo = json.error?.error_subcode ?? null
    throw e
  }
  return json
}

/**
 * O endereço de download é da Meta? https e host dela. É para esse endereço
 * que o token da imobiliária vai no cabeçalho.
 */
export function urlDaMeta(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/.test(u.hostname)
  } catch {
    return false
  }
}

interface Resposta { messages?: { id?: string }[]; contacts?: { wa_id?: string }[] }

function enviada(r: Resposta): Enviada {
  const wamid = r.messages?.[0]?.id
  if (!wamid) throw new ErroDoWhatsapp('O WhatsApp não confirmou o envio.')
  return { wamid, waId: r.contacts?.[0]?.wa_id ?? null }
}

/**
 * Troca o `code` que o popup do Embedded Signup devolveu pelo token da
 * integração da imobiliária com o nosso app.
 *
 * Aqui, no servidor, e nunca no navegador: a troca exige o App Secret. O
 * `code` vale segundos e uma vez só — quem chama tem de fazer isto logo.
 */
export async function trocarCodigo(t: TrocaDeCodigo, f: Fetch = fetch): Promise<string> {
  const q = new URLSearchParams({ client_id: t.appId, client_secret: t.appSecret, code: t.code })
  let res: Response
  try {
    res = await f(`${GRAPH}/oauth/access_token?${q}`, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new ErroDoWhatsapp(`Não foi possível falar com a Meta agora (${errMessage(e)}).`)
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string } & ErroDaMeta
  if (!res.ok || !json.access_token) {
    throw new ErroDoWhatsapp(json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`, true)
  }
  return json.access_token
}

export function cloudApi(f: Fetch = fetch): WhatsappProvider {
  return {
    async conferirNumero(c) {
      const r = await chamar<{ display_phone_number?: string; verified_name?: string }>(
        f,
        c,
        `/${encodeURIComponent(c.phoneNumberId)}?fields=display_phone_number,verified_name`,
        { method: 'GET' },
      )
      return { displayPhone: r.display_phone_number ?? null, verifiedName: r.verified_name ?? null }
    },

    async assinarWebhook(c) {
      await chamar(f, c, `/${encodeURIComponent(c.wabaId)}/subscribed_apps`, { method: 'POST' })
    },

    async enviarTexto(c, para, texto) {
      const r = await chamar<Resposta>(f, c, `/${encodeURIComponent(c.phoneNumberId)}/messages`, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: para,
          type: 'text',
          text: { body: texto, preview_url: false },
        },
      })
      return enviada(r)
    },

    async listarModelos(c) {
      const modelos: ModeloDaMeta[] = []
      let caminho: string | null =
        `/${encodeURIComponent(c.wabaId)}/message_templates?fields=name,language,status,category,parameter_format,components&limit=100`
      // Paginado. Teto de 5 páginas (500 modelos): nenhuma imobiliária tem
      // tantos, e um laço sem teto num `next` malformado prenderia a função.
      for (let pagina = 0; caminho && pagina < 5; pagina++) {
        const r: { data?: MetaModelo[]; paging?: { next?: string } } = await chamar(f, c, caminho, { method: 'GET' })
        for (const m of r.data ?? []) {
          const n = modeloDaMeta(m)
          if (n) modelos.push(n)
        }
        // O `next` vem absoluto; só o caminho depois da versão é reaproveitado,
        // para a chamada continuar indo para o host fixo acima.
        const next = r.paging?.next
        caminho = next && next.startsWith(GRAPH) ? next.slice(GRAPH.length) : null
      }
      return modelos
    },

    async enviarModelo(c, para, modelo, valores) {
      const parametros = modelo.variables.map((nome, i) =>
        modelo.nomeado ? { type: 'text', parameter_name: nome, text: valores[i] ?? '' } : { type: 'text', text: valores[i] ?? '' },
      )
      const r = await chamar<Resposta>(f, c, `/${encodeURIComponent(c.phoneNumberId)}/messages`, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: para,
          type: 'template',
          template: {
            name: modelo.name,
            language: { code: modelo.language },
            ...(parametros.length ? { components: [{ type: 'body', parameters: parametros }] } : {}),
          },
        },
      })
      return enviada(r)
    },

    async baixarMidia(c, mediaId, maxBytes, prazoMs) {
      const info = await chamar<{ url?: string; mime_type?: string; file_size?: number }>(f, c, `/${encodeURIComponent(mediaId)}`, { method: 'GET' })
      if (!info.url || !urlDaMeta(info.url)) throw new ErroDoWhatsapp('A Meta não devolveu um endereço de arquivo válido.')
      if ((info.file_size ?? 0) > maxBytes) throw new MidiaGrandeDemais()

      let res: Response
      try {
        // O token vai junto — por isso o host é conferido acima. Um endereço
        // que não fosse da Meta receberia o token da imobiliária. (Num
        // redirect para outro domínio o fetch do Node descarta o
        // Authorization, como manda a especificação.)
        res = await f(info.url, { headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(Math.max(1000, prazoMs)) })
      } catch (e) {
        throw new ErroDoWhatsapp(`Não foi possível baixar o arquivo (${errMessage(e)}).`)
      }
      if (!res.ok) throw new ErroDoWhatsapp(`A Meta recusou o download do arquivo (HTTP ${res.status}).`, res.status === 401 || res.status === 403)
      const bytes = new Uint8Array(await res.arrayBuffer())
      // O tamanho informado pode faltar; o teto vale para o que chegou.
      if (bytes.byteLength > maxBytes) throw new MidiaGrandeDemais()
      return { bytes, mime: info.mime_type || res.headers.get('content-type') || 'application/octet-stream' }
    },

    async enviarMidia(c, para, m) {
      const arquivo: Record<string, string> = { link: m.link }
      if (m.legenda && m.tipo !== 'audio') arquivo.caption = m.legenda
      if (m.tipo === 'document' && m.nomeDoArquivo) arquivo.filename = m.nomeDoArquivo
      const r = await chamar<Resposta>(f, c, `/${encodeURIComponent(c.phoneNumberId)}/messages`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: m.tipo, [m.tipo]: arquivo },
      })
      return enviada(r)
    },

    async numerosDaWaba(c) {
      const r = await chamar<{ data?: { id?: string }[] }>(f, c, `/${encodeURIComponent(c.wabaId)}/phone_numbers?fields=id&limit=100`, { method: 'GET' })
      return (r.data ?? []).map((n) => n.id).filter((id): id is string => Boolean(id))
    },

    async registrarNumero(c, pin) {
      await chamar(f, c, `/${encodeURIComponent(c.phoneNumberId)}/register`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', pin },
      })
    },

    async pedirSincronizacao(c, tipo) {
      await chamar(f, c, `/${encodeURIComponent(c.phoneNumberId)}/smb_app_data`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', sync_type: tipo },
      })
    },

    async enviarInterativo(c, para, msg) {
      if (msg.tipo === 'texto') return this.enviarTexto(c, para, msg.corpo)
      const interactive =
        msg.tipo === 'botoes'
          ? {
              type: 'button',
              body: { text: msg.corpo },
              action: { buttons: msg.botoes.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
            }
          : {
              type: 'list',
              body: { text: msg.corpo },
              action: {
                button: msg.botao.slice(0, 20),
                sections: [{ title: 'Opções', rows: msg.linhas.slice(0, 10).map((l) => ({ id: l.id, title: l.titulo.slice(0, 24) })) }],
              },
            }
      const r = await chamar<Resposta>(f, c, `/${encodeURIComponent(c.phoneNumberId)}/messages`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'interactive', interactive },
      })
      return enviada(r)
    },

    async criarModelo(c, m) {
      try {
        await chamar(f, c, `/${encodeURIComponent(c.wabaId)}/message_templates`, {
          method: 'POST',
          body: {
            name: m.name,
            language: m.language,
            category: m.category,
            components: [{ type: 'BODY', text: m.body, ...(m.exemplo.length ? { example: { body_text: [m.exemplo] } } : {}) }],
          },
        })
        return 'criado'
      } catch (e) {
        // 2388024: "já existe conteúdo neste idioma" — pedir de novo não é erro.
        if (e instanceof ErroDoWhatsapp && e.subcodigo === 2388024) return 'ja_existe'
        throw e
      }
    },
  }
}
