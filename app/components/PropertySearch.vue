<script setup lang="ts">
import type { CatalogFilters } from '~/composables/useCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = defineProps<{ filters: CatalogFilters }>()
const emit = defineEmits<{ search: [] }>()

/**
 * A pretensão canônica vive em `/imoveis/a-venda` e `/imoveis/para-alugar` —
 * são essas páginas que o Google indexa e que recebem link interno (via
 * `catLinks` na home). Aqui na home o toggle é só filtro de tela, em memória:
 * não escreve na URL.
 */
function setPurpose(p: 'venda' | 'aluguel') {
  if (props.filters.purpose === p) return
  props.filters.purpose = p
  props.filters.maxPrice = 0 // faixas de preço de venda e aluguel não são comparáveis
}

const priceOptions = computed(() =>
  props.filters.purpose === 'aluguel'
    ? [
        { v: 0, l: 'Sem limite' },
        { v: 1500, l: 'Até R$ 1.500' },
        { v: 2500, l: 'Até R$ 2.500' },
        { v: 4000, l: 'Até R$ 4.000' },
      ]
    : [
        { v: 0, l: 'Sem limite' },
        { v: 200000, l: 'Até R$ 200 mil' },
        { v: 350000, l: 'Até R$ 350 mil' },
        { v: 500000, l: 'Até R$ 500 mil' },
        { v: 800000, l: 'Até R$ 800 mil' },
      ],
)

/**
 * No celular, os quatro campos empilhados ocupavam ~450px — mais da metade da
 * tela útil de um aparelho comum, antes de qualquer imóvel aparecer. A pessoa
 * chegava no site de imóveis e via um formulário.
 *
 * A saída não é encolher o formulário: é reconhecer que a busca por texto
 * responde à maioria das visitas ("Centro", "Jardim Alvorada") e que tipo,
 * quartos e faixa de preço são refinamento de quem já não achou. Esses três vão
 * para um painel que abre sob demanda.
 *
 * No desktop nada disso acontece — o CSS mantém os quatro campos lado a lado e
 * o painel nunca existe. É a mesma marcação servindo as duas interações, sem
 * componente duplicado.
 */
const drawerOpen = ref(false)

/** Quantos refinamentos estão ativos — vira o contador no botão "Filtros". */
const activeCount = computed(() => {
  let n = 0
  if (props.filters.type) n++
  if (props.filters.bedrooms) n++
  if (props.filters.maxPrice) n++
  return n
})

function applyAndClose() {
  drawerOpen.value = false
  emit('search')
}

function clearFilters() {
  props.filters.type = ''
  props.filters.bedrooms = 0
  props.filters.maxPrice = 0
}

// Trava a rolagem do fundo enquanto o painel está aberto — sem isto, arrastar
// dentro do painel rola o catálogo atrás dele.
watch(drawerOpen, (open) => {
  if (import.meta.client) document.documentElement.style.overflow = open ? 'hidden' : ''
})
onBeforeUnmount(() => {
  if (import.meta.client) document.documentElement.style.overflow = ''
})

onKeyStroke('Escape', () => drawerOpen.value && (drawerOpen.value = false))

const painel = ref<HTMLElement | null>(null)
watch(drawerOpen, async (open) => {
  if (!open) return
  await nextTick()
  painel.value?.querySelector<HTMLElement>('button, select, input')?.focus()
})
</script>

