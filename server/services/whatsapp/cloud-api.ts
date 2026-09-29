import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WhatsappMessageStatus, WhatsappTemplateCategory, WhatsappTemplateStatus } from '~~/shared/models/whatsapp'
import { variaveisDoModelo } from '~~/shared/models/whatsapp'
import {
  ErroDoWhatsapp,
  type Conexao,
  type LoteDoWebhook,
  type MensagemEcoada,
  type MensagemRecebida,
  type Enviada,
  type ModeloDaMeta,
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
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
}
interface MetaStatus {
  id?: string
  status?: string
  errors?: { code?: number; title?: string; message?: string }[]
}
interface MetaValor {
  metadata?: { phone_number_id?: string }
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
      } else if (change.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          if (!m.id || !m.to) continue
          const eco: MensagemEcoada = { wamid: m.id, para: m.to, tipo: m.type ?? 'unknown', texto: textoDe(m), quando: quando(m.timestamp) }
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

interface Resposta { messages?: { id?: string }[]; contacts?: { wa_id?: string }[] }

function enviada(r: Resposta): Enviada {
  const wamid = r.messages?.[0]?.id
  if (!wamid) throw new ErroDoWhatsapp('O WhatsApp não confirmou o envio.')
  return { wamid, waId: r.contacts?.[0]?.wa_id ?? null }
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
