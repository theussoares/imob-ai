import { recursoAtivo } from '~~/shared/utils/portal-access'

/**
 * A Área do Cliente está valendo para esta imobiliária?
 *
 * Fonte única do entitlement no servidor. Existe para não haver duas leituras
 * de `tenant_features` com tratamentos de erro diferentes — que foi o achado da
 * revisão do PR #27: `features.get.ts` pegava só `data` do destructuring, e uma
 * leitura que FALHASSE (grant revogado, mudança de schema, conexão) ficava
 * indistinguível de "não há linha". O recurso sumia para toda imobiliária que
 * paga, sem rastro nenhum, e o primeiro sinal seria uma ligação do cliente.
 *
 * Duas regras, e as duas são deliberadas:
 *
 * **Falha fechado.** Recurso pago erra para o lado de não oferecer. Mostrar a
 * tela e deixar a RLS recusar depois é pior: a pessoa cadastra um cliente e
 * descobre no fim que não podia.
 *
 * **Falha ruidosa.** É a convenção que `assertSubmitRateLimit` já estabeleceu
 * neste repositório — "senão a proteção pode estar desligada há semanas sem
 * ninguém ver". Aqui o risco espelha: o recurso pode estar escondido há semanas
 * sem ninguém ver.
 *
 * Service role porque `tenant_features` não tem policy de leitura para
 * `authenticated` nem grant para `anon` — é assim que ela fica fora do alcance
 * de quem não deve mexer no que é cobrado.
 */
export async function areaClienteAtiva(tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await serviceSupabase()
      .from('tenant_features')
      .select('enabled, grace_until')
      .eq('tenant_id', tenantId)
      .eq('feature', 'portal')
      .maybeSingle()

    if (error) {
      logError('entitlement.leitura_falhou', { tenant: tenantId, reason: error.message })
      return false
    }

    // A MESMA função que o portal usa. A régua de carência não pode ter duas
    // implementações que discordam — já errou por um dia neste repositório.
    return recursoAtivo(data ? { enabled: data.enabled, graceUntil: data.grace_until } : null)
  } catch (e) {
    // `serviceSupabase()` lança quando a chave não está configurada. Sem este
    // catch, uma variável de ambiente ausente derrubaria a resolução de tenant
    // — ou seja, o site inteiro — em vez de esconder um item de menu.
    logError('entitlement.leitura_falhou', { tenant: tenantId, reason: errMessage(e) })
    return false
  }
}
