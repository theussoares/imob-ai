import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },

  // @vercel/analytics e @vercel/speed-insights saíram daqui: os módulos não aceitam
  // `beforeSend`, e sem ele o painel e a Área do Cliente (com id de contrato na
  // URL) iam para a Vercel. Quem injeta é app/plugins/observabilidade.client.ts.
  modules: ['@vueuse/nuxt', '@nuxt/icon', '@nuxt/fonts', '@vite-pwa/nuxt'],

  /**
   * PWA do painel. Ver docs/superpowers/specs/2026-09-09-pwa-painel-design.md.
   */
  pwa: {
    // `prompt` e não `autoUpdate`: recarregar sozinho no meio de um cadastro
    // perde o formulário preenchido.
    registerType: 'prompt',
    /**
     * O manifest NÃO é gerado aqui: quem serve é
     * `server/routes/manifest.webmanifest.get.ts`, que o monta por host com o
     * nome e a cor de cada cliente. Um arquivo estático não daria conta —
     * `start_url` precisa ser relativo à origem, e cada cliente tem a sua.
     *
     * `false` também evita que o módulo injete o `<link rel="manifest">` em
     * TODA página, inclusive nos sites públicos; quem injeta, só no host do
     * painel, é `server/plugins/pwa-head.ts`.
     */
    manifest: false,
    /**
     * O módulo registra o service worker num plugin Nuxt, que roda em TODA
     * página — inclusive nos sites públicos dos clientes. Lá um SW controlando
     * a origem serviria conteúdo de cache para visitantes e para o Googlebot, o
     * que é prejuízo do cliente, não nosso.
     *
     * Desligado aqui, quem registra é `app/plugins/pwa.client.ts`, só quando o
     * host é de painel.
     */
    client: { registerPlugin: false },
    workbox: {
      // Sem isto o precache sai com 3 entradas (dois JSON de metadata e o
      // manifest) e NENHUM dos 89 arquivos de `_nuxt/` — o shell inteiro fica
      // de fora e o service worker não acelera nada. O default do módulo não
      // cobre js/css; foi preciso medir o build para descobrir.
      // São 992 kB no total: cabe como download único de um app instalado.
      globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
      /**
       * Nenhuma resposta de API entra em cache, em nenhuma estratégia.
       *
       * O painel é dado autenticado e multi-tenant: uma resposta guardada volta
       * para outra sessão ou mostra um lead que já mudou de etapa. E `/api/`
       * ficaria coberto por qualquer regra de navegação que se adicione depois,
       * então o denylist é explícito em vez de implícito.
       */
      navigateFallbackDenylist: [/^\/api\//],
      // Sem runtimeCaching: o Supabase (dados e Storage) é sempre rede. O
      // ganho do SW aqui é o shell, que é imutável por hash — dado de CRM não.
      runtimeCaching: [],
      /**
       * `prompt` só vale se o SW novo esperar: com skipWaiting ele assume na
       * hora e a pessoa recebe código novo numa aba que ainda roda o antigo.
       * Quem decide a troca é o aviso na tela.
       */
      skipWaiting: false,
      clientsClaim: false,
      // Limpa precache de versões antigas — sem isso o Cache Storage cresce a
      // cada deploy.
      cleanupOutdatedCaches: true,
    },
  },

  css: ['~/assets/css/main.css'],

  fonts: {
    /**
     * Só latino e só normal. O padrão do módulo gera @font-face para cirílico,
     * grego, vietnamita e latin-ext, em normal E itálico, para cada peso: eram
     * 149 regras e 54 KB de CSS inline no HTML da home da Olmi (24/09), antes
     * de qualquer byte de conteúdo — atrás delas ficava o preload do hero.
     *
     * Português cabe inteiro no subconjunto `latin` (acentos, ç, ã, travessão).
     * Um caractere fora dele (nome com ő, por exemplo) cai na fonte de sistema
     * só naquele glifo — não some.
     *
     * Itálico: o CSS usa em dois lugares (nota "sem características" do card e
     * uma citação do Quem somos) e o <em> da landing. Sem o arquivo, o
     * navegador sintetiza a inclinação; para uma linha de nota, a diferença não
     * paga as 60 regras que o itálico real custava.
     */
    defaults: {
      styles: ['normal'],
      subsets: ['latin'],
    },
    // Self-hosta os .woff2 (corta 2 hops pro Google) e gera @font-face com
    // size-adjust/ascent-override calculados — sem isso o layout salta na troca
    // da fonte fallback pela real, porque os max-width em `ch` mudam de largura.
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Space Grotesk', provider: 'google', weights: [400, 500, 600, 700] },
      // Temas da vitrine (ver a spec 2026-09-25-temas-da-vitrine): Playfair no
      // "Alto padrão", Nunito no "Acolhedor". O "Moderno" usa a Figtree da
      // landing, já declarada abaixo. Três pesos cada, só latino e normal: o
      // custo é o texto das regras @font-face no entry.css que TODO cliente
      // baixa (fora do HTML, conferido em 25/09), e o teto medido na spec é
      // de +4 KB.
      { name: 'Playfair Display', provider: 'google', weights: [400, 600, 700] },
      { name: 'Nunito', provider: 'google', weights: [400, 600, 700] },
      // As três abaixo são da landing da raiz (MoradiLanding); a Figtree também
      // do "Moderno". O @nuxt/fonts só baixa a face que algum CSS usa, e a põe
      // no CSS de quem usa, então o site dos clientes não paga a landing —
      // `pnpm test:css-inline` confere isso no build (medir à mão engana: no
      // .env de dev, `localhost` É a raiz; ver o topo de scripts/css-inline.mjs).
      { name: 'Schibsted Grotesk', provider: 'google', weights: [600, 700, 800] },
      { name: 'Figtree', provider: 'google', weights: [400, 500, 600, 700] },
      // Só itálico: é o único estilo que a landing usa desta família, uma
      // palavra por título. Sem declarar, o default `normal` acima baixaria a
      // face errada e o navegador sintetizaria a inclinação.
      { name: 'Instrument Serif', provider: 'google', weights: [400], styles: ['italic'] },
    ],
  },

  icon: {
    // Coleção "tabler" bundlada localmente (só os ícones usados no app).
    // Sem @iconify-json/tabler nem chamada em runtime pra API do Iconify.
    customCollections: [{ prefix: 'tabler', dir: './app/assets/icons/tabler' }],
    // mode 'svg' (o default do módulo é 'css', que renderiza <span> com
    // mask-image): o CSS do projeto dimensiona e colore os ícones por seletores
    // `... svg`, que ficariam mortos — ícones sairiam a 1em e sem var(--brand).
    mode: 'svg',
    // provider: 'server' já embute os ícones no SSR, mas o client (hidratação)
    // só puxa custom collections pro bundle se pedirmos explicitamente.
    clientBundle: { includeCustomCollections: true },
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      // O app resolve o tenant POR HOST. Sem isto o dev server responde 403 a
      // qualquer Host diferente de localhost, impossibilitando testar domínio de
      // cliente, painel.<dominio> e subdomínios sem subir pra produção.
      // Vale só em desenvolvimento — `server` do Vite não existe no build.
      allowedHosts: true,
    },
  },

  runtimeConfig: {
    // Sobrescrito por NUXT_DEFAULT_TENANT (fallback de tenant em dev).
    defaultTenant: '',
    // Domínio-base da plataforma: raiz = landing da Moradi; slug.<platform> = tenant.
    // Sobrescrito por NUXT_PLATFORM_DOMAIN (para white-label em outro domínio).
    platformDomain: process.env.NUXT_PLATFORM_DOMAIN || 'usemoradi.com.br',
    // Atalho ?tenant=slug: habilitado fora de produção (dev + previews da Vercel),
    // para testar tenants sem subdomínio. Nunca em produção.
    allowTenantSwitch: process.env.VERCEL_ENV !== 'production',
    // service_role do Supabase: ignora RLS, usada só nas escritas públicas feitas
    // pelo servidor (ver serviceSupabase). Fica FORA de `public` de propósito —
    // em `public` ela seria embutida no bundle do navegador.
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    // Sal opcional para o hash de IP usado no anti-flood do formulário público.
    rateLimitIpSalt: process.env.RATE_LIMIT_IP_SALT || '',
    // Segredo que a Vercel manda no cron (`Authorization: Bearer`). A própria
    // Vercel usa o nome CRON_SECRET; leia por `segredoDeRuntime`, como os demais.
    cronSecret: process.env.CRON_SECRET || '',
    // Envio transacional (convite e recuperação de senha do portal). FORA de
    // `public`: chave de API no bundle do navegador é chave vazada.
    // Sem as duas, o servidor não envia — em dev registra no log, em produção
    // erra alto. Ver `server/utils/mailer.ts`.
    // ⚠️ Este arquivo roda no BUILD: o valor abaixo é assado no bundle, não
    // lido em produção. Em execução o Nitro só sobrescreve `runtimeConfig` com
    // variável prefixada por `NUXT_` (aqui, `NUXT_MAIL_API_KEY`).
    //
    // Custou uma tarde de depuração em 17/09: a variável aparecia configurada
    // na Vercel e o convite não saía, sem log nenhum.
    //
    // NÃO leia esta chave direto do config no servidor. Use
    // `segredoDeRuntime(config.mailApiKey, 'MAIL_API_KEY')`, que aceita também
    // o nome sem prefixo lido em execução — há um teste que cobra isso
    // (`test/server/segredos-em-runtime.test.ts`).
    mailApiKey: process.env.MAIL_API_KEY || '',
    // Endereço remetente, no domínio VERIFICADO da plataforma.
    // Ex.: nao-responda@usemoradi.com.br
    mailFrom: process.env.MAIL_FROM || '',
    // Chave do provedor de IA (descrição de imóvel). FORA de `public`: chave de
    // API no bundle do navegador é chave vazada.
    //
    // ⚠️ SEM default vindo de `process.env`, e o nome da variável é
    // NUXT_ANTHROPIC_API_KEY — com o prefixo. `mailApiKey` usa MAIL_API_KEY sem
    // prefixo, que o Nuxt lê no BUILD: marcar na Vercel não basta, precisa
    // redeploy, e isso custou uma tarde em 17/09. Com o prefixo, marcar já vale.
    anthropicApiKey: '',
    // Chave-mestra que cifra a chave de API do Asaas de cada imobiliária
    // (AES-256-GCM, `server/utils/cofre.ts`). Qualquer texto com 32+
    // caracteres (`openssl rand -base64 32`). Sem default, como a da IA: o
    // nome é NUXT_PAYMENTS_ENCRYPTION_KEY.
    //
    // ⚠️ Trocar esta chave torna ilegíveis as chaves já gravadas: as
    // imobiliárias precisam reconectar a conta. Guarde-a como se guarda a
    // service_role.
    paymentsEncryptionKey: '',
    // Trocar de modelo é variável de ambiente, não deploy de código.
    aiModel: process.env.NUXT_AI_MODEL || 'claude-haiku-4-5',
    public: {
      // Não existe URL canônica global: cada tenant se auto-canonicaliza no
      // próprio host (ver app.vue). Por isso não há `siteUrl` aqui.
      // Anon key + URL (públicas) — usadas só pelo painel /admin, sob demanda.
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      // Espelho PÚBLICO de `allowTenantSwitch`, só para o middleware de rota
      // preservar `?tenant=` ao navegar. Não concede nada: quem decide o tenant
      // é o servidor, que checa a versão privada.
      allowTenantSwitch: process.env.VERCEL_ENV !== 'production',
      // Crédito do desenvolvedor no rodapé (fixo em todos os tenants).
      builtByName: process.env.NUXT_PUBLIC_BUILT_BY_NAME || 'MA Tech',
      // Sem default: um número inventado aqui mandaria os interessados para o
      // WhatsApp de um desconhecido, e este valor alimenta links reais (crédito
      // no rodapé de todo tenant e os CTAs da landing da Moradi). Vazio, os
      // componentes já degradam sozinhos. DEFINA nos ambientes.
      builtByWhatsapp: process.env.NUXT_PUBLIC_BUILT_BY_WHATSAPP || '',
      // Link da demonstração (usado na landing da Moradi).
      demoUrl: process.env.NUXT_PUBLIC_DEMO_URL || 'https://demo.usemoradi.com.br',
    },
  },

  nitro: {
    preset: 'vercel',
    vercel: {
      /**
       * Funções em São Paulo (`gru1`), onde já está o banco (Supabase
       * sa-east-1). O padrão da Vercel é `iad1`, Washington: cada requisição
       * ia aos EUA e voltava ao Brasil para falar com o banco, e o dado do
       * visitante (IP, formulário) passava pelos EUA antes de ser gravado.
       *
       * O segundo ponto é LGPD, não só latência: o hash de IP do clique no
       * WhatsApp tem base em legítimo interesse, que não está entre as
       * hipóteses de transferência internacional do art. 33, IX — ver Q3 em
       * docs/runbooks/lgpd-site-publico.md. Trocar esta região de volta para
       * fora do Brasil reabre essa lacuna.
       */
      functions: { regions: ['gru1'] },
      config: {
        /**
         * Lembrete de leads parados, 12:00 UTC = 9h em Brasília: chega no
         * começo do expediente, quando dá para ligar. Um por dia porque o plano
         * Hobby da Vercel só aceita cron diário — e mais que isso seria
         * insistência, não lembrete.
         */
        crons: [{ path: '/api/cron/leads-parados', schedule: '0 12 * * *' }],
      },
    },
    routeRules: {
      // Painel é SPA (sem SSR) — mantém o bundle do Supabase fora das páginas públicas.
      // X-Robots-Tag: o Disallow do robots.txt impede o crawl, mas não a indexação
      // da URL (que apareceria "sem descrição" se linkada em algum lugar).
      // '/admin/**' não cobre '/admin' exato, por isso as duas regras.
      '/admin': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      '/admin/**': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      // Cabeçalhos de segurança (Best Practices): anti-clickjacking + isolamento de origem.
      '/**': {
        headers: {
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
          // CSP. O ganho principal aqui é `connect-src`: o painel guarda a sessão
          // do Supabase no localStorage, e restringir para onde a página pode
          // enviar dados impede que um XSS exfiltre esse token para um domínio
          // do atacante.
          //
          // script-src leva 'unsafe-inline' porque o Nuxt emite um script inline
          // e um importmap; travar isso exige nonce por requisição (módulo à
          // parte). Assumido conscientemente — as diretivas abaixo seguem valendo.
          //
          // img-src é permissivo em https: de propósito: o painel deixa cadastrar
          // imagem colando URL de qualquer origem, então restringir a domínios
          // fixos quebraria imóveis já cadastrados.
          'Content-Security-Policy': [
            "default-src 'self'",
            // va.vercel-scripts.com: o @vercel/speed-insights injeta esse script
            // em runtime (não aparece no HTML inicial — só o navegador revela).
            "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
            "style-src 'self' 'unsafe-inline'", // <style id="tenant-theme"> + style= nos cards
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:", // fontes são self-hosted pelo @nuxt/fonts
            // wss:// precisa vir explícito. Pela spec do CSP, um source com
            // esquema `https` casa só com `https` — não com `wss` — então o
            // WebSocket do Realtime (contato novo aparecendo no funil na hora)
            // era bloqueado mesmo com o mesmo domínio já liberado acima.
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            // O mapa do rodapé e a pré-visualização do painel são iframes do
            // Google Maps (shared/utils/address.ts). Sem esta linha, frame-src
            // herda o default-src 'self' e o navegador bloqueia o iframe em
            // silêncio — foi assim de 08/09, quando o mapa entrou, até 24/09:
            // nenhum tenant viu o mapa, e o painel também não, o que escondeu
            // uma coordenada da Olmi digitada sem o sinal de menos.
            // Os dois hosts porque maps.google.com responde 301 para
            // www.google.com/maps/embed, e o CSP confere cada salto.
            "frame-src https://maps.google.com https://www.google.com",
            "frame-ancestors 'self'", // sucessor do X-Frame-Options
            "base-uri 'self'", // bloqueia injeção de <base> pra sequestrar URLs relativas
            "form-action 'self'",
            "object-src 'none'",
          ].join('; '),
        },
      },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0f3d38' },
      ],
      // As fontes são resolvidas pelo @nuxt/fonts (self-hosted + size-adjust),
      // não por <link> pro Google Fonts — ver a chave `fonts` acima.
    },
  },
})
