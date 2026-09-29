/**
 * A porta entre o sistema e quem entrega a mensagem de WhatsApp.
 *
 * Mesmo desenho de `server/services/payments/provider.ts`: nossa, pequena, e o
 * único formato em que um webhook entra no sistema. O nome de campo da Meta
 * (`message_echoes`, `statuses[].recipient_id`…) nunca sai do adaptador. É o
 * que deixa a 360dialog entrar como ponte, se o app review da Meta atrasar,
 * sem tocar em tabela nem em tela (spec 29/09, seção 5).
 */

import type { WhatsappMessageStatus } from '~~/shared/models/whatsapp'

/** Mensagem que o CONTATO mandou para o número da imobiliária. */
export interface MensagemRecebida {
  wamid: string
  /** wa_id do contato. */
  de: string
  nomeDoPerfil: string | null
  tipo: string
  texto: string | null
  /** ISO. */
  quando: string
}

/**
 * Mensagem que a imobiliária mandou PELO APP do celular, no modo Coexistence.
 * A Meta avisa por eco (`smb_message_echoes`); sem contar o eco, quem responde
 * pelo celular — o normal — apareceria como "sem resposta" para sempre.
 */
export interface MensagemEcoada {
  wamid: string
  /** wa_id do contato. */
  para: string
  tipo: string
  texto: string | null
  quando: string
}

export interface MudancaDeStatus {
  wamid: string
  status: WhatsappMessageStatus
  erro: string | null
}

/** Tudo o que um webhook trouxe para UM número conectado. */
export interface LoteDoWebhook {
  phoneNumberId: string
  recebidas: MensagemRecebida[]
  ecos: MensagemEcoada[]
  status: MudancaDeStatus[]
}

export interface NumeroConferido {
  displayPhone: string | null
  verifiedName: string | null
}

export class ErroDoWhatsapp extends Error {
  constructor(
    message: string,
    /** 401/403, ou o erro 190 da Meta = token errado, expirado ou revogado. */
    readonly credencialInvalida = false,
    /** 131047: fora da janela de 24h. A tela explica em vez de mostrar código. */
    readonly foraDaJanela = false,
  ) {
    super(message)
  }
}

export interface Conexao {
  phoneNumberId: string
  wabaId: string
  accessToken: string
}

export interface WhatsappProvider {
  /** Confere o token contra o número — antes de gravar, não na primeira mensagem. */
  conferirNumero(c: Conexao): Promise<NumeroConferido>
  /** Assina o nosso app na WABA; sem isso a Meta não manda webhook nenhum. */
  assinarWebhook(c: Conexao): Promise<void>
  enviarTexto(c: Conexao, para: string, texto: string): Promise<{ wamid: string }>
}
