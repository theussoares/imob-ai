<script setup lang="ts">
const config = useRuntimeConfig()
const builtByName = config.public.builtByName || 'Matheus Soares'
const waDigits = (config.public.builtByWhatsapp || '').replace(/\D/g, '')
const waLink = computed(() => {
  const msg = 'Olá! Quero um site de imóveis pela Moradi. Pode me passar mais informações?'
  return waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}` : '#'
})
const year = new Date().getFullYear()

const features = [
  { t: 'Catálogo com busca', d: 'Imóveis com filtros por tipo, bairro, preço e quartos — rápido e sem recarregar a página.' },
  { t: 'Encontrado no Google e na IA', d: 'SEO técnico pronto: dados estruturados, sitemap, títulos e páginas otimizadas para buscas.' },
  { t: 'WhatsApp integrado', d: 'Cada imóvel com botão de contato direto no WhatsApp, com mensagem já preenchida.' },
  { t: 'Painel próprio', d: 'O corretor cadastra e edita imóveis, sobe fotos e muda cores e textos — sem depender de ninguém.' },
  { t: 'Domínio ou subdomínio', d: 'Seu site no seu domínio (ou em seunome.usemoradi.com.br), com identidade e cores próprias.' },
  { t: 'Rápido e mobile-first', d: 'Feito para carregar rápido no celular, onde a maioria dos clientes procura imóveis.' },
]

const steps = [
  { n: '1', t: 'Fale com a gente', d: 'Você entra em contato e conta sobre o seu trabalho.' },
  { n: '2', t: 'Montamos seu site', d: 'Configuramos o site, as cores, o domínio e publicamos.' },
  { n: '3', t: 'Você gerencia', d: 'Cadastra os imóveis no painel e começa a receber contatos.' },
]

useSeoMeta({
  title: 'Sites de imóveis para corretores e imobiliárias',
  description:
    'A Moradi cria sites de imóveis rápidos, otimizados para o Google e com painel próprio para o corretor. Cada cliente com seu site e domínio.',
  ogTitle: 'Moradi — Sites de imóveis para corretores',
  ogDescription:
    'Sites de imóveis rápidos, encontrados no Google e com painel próprio. Cada corretor com seu site e domínio.',
  ogSiteName: 'Moradi',
  ogType: 'website',
})
</script>

<template>
  <div class="moradi">
    <header class="m-bar">
      <div class="m-bar-in">
        <a class="m-logo" href="/">moradi<span>.</span></a>
        <a class="m-cta-sm" :href="waLink" target="_blank" rel="noopener">Fale conosco</a>
      </div>
    </header>

    <section class="m-hero">
      <div class="m-wrap">
        <span class="m-badge">Plataforma para corretores e imobiliárias</span>
        <h1>Seu site de imóveis, pronto para <em>vender</em>.</h1>
        <p class="m-sub">
          Um catálogo online rápido, otimizado para o Google e com painel próprio.
          Cada corretor com o seu site, o seu domínio e a sua marca.
        </p>
        <div class="m-actions">
          <a class="m-btn" :href="waLink" target="_blank" rel="noopener">Quero meu site</a>
          <a class="m-btn ghost" href="#recursos">Ver recursos</a>
        </div>
      </div>
    </section>

    <section id="recursos" class="m-section">
      <div class="m-wrap">
        <h2>Tudo que um corretor precisa</h2>
        <div class="m-grid">
          <div v-for="f in features" :key="f.t" class="m-card">
            <span class="m-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <h3>{{ f.t }}</h3>
            <p>{{ f.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="m-section alt">
      <div class="m-wrap">
        <h2>Como funciona</h2>
        <div class="m-steps">
          <div v-for="s in steps" :key="s.n" class="m-step">
            <span class="m-num">{{ s.n }}</span>
            <h3>{{ s.t }}</h3>
            <p>{{ s.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="m-band">
      <div class="m-wrap">
        <h2>Quer um site assim para a sua imobiliária?</h2>
        <p>Fale agora no WhatsApp e receba uma proposta.</p>
        <a class="m-btn light" :href="waLink" target="_blank" rel="noopener">Falar no WhatsApp</a>
      </div>
    </section>

    <footer class="m-foot">
      <div class="m-wrap m-foot-in">
        <span class="m-logo sm">moradi<span>.</span></span>
        <span>
          © {{ year }} Moradi · Desenvolvido por
          <a :href="waLink" target="_blank" rel="noopener">{{ builtByName }}</a>
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.moradi {
  --m-ink: #0b1220;
  --m-ink-2: #1b2436;
  --m-soft: #55617a;
  --m-line: #e6e9f0;
  --m-paper: #ffffff;
  --m-surface: #f6f8fc;
  --m-accent: #0f766e;
  --m-accent-2: #0b5a54;
  background: var(--m-paper);
  color: var(--m-ink);
  font-family: 'Inter', system-ui, sans-serif;
}
.m-wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 20px;
}
.m-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--m-line);
}
.m-bar-in {
  max-width: 1080px;
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.m-logo {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.03em;
  color: var(--m-ink);
  text-decoration: none;
}
.m-logo span {
  color: var(--m-accent);
}
.m-logo.sm {
  font-size: 18px;
}
.m-cta-sm {
  background: var(--m-ink);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  padding: 10px 16px;
  border-radius: 10px;
}
.m-hero {
  background: radial-gradient(1200px 400px at 50% -10%, #eafaf6, transparent), var(--m-paper);
  padding: 64px 0 48px;
  text-align: center;
}
.m-badge {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--m-accent-2);
  background: #dff3ef;
  padding: 7px 14px;
  border-radius: 100px;
}
.m-hero h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(34px, 6vw, 58px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin: 18px auto 14px;
  max-width: 16ch;
}
.m-hero h1 em {
  font-style: normal;
  color: var(--m-accent);
}
.m-sub {
  color: var(--m-soft);
  font-size: 17px;
  max-width: 52ch;
  margin: 0 auto;
  line-height: 1.6;
}
.m-actions {
  margin-top: 28px;
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.m-btn {
  background: var(--m-accent);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 15.5px;
  padding: 14px 24px;
  border-radius: 12px;
  transition: background 0.15s, transform 0.15s;
}
.m-btn:hover {
  background: var(--m-accent-2);
  transform: translateY(-1px);
}
.m-btn.ghost {
  background: transparent;
  color: var(--m-ink);
  border: 1.5px solid var(--m-line);
}
.m-btn.ghost:hover {
  background: var(--m-surface);
}
.m-btn.light {
  background: #fff;
  color: var(--m-accent-2);
}
.m-section {
  padding: 56px 0;
}
.m-section.alt {
  background: var(--m-surface);
}
.m-section h2,
.m-band h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(24px, 4vw, 34px);
  letter-spacing: -0.02em;
  text-align: center;
  margin-bottom: 32px;
}
.m-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.m-card {
  background: var(--m-paper);
  border: 1px solid var(--m-line);
  border-radius: 16px;
  padding: 22px;
}
.m-check {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: #dff3ef;
  color: var(--m-accent-2);
  margin-bottom: 13px;
}
.m-check svg {
  width: 22px;
  height: 22px;
}
.m-card h3,
.m-step h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  margin-bottom: 6px;
}
.m-card p,
.m-step p {
  color: var(--m-soft);
  font-size: 14.5px;
  line-height: 1.55;
}
.m-steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}
.m-num {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--m-ink);
  color: #fff;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  margin-bottom: 12px;
}
.m-band {
  background: var(--m-ink);
  color: #fff;
  padding: 60px 0;
  text-align: center;
}
.m-band p {
  color: #aeb8cc;
  margin: 0 0 24px;
  font-size: 16px;
}
.m-foot {
  border-top: 1px solid var(--m-line);
  padding: 26px 0;
  color: var(--m-soft);
  font-size: 14px;
}
.m-foot-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.m-foot a {
  color: var(--m-ink);
  font-weight: 600;
}
@media (min-width: 700px) {
  .m-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .m-steps {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 1000px) {
  .m-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
