<script setup lang="ts">
import type { Tenant } from '~~/shared/models/tenant'

const props = defineProps<{ tenant: Tenant | null }>()

const hasImage = computed(() => !!props.tenant?.heroImage)
const isBackground = computed(() => hasImage.value && props.tenant?.heroImagePosition === 'background')
const isSplit = computed(() => hasImage.value && !isBackground.value)
const imageOnLeft = computed(() => props.tenant?.heroImagePosition === 'left')
const hasCta = computed(() => !!props.tenant?.heroCtaLabel && !!props.tenant?.heroCtaHref)
const ctaExternal = computed(() => /^https?:\/\//i.test(props.tenant?.heroCtaHref || ''))
const heroTitle = computed(() => props.tenant?.heroTitle || 'Encontre o imóvel certo sem rodeios.')
const imageAlt = computed(() => `Foto institucional${props.tenant?.name ? ' — ' + props.tenant.name : ''}`)
</script>

<template>
  <section class="hero" :class="{ split: isSplit, 'img-left': isSplit && imageOnLeft, 'bg-mode': isBackground }">
    <div v-if="isBackground" class="hero-bg">
      <!-- LCP quase certo no modo fundo: alta prioridade, nunca lazy. -->
      <img :src="tenant!.heroImage!" :alt="imageAlt" fetchpriority="high" decoding="async" />
      <div class="hero-overlay" />
    </div>

    <div class="hero-in">
      <div class="hero-text">
        <span v-if="tenant?.tagline" class="eyebrow"><span class="dot" />{{ tenant.tagline }}</span>
        <h1>{{ heroTitle }}</h1>
        <p v-if="tenant?.heroSubtitle" class="sub">{{ tenant.heroSubtitle }}</p>
        <NuxtLink
          v-if="hasCta"
          class="hero-cta"
          :to="tenant!.heroCtaHref!"
          v-bind="ctaExternal ? { target: '_blank', rel: 'noopener' } : {}"
        >
          {{ tenant!.heroCtaLabel }}
        </NuxtLink>
      </div>
      <div v-if="isSplit" class="hero-media">
        <img :src="tenant!.heroImage!" :alt="imageAlt" fetchpriority="high" decoding="async" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
}
.hero-in {
  max-width: 1140px;
  margin: 0 auto;
  padding: 44px 18px 24px;
  position: relative;
  z-index: 1;
}
.hero h1 {
  font-size: clamp(33px, 6.6vw, 56px);
  color: var(--ink);
  margin: 18px 0 12px;
  max-width: 16ch;
  font-weight: 700;
}
.hero p.sub {
  font-size: 16.5px;
  color: var(--ink-soft);
  max-width: 46ch;
  margin: 0;
}
.hero-cta {
  display: inline-flex;
  align-items: center;
  margin-top: 20px;
  padding: 13px 22px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
  transition: transform 0.15s;
}
.hero-cta:hover {
  transform: translateY(-1px);
}

/* ---------- Split (foto ao lado) ---------- */
.hero.split .hero-in {
  padding-bottom: 40px;
}
.hero.split .hero-media {
  margin-top: 24px;
  aspect-ratio: 4/3;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.hero.split .hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (min-width: 860px) {
  .hero.split .hero-in {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 48px;
    padding-top: 56px;
    padding-bottom: 56px;
  }
  .hero.split.img-left .hero-in {
    direction: rtl;
  }
  .hero.split.img-left .hero-text,
  .hero.split.img-left .hero-media {
    direction: ltr;
  }
  .hero.split .hero-media {
    margin-top: 0;
    aspect-ratio: 4/5;
  }
}

/* ---------- Fundo (foto full-bleed atrás do texto) ---------- */
.hero.bg-mode {
  overflow: hidden;
}
.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.hero-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 12, 16, 0.55), rgba(10, 12, 16, 0.72));
}
.hero.bg-mode .hero-in {
  padding-top: 72px;
  padding-bottom: 72px;
  min-height: 420px;
  display: flex;
  align-items: center;
}
.hero.bg-mode .hero-text {
  max-width: 640px;
}
.hero.bg-mode .eyebrow {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.hero.bg-mode .eyebrow .dot {
  background: #fff;
}
.hero.bg-mode h1 {
  color: #fff;
}
.hero.bg-mode p.sub {
  color: rgba(255, 255, 255, 0.85);
}
</style>
