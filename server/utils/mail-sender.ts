import type { Tenant } from '~~/shared/models/tenant'

/**
 * De qual endereço sai o e-mail desta imobiliária.
 *
 * Fonte única, no molde do `entitlement.ts`. Existe para não haver duas
 * leituras de `tenant_mail_sender` com tratamentos de erro diferentes — e para
 * que o caminho de envio não precise saber que existe uma tabela.
 *
 * ⚠️ **Falha para o lado ABERTO, ao contrário do `entitlement.ts`, e a diferença
 * é deliberada.** Lá o recurso pago erra para "não oferecer", porque a
 * alternativa é entregar algo que não foi comprado. Aqui, falhar fechado seria
 * não enviar o convite: um e-mail saindo do domínio da plataforma é pior que o
 * dedicado e infinitamente melhor que e-mail nenhum.
 *
 * Recebe o `Tenant` e não o id: o aviso de Reply-To abaixo depende do
 * `tenant.email`, e uma assinatura por id obrigaria a segunda consulta ou
 * jogaria o aviso para o chamador, onde se repetiria nos dois caminhos de envio.
 *
 * Service role porque `tenant_mail_sender` não tem policy de escrita e é lida
 * fora de qualquer sessão de usuário (a recuperação de senha é pública).
 */
export async function remetenteDoTenant(tenant: Tenant): Promise<string> {
  const plataforma = segredoDeRuntime(useRuntimeConfig().mailFrom, 'MAIL_FROM')

  try {
    const { data, error } = await serviceSupabase()
      .from('tenant_mail_sender')
      .select('from_address')
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (error) {
      logError('remetente.leitura_falhou', { tenant: tenant.slug, reason: error.message })
      return plataforma
    }

    const dedicado = (data?.from_address || '').trim()
    if (!dedicado) return plataforma

    // ⚠️ O apex do domínio dedicado costuma não ter MX — só o subdomínio de
    // bounce do provedor tem. Enquanto o From era `@usemoradi.com.br` ninguém
    // respondia para lá; com ele parecendo da imobiliária, responder fica
    // natural, e o rodapé do convite manda responder. Sem `tenant.email` não vai
    // `Reply-To` e a resposta bounce sem deixar rastro.
    //
    // Não bloqueia o envio: transforma um bounce silencioso em linha de log.
    if (!tenant.email) {
      logWarn('remetente.dedicado_sem_reply_to', { tenant: tenant.slug })
    }

    return dedicado
  } catch (e) {
    // `serviceSupabase()` lança quando a chave não está configurada. Sem este
    // catch, uma variável de ambiente ausente derrubaria o convite inteiro em
    // vez de mandá-lo pelo domínio da plataforma.
    logError('remetente.leitura_falhou', { tenant: tenant.slug, reason: errMessage(e) })
    return plataforma
  }
}
