import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },

  modules: ['@vueuse/nuxt', '@vercel/analytics', '@vercel/speed-insights'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
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
    public: {
      // Sobrescrito por NUXT_PUBLIC_SITE_URL.
      siteUrl: 'http://localhost:3000',
      // Anon key + URL (públicas) — usadas só pelo painel /admin, sob demanda.
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      // Crédito do desenvolvedor no rodapé (fixo em todos os tenants).
      builtByName: process.env.NUXT_PUBLIC_BUILT_BY_NAME || 'Matheus Soares',
      builtByWhatsapp: process.env.NUXT_PUBLIC_BUILT_BY_WHATSAPP || '5567992171768',
      // Link da demonstração (usado na landing da Moradi).
      demoUrl: process.env.NUXT_PUBLIC_DEMO_URL || 'https://demo.usemoradi.com.br',
    },
  },

  nitro: {
    preset: 'vercel',
    routeRules: {
      // Painel é SPA (sem SSR) — mantém o bundle do Supabase fora das páginas públicas.
      '/admin/**': { ssr: false },
      // Cabeçalhos de segurança (Best Practices): anti-clickjacking + isolamento de origem.
      '/**': {
        headers: {
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
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
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        // Fonts fora do caminho crítico: preload + troca de media no onload (não bloqueia render).
        {
          rel: 'preload',
          as: 'style',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap',
          media: 'print',
          onload: "this.media='all'",
        },
      ],
      noscript: [
        {
          innerHTML:
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap">',
        },
      ],
    },
  },
})