<template>
  <div class="search-card">
    <nav class="seg" aria-label="Pretensão">
      <button
        type="button"
        :class="{ on: filters.purpose === 'venda' }"
        :aria-pressed="filters.purpose === 'venda'"
        @click="setPurpose('venda')"
      >
        Comprar
      </button>
      <button
        type="button"
        :class="{ on: filters.purpose === 'aluguel' }"
        :aria-pressed="filters.purpose === 'aluguel'"
        @click="setPurpose('aluguel')"
      >
        Alugar
      </button>
    </nav>

    <div class="fields">
      <!-- Sempre visível, nas duas larguras: é a busca que a maioria usa. -->
      <div class="field field-q">
        <label for="q">Bairro, cidade ou palavra-chave</label>
        <input
          id="q"
          v-model="filters.q"
          class="ctl"
          type="search"
          placeholder="Ex.: Jardim Alvorada, Centro..."
          autocomplete="off"
          @keydown.enter="emit('search')"
        />
      </div>

      <!--
        Os três refinamentos. No desktop são colunas do mesmo grid; no celular o
        CSS os tira do fluxo e os coloca dentro do painel (`.adv`), que só existe
        quando aberto. A marcação é uma só — dois conjuntos de campos ligados ao
        mesmo v-model dariam dois lugares para o mesmo estado divergir.
      -->
      <div id="filtros-avancados" ref="painel" class="adv" :class="{ open: drawerOpen }">
        <div class="adv-head">
          <h3>Filtros</h3>
          <button type="button" class="adv-x" aria-label="Fechar filtros" @click="drawerOpen = false">
            <AppIcon name="close" />
          </button>
        </div>

        <div class="adv-fields">
          <div class="field">
            <label for="fTipo">Tipo de imóvel</label>
            <select id="fTipo" v-model="filters.type" class="ctl">
              <option value="">Todos os tipos</option>
              <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">
                {{ PROPERTY_TYPE_LABELS[t] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="fQuartos">Quartos</label>
            <select id="fQuartos" v-model.number="filters.bedrooms" class="ctl">
              <option :value="0">Qualquer</option>
              <option :value="1">1+</option>
              <option :value="2">2+</option>
              <option :value="3">3+</option>
              <option :value="4">4+</option>
            </select>
          </div>
          <div class="field">
            <label for="fPreco">Valor até</label>
            <select id="fPreco" v-model.number="filters.maxPrice" class="ctl">
              <option v-for="o in priceOptions" :key="o.v" :value="o.v">{{ o.l }}</option>
            </select>
          </div>
        </div>

        <div class="adv-foot">
          <button type="button" class="adv-clear" :disabled="!activeCount" @click="clearFilters">
            Limpar
          </button>
          <button type="button" class="adv-apply" @click="applyAndClose">Ver imóveis</button>
        </div>
      </div>
    </div>

    <!-- Linha de ação do celular: abrir refinamentos, ou buscar direto. -->
    <div class="go-row">
      <button
        type="button"
        class="filters-btn"
        :aria-expanded="drawerOpen"
        aria-controls="filtros-avancados"
        @click="drawerOpen = true"
      >
        Filtros
        <span v-if="activeCount" class="filters-n">{{ activeCount }}</span>
      </button>
      <button class="search-go" @click="emit('search')">
        <AppIcon name="search" />
        Buscar imóveis
      </button>
    </div>

    <!--
      Fundo escurecido do painel. Fora do `.adv` para que fechar tocando fora
      não dependa de propagação de clique dentro dele.

      Fica SEMPRE no DOM, escondido por classe — não por `v-if` dentro de um
      `<Transition>`. Com o `v-if`, a saída do elemento depende de o navegador
      avisar que a animação terminou; se esse aviso não vier (aba em segundo
      plano, motor sem composição), sobra uma camada de tela inteira em cima da
      página, e o site inteiro deixa de aceitar clique. Um fade não vale esse
      risco: aqui o estado fechado é `pointer-events: none`, que não depende de
      evento nenhum.
    -->
    <div class="adv-backdrop" :class="{ open: drawerOpen }" @click="drawerOpen = false" />
  </div>
</template>

<style scoped>
/* ---------- Linha de ação ---------- */
.go-row {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}
/* Abaixo de 360px os dois rótulos não cabem lado a lado e "Buscar imóveis"
   quebra em duas linhas, deixando os botões com 78px de altura. Empilhar é mais
   honesto que abreviar o rótulo: cada botão fica com a largura toda e um alvo
   de toque melhor. */
@media (max-width: 359px) {
  .go-row {
    flex-direction: column;
  }
  .filters-btn {
    justify-content: center;
  }
}
.go-row .search-go {
  /* O `.search-go` global já traz cor, tipografia e altura; aqui ele só deixa
     de ser largura total para dividir a linha com o botão de filtros. */
  flex: 1;
  margin-top: 0;
  width: auto;
}
.filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 15px 18px;
  border: 1.5px solid var(--line-2);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
  font-size: 15px;
}
.filters-btn:hover {
  border-color: var(--brand);
}
.filters-n {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* ---------- Celular: os refinamentos viram painel ---------- */
/* ---------- Cabeçalho e rodapé do painel ---------- */
.adv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.adv-head h3 {
  font-size: 18px;
}
.adv-x {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
}
.adv-x :deep(svg) {
  width: 20px;
  height: 20px;
}
.adv-foot {
  display: flex;
  gap: 10px;
}
.adv-clear {
  flex: none;
  padding: 14px 18px;
  border: 1.5px solid var(--line-2);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
  font-size: 15px;
}
.adv-clear:disabled {
  opacity: 0.45;
  cursor: default;
}
.adv-apply {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  font-size: 15.5px;
}

@media (max-width: 819px) {
  /* Sozinho na grade enquanto os refinamentos estão no painel: entre 560 e
     819px o `.fields` tem duas colunas e o campo ficaria com metade da largura
     e um vão do lado. */
  .field-q {
    grid-column: 1 / -1;
  }
  .adv {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: 86vh;
    overflow-y: auto;
    padding: 18px 18px max(18px, env(safe-area-inset-bottom));
    background: var(--paper);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--shadow-lg);
    /* Fora da tela e fora da ordem de foco enquanto fechado: um painel
       invisível não pode receber Tab. */
    transform: translateY(100%);
    visibility: hidden;
    /*
     * `visibility` não se interpola — ela troca de estado. Transicioná-la junto
     * com a duração do movimento deixa o painel dependendo de a animação
     * completar para ficar visível, e onde a animação não roda (aba em segundo
     * plano, motor sem composição) ele fica preso em `hidden` com o `.open`
     * aplicado.
     *
     * O padrão certo é troca discreta com atraso: ao ABRIR, visível na hora
     * (0s); ao FECHAR, só some depois que o painel terminou de descer (0.26s),
     * senão ele sumiria antes de deslizar.
     */
    transition:
      transform 0.26s cubic-bezier(0.32, 0.72, 0, 1),
      visibility 0s linear 0.26s;
  }
  .adv.open {
    transform: none;
    visibility: visible;
    transition:
      transform 0.26s cubic-bezier(0.32, 0.72, 0, 1),
      visibility 0s;
  }
  .adv-fields {
    display: grid;
    gap: 12px;
  }
  .adv-backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(10, 12, 16, 0.45);
    opacity: 0;
    /* O estado fechado não intercepta clique — é o que garante que a página
       continue utilizável mesmo que a transição não termine. */
    pointer-events: none;
    transition: opacity 0.22s ease;
  }
  .adv-backdrop.open {
    opacity: 1;
    pointer-events: auto;
  }
}

/* ---------- Desktop: os refinamentos são colunas, o painel não existe ---------- */
@media (min-width: 820px) {
  .adv {
    display: contents;
  }
  .adv-head,
  .adv-foot,
  .adv-backdrop,
  .filters-btn {
    display: none;
  }
  .adv-fields {
    display: contents;
  }
  .go-row .search-go {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .adv,
  .adv-backdrop {
    transition: none;
  }
}
</style>
