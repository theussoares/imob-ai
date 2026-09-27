<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { SITE_THEMES, SITE_THEME_LABELS, type SiteTheme } from '~~/shared/models/site-theme'
import { createCatalogFilters } from '~/composables/useCatalog'

/**
 * MOCK de interface — destaques, exclusiva e hierarquia de selos.
 *
 * Existe para decidir a interface ANTES de migration e endpoint: usa o acervo
 * real do tenant (`?tenant=`), e só as marcações (destaque, exclusiva) são
 * inventadas aqui, por cenário. Some do build de produção pelo 404 abaixo e
 * sai do repositório quando a versão de verdade entrar.
 */
if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

const tenant = useTenant()
const { data: properties } = await useCatalogCards()

const cenarios = {
  nenhum: { label: 'Nenhum destaque', destaques: 0 },
  um: { label: '1 destaque (seção some)', destaques: 1 },
  tres: { label: '3 destaques', destaques: 3 },
  seis: { label: '6 destaques (limite)', destaques: 6 },
  demais: { label: '17 destaques (caso tatiane)', destaques: 17 },
} as const
type Cenario = keyof typeof cenarios

const cenario = ref<Cenario>('tres')
const tema = ref<SiteTheme>(tenant.value?.siteTheme ?? 'classico')

// O mesmo atributo que o layout default põe no <html>: o `useHead` da página
// entra depois do layout e vence, então dá para trocar de tema sem trocar de
// tenant.
useHead(() => ({ htmlAttrs: { 'data-tema': tema.value } }))
useSeoMeta({ title: 'Mock · Destaques', robots: 'noindex, nofollow' })

/**
 * Marcações inventadas sobre o acervo real, contadas POR FINALIDADE (os N
 * primeiros de venda e os N primeiros de aluguel são destaque), porque a faixa
 * agora segue o Comprar/Alugar da busca.
 *
 * Os selos caem em posições fixas para a grade sempre mostrar todos os casos:
 * Exclusiva no 2º e no 5º, Novo (cadastrado há 4 dias) no 1º, 3º e 5º, Alto
 * padrão no 4º e no 5º. O 5º junta os três e mostra quem vence.
 */
const DIA = 86_400_000
const hoje = Date.now()
const lista = computed<PropertyCard[]>(() => {
  const n = cenarios[cenario.value].destaques
  const porFinalidade = { venda: 0, aluguel: 0 }
  return (properties.value ?? []).map((p, i) => {
    const ordem = porFinalidade[p.purpose]++
    return {
      ...p,
      featured: ordem < n,
      exclusive: i === 1 || i === 4,
      highStandard: p.highStandard || i === 3 || i === 4,
      createdAt: new Date(hoje - ([0, 2, 4].includes(i) ? 4 : 200) * DIA).toISOString(),
    }
  })
})

const filters = reactive(createCatalogFilters())
const { filtered } = useCatalog(lista, filters)

const casos = computed(() => {
  const l = lista.value
  return [
    { t: 'Só pretensão', p: l.find((p, i) => i > 5 && !p.exclusive && !p.highStandard) },
    { t: 'Novo (cadastrado há 4 dias)', p: l[2] },
    { t: 'Exclusiva', p: l[1] },
    { t: 'Alto padrão', p: l[3] },
    { t: 'Exclusiva + Novo + Alto padrão: vence Exclusiva', p: l[4] },
  ].filter((c) => c.p) as { t: string; p: PropertyCard }[]
})
</script>

<template>
  <div>
    <div class="mock-bar" role="region" aria-label="Controles do mock">
      <strong>Mock</strong>
      <label>
        Cenário
        <select v-model="cenario">
          <option v-for="(c, k) in cenarios" :key="k" :value="k">{{ c.label }}</option>
        </select>
      </label>
      <label>
        Tema
        <select v-model="tema">
          <option v-for="t in SITE_THEMES" :key="t" :value="t">{{ SITE_THEME_LABELS[t] }}</option>
        </select>
      </label>
      <NuxtLink to="/mock/destaques-admin">Painel →</NuxtLink>
    </div>

    <Hero :tenant="tenant" />

    <div class="search">
      <PropertySearch :filters="filters" />
    </div>

    <HomeDestaques :properties="lista" :purpose="filters.purpose" />

    <div class="wrap">
      <div class="res-head">
        <div>
          <h2>{{ filters.purpose === 'aluguel' ? 'Imóveis para alugar' : 'Imóveis à venda' }}</h2>
          <div class="count">{{ filtered.length }} imóveis encontrados</div>
        </div>
      </div>
      <div class="grid">
        <LazyPropertyCard
          v-for="(p, i) in filtered.slice(0, 6)"
          :key="p.id"
          :property="p"
          :index="i"
          :lcp-candidate="false"
        />
      </div>

      <h2 class="mock-h">Casos de selo</h2>
      <div class="grid">
        <div v-for="c in casos" :key="c.t">
          <p class="mock-cap">{{ c.t }}</p>
          <LazyPropertyCard :property="c.p" :lcp-candidate="false" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mock-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  padding: 8px 18px;
  background: #fff7d6;
  border-bottom: 1px solid #e8d98a;
  font-size: var(--fs-label);
}
.mock-bar label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mock-bar select {
  min-height: 36px;
  font: inherit;
}
.mock-h {
  margin: 48px 0 14px;
  font-size: var(--fs-title);
}
.mock-cap {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin-bottom: 6px;
}
</style>
