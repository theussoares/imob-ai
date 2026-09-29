import type { LeadType } from './lead'

/**
 * Lead que o Canal Pro (Grupo OLX: ZAP, Viva Real, OLX) manda por webhook.
 * Formato: developers.grupozap.com/webhooks/integration_leads.html.
 */

/** Por onde a pessoa chamou no portal (`extraData.leadType`). */
export const CANAIS_DO_PORTAL: Record<string, string> = {
  CONTACT_FORM: 'formulário',
  CONTACT_CHAT: 'chat',
  PHONE_VIEW: 'viu o telefone',
  CLICK_WHATSAPP: 'clicou no WhatsApp',
  CLICK_SCHEDULE: 'pediu agendamento',
  VISIT_REQUEST: 'pediu visita',
}

export interface LeadDoPortal {
  /** Id do lead no portal — a chave contra reenvio. */
  originLeadId: string
  nome: string
  /** Formato do formulário do site: DDD + número, sem DDI, 10 ou 11 dígitos. */
  telefone: string
  mensagem: string | null
  /** O código do imóvel que o nosso feed mandou como `ListingID`. */
  codigoDoImovel: string | null
  tipo: LeadType
  /** Frase para o histórico: "Chegou pelo portal (ZAP, Viva Real ou OLX) · formulário · interesse alto". */
  resumo: string
  minhaCasaMinhaVida: boolean
}

const TEMPERATURAS: Record<string, string> = { Baixa: 'baixo', Média: 'médio', Media: 'médio', Alta: 'alto' }

/**
 * Lê o corpo do webhook. Devolve o lead ou a frase do erro — o webhook
 * responde 4xx com ela, e o Canal Pro mostra falha na integração em vez de
 * dar o lead como entregue.
 *
 * Só o que o funil usa sai daqui. E-mail, dados do Minha Casa Minha Vida
 * (CPF, renda, FGTS) e o link da conversa com o robô do portal ficam de
 * fora: o formulário do site não coleta nada disso, e guardar dado que
 * ninguém vai usar é o que a LGPD manda não fazer.
 */
export function lerLeadDoPortal(corpo: unknown): LeadDoPortal | string {
  const b = (corpo ?? {}) as Record<string, unknown>
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  const originLeadId = texto(b.originLeadId, 200)
  if (!originLeadId) return 'originLeadId ausente'

  const mcmv = b.leadOrigin === 'MCMV_OLX'
  const codigo = texto(b.clientListingId, 60) || null
  // A spec manda recusar com 4xx o lead de anúncio sem o código do anúncio;
  // o do Minha Casa Minha Vida não tem anúncio e não pode falhar por isso.
  if (!mcmv && !codigo) return 'clientListingId ausente'

  const digitos = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '')
  let telefone = digitos(b.ddd) + digitos(b.phone)
  if (!telefone) telefone = digitos(b.phoneNumber)
  if (telefone.startsWith('55') && (telefone.length === 12 || telefone.length === 13)) telefone = telefone.slice(2)
  if (telefone.length !== 10 && telefone.length !== 11) return 'telefone inválido'

  const nome = texto(b.name, 120) || 'Contato do portal'
  const mensagem = texto(b.message, 2000) || null

  const tipo: LeadType = b.transactionType === 'RENT' ? 'busca_aluguel' : b.transactionType === 'SELL' ? 'busca_compra' : 'indefinido'

  const extra = (b.extraData ?? {}) as Record<string, unknown>
  const canal = typeof extra.leadType === 'string' ? CANAIS_DO_PORTAL[extra.leadType] : undefined
  const temperatura = typeof b.temperature === 'string' ? TEMPERATURAS[b.temperature] : undefined
  const resumo = [
    mcmv ? 'Chegou pelo portal (Minha Casa Minha Vida)' : 'Chegou pelo portal (ZAP, Viva Real ou OLX)',
    canal,
    temperatura ? `interesse ${temperatura}` : null,
    extra.leadCerto === true ? 'indicado por anúncio parecido' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return { originLeadId, nome, telefone, mensagem, codigoDoImovel: codigo, tipo, resumo, minhaCasaMinhaVida: mcmv }
}

/**
 * Tetos do webhook de leads. O Canal Pro não autentica a chamada, então quem
 * tiver a URL cria lead — e, com o automático ligado, dispara WhatsApp pago
 * pelo número da imobiliária. Acima do teto o webhook responde 429: o Canal
 * Pro reenvia depois (e guarda o lead por 14 dias), então o lead legítimo de
 * um pico não se perde.
 *
 * Os números são folgados para o porte-alvo (2 a 15 corretores): nenhuma
 * dessas imobiliárias recebe 60 leads de portal numa hora.
 */
export const PORTAL_LEADS_POR_HORA = 60
export const PORTAL_WHATSAPP_AUTOMATICO_POR_DIA = 100

/**
 * O nome para "Olá, {{1}}!" — ou "cliente". O nome vem do corpo do webhook,
 * e o modelo sai pelo número VERIFICADO da imobiliária: um "nome" que fosse
 * um link viraria phishing com a cara dela. Só letras (com acento), hífen e
 * apóstrofo passam, e só a primeira palavra.
 */
export function nomeParaSaudacao(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  return /^[\p{L}][\p{L}'’-]{0,29}$/u.test(primeiro) ? primeiro : 'cliente'
}
