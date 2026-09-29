/**
 * Conversas do WhatsApp no painel (0059).
 * Ver docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md.
 */

export type WhatsappDirection = 'in' | 'out'
export type WhatsappOrigin = 'contato' | 'painel' | 'app'
export type WhatsappMessageStatus = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou'

/** O que o painel sabe do número conectado. Nunca o token. */
export interface WhatsappAccountInfo {
  conectado: boolean
  displayPhone: string | null
  verifiedName: string | null
  phoneNumberId: string | null
  /** Endereço para colar no app da Meta (Webhooks → Callback URL). */
  webhookUrl: string
  /** A plataforma tem App Secret e verify token configurados? Sem eles nada chega. */
  plataformaPronta: boolean
}

export interface WhatsappAccountInput {
  phoneNumberId: string
  wabaId: string
  accessToken: string
}

export interface WhatsappConversation {
  id: string
  waId: string
  contactName: string | null
  leadId: string | null
  leadName: string | null
  leadStage: string | null
  brokerId: string | null
  brokerName: string | null
  propertyId: string | null
  propertyCode: string | null
  propertyTitle: string | null
  lastInboundAt: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  lastDirection: WhatsappDirection | null
  firstResponseAt: string | null
  unreadCount: number
  createdAt: string
}

export type WhatsappMediaStatus = 'pendente' | 'salva' | 'falhou' | 'grande_demais'

export interface WhatsappMessage {
  id: string
  direction: WhatsappDirection
  origin: WhatsappOrigin
  type: string
  body: string | null
  status: WhatsappMessageStatus
  error: string | null
  occurredAt: string
  /** null = mensagem sem mídia. */
  mediaStatus: WhatsappMediaStatus | null
  mediaMime: string | null
  mediaFilename: string | null
}

/** Tipos de mensagem que carregam arquivo. */
export const TIPOS_COM_MIDIA = ['image', 'audio', 'video', 'document', 'sticker'] as const

/** Teto do que é guardado — o mesmo `file_size_limit` do bucket (0060). */
export const WHATSAPP_MIDIA_MAX_BYTES = 16 * 1024 * 1024

/**
 * Formatos guardados — os mesmos `allowed_mime_types` do bucket (0060). Fora
 * da lista, o upload seria recusado pelo Storage; melhor saber antes de baixar.
 */
export const WHATSAPP_MIDIA_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
  'video/mp4', 'video/3gpp',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/**
 * MIME como o Storage espera. A Meta manda áudio de voz como
 * `audio/ogg; codecs=opus`, e o `allowed_mime_types` compara o tipo sem
 * parâmetros.
 */
export function mimeBase(mime: string | null | undefined): string {
  return String(mime ?? '').split(';')[0]!.trim().toLowerCase()
}

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

/** O tipo de um arquivo que NÓS gravamos, pela extensão que o caminho recebeu. */
export function mimeDoCaminho(caminho: string): string | null {
  const ext = caminho.split('.').pop()?.toLowerCase()
  return Object.entries(EXTENSOES).find(([, e]) => e === ext)?.[0] ?? null
}

// ---------------------------------------------------------------------------
// Envio de mídia pelo painel
// ---------------------------------------------------------------------------

export type WhatsappTipoDeEnvio = 'image' | 'video' | 'audio' | 'document'

/**
 * O que o painel manda, e em que tipo de mensagem da Meta. Os tetos são os da
 * Meta (foto 5 MB) ou o do nosso bucket (16 MB), o menor dos dois.
 *
 * `image/webp` fica fora: para a Meta, webp é figurinha, e a foto chegaria
 * como sticker sem legenda. Áudio `audio/ogg` só com opus, o que o navegador
 * não garante; áudio fica restrito a mp3, m4a, aac e amr.
 */
