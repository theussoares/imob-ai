<script setup lang="ts">
import type { Tenant } from '~~/shared/models/tenant'

const props = defineProps<{
  tenant: Tenant | null
  /** Só o site público: a pré-visualização do painel não tem LCP a ganhar. */
  preload?: boolean
}>()

const hasImage = computed(() => !!props.tenant?.heroImage)
const isBackground = computed(() => hasImage.value && props.tenant?.heroImagePosition === 'background')
const isSplit = computed(() => hasImage.value && !isBackground.value)
const imageOnLeft = computed(() => props.tenant?.heroImagePosition === 'left')
const hasCta = computed(() => !!props.tenant?.heroCtaLabel && !!props.tenant?.heroCtaHref)
const ctaExternal = computed(() => /^https?:\/\//i.test(props.tenant?.heroCtaHref || ''))
const heroTitle = computed(() => props.tenant?.heroTitle || 'Encontre o imóvel certo sem rodeios.')
const imageAlt = computed(() => `Foto institucional${props.tenant?.name ? ' — ' + props.tenant.name : ''}`)

/**
 * O hero é sempre LCP (`fetchpriority="high"`, nunca lazy) mas era servido na
 * derivada `IMAGE_SIZE_LG` (1600px) inteira, mesmo no celular. Mesma ideia das
 * fotos de imóvel: srcset via transformação sob demanda do Supabase em vez da
 * imagem única full-size.
 */
// Fundo full-bleed: cobre a largura toda da viewport. Degrau de 960 no meio
// porque o salto direto de 640 pra 1280 fazia celular com DPR alto (a maioria
// hoje) cair no 1280 mesmo quando ~900-1000px já bastava (achado do PageSpeed
// em produção: 98 KiB entregues contra ~29 KiB necessários). Qualidade um
// pouco mais baixa que a das fotos de imóvel porque o degradê escuro por cima
// (`.hero-overlay`) mascara boa parte da perda.
const heroBgSrcset = computed(() => {
  const url = props.tenant?.heroImage
  if (!url) return undefined
  return [
    `${supabaseRenderImage(url, { width: 640, height: 640, quality: 60 })} 640w`,
    `${supabaseRenderImage(url, { width: 960, height: 960, quality: 60 })} 960w`,
    `${supabaseRenderImage(url, { width: 1280, height: 1280, quality: 60 })} 1280w`,
    `${supabaseRenderImage(url, { width: 1920, height: 1920, quality: 60 })} 1920w`,
  ].join(', ')
})
// Split: coluna de ~546px a partir de 860px; largura da viewport (menos padding) abaixo disso.
const heroSplitSrcset = computed(() => {
  const url = props.tenant?.heroImage
  if (!url) return undefined
  return [
    `${supabaseRenderImage(url, { width: 720, height: 720, quality: 70 })} 720w`,
    `${supabaseRenderImage(url, { width: 1440, height: 1440, quality: 70 })} 1440w`,
  ].join(', ')
})

const BG_SIZES = '100vw'
const SPLIT_SIZES = '(min-width: 860px) 546px, calc(100vw - 36px)'

/**
 * Preload da foto do hero no `<head>`.
 *
 * O PageSpeed no celular (24/09) mostrava o LCP esperando 2,3 s só para
 * COMEÇAR a baixar: o `<img>` fica no byte ~91 mil do HTML, depois de ~80 KB de
 * CSS inline, e o navegador não sabe que a foto existe até o parser chegar lá.
 *
 * ⚠️ O `<link>` no `<head>` NÃO resolve sozinho — medido em produção depois
 * do #55: mesmo com `tagPriority: 'critical'` ele sai no byte ~82 mil, DEPOIS
 * dos `<style>` inline que o Nuxt injeta no build (quase tudo `@font-face` do
 * @nuxt/fonts). O servidor de dev não inline CSS; lá ele aparecia no byte
 * 1,5 mil, e foi isso que enganou a primeira validação.
 *
 * Por isso a via principal é o cabeçalho HTTP `Link`: o navegador o lê antes do
 * primeiro byte do HTML, e a ordem do `<head>` deixa de importar. O `<link>`
 * fica como reserva (proxy que descarte o cabeçalho); o navegador deduplica os
 * dois porque URL, srcset e sizes são iguais.
 *
 * ⚠️ `imagesrcset` e `imagesizes` têm que ser IDÊNTICOS aos do `<img>` —
 * por isso saem dos mesmos `computed`/constantes. Se divergirem, o navegador
 * escolhe candidatos diferentes nas duas pontas e baixa a foto DUAS vezes
 * (e, no Supabase, com duas transformações em vez de uma).
 */
if (import.meta.server && props.preload && hasImage.value) {
  const srcset = isBackground.value ? heroBgSrcset.value : heroSplitSrcset.value
  const event = useRequestEvent()
  if (event && srcset) {
    const sizes = isBackground.value ? BG_SIZES : SPLIT_SIZES
    // Acrescentar, nunca substituir: o servidor já manda outros `Link` (sitemap,
    // llms.txt, api-catalog). `appendResponseHeader` do h3 não é auto-importado
    // no lado do app — só no de servidor —, e o typecheck não pega: o build de
    // produção respondeu 500. O `appendHeader` do próprio response do Node não
    // depende de import nenhum.
    event.node.res.appendHeader(
      'Link',
      `<${props.tenant!.heroImage!}>; rel=preload; as=image; imagesrcset="${srcset}"; imagesizes="${sizes}"; fetchpriority=high`,
    )
  }
}

useHead(() => {
  if (!props.preload || !hasImage.value) return {}
  return {
    link: [
      {
        key: 'hero-preload',
        rel: 'preload',
        as: 'image',
        href: props.tenant!.heroImage!,
        imagesrcset: isBackground.value ? heroBgSrcset.value : heroSplitSrcset.value,
        imagesizes: isBackground.value ? BG_SIZES : SPLIT_SIZES,
        fetchpriority: 'high',
        tagPriority: 'critical',
      },
    ],
  }
})
</script>

<template>
  <section class="hero" :class="{ split: isSplit, 'img-left': isSplit && imageOnLeft, 'bg-mode': isBackground }">
    <div v-if="isBackground" class="hero-bg">
      <!-- LCP quase certo no modo fundo: alta prioridade, nunca lazy. -->
      <img
        :src="tenant!.heroImage!"
        :srcset="heroBgSrcset"
        :sizes="BG_SIZES"
        :alt="imageAlt"
        fetchpriority="high"
        decoding="async"
      />
      <div class="hero-overlay" />
    </div>

    <div class="hero-in">
      <div class="hero-text">
        <!-- Sem o selo com o slogan: ele repetia, palavra por palavra, o slogan
             que o cabeçalho mostra logo acima — duas vezes na mesma tela. -->
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
        <img
          :src="tenant!.heroImage!"
          :srcset="heroSplitSrcset"
          :sizes="SPLIT_SIZES"
          :alt="imageAlt"
          fetchpriority="high"
          decoding="async"
        />
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
  margin: 0 0 12px;
  max-width: 16ch;
  font-weight: 700;
}
.hero p.sub {
  font-size: var(--fs-body);
  color: var(--ink-soft);
  max-width: 46ch;
  margin: 0;
}
.hero-cta {
  display: inline-flex;
  align-items: center;
  margin-top: 20px;
  padding: 13px 22px;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  font-size: var(--fs-body);
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
  border-radius: var(--r-lg);
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
.hero.bg-mode h1 {
  color: #fff;
}
.hero.bg-mode p.sub {
  color: rgba(255, 255, 255, 0.85);
}

/*
 * Celular: o hero em texto mais a busca ocupavam a primeira tela inteira, e o
 * primeiro imóvel só aparecia depois de ~1000px de rolagem. Num site de
 * imóveis, o imóvel é o conteúdo — e a atenção cai muito abaixo da dobra
 * (NN/g, "Scrolling and Attention").
 *
 * Título e espaçamentos encolhem; o texto não sai.
 */
@media (max-width: 639px) {
  .hero-in {
    padding-top: 20px;
    padding-bottom: 8px;
  }
  .hero h1 {
    font-size: var(--fs-title-lg);
    margin: 0 0 8px;
  }
  .hero p.sub {
    font-size: var(--fs-body);
  }
  .hero.bg-mode .hero-in {
    padding-top: 36px;
    padding-bottom: 36px;
    min-height: 300px;
  }
}
</style>
