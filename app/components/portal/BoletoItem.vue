<script setup lang="ts">
import type { ChargeForClient } from '~~/shared/models/cobranca'
import { CHARGE_STATUS_LABELS } from '~~/shared/models/cobranca'

/**
 * Um boleto do aluguel.
 *
 * `principal` é o próximo a pagar: ganha o valor grande e o Pix em amarelo,
 * porque é a única ação que a pessoa veio fazer na maioria das visitas. Os
 * outros em aberto aparecem iguais, só menores; os pagos e cancelados viram
 * linha de histórico, sem ação.
 */
const props = defineProps<{
  boleto: ChargeForClient
  principal?: boolean
  historico?: boolean
}>()

const copiado = ref<'pix' | 'linha' | null>(null)
let relogio: ReturnType<typeof setTimeout> | undefined

async function copiar(texto: string, qual: 'pix' | 'linha') {
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = qual
    clearTimeout(relogio)
    relogio = setTimeout(() => (copiado.value = null), 2500)
  } catch {
    copiado.value = null
  }
}
onBeforeUnmount(() => clearTimeout(relogio))

const vencida = computed(() => props.boleto.status === 'vencida')

// Só `https:` vira link — ver `urlHttps`. Sem ele, o Pix e o código de
// barras continuam na tela.
const linkBoleto = computed(() => urlHttps(props.boleto.paymentUrl))
</script>

<template>
  <li v-if="historico" class="bh">
    <span class="bh-mes">{{ mesPorExtenso(boleto.competence) }}</span>
    <span class="bh-venc">venceu {{ dataBR(boleto.dueOn) }}</span>
    <span class="bh-valor">{{ dinheiroBR(boleto.amount) }}</span>
    <span class="bh-st" :class="boleto.status">{{ CHARGE_STATUS_LABELS[boleto.status] }}</span>
  </li>

  <li v-else class="bo" :class="{ principal, vencida }">
    <div class="bo-topo">
      <div>
        <p class="bo-mes">Aluguel de {{ mesPorExtenso(boleto.competence) }}</p>
        <p class="bo-valor">{{ dinheiroBR(boleto.amount) }}</p>
      </div>
      <span class="bo-st" :class="boleto.status">{{ CHARGE_STATUS_LABELS[boleto.status] }}</span>
    </div>

    <p class="bo-venc">
      <AppIcon name="calendar" />
      {{ vencida ? 'Venceu' : 'Vence' }} em <b>{{ dataBR(boleto.dueOn) }}</b>
    </p>
    <p v-if="vencida" class="bo-aviso">
      <AppIcon name="alert" />
      Pagando depois do vencimento, o boleto soma a multa e os juros do contrato.
    </p>

    <div class="bo-acoes">
      <button v-if="boleto.pixCopyPaste" type="button" class="bo-btn pix" @click="copiar(boleto.pixCopyPaste, 'pix')">
        <AppIcon :name="copiado === 'pix' ? 'check' : 'copy'" />
        {{ copiado === 'pix' ? 'Pix copiado!' : 'Copiar Pix' }}
      </button>
      <button v-if="boleto.digitableLine" type="button" class="bo-btn" @click="copiar(boleto.digitableLine, 'linha')">
        <AppIcon :name="copiado === 'linha' ? 'check' : 'copy'" />
        {{ copiado === 'linha' ? 'Código copiado!' : 'Copiar código' }}
      </button>
      <a v-if="linkBoleto" :href="linkBoleto" target="_blank" rel="noopener noreferrer" class="bo-btn">
        <AppIcon name="external" />
        Ver boleto
      </a>
    </div>
    <!-- O "copiado" também para leitor de tela: o texto do botão muda, mas sem
         região viva nada é anunciado. -->
    <span class="sr-only" aria-live="polite">{{ copiado ? 'Copiado para a área de transferência.' : '' }}</span>
  </li>
</template>

<style scoped>
.bo {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
}
.bo.principal {
  border: 2px solid var(--ink);
  padding: 20px;
}
.bo.vencida {
  border-color: #d93636;
}
.bo-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.bo-mes {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-2);
}
.bo-valor {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.principal .bo-valor {
  font-size: 30px;
}
.bo-st,
.bh-st {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--ipe-soft);
  color: #6b4e00;
}
.bo-st.vencida,
.bh-st.vencida {
  background: #fdecec;
  color: #9f1c1c;
}
.bh-st.paga {
  background: #e3f3e8;
  color: #1c6b3a;
}
.bh-st.cancelada {
  background: var(--line);
  color: var(--ink-2);
}
.bo-venc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--ink-2);
}
.bo-aviso {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fdecec;
  color: #9f1c1c;
  font-size: 13px;
  line-height: 1.45;
}
.bo-aviso :deep(svg) {
  flex: none;
  margin-top: 1px;
}
.bo-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.bo-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.bo-btn:hover {
  border-color: var(--ink);
}
.bo-btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.bo-btn.pix {
  border-color: var(--ipe);
  background: var(--ipe);
}
.bo-btn.pix:hover {
  border-color: var(--ipe-hover);
  background: var(--ipe-hover);
}
/* No celular: Pix na linha inteira (é o botão que o polegar procura) e os
   outros dois lado a lado, com a mesma largura. Em flex, cada um quebrava
   numa largura diferente e o bloco parecia desmontado. */
@media (max-width: 480px) {
  .bo-acoes {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .bo-btn {
    justify-content: center;
    padding: 0 10px;
    font-size: 13px;
  }
  .bo-btn.pix {
    grid-column: 1 / -1;
    font-size: 15px;
  }
}

.bh {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 4px 14px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.bh:last-child {
  border-bottom: 0;
}
.bh-mes {
  font-weight: 600;
}
/* "Setembro de 2026", não "Setembro De 2026": `capitalize` pegaria cada
   palavra. */
.bh-mes::first-letter {
  text-transform: uppercase;
}
.bh-venc {
  grid-column: 1;
  grid-row: 2;
  font-size: 12px;
  color: var(--muted);
}
.bh-valor {
  grid-row: 1 / span 2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bh-st {
  grid-row: 1 / span 2;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
