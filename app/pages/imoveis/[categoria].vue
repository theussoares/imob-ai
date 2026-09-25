<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { createCatalogFilters } from '~/composables/useCatalog'
import { propertyPath } from '~~/shared/utils/property-url'
import {
  parseCategorySlug,
  categoryLabel,
  categorySlug,
  CATEGORY_MIN_PROPERTIES,
} from '~~/shared/utils/category'
import { loteDoCatalogo } from '~~/shared/utils/catalog-lote'
import { seekingTypeFor } from '~~/shared/models/lead'
import { allNeighborhoods } from '~~/shared/utils/neighborhood'

const route = useRoute()
const tenant = useTenant()
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true })

const category = parseCategorySlug(String(route.params.categoria))
if (!category) {
  throw createError({ statusCode: 404, statusMessage: 'Categoria não encontrada.' })
}

// Mesma chave e formato da home — ver useCatalogCards.
const { data: properties } = await useCatalogCards()

const inCategory = computed(() =>
  (properties.value ?? []).filter(
    (p) => p.purpose === category.purpose && (category.type === null || p.type === category.type),
  ),
)

// Piso de conteúdo: categoria magra não vira página. Evita publicar dezenas de
// rotas quase vazias, que o Google trata como conteúdo fino gerado em massa.
// As páginas de pretensão ficam linkadas na home, então 404 apareceria na cara
// do visitante. Elas respondem 200 e saem do índice; as de tipo+pretensão,
// que ninguém alcança pelo menu, seguem com 404.
const abaixoDoPiso = computed(() => inCategory.value.length < CATEGORY_MIN_PROPERTIES)
if (abaixoDoPiso.value && category.type !== null) {
  throw createError({ statusCode: 404, statusMessage: 'Categoria sem imóveis suficientes.' })
}

useHead(() => ({
  meta: abaixoDoPiso.value ? [{ name: 'robots', content: 'noindex,follow' }] : [],
}))

// Tipo e pretensão já vêm da própria rota; os demais filtros seguem em memória,
// como na home — instantâneos e sem requisição.
//
// `useState` por categoria, e não `reactive` local: quem escolheu um bairro,
// abriu um imóvel e voltou encontrava "Todos" de novo e o card que acabou de
// ver fora da lista. A chave leva o slug para "Casas à venda" não herdar o
// bairro escolhido em "Apartamentos à venda".
const slug = categorySlug(category)
const filters = useState(`cat-filters:${slug}`, createCatalogFilters).value
filters.purpose = category.purpose
if (category.type) filters.type = category.type
const { filtered } = useCatalog(inCategory, filters)

/**
 * Mesmo corte em lotes que a home já fazia, e pelo mesmo motivo — ver
 * `catalog-lote.ts`. A categoria ficou de fora quando o lote foi criado, e na
 * maior imobiliária de hoje isso são 56 cards de uma vez: 479 KB de HTML numa
 * página que a busca orgânica abre primeiro, quase sempre no celular.
 *
 * O ganho é DOM e parse, não banda: o catálogo inteiro continua chegando no
 * payload, de propósito, porque é sobre ele que os filtros e os chips de
 * bairro rodam em memória.
 */
// `useState` pelo mesmo motivo dos filtros: com `ref(1)`, voltar de um imóvel
// que estava no segundo lote recolhia a lista, o card sumia e o navegador não
// tinha onde restaurar a rolagem.
const lotes = useState(`cat-lotes:${slug}`, () => 1)
const lote = computed(() => loteDoCatalogo(filtered.value, lotes.value))

// Trocar de bairro/filtro recomeça do primeiro lote — sem isso, quem expandiu
// e depois filtrou recebe outra parede de cards.
watch(filters, () => {
  lotes.value = 1
})

const { whatsappLink } = useContact()

// O lead do estado vazio chega no painel dizendo O QUE a pessoa procurava —
// sem isso seria um nome e um telefone sem contexto nenhum para o corretor.
const composeEmptyMessage = (note: string) =>
  [`Procura: ${heading.value}`, note.trim()].filter(Boolean).join('\n')

