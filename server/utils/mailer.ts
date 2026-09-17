/**
 * Envio de e-mail transacional.
 *
 * O provedor é trocável de propósito. A entrega começa num plano gratuito e o
 * volume desta feature é pequeno (dezenas por mês), mas quem hoje é grátis pode
 * mudar de política — e trocar de provedor não pode significar reescrever o
 * convite e a recuperação de senha. Só este arquivo conhece o provedor.
 *
 * ⚠️ Por que NÃO deixamos o Supabase enviar:
 * o SMTP customizado do Supabase tem UM remetente global por projeto — um nome
 * de exibição e um e-mail, para todos os tenants. A decisão registrada no plano
 * é que o cliente final veja o nome da IMOBILIÁRIA na caixa de entrada e
 * responda para ela. Isso é impossível num remetente global. Então geramos o
 * link nós mesmos (`generateLink`, que não envia nada) e mandamos por aqui, com
 * o nome e o Reply-To daquele tenant.
 */

export interface Remetente {
  /** Nome de exibição: o nome da imobiliária. */
  nome: string
  /**
   * Endereço do `From`. Vem de `remetenteDoTenant` (server/utils/mail-sender.ts),
   * que já resolve dedicado vs. plataforma — este arquivo não conhece a tabela.
   */
  endereco: string
  /** Para onde vai a resposta do cliente: o e-mail real da imobiliária. */
  replyTo: string | null
}

export interface Mensagem {
  para: string
  assunto: string
  html: string
  texto: string
  remetente: Remetente
}

/** Caracteres de controle e quebra de linha — o vetor de injeção de cabeçalho. */
const CONTROLE = new RegExp('[\\r\\n\\u0000-\\u001f\\u007f]', 'g')
/** Caracteres que quebram a sintaxe de `Nome <endereco>`. */
const SINTAXE = new RegExp('["<>;,\\\\]', 'g')

/**
 * Nome de exibição seguro para o cabeçalho `From`.
 *
 * `tenant.name` é digitado no painel pela imobiliária. Sem limpeza, um nome com
 * aspas, `<`, `>` ou quebra de linha quebra o cabeçalho — e quebra de linha em
 * cabeçalho de e-mail é injeção: permite acrescentar um `Bcc:` e transformar o
 * convite num disparo para terceiros.
 */
export function nomeExibicaoSeguro(nome: string): string {
  return nome
    .replace(CONTROLE, ' ')
    .replace(SINTAXE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78)
}

/** Monta o `From` no formato `Nome <endereco>`. */
export function montarFrom(nome: string, endereco: string): string {
  const limpo = nomeExibicaoSeguro(nome)
  return limpo ? `${limpo} <${endereco}>` : endereco
}

/** E-mail válido o bastante para ser usado como Reply-To. */
export function replyToValido(v: string | null): string | undefined {
  if (!v) return undefined
  const limpo = v.trim()
  return /^[^@\s<>",]+@[^@\s<>",]+\.[^@\s<>",]+$/.test(limpo) ? limpo : undefined
}

/**
 * Endereço utilizável no cabeçalho `From`, ou o fallback.
 *
 * `montarFrom` limpa o NOME contra injeção de cabeçalho. O endereço nunca
 * precisou do mesmo cuidado porque era constante de configuração; desde que ele
 * passou a vir de `tenant_mail_sender`, é dado de linha — e uma quebra de linha
 * num `From` acrescenta um `Bcc:` e transforma o convite num disparo para
 * terceiros.
 *
 * Recusa em vez de limpar: um endereço "consertado" enviaria de um lugar que
 * ninguém escolheu. Cair no fallback manda do domínio da plataforma, que é
 * sempre um destino legítimo.
 */
const ENDERECO = /^[^@\s<>",;\\]+@[^@\s<>",;\\]+\.[^@\s<>",;\\]+$/

export function enderecoDeEnvio(
  endereco: string | null | undefined,
  fallback: string,
): string {
  const limpo = (endereco || '').trim()
  return ENDERECO.test(limpo) ? limpo : fallback
}

export type ResultadoEnvio = { enviado: boolean; provedor: string }

/**
 * Envia a mensagem pelo provedor configurado.
 *
 * Sem chave configurada o comportamento depende do ambiente, e a diferença é
 * deliberada:
 *   - fora de produção, registra a mensagem no log (inclusive o link), para que
 *     dê para desenvolver o fluxo inteiro sem conta em provedor nenhum;
 *   - em produção, ERRA. Convite que não sai precisa falhar alto: silêncio aqui
 *     vira "o cliente diz que não recebeu" e ninguém sabe por quê.
 *
 * ⚠️ O log de desenvolvimento imprime um link que É uma credencial. Por isso
 * ele nunca acontece em produção.
 */
export async function enviarEmail(msg: Mensagem): Promise<ResultadoEnvio> {
  const config = useRuntimeConfig()
  const chave = config.mailApiKey
  // O endereço do tenant, com o da plataforma como fallback. Quem resolve qual
  // é qual é `remetenteDoTenant`; aqui só se valida o que chegou, porque é este
  // arquivo que monta o cabeçalho.
  const remetenteEndereco = enderecoDeEnvio(msg.remetente.endereco, config.mailFrom)

  if (!chave || !remetenteEndereco) {
    if (process.env.NODE_ENV === 'production') {
      logError('mail.nao_configurado', {
        temChave: !!chave,
        temRemetente: !!remetenteEndereco,
        assunto: msg.assunto,
      })
      throw createError({
        statusCode: 500,
        statusMessage: 'Envio de e-mail não configurado.',
      })
    }
    logWarn('mail.simulado', {
      // Sem o endereço: `log.ts` proíbe PII, e esta regra foi seguida em todo o
      // resto desta feature. O destinatário não ajuda a depurar — o corpo, que
      // carrega o link, é o que se quer ver em dev.
      assunto: msg.assunto,
      // Em dev o link é o que se quer ver; em produção este caminho não roda.
      corpo: msg.texto,
    })
    return { enviado: false, provedor: 'log' }
  }

  const from = montarFrom(msg.remetente.nome, remetenteEndereco)
  const replyTo = replyToValido(msg.remetente.replyTo)

  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: {
        from,
        to: [msg.para],
        subject: msg.assunto,
        html: msg.html,
        text: msg.texto,
        ...(replyTo ? { reply_to: replyTo } : {}),
      },
    })
    return { enviado: true, provedor: 'resend' }
  } catch (e) {
    // Falha de envio vira log SEM o corpo: o corpo carrega o link de definir
    // senha, e log é lido por mais gente que o e-mail.
    logError('mail.falhou', {
      assunto: msg.assunto,
      reason: errMessage(e),
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Não foi possível enviar o e-mail. Tente novamente em instantes.',
    })
  }
}
