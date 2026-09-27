<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'
import { formatPropertyCode } from '~~/shared/utils/property-specs'
import { cardQualifier, CARD_QUALIFIER_LABELS } from '~~/shared/utils/property-badges'

/**
 * MOCK de interface do painel — controle de destaque com limite e o bloco
 * "Como aparece no site" do cadastro. Mesmo propósito e mesma saída do
 * `/mock/destaques`: decidir a tela antes do backend, e sumir depois.
 *
 * Sem o layout do painel porque ele exige sessão; o conteúdo usa as mesmas
 * classes (`admin-card`, `admin-label`, `pill`) e herda a mesma cara.
 */
if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

definePageMeta({ layout: false })
useSeoMeta({ title: 'Mock · Destaques no painel', robots: 'noindex, nofollow' })

const LIMITE = 6

const { data: properties } = await useCatalogCards()

const cenarios = { tres: 3, seis: 6, demais: 17 } as const
const cenario = ref<keyof typeof cenarios>('tres')

// Estado local editável: o mock precisa responder ao clique na estrela.
const itens = ref<PropertyCard[]>([])
watch(
  [properties, cenario],
  () => {
    const n = cenarios[cenario.value]
    itens.value = (properties.value ?? []).slice(0, 20).map((p, i) => ({
      ...p,
      featured: i < n,
      exclusive: i === 1,
    }))
  },
  { immediate: true },
)

const usados = computed(() => itens.value.filter((p) => p.featured).length)
const cheio = computed(() => usados.value >= LIMITE)
const excedente = computed(() => Math.max(0, usados.value - LIMITE))
const soDestaques = ref(false)
const visiveis = computed(() => (soDestaques.value ? itens.value.filter((p) => p.featured) : itens.value))

// Aviso junto da estrela recusada, não toast: o toast some em 4s e aparece
// longe de onde a pessoa clicou.
const recusado = ref<string | null>(null)
function alternar(p: PropertyCard) {
  if (!p.featured && cheio.value) {
    recusado.value = p.id
    return
  }
  recusado.value = null
  p.featured = !p.featured
}

// ---- Bloco do cadastro (um imóvel em edição) ----
const editando = computed(() => itens.value[2])
const form = reactive({ featured: false, exclusive: false, highStandard: false })
watch(
  editando,
  (p) => {
    if (!p) return
    form.featured = p.featured
    form.exclusive = !!p.exclusive
    form.highStandard = p.highStandard
  },
  { immediate: true },
)
// Os outros destaques, sem contar este imóvel: é o que decide se ainda cabe.
const outrosDestaques = computed(() => itens.value.filter((p) => p.featured && p.id !== editando.value?.id).length)
const semVaga = computed(() => !form.featured && outrosDestaques.value >= LIMITE)
const usadosComEste = computed(() => outrosDestaques.value + (form.featured ? 1 : 0))

const preQualificador = computed(() => cardQualifier({ exclusive: form.exclusive, highStandard: form.highStandard }))
</script>

