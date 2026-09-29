<script setup lang="ts">
import type { ContractForClient } from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS } from '~~/shared/models/portal'

/**
 * Cabeçalho do contrato: o bloco preto no topo da página de detalhe.
 *
 * Preto, e não mais um cartão branco: é a única superfície escura dentro do
 * portal, e marca "este é o seu contrato" antes da lista de boletos e
 * documentos — que é onde a página fica longa e tudo começa a se parecer.
 */
const props = defineProps<{ contrato: ContractForClient }>()

const papeis = computed(() => props.contrato.roles.map((r) => CONTRACT_PARTY_LABELS[r]).join(' e '))
const ativo = computed(() => props.contrato.status === 'ativo')
</script>

<template>
  <section class="cr" aria-labelledby="cr-tit">
    <div class="cr-topo">
      <span class="cr-status" :class="{ fim: !ativo }">{{ ativo ? 'Contrato ativo' : 'Contrato encerrado' }}</span>
      <span class="cr-cod">Nº {{ contrato.code }}</span>
    </div>

    <h1 id="cr-tit" class="cr-tit">{{ contrato.addressLabel || `Contrato ${contrato.code}` }}</h1>
    <p class="cr-papel">Você é o <b>{{ papeis }}</b> neste contrato.</p>

    <dl class="cr-fatos">
      <div class="destaque">
        <dt>Aluguel</dt>
        <dd>{{ dinheiroBR(contrato.rentAmount) }}</dd>
      </div>
      <div>
        <dt>Vencimento</dt>
        <dd>{{ contrato.dueDay ? `Todo dia ${contrato.dueDay}` : '—' }}</dd>
      </div>
      <div>
        <dt>Início</dt>
        <dd>{{ dataBR(contrato.startedOn) }}</dd>
      </div>
      <div>
        <dt>Término</dt>
        <dd>{{ dataBR(contrato.endsOn) }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.cr {
  position: relative;
  padding: 24px;
  border-radius: 18px;
  background:
    radial-gradient(90% 120% at 100% 0%, rgba(244, 180, 0, 0.18), transparent 55%),
    var(--ink);
  color: #e9e7e1;
  overflow: hidden;
}
.cr-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cr-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ipe);
}
.cr-status::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(244, 180, 0, 0.18);
}
.cr-status.fim {
  color: #bdbab2;
}
.cr-status.fim::before {
  box-shadow: none;
}
.cr-cod {
  font-size: 13px;
  color: #a19e96;
  font-variant-numeric: tabular-nums;
}
.cr-tit {
  margin: 14px 0 0;
  font-size: clamp(22px, 4vw, 28px);
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}
.cr-papel {
  margin: 6px 0 0;
  font-size: 15px;
  color: #bdbab2;
}
.cr-papel b {
  color: #fff;
}
.cr-fatos {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 22px 0 0;
  border-radius: 12px;
  overflow: hidden;
  background: #34383d;
}
.cr-fatos div {
  padding: 12px 14px;
  background: #1f2226;
}
.cr-fatos dt {
  font-size: 12px;
  color: #a19e96;
}
.cr-fatos dd {
  margin: 3px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.cr-fatos .destaque dd {
  color: var(--ipe);
}
@media (max-width: 560px) {
  .cr {
    padding: 20px 18px;
  }
  .cr-fatos {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