export const WHATSAPP_ENVIO: Record<string, { tipo: WhatsappTipoDeEnvio; maxBytes: number }> = {
  'image/jpeg': { tipo: 'image', maxBytes: 5 * 1024 * 1024 },
  'image/png': { tipo: 'image', maxBytes: 5 * 1024 * 1024 },
  'video/mp4': { tipo: 'video', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'video/3gpp': { tipo: 'video', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'audio/mpeg': { tipo: 'audio', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'audio/mp4': { tipo: 'audio', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'audio/aac': { tipo: 'audio', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'audio/amr': { tipo: 'audio', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/pdf': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'text/plain': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/msword': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/vnd.ms-excel': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/vnd.ms-powerpoint': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { tipo: 'document', maxBytes: WHATSAPP_MIDIA_MAX_BYTES },
}

/** Legenda: o limite da Meta para foto, vídeo e documento. */
export const WHATSAPP_LEGENDA_MAX = 1024

/** O arquivo pode ser mandado? `null` = pode; senão, a frase para a tela. */
export function problemaNoAnexo(mime: string, bytes: number): string | null {
  const regra = WHATSAPP_ENVIO[mimeBase(mime)]
  if (!regra) return 'Este tipo de arquivo não pode ser enviado pelo WhatsApp. Use foto (JPG ou PNG), PDF, documento do Office, vídeo MP4 ou áudio MP3.'
  if (bytes <= 0) return 'O arquivo está vazio.'
  if (bytes > regra.maxBytes) return `Arquivo grande demais: o limite para ${regra.tipo === 'image' ? 'foto' : 'este tipo'} é ${Math.round(regra.maxBytes / 1024 / 1024)} MB.`
  return null
}

/** Pasta dos arquivos ENVIADOS pelo painel numa conversa. O `out-` separa dos recebidos. */
export function prefixoDeEnvio(tenantId: string, conversationId: string): string {
  return `${tenantId}/${conversationId}/out-`
}

/**
 * Caminho no bucket. A pasta de cima é o tenant — é por ela que a policy de
 * leitura (0060) decide quem vê. Nome do arquivo do CLIENTE nunca entra no
 * caminho: `../` ou um nome com o CPF dele virariam chave de objeto.
 */
export function caminhoDaMidia(tenantId: string, conversationId: string, messageId: string, mime: string): string {
  return `${tenantId}/${conversationId}/${messageId}.${EXTENSOES[mimeBase(mime)] ?? 'bin'}`
}

export type WhatsappFiltro = 'todas' | 'sem_resposta' | 'nao_lidas'
export const WHATSAPP_FILTROS: WhatsappFiltro[] = ['todas', 'sem_resposta', 'nao_lidas']
export const WHATSAPP_FILTRO_LABELS: Record<WhatsappFiltro, string> = {
  todas: 'Todas',
  sem_resposta: 'Sem resposta',
  nao_lidas: 'Não lidas',
}

export function toWhatsappFiltro(v: unknown): WhatsappFiltro {
  return WHATSAPP_FILTROS.includes(v as WhatsappFiltro) ? (v as WhatsappFiltro) : 'todas'
}

/**
 * Conversa sem lead some depois disto. Conteúdo de conversa é dado pessoal, e
 * sem lead não há atendimento que justifique guardar — mesmo prazo do clique.
 */
export const WHATSAPP_CONVERSA_RETENCAO_DIAS = 90

/** A janela de atendimento da Meta: texto livre só até 24h da última mensagem do contato. */
export const JANELA_DE_ATENDIMENTO_MS = 24 * 60 * 60 * 1000

export function janelaAberta(lastInboundAt: string | null, agora: Date): boolean {
  if (!lastInboundAt) return false
  const t = Date.parse(lastInboundAt)
  return Number.isFinite(t) && agora.getTime() - t < JANELA_DE_ATENDIMENTO_MS
}

/**
 * A conversa espera resposta da imobiliária? Última mensagem é do contato.
 *
 * Pela última mensagem, e não por `first_response_at`: o contato que voltou a
 * escrever depois de uma resposta também está esperando.
 */
export function aguardandoResposta(c: Pick<WhatsappConversation, 'lastDirection'>): boolean {
  return c.lastDirection === 'in'
}

/**
 * As duas formas de um celular brasileiro, SEM DDI, no formato do formulário
 * (`leads.phone`): com e sem o nono dígito.
 *
 * O `wa_id` que a Meta manda para número antigo costuma vir SEM o nono
 * dígito (`556791234567`), e o lead do formulário foi gravado COM ele
 * (`67991234567`). Casar só pela forma exata criaria um lead duplicado para
 * quem já tinha preenchido o formulário — justo o contato mais quente.
 *
 * A primeira é a canônica (com o nono dígito quando é celular): é a que vai
 * para lead novo. Fixo (8 dígitos começando em 2–5) não ganha o nove.
 */
export function telefonesDoWaId(waId: string): string[] {
  let d = String(waId ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 11) return [d, d.slice(0, 2) + d.slice(3)]
  if (d.length === 10) {
    const ehCelular = /[6-9]/.test(d[2]!)
    return ehCelular ? [d.slice(0, 2) + '9' + d.slice(2), d] : [d]
  }
  return d ? [d] : []
}

/**
 * Código do imóvel dentro da primeira mensagem, ou null.
 *
 * O texto vem do `wa.me` que o site monta (`useContact().whatsappLink`):
 * "Olá! Tenho interesse no imóvel VD-0010 — Casa…". Casa só depois de
 * "imóvel", e não qualquer "XX-123" solto: a pessoa pode apagar o texto e
 * escrever um CEP ou um número de apartamento.
 */
export function codigoDoImovelNaMensagem(texto: string | null | undefined): string | null {
  const m = String(texto ?? '').match(/im[óo]vel\s+([A-Za-z]{1,6}-\d{1,8})\b/i)
  return m ? m[1]!.toUpperCase() : null
}

const ROTULO_DE_TIPO: Record<string, string> = {
  image: 'Foto',
  audio: 'Áudio',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
  location: 'Localização',
  contacts: 'Contato compartilhado',
  reaction: 'Reação',
}

/** O que a lista e a conversa mostram quando a mensagem não é texto. */
export function textoDaMensagem(type: string, body: string | null): string {
  if (body) return body
  return ROTULO_DE_TIPO[type] ?? 'Mensagem não suportada'
}

/** Prévia de uma linha para a lista. */
export function previa(type: string, body: string | null): string {
  const t = textoDaMensagem(type, body).replace(/\s+/g, ' ').trim()
  return t.length > 120 ? t.slice(0, 119) + '…' : t
}

/** Ordem de progresso do status: um webhook atrasado nunca faz a mensagem "voltar". */
const ORDEM_STATUS: Record<WhatsappMessageStatus, number> = {
  recebida: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falhou: 4,
}

export function statusAvanca(atual: WhatsappMessageStatus, novo: WhatsappMessageStatus): boolean {
  return ORDEM_STATUS[novo] > ORDEM_STATUS[atual]
}

/** Teto do texto enviado pelo painel. É o limite da própria Meta para corpo de texto. */
export const WHATSAPP_TEXTO_MAX = 4096

// ---------------------------------------------------------------------------
// Modelos de mensagem (templates)
//
// Fora da janela de 24h, a Meta só entrega mensagem a partir de um modelo
// aprovado por ela. O modelo mora na conta do WhatsApp Business DA
// imobiliária; aqui só lemos, preenchemos as variáveis e enviamos.
// ---------------------------------------------------------------------------

export type WhatsappTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export const WHATSAPP_CATEGORIA_LABELS: Record<WhatsappTemplateCategory, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
  AUTHENTICATION: 'Autenticação',
}

export type WhatsappTemplateStatus = 'aprovado' | 'em_analise' | 'recusado' | 'pausado' | 'outro'

export const WHATSAPP_TEMPLATE_STATUS_LABELS: Record<WhatsappTemplateStatus, string> = {
  aprovado: 'Aprovado',
  em_analise: 'Em análise na Meta',
  recusado: 'Recusado pela Meta',
  pausado: 'Pausado pela Meta',
  outro: 'Indisponível',
}

export interface WhatsappTemplate {
  name: string
  language: string
  category: WhatsappTemplateCategory
  status: WhatsappTemplateStatus
  /** Texto do corpo, com as variáveis (`{{1}}` ou `{{nome}}`). */
  body: string
  /** Variáveis do corpo, na ordem em que aparecem. */
  variables: string[]
  /**
   * Dá para mandar pelo painel? Modelo com cabeçalho de mídia ou botão com
   * link variável exige parâmetros que a tela ainda não pede; mandar sem eles
   * a Meta recusa, e é melhor não oferecer do que falhar no clique.
   */
  suportado: boolean
}

export interface WhatsappTemplateSendInput {
  name: string
  language: string
  /** Um valor por variável, na ordem de `variables`. */
  values: string[]
}

/** Variáveis do texto, sem repetir, na ordem da primeira aparição. */
export function variaveisDoModelo(body: string): string[] {
  const vistas: string[] = []
  for (const m of body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!vistas.includes(m[1]!)) vistas.push(m[1]!)
  }
  return vistas
}

/** O texto como o cliente vai ler — é o que fica no histórico. */
export function preencherModelo(body: string, variables: string[], values: string[]): string {
  return body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (inteiro, nome: string) => {
    const i = variables.indexOf(nome)
    return i >= 0 && values[i] ? values[i]! : inteiro
  })
}

/**
 * Valor de variável aceitável pela Meta. Ela recusa parâmetro com quebra de
 * linha, tabulação ou mais de quatro espaços seguidos — e recusa o envio
 * inteiro, com um código que não diz qual variável.
 */
export function problemaNoValor(v: string): string | null {
  if (!v.trim()) return 'Preencha todos os campos.'
  if (/[\n\r\t]/.test(v)) return 'Os campos do modelo não aceitam quebra de linha.'
  if (/ {5,}/.test(v)) return 'Os campos do modelo não aceitam tantos espaços seguidos.'
  if (v.length > 500) return 'Um dos campos passou de 500 caracteres.'
  return null
}

/**
 * Os dois modelos que a Moradi sugere, para a imobiliária não começar do zero.
 * Os nomes têm prefixo `moradi_` para ficarem reconhecíveis na conta da Meta
 * dela, e a tela preenche as variáveis sozinha por eles.
 *
 * Categorias honestas: retomar contato é MARKETING (a Meta reclassifica, e
 * cobra, quem tenta passar por utilidade), responder a um pedido que a pessoa
 * fez no site é UTILITY.
 */
export const MODELOS_SUGERIDOS = [
  {
    name: 'moradi_primeiro_contato',
    category: 'UTILITY' as const,
    body: 'Olá, {{1}}! Aqui é da {{2}}. Recebemos o seu pedido de contato pelo nosso site e vamos continuar o atendimento por aqui. Pode responder esta mensagem quando quiser.',
    exemplo: ['Ana', 'Imobiliária Exemplo'],
    descricao: 'Para responder quem preencheu o formulário do site e ainda não falou pelo WhatsApp.',
  },
  {
    name: 'moradi_retomar_conversa',
    category: 'MARKETING' as const,
    body: 'Olá, {{1}}! Aqui é da {{2}}. Você falou com a gente sobre um imóvel há alguns dias. Ainda tem interesse? Se quiser, é só responder esta mensagem.',
    exemplo: ['Ana', 'Imobiliária Exemplo'],
    descricao: 'Para retomar uma conversa parada há mais de 24h.',
  },
]

export const MODELO_IDIOMA = 'pt_BR'
