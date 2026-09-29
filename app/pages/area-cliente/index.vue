<script setup lang="ts">
import type { ContractForClient } from '~~/shared/models/portal'
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

const tenant = useTenant()

/**
 * Ativos primeiro: o encerrado é consulta de arquivo (o recibo do ano passado),
 * e no alto da lista empurraria para baixo o contrato que a pessoa usa todo mês.
 */
const ordenados = computed(() =>
  [...contratos.value].sort((a, b) => Number(a.status === 'encerrado') - Number(b.status === 'encerrado')),
)

useHead({
  title: 'Meus contratos · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div>
    <header class="topo">
      <h1>Meus contratos</h1>
      <p>Seu aluguel com a {{ tenant?.name || 'imobiliária' }}: contratos, boletos e documentos.</p>
    </header>

    <!-- Esqueleto com a forma do cartão, e não "Carregando…": a lista chega em
         meio segundo e o texto piscava; o esqueleto ocupa o mesmo lugar e a
         página não pula quando o conteúdo entra. -->
    <div v-if="carregando" class="lista" aria-busy="true" aria-label="Carregando seus contratos">
      <div v-for="i in 2" :key="i" class="esqueleto" />
    </div>

    <p v-else-if="erro" class="erro" role="alert">
      <AppIcon name="alert" />
      {{ erro }}
    </p>

    <!--
      Estado vazio com instrução, não área em branco: quem chega aqui sem
      contrato precisa saber a quem falar, senão conclui que o portal quebrou.
    -->
    <div v-else-if="!contratos.length" class="vazio">
      <span class="vazio-ic"><AppIcon name="contract" /></span>
      <b>Nenhum contrato por aqui ainda</b>
      <p>Se você já assinou um contrato, fale com a {{ tenant?.name || 'imobiliária' }} para vinculá-lo ao seu acesso.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="c in ordenados" :key="c.id">
        <PortalContratoCard :contrato="c" />
      </li>
    </ul>

    <PortalAjuda />
  </div>
</template>

<style scoped>
.topo {
  margin: 6px 0 22px;
}
.topo h1 {
  margin: 0;
  font-size: clamp(26px, 5vw, 32px);
  font-weight: 700;
  line-height: 1.15;
}
.topo p {
  margin: 6px 0 0;
  font-size: 15px;
  color: var(--muted);
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: 14px;
}
.esqueleto {
  height: 214px;
  border-radius: 16px;
  background: linear-gradient(100deg, #efeee9 30%, #f7f6f2 50%, #efeee9 70%) 0 0 / 300% 100%;
  animation: brilho 1.4s ease-in-out infinite;
}
@keyframes brilho {
  to {
    background-position: -150% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .esqueleto {
    animation: none;
  }
}
.erro {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fdecec;
  color: #9f1c1c;
  font-size: 15px;
}
.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 24px;
  border: 1px dashed var(--line-2);
  border-radius: 16px;
  background: #fff;
  text-align: center;
}
.vazio-ic {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 6px;
  border-radius: 14px;
  background: var(--ipe-soft);
  color: #6b4e00;
  font-size: 24px;
}
.vazio b {
  font-size: 17px;
}
.vazio p {
  margin: 0;
  max-width: 42ch;
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink-2);
}
</style>
