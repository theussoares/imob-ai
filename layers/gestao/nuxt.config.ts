import { fileURLToPath } from 'node:url'

/**
 * Layer `gestao`: painel de contratos (venda hoje, locação depois).
 * Spec: docs/superpowers/specs/2026-11-15-painel-gestao-design.md
 */
// O mocker-nuxt só entra quando o mock é pedido (script `dev:gestao`). Registrado sempre,
// ele empacota no build de produção um import com o caminho ABSOLUTO de
// `mocks/gestao.mock.ts` da máquina de build: na Vercel o arquivo não existe, a função
// cai com ERR_MODULE_NOT_FOUND e o site inteiro (não só /gestao) responde 500. Foi o que
// derrubou a develop no primeiro deploy do painel. Sem o módulo, o store cai no seed local.
const comMocks = process.env.NUXT_MOCKER_SERVER_ENABLED === 'true'

const mockerServer = {
  // Só `/api/gestao`. Com `/api` inteiro o gateway interceptaria também
  // /api/admin, /api/leads e o resto do app real, que não têm mock.
  basePath: '/api/gestao',
  directory: fileURLToPath(new URL('./mocks', import.meta.url)),
  // `error` (e não `proxy`): não há API real para repassar; mock faltando tem
  // que aparecer como 404 no teste, não como um proxy para lugar nenhum.
  fallback: 'error',
  // Nunca em produção pública (README do módulo): produção só liga com
  // `allowProduction`, que este layer não liga.
  allowProduction: false,
}

export default defineNuxtConfig({
  modules: comMocks ? ['mocker-nuxt'] : [],

  // Chave do mocker-nuxt, só existe (e só é tipada) com o módulo registrado.
  ...(comMocks ? ({ mockerServer } as Record<string, unknown>) : {}),

  runtimeConfig: {
    // NUXT_MOCKER_SERVER_ENABLED=true liga os mocks (script `dev:gestao`). O README
    // do módulo diz NUXT_MOCK_SERVER_ENABLED, mas o runtimeConfig é `mockerServer`:
    // com o nome do README a variável é ignorada e o gateway só devolve 502.
    mockerServer: { enabled: false, target: '' },
    public: {
      // Gate do MVP. Vira `tenant_features` depois do demo (spec, "Fora do escopo").
      gestaoEnabled: false,
      // Modo demonstração: liga o «Acesso rápido» (pula senha e 2º fator), as contas de
      // exemplo e a faixa com o código do 2º fator. NUNCA ligar fora do demo.
      // env NUXT_PUBLIC_GESTAO_DEMO.
      gestaoDemo: false,
    },
  },

  routeRules: {
    // Sessão do demo vive no localStorage: não há o que renderizar no servidor.
    '/gestao': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    '/gestao/**': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  },
})
