/**
 * A porta entre o sistema e quem entrega a mensagem de WhatsApp.
 *
 * Mesmo desenho de `server/services/payments/provider.ts`: nossa, pequena, e o
 * único formato em que um webhook entra no sistema. O nome de campo da Meta
 * (`message_echoes`, `statuses[].recipient_id`…) nunca sai do adaptador. É o
 * que deixa a 360dialog entrar como ponte, se o app review da Meta atrasar,
 * sem tocar em tabela nem em tela (spec 29/09, seção 5).
 */

import type { WhatsappMessageStatus, WhatsappTemplate, WhatsappTemplateCategory, WhatsappTipoDeEnvio } from '~~/shared/models/whatsapp'

/** Arquivo anexado. Só o id: o arquivo em si é baixado à parte (`baixarMidia`). */
export interface MidiaRecebida {
  id: string
  mime: string | null
  /** Nome que o cliente deu ao documento. Só exibição — nunca vira caminho. */
  nomeDoArquivo: string | null
}

/** Mensagem que o CONTATO mandou para o número da imobiliária. */
export interface MensagemRecebida {
  wamid: string
  /** wa_id do contato. */
  de: string
  nomeDoPerfil: string | null
  tipo: string
  texto: string | null
  midia: MidiaRecebida | null
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
  midia: MidiaRecebida | null
  quando: string
}

export interface MudancaDeStatus {
  wamid: string
  status: WhatsappMessageStatus
  erro: string | null
}

/** Mensagem do histórico do app (Coexistence), de um lado ou do outro. */
export interface MensagemDoHistorico {
  wamid: string
  /** true = o contato mandou; false = a imobiliária, pelo app. */
  doContato: boolean
  tipo: string
  texto: string | null
  midia: MidiaRecebida | null
  quando: string
}

/** Um pedaço do histórico. A Meta manda em vários, com o progresso. */
export interface PedacoDoHistorico {
  /** 0–100, quando a Meta informa. */
  progresso: number | null
  /** A imobiliária desligou o compartilhamento no app do celular. */
  recusado: boolean
  conversas: { waId: string; mensagens: MensagemDoHistorico[] }[]
}

/** Nome de um contato da agenda do app. Só serve para nomear conversa que já existe. */
export interface ContatoDaAgenda {
  waId: string
  nome: string
}

/** Tudo o que um webhook trouxe para UM número conectado. */
export interface LoteDoWebhook {
  phoneNumberId: string
  recebidas: MensagemRecebida[]
  ecos: MensagemEcoada[]
  status: MudancaDeStatus[]
  historico?: PedacoDoHistorico[]
  contatos?: ContatoDaAgenda[]
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

  /** `error_subcode` da Meta, para os poucos casos que mudam o que fazer. */
  subcodigo: number | null = null
}

export interface Conexao {
  phoneNumberId: string
  wabaId: string
  accessToken: string
}

/**
 * Modelo como o servidor o conhece. `nomeado` diz o formato das variáveis
 * (`{{nome}}` ou `{{1}}`): a Meta exige `parameter_name` num e recusa no
 * outro, e a tela não precisa saber disso.
 */
export interface ModeloDaMeta extends WhatsappTemplate {
  nomeado: boolean
}

export interface NovoModelo {
  name: string
  language: string
  category: WhatsappTemplateCategory
  body: string
  /** Um exemplo por variável — a Meta exige para analisar. */
  exemplo: string[]
}

export interface Enviada {
  wamid: string
  /**
   * O wa_id que a Meta resolveu para o destinatário. Pode diferir do número
   * enviado (o nono dígito de celular antigo): é por ele que as respostas vão
   * chegar, então é ele que identifica a conversa.
   */
  waId: string | null
}

export interface WhatsappProvider {
  /** Confere o token contra o número — antes de gravar, não na primeira mensagem. */
  conferirNumero(c: Conexao): Promise<NumeroConferido>
  /** Assina o nosso app na WABA; sem isso a Meta não manda webhook nenhum. */
  assinarWebhook(c: Conexao): Promise<void>
  enviarTexto(c: Conexao, para: string, texto: string): Promise<Enviada>
  listarModelos(c: Conexao): Promise<ModeloDaMeta[]>
  enviarModelo(c: Conexao, para: string, modelo: ModeloDaMeta, valores: string[]): Promise<Enviada>
  /** `'ja_existe'` quando a conta já tem um modelo com esse nome e idioma. */
  criarModelo(c: Conexao, modelo: NovoModelo): Promise<'criado' | 'ja_existe'>
  /**
   * Baixa o arquivo. Lança `MidiaGrandeDemais` ANTES de baixar quando a Meta
   * informa um tamanho acima do teto — baixar 100 MB para jogar fora gastaria
   * o tempo da função inteira.
   */
  baixarMidia(c: Conexao, mediaId: string, maxBytes: number, prazoMs: number): Promise<MidiaBaixada>
  /**
   * Manda um arquivo que JÁ está no nosso bucket, por link: a Meta busca pela
   * URL assinada. Assim o arquivo não passa pela função (que na Vercel aceita
   * no máximo 4,5 MB de corpo).
   */
  enviarMidia(c: Conexao, para: string, midia: MidiaParaEnviar): Promise<Enviada>
  /** Ids dos números desta WABA que o token enxerga. */
  numerosDaWaba(c: Conexao): Promise<string[]>
  /**
   * Registra um número NOVO na Cloud API, com o PIN de verificação em duas
   * etapas. No Coexistence não se registra: o número já está no app.
   */
  registrarNumero(c: Conexao, pin: string): Promise<void>
  /**
   * Pede à Meta a agenda (`smb_app_state_sync`) ou o histórico (`history`)
   * do app, que chegam depois por webhook. Só vale até 24h depois da conexão.
   */
  pedirSincronizacao(c: Conexao, tipo: 'smb_app_state_sync' | 'history'): Promise<void>
}

/** Troca do `code` do Embedded Signup pelo token da integração. Fora da interface: não usa Conexão. */
export interface TrocaDeCodigo {
  appId: string
  appSecret: string
  code: string
}

export interface MidiaParaEnviar {
  tipo: WhatsappTipoDeEnvio
  link: string
  /** Ignorada em áudio: a Meta não aceita legenda nele. */
  legenda: string | null
  /** Só em documento: é o nome que o cliente vê. */
  nomeDoArquivo: string | null
}

export interface MidiaBaixada {
  bytes: Uint8Array
  mime: string
}

export class MidiaGrandeDemais extends Error {}
