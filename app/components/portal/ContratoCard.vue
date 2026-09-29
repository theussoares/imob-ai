<script setup lang="ts">
import type { ContractForClient } from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS } from '~~/shared/models/portal'

/**
 * Um contrato na lista "Meus contratos".
 *
 * Aluguel, vencimento e término já no cartão: são as três perguntas que fazem o
 * inquilino abrir o portal ("quanto", "quando", "até quando"), e responder aqui
 * poupa um toque em quem só veio conferir.
 */
const props = defineProps<{ contrato: ContractForClient }>()

const ativo = computed(() => props.contrato.status === 'ativo')
const titulo = computed(() => props.contrato.addressLabel || `Contrato ${props.contrato.code}`)
</script>

<template>
  <NuxtLink :to="`/area-cliente/contratos/${contrato.id}`" class="cc" :class="{ encerrado: !ativo }">
    <div class="cc-topo">
      <span class="cc-status" :class="ativo ? 'ativo' : 'fim'">{{ ativo ? 'Ativo' : 'Encerrado' }}</span>
      <span class="cc-cod">{{ contrato.code }}</span>
    </div>

    <h2 class="cc-tit">{{ titulo }}</h2>

    <ul class="cc-papeis" aria-label="Seu papel neste contrato">
      <li v-for="r in contrato.roles" :key="r">{{ CONTRACT_PARTY_LABELS[r] }}</li>
    </ul>

    <dl class="cc-fatos">
      <div>
        <dt>Aluguel</dt>
        <dd>{{ dinheiroBR(contrato.rentAmount) }}</dd>
      </div>
      <div>
        <dt>Vencimento</dt>
        <dd>{{ contrato.dueDay ? `todo dia ${contrato.dueDay}` : '—' }}</dd>
      </div>
      <div>
        <dt>Término</dt>
        <dd>{{ dataBR(contrato.endsOn) }}</dd>
      </div>
    </dl>

    <span class="cc-abrir">
      Ver contrato e documentos
      <AppIcon name="arrow-right" />
    </span>
  </NuxtLink>
</template>

<style scoped>
.cc {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.cc:hover {
  border-color: var(--ink);
  box-shadow: var(--portal-shadow);
}
.cc:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}
.cc.encerrado {
  background: #f6f5f1;
}
.cc-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cc-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.cc-status::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.cc-status.ativo {
  background: #e3f3e8;
  color: #1c6b3a;
}
.cc-status.fim {
  background: var(--line);
  color: var(--ink-2);
}
.cc-cod {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.cc-tit {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}
.cc-papeis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -4px 0 0;
  padding: 0;
  list-style: none;
}
.cc-papeis li {
  padding: 2px 9px;
  border-radius: 6px;
  background: var(--ipe-soft);
  color: #6b4e00;
  font-size: 12px;
  font-weight: 700;
}
.cc-papeis li::first-letter {
  text-transform: uppercase;
}
.cc-fatos {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 4px 0 0;
  padding: 14px 0 0;
  border-top: 1px solid var(--line);
}
.cc-fatos dt {
  font-size: 12px;
  color: var(--muted);
}
.cc-fatos dd {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cc-abrir {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--ipe);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
.cc-abrir :deep(svg) {
  transition: transform 0.18s ease;
}
.cc:hover .cc-abrir :deep(svg) {
  transform: translateX(3px);
}
@media (max-width: 420px) {
  .cc-fatos {
    grid-template-columns: 1fr 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cc,
  .cc-abrir :deep(svg) {
    transition: none;
  }
}
</style>