const cityLabel = computed(() => (tenant.value?.city ? ` em ${tenant.value.city}` : ''))
const heading = computed(() => `${categoryLabel(category)}${cityLabel.value}`)

/**
 * Bairros presentes nesta categoria — viram atalhos de filtro (não rotas
 * próprias). Agrupados por como o nome se LÊ (`allNeighborhoods`): contando a
 * string crua, "Bela Vista da Lagoa" e "Bela vista da Lagoa" viravam duas
 * pastilhas do mesmo lugar.
 */
const neighborhoods = computed(() => allNeighborhoods(inCategory.value))

const canonical = `${url.origin}/imoveis/${slug}`

useSeoMeta({
  title: () => heading.value,
  description: () =>
    `${heading.value}: ${inCategory.value.length} ${inCategory.value.length === 1 ? 'opção' : 'opções'} disponíveis` +
    `${tenant.value?.name ? ' na ' + tenant.value.name : ''}. Veja fotos, valores e fale direto com o corretor.`,
  ogTitle: () => `${heading.value}${tenant.value?.name ? ' · ' + tenant.value.name : ''}`,
  ogType: 'website',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonical }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: url.origin + '/' },
          { '@type': 'ListItem', position: 2, name: heading.value, item: canonical },
        ],
      }),
    },
    /**
     * A lista dos imóveis da categoria.
     *
     * Antes daqui, a página de categoria só declarava a própria trilha: o robô
     * via o título e nada sobre o que a página lista. `ItemList` é o que diz
     * que estas 56 URLs são o conteúdo desta página, e não links soltos de
     * menu — é a diferença entre uma página de categoria e um índice qualquer.
     *
     * Vai a categoria inteira, não só o primeiro lote: o "Ver mais" revela o
     * resto sem trocar de URL, então a página É todas elas. São ~120 bytes por
     * item, contra os 479 KB que o corte em lote tirou.
     *
     * Só `url` e `name` por item. Preço e foto ficam na página de cada imóvel,
     * onde o JSON-LD completo já existe — repetir aqui dobraria o payload para
     * dizer ao robô o que ele encontra a um clique.
     */
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: heading.value,
        numberOfItems: inCategory.value.length,
        itemListElement: inCategory.value.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.title,
          url: url.origin + propertyPath(p),
        })),
      }),
    },
  ],
}))
</script>

