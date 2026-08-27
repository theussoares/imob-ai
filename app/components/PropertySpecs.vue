<script setup lang="ts">
import type { PropertySpecFields } from '~~/shared/utils/property-specs'
import { propertySpecs } from '~~/shared/utils/property-specs'

/**
 * A ficha de medidas, nas duas densidades em que ela aparece.
 *
 * `card` é a linha compacta da grade: rótulo abreviado, uma linha só quando
 * cabe. `detail` é o bloco da página do imóvel: número grande, rótulo por
 * extenso embaixo.
 *
 * As duas leem a MESMA lista (`propertySpecs`), então a regra de o que mostrar
 * e o que omitir não pode divergir entre a grade e o detalhe — era exatamente
 * o que acontecia quando cada tela montava a ficha à mão.
 */
const props = withDefaults(
  defineProps<{ property: PropertySpecFields; variant?: 'card' | 'detail' }>(),
  { variant: 'card' },
)

const specs = computed(() => propertySpecs(props.property))
</script>

<template>
  <!--
    Lista de verdade (ul/li), não um punhado de divs: o leitor de tela anuncia
    "lista com 5 itens" e permite pular de um para o outro. `specs` sem itens
    não renderiza nada — um imóvel sem nenhuma medida cadastrada não ganha uma
    régua vazia na tela.
  -->
  <ul v-if="specs.length" class="specs" :class="variant">
    <li v-for="s in specs" :key="s.icon" class="spec">
      <AppIcon :name="s.icon" />
      <b>{{ s.value }}</b>
      <small>{{ variant === 'detail' ? s.long : s.short }}</small>
    </li>
  </ul>

  <!--
    Nenhuma medida cadastrada. Existe em produção: um terreno com área 0 ficava
    com o cartão inteiro sem uma única informação sobre o imóvel — preço, bairro
    e nada mais.

    Dizer "sob consulta" não é inventar dado: é a diferença entre "este imóvel
    não tem medida" e "esta medida não foi informada", e só a segunda é verdade.
    Ainda dá à pessoa um motivo para perguntar, em vez de um vazio para ignorar.
  -->
  <p v-else class="specs-none" :class="variant">Medidas sob consulta</p>
</template>

<style scoped>
.specs {
  list-style: none;
  margin: 0;
  padding: 0;
}

.specs-none {
  color: var(--ink-soft);
  font-size: 13px;
  font-style: italic;
}
.specs-none.card {
  margin: 13px 0 15px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}
.specs-none.detail {
  margin: 18px 0 22px;
  padding: 13px 14px;
  border: 1px dashed var(--line-2);
  border-radius: 12px;
  font-size: 14px;
}

/* ---------- Variante do card ---------- */
.specs.card {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 13px 0 15px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}
.specs.card .spec {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--ink);
  font-weight: 600;
  /* A medida e o rótulo são uma unidade: "2 qtos" nunca quebra no meio. */
  white-space: nowrap;
}
.specs.card .spec small {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-soft);
}
.specs.card .spec :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: var(--brand);
  fill: none;
  flex: none;
}

/* ---------- Variante da página de detalhe ---------- */
.specs.detail {
  display: grid;
  /* auto-fit + minmax: com duas medidas (um terreno) as colunas não esticam
     grotescamente; com cinco, quebra sozinho no celular. */
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 10px;
  margin: 18px 0 22px;
}
.specs.detail .spec {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  padding: 13px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
}
.specs.detail .spec b {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 19px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.1;
}
.specs.detail .spec small {
  font-size: 11.5px;
  color: var(--ink-soft);
  line-height: 1.25;
}
.specs.detail .spec :deep(svg) {
  width: 19px;
  height: 19px;
  stroke: var(--brand);
  fill: none;
  margin-bottom: 3px;
}
</style>
