import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },

  modules: ['@nuxtjs/supabase', '@vueuse/nuxt', '@vercel/analytics', '@vercel/speed-insights'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    // Sobrescrito por NUXT_DEFAULT_TENANT (fallback de tenant em dev).
    defaultTenant: '',
    // Domínio-base da plataforma p/ resolução por subdomínio (slug.<platform>).
    // Sobrescrito por NUXT_PLATFORM_DOMAIN. Ex.: "suaplataforma.com.br".
    platformDomain: '',
    public: {
      // Sobrescrito por NUXT_PUBLIC_SITE_URL.
      siteUrl: 'http://localhost:3000',
    },
  },

  // Auth do painel: sem redirect global — protegemos apenas /admin/** via middleware próprio.
  supabase: {
    redirect: false,
  },

  nitro: {
    preset: 'vercel',
    routeRules: {
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