<template>
  <div>
    <div class="cat-head">
      <nav class="crumbs" aria-label="Trilha de navegação">
        <NuxtLink to="/">Início</NuxtLink>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{{ heading }}</span>
      </nav>

      <h1>{{ heading }}</h1>
      <p class="cat-intro">
        {{ inCategory.length }}
        {{ inCategory.length === 1 ? 'imóvel disponível' : 'imóveis disponíveis' }}
        <template v-if="tenant?.name">na {{ tenant.name }}</template
        >. Compare fotos, valores e características, e fale direto com o corretor pelo WhatsApp.
      </p>

      <div v-if="neighborhoods.length > 1" class="cat-hoods">
        <span class="cat-hoods-label">Bairros:</span>
        <!-- aria-pressed: sem ele o leitor de tela anuncia uma fileira de
             "botão" idênticos, sem dizer qual bairro está valendo. -->
        <button
          type="button"
          class="hood"
          :class="{ on: !filters.q }"
          :aria-pressed="!filters.q"
          @click="filters.q = ''"
        >
          Todos
        </button>
        <button
          v-for="h in neighborhoods"
          :key="h.slug"
          type="button"
          class="hood"
          :class="{ on: filters.q === h.label }"
          :aria-pressed="filters.q === h.label"
          @click="filters.q = filters.q === h.label ? '' : h.label"
        >
          {{ h.label }} <small>{{ h.count }}</small>
        </button>
      </div>
    </div>

    <div class="wrap">
      <!-- O <template> segura grade e botão sob o MESMO v-if. Com o botão solto
           entre os dois, o v-else de baixo grudava no v-if dele: toda categoria
           com até um lote mostrava os cards e, logo abaixo, "ainda não temos". -->
      <template v-if="filtered.length">
        <!--
          A frase do topo conta a categoria inteira; ao escolher um bairro, a
          lista encolhia sem nada dizer quantos sobraram. A contagem fica
          `aria-live` porque o filtro muda a lista sem mover o foco.
        -->
        <div class="cat-res">
          <p class="cat-count" aria-live="polite">
            {{ filtered.length }}
            {{ filtered.length === 1 ? 'imóvel' : 'imóveis' }}<template v-if="filters.q">
              em {{ filters.q }}</template>
          </p>
          <label class="sort">
            Ordenar
            <select v-model="filters.sort">
              <option value="rel">Relevância</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="area">Maior área</option>
            </select>
          </label>
        </div>
        <div class="grid">
          <PropertyCard
            v-for="(p, i) in lote.visiveis"
            :key="p.id"
            :property="p"
            :index="i"
            :style="`animation: fade .4s ease ${Math.min(i, 8) * 0.04}s both`"
          />
        </div>

        <div v-if="lote.restantes" class="ver-mais">
          <button type="button" @click="lotes++">
            Ver mais {{ lote.proximoLote }}
            {{ lote.proximoLote === 1 ? 'imóvel' : 'imóveis' }}
          </button>
          <!-- aria-live: os cards novos entram ABAIXO do botão, fora de onde o
               leitor de tela está — sem o aviso o clique não produz resposta
               audível nenhuma. -->
          <p class="ver-mais-conta" aria-live="polite">
            Mostrando {{ lote.visiveis.length }} de {{ filtered.length }}
          </p>
        </div>
      </template>
      <div v-else class="cat-vazio">
        <p>
          Ainda não temos {{ categoryLabel(category).toLowerCase() }}{{ cityLabel }} publicados no
          momento.
        </p>
        <!--
          Formulário além do WhatsApp: nem todo mundo quer abrir conversa com um
          corretor só para pedir um aviso, e o link sozinho não deixava rastro
          nenhum no painel. O formulário vira lead com o que a pessoa procurava.
        -->
        <div class="cat-vazio-lead">
          <LeadForm
            source="catalog_empty"
            :lead-type="seekingTypeFor(category.purpose)"
            :heading-level="2"
            title="Avisamos quando aparecer"
            note-placeholder="Algo mais que ajude na busca? (opcional)"
            submit-label="Quero ser avisado"
            ok-message="Recebemos! Assim que aparecer, a gente te chama. ✅"
            :build-message="composeEmptyMessage"
          />
        </div>
        <a class="cat-vazio-wa" :href="whatsappLink()" target="_blank" rel="noopener">
          Prefere o WhatsApp? Fale com a gente
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cat-head {
  max-width: 1140px;
  margin: 0 auto;
  padding: 28px 18px 0;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin-bottom: 12px;
}
.crumbs a {
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.crumbs a:hover {
  text-decoration: underline;
}
.cat-head h1 {
  font-size: clamp(26px, 4.5vw, 38px);
  margin: 0 0 10px;
}
.cat-intro {
  color: var(--ink-soft);
  font-size: var(--fs-body);
  max-width: 62ch;
  margin: 0;
}
.cat-hoods {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.cat-hoods-label {
  font-size: var(--fs-label);
  font-weight: 700;
  color: var(--ink-soft);
}
.hood {
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--ink);
  background: var(--paper);
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-pill);
  padding: 7px 13px;
  /* 44px de alvo de toque: com o padding original davam ~31px, e uma fileira
     de pastilhas pequenas e coladas é onde mais se toca no bairro errado. */
  min-height: 44px;
}
.hood small {
  color: var(--ink-soft);
  font-weight: 500;
}
.hood.on {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.hood.on small {
  color: rgba(255, 255, 255, 0.75);
}
.cat-vazio {
  text-align: center;
  padding: 60px 20px;
  color: var(--ink-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.cat-vazio-lead {
  width: 100%;
  max-width: 460px;
  text-align: left;
  padding: 20px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.cat-vazio-wa {
  color: var(--brand);
  font-weight: 600;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.cat-res {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.cat-count {
  margin: 0;
  font-weight: 600;
  color: var(--ink-soft);
}
</style>
