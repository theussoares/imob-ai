<script setup lang="ts">
import type { ContractForClient } from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS } from '~~/shared/models/portal'
import { classificarFalha, MENSAGEM_DE_FALHA } from '~~/shared/utils/session-error'

definePageMeta({ layout: 'portal', middleware: 'portal' })

const contratos = ref<ContractForClient[]>([])
const carregando = ref(true)
const erro = ref('')

onMounted(async () => {
  try {
    contratos.value = await portalFetch<ContractForClient[]>('/api/portal/contratos')
  } catch (e: unknown) {
    erro.value = MENSAGEM_DE_FALHA[classificarFalha(e)]
  } finally {
    carregando.value = false
  }
})

/** "Você é o inquilino" / "Você é o proprietário e o fiador". */
function papeis(c: ContractForClient): string {
  const nomes = c.roles.map((r) => CONTRACT_PARTY_LABELS[r])
  if (nomes.length === 1) return `Você é o ${nomes[0]}`
  return `Você é o ${nomes.slice(0, -1).join(', ')} e o ${nomes[nomes.length - 1]}`
}

function titulo(c: ContractForClient): string {
  return c.addressLabel || `Contrato ${c.code}`
}

useHead({
  title: 'Meus contratos · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div>
    <h1 class="tit">Meus contratos</h1>

    <p v-if="carregando" class="muted">Carregando…</p>
    <p v-else-if="erro" class="erro" role="alert">{{ erro }}</p>

    <!--
      Estado vazio com instrução, não área em branco: quem chega aqui sem
      contrato precisa saber a quem falar, senão conclui que o portal quebrou.
    -->
    <div v-else-if="!contratos.length" class="vazio">
      <p><b>Nenhum contrato por aqui ainda.</b></p>
      <p>Se você já assinou um contrato, fale com a imobiliária para vinculá-lo ao seu acesso.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="c in contratos" :key="c.id">
        <NuxtLink :to="`/area-cliente/contratos/${c.id}`" class="cartao">
          <span class="cartao-tit">{{ titulo(c) }}</span>
          <span class="cartao-sub">{{ papeis(c) }}</span>
          <span v-if="c.status === 'encerrado'" class="tag">Encerrado</span>
          <span class="cartao-seta" aria-hidden="true">→</span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tit {
  font-size: 22px;
  margin: 4px 0 16px;
}
.muted {
  font-size: 14px;
  color: #6b7280;
}
.erro {
  color: #b91c1c;
  font-size: 14px;
}
.vazio {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  font-size: 14px;
  color: #4b5563;
}
.vazio p {
  margin: 0 0 6px;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.cartao {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 2px 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  text-decoration: none;
  color: inherit;
}
.cartao:hover {
  border-color: var(--brand);
}
.cartao-tit {
  font-weight: 600;
  font-size: 15px;
}
.cartao-sub {
  grid-column: 1;
  font-size: 13px;
  color: #6b7280;
}
.tag {
  grid-column: 1;
  justify-self: start;
  margin-top: 6px;
  font-size: 11px;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 2px 9px;
  color: #4b5563;
}
.cartao-seta {
  grid-row: 1 / span 2;
  grid-column: 2;
  color: #9ca3af;
}
</style>
