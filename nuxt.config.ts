import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },

  modules: ['@vueuse/nuxt', '@vercel/analytics', '@vercel/speed-insights', '@nuxt/icon', '@nuxt/fonts'],

  css: ['~/assets/css/main.css'],

  fonts: {
    // Self-hosta os .woff2 (corta 2 hops pro Google) e gera @font-face com
    // size-adjust/ascent-override calculados — sem isso o layout salta na troca
    // da fonte fallback pela real, porque os max-width em `ch` mudam de largura.
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Space Grotesk', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Montserrat', provider: 'google', weights: [400, 500, 600, 700] },
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
    public: {
      // Não existe URL canônica global: cada tenant se auto-canonicaliza no
      // próprio host (ver app.vue). Por isso não há `siteUrl` aqui.
      // Anon key + URL (públicas) — usadas só pelo painel /admin, sob demanda.
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      // Crédito do desenvolvedor no rodapé (fixo em todos os tenants).
      builtByName: process.env.NUXT_PUBLIC_BUILT_BY_NAME || 'MA Tech',
      builtByWhatsapp: process.env.NUXT_PUBLIC_BUILT_BY_WHATSAPP || '5567992171768',
      // Link da demonstração (usado na landing da Moradi).
      demoUrl: process.env.NUXT_PUBLIC_DEMO_URL || 'https://demo.usemoradi.com.br',
    },
  },

  nitro: {
    preset: 'vercel',
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
            "connect-src 'self' https://*.supabase.co",
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