<template>
  <div class="mock-admin">
    <div class="mock-bar" role="region" aria-label="Controles do mock">
      <strong>Mock · painel</strong>
      <label>
        Destaques já marcados
        <select v-model="cenario">
          <option value="tres">3</option>
          <option value="seis">6 (limite)</option>
          <option value="demais">17 (caso tatiane)</option>
        </select>
      </label>
      <NuxtLink to="/mock/destaques">← Site</NuxtLink>
    </div>

    <main class="admin-main">
      <!-- ============ 1. Cadastro do imóvel ============ -->
      <h1>Editar imóvel</h1>
      <p class="sub">Trecho do formulário, no lugar dos dois checkboxes soltos de hoje.</p>

      <div class="admin-card">
        <fieldset class="sec">
          <legend>Como aparece no site</legend>

          <div class="opt">
            <input id="o-dest" v-model="form.featured" type="checkbox" :disabled="semVaga" aria-describedby="o-dest-h" />
            <div>
              <label for="o-dest">Destaque na home</label>
              <p id="o-dest-h" class="opt-h">
                <template v-if="semVaga">
                  Os {{ LIMITE }} lugares estão ocupados. Tire o destaque de outro imóvel para liberar um.
                  <a href="#lista" class="opt-link" @click="soDestaques = true">Ver destaques</a>
                </template>
                <template v-else>
                  Entra na faixa "Imóveis em destaque", no topo da página inicial.
                  <span class="meter">{{ usadosComEste }} de {{ LIMITE }} usados</span>
                </template>
              </p>
            </div>
          </div>

          <div class="opt">
            <input id="o-excl" v-model="form.exclusive" type="checkbox" aria-describedby="o-excl-h" />
            <div>
              <label for="o-excl">Exclusiva</label>
              <p id="o-excl-h" class="opt-h">
                Marque só com contrato de exclusividade assinado com o proprietário.
              </p>
            </div>
          </div>

          <div class="opt">
            <input id="o-alto" v-model="form.highStandard" type="checkbox" aria-describedby="o-alto-h" />
            <div>
              <label for="o-alto">Alto padrão</label>
              <p id="o-alto-h" class="opt-h">Selo no card e na página do imóvel.</p>
            </div>
          </div>

          <!--
            Prévia do que muda no card. É a resposta ao problema que motivou
            tudo: o checkbox de destaque não mostrava efeito nenhum, e ninguém
            sabia o que estava marcando.
          -->
          <div class="preview" aria-live="polite">
            <span class="preview-t">No card do site:</span>
            <span class="badge">{{ editando?.purpose === 'aluguel' ? 'Aluguel' : 'Venda' }}</span>
            <span v-if="preQualificador" class="badge" :class="preQualificador === 'exclusiva' ? 'excl' : 'high'">
              {{ CARD_QUALIFIER_LABELS[preQualificador] }}
            </span>
            <span v-if="form.exclusive && form.highStandard" class="preview-n">
              Alto padrão fica só na página do imóvel: no card cabe um selo além de Venda/Aluguel.
            </span>
          </div>
        </fieldset>
      </div>

      <!-- ============ 2. Lista de imóveis ============ -->
      <h1 id="lista" class="h-lista">Imóveis</h1>

      <div v-if="excedente" class="warn" role="status">
        <AppIcon name="alert" />
        <p>
          <strong>{{ usados }} imóveis marcados como destaque, e a home mostra {{ LIMITE }}.</strong>
          Os {{ excedente }} mais antigos ficam de fora. Tire a estrela dos que não precisam estar lá.
        </p>
      </div>

      <div class="toolbar">
        <span class="meter" :class="{ full: cheio }">
          <AppIcon name="star" /> Destaques na home: {{ usados }} de {{ LIMITE }}
        </span>
        <label class="only">
          <input v-model="soDestaques" type="checkbox" /> Só destaques
        </label>
      </div>

      <div class="admin-card list">
        <div v-for="p in visiveis" :key="p.id" class="row">
          <div class="thumb">
            <img v-if="p.images[0]" :src="p.images[0].urlSm || p.images[0].url" alt="" loading="lazy" />
          </div>
          <div class="info">
            <span class="mono">{{ formatPropertyCode(p.code) }}</span>
            <strong>{{ PROPERTY_TYPE_LABELS[p.type] }}{{ p.neighborhood ? ` · ${p.neighborhood}` : '' }}</strong>
            <span class="meta">
              {{ formatBRL(p.price) }}
              <span v-if="p.exclusive" class="pill">Exclusiva</span>
            </span>
            <span v-if="recusado === p.id" class="refused" role="alert">
              Limite de {{ LIMITE }} destaques. Tire a estrela de outro imóvel primeiro.
            </span>
          </div>
          <button
            type="button"
            class="star"
            :class="{ on: p.featured }"
            :aria-pressed="p.featured"
            :aria-label="`Destaque na home: ${formatPropertyCode(p.code)}`"
            @click="alternar(p)"
          >
            <AppIcon name="star" />
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.mock-admin {
  min-height: 100vh;
  background: var(--surface);
}
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
h1 {
  font-size: var(--fs-title-lg);
  margin-bottom: 4px;
}
.sub {
  color: var(--ink-soft);
  font-size: var(--fs-ui);
  margin-bottom: 14px;
}
.sec {
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.sec legend {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: 6px;
}

/* Uma opção por linha, com o efeito escrito embaixo: checkbox sem explicação
   foi o que produziu 0 destaques num cliente e 17 no outro. */
.opt {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.opt input {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  accent-color: var(--brand);
}
.opt label {
  font-weight: 600;
  font-size: var(--fs-ui);
  cursor: pointer;
}
.opt input:disabled + div label {
  color: var(--ink-soft);
  cursor: not-allowed;
}
.opt-h {
  margin-top: 2px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  line-height: 1.45;
}
.opt-link {
  color: var(--brand);
  font-weight: 600;
  margin-left: 4px;
}
.meter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}
.meter :deep(svg) {
  width: 16px;
  height: 16px;
}
.preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 12px;
  border-radius: var(--r-sm);
  background: var(--surface);
}
.preview-t {
  font-size: var(--fs-label);
  font-weight: 600;
  margin-right: 4px;
}
.preview-n {
  flex-basis: 100%;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}

.h-lista {
  margin-top: 40px;
}
.warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 12px 0;
  padding: 12px 14px;
  border: 1px solid #f0c36d;
  background: #fff8e6;
  border-radius: var(--r-md);
  font-size: var(--fs-ui);
  line-height: 1.45;
}
.warn :deep(svg) {
  flex: none;
  width: 20px;
  height: 20px;
  color: #a16207;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0;
}
.toolbar .meter {
  margin: 0;
  font-size: var(--fs-ui);
}
.toolbar .meter.full {
  color: #a16207;
}
.only {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-ui);
  font-weight: 600;
  min-height: 44px;
}
.list {
  padding: 4px 16px;
}
.row {
  display: grid;
  grid-template-columns: 56px 1fr 44px;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
.row + .row {
  border-top: 1px solid var(--line);
}
.thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--surface);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: var(--fs-ui);
}
.mono {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
}
.refused {
  color: #a16207;
  font-size: var(--fs-caption);
  font-weight: 600;
}

/* Estrela vazada/cheia: o mesmo ícone, preenchido quando ligado. 44px de
   alvo; o ícone é menor, a área de toque não. */
.star {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  border: none;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.12s;
}
.star:hover {
  background: var(--surface);
}
.star:active {
  transform: scale(0.94);
}
.star :deep(svg) {
  width: 24px;
  height: 24px;
}
.star.on {
  color: #d97706;
}
.star.on :deep(svg path) {
  fill: currentColor;
}
.star:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 2px;
}
</style>
