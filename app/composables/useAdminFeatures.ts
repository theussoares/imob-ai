/**
 * Recursos opcionais ligados para esta imobiliária, do ponto de vista do painel.
 *
 * O menu lateral e o middleware das rotas perguntam a mesma coisa, então a
 * resposta fica em `useState`: duas respostas diferentes na mesma navegação
 * apareceriam como link que some ao clicar.
 *
 * ⚠️ **Falha NÃO vira estado.** Foi o achado da revisão do PR #27. A primeira
 * versão gravava `{ areaCliente: false }` no `catch`, e a guarda de "já
 * carregou" fazia toda tentativa seguinte voltar sem tentar de novo. Uma única
 * falha de rede — 502 da borda, celular trocando de rede, o intervalo em que o
 * token é renovado — escondia o recurso PAGO pelo resto da sessão do SPA: os
 * itens sumiam do menu, `/admin/contratos` devolvia para `/admin` sem
 * mensagem, e nada na tela dizia por quê. Do lado de quem usa, é
 * indistinguível de "perdi o que contratei".
 *
 * Agora o erro não é gravado: o computed continua respondendo `false` (que é o
 * lado seguro enquanto não se sabe), e a próxima navegação tenta de novo.
 */
export function useAdminFeatures() {
  const estado = useState<Recursos | null>('admin:features', () => null)

  async function carregar() {
    if (estado.value) return

    // Uma requisição só para chamadores concorrentes — e, o que importa mais,
    // todos ESPERAM a mesma. Uma flag booleana de "carregando" faria o segundo
    // chamador voltar imediatamente com o estado ainda nulo, e é justo o
    // `await carregar()` do middleware que passaria por aí: ele decidiria o
    // redirect antes de a resposta existir.
    //
    // (O `dedupeInflight` do `adminFetch` colapsa os GETs em um só, mas não
    // resolve isto: quem não chega a chamar o `adminFetch` não espera nada.)
    emVoo ??= buscar().finally(() => {
      emVoo = null
    })
    await emVoo
  }

  async function buscar() {
    try {
      estado.value = await adminFetch<Recursos>('/api/admin/features')
    } catch {
      // Sem barulho na tela e SEM gravar: o menu não oferece o que não deu para
      // confirmar, e a próxima navegação pergunta outra vez.
    }
  }

  return {
    areaCliente: computed(() => estado.value?.areaCliente === true),
    quemSomos: computed(() => estado.value?.quemSomos === true),
    descricaoIa: computed(() => estado.value?.descricaoIa === true),
    crm: computed(() => estado.value?.crm === true),
    cobranca: computed(() => estado.value?.cobranca === true),
    carregar,
    carregado: computed(() => estado.value !== null),
  }
}

/** O que `/api/admin/features` devolve. Um campo por recurso opcional. */
interface Recursos {
  areaCliente: boolean
  quemSomos: boolean
  descricaoIa: boolean
  crm: boolean
  cobranca: boolean
}

/**
 * Promessa em voo, fora do `useState` porque promessa não é estado serializável.
 * Só existe no cliente: o middleware retorna cedo no servidor e o menu chama em
 * `onMounted`, então isto nunca é compartilhado entre requisições de SSR.
 */
let emVoo: Promise<void> | null = null
