import { recursoAtivo } from '~~/shared/utils/portal-access'

/**
 * Recursos opcionais, pela chave gravada em `tenant_features.feature`.
 *
 * Mesmas strings do banco e do registro de páginas do rodapé
 * (`FooterPageFeature`): uma tradução no meio faria quem lê o código procurar
 * uma linha que não existe com aquele nome.
 */
export type RecursoOpcional = 'portal' | 'about'

/**
 * Este recurso está valendo para esta imobiliária?
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
 *
 * ⚠️ É a ÚNICA leitura de `tenant_features` do servidor, e continua tendo que
 * ser: um recurso novo que trouxesse a própria consulta traria junto o próprio
 * tratamento de erro, que foi exatamente o defeito descrito acima.
 */
async function recursoLigado(tenantId: string, feature: RecursoOpcional): Promise<boolean> {
  try {
    const { data, error } = await serviceSupabase()
      .from('tenant_features')
      .select('enabled, grace_until')
      .eq('tenant_id', tenantId)
      .eq('feature', feature)
      .maybeSingle()

    if (error) {
      logError('entitlement.leitura_falhou', { tenant: tenantId, feature, reason: error.message })
      return false
    }

    // A MESMA função que o portal usa. A régua de carência não pode ter duas
    // implementações que discordam — já errou por um dia neste repositório.
    return recursoAtivo(data ? { enabled: data.enabled, graceUntil: data.grace_until } : null)
  } catch (e) {
    // `serviceSupabase()` lança quando a chave não está configurada. Sem este
    // catch, uma variável de ambiente ausente derrubaria a resolução de tenant
    // — ou seja, o site inteiro — em vez de esconder um item de menu.
    logError('entitlement.leitura_falhou', { tenant: tenantId, feature, reason: errMessage(e) })
    return false
  }
}

/** A Área do Cliente está valendo para esta imobiliária? */
export function areaClienteAtiva(tenantId: string): Promise<boolean> {
  return recursoLigado(tenantId, 'portal')
}

/**
 * A página "Quem somos" está valendo para esta imobiliária?
 *
 * Recurso separado do portal e não um "extra" dele: são coisas que uma
 * imobiliária contrata em momentos diferentes, e amarrar as duas na mesma linha
 * faria desligar uma derrubar a outra.
 */
export function quemSomosAtiva(tenantId: string): Promise<boolean> {
  return recursoLigado(tenantId, 'about')
}
