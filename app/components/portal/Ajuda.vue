<script setup lang="ts">
/**
 * "Fale com a imobiliária", no fim das telas do portal.
 *
 * O canal é o WhatsApp da imobiliária, o mesmo do site: chamado e chat dentro
 * do portal ficaram fora do escopo por decisão (a imobiliária já atende por
 * lá). Sem WhatsApp cadastrado, o bloco não aparece — um botão para lugar
 * nenhum seria pior que nada.
 *
 * O código do contrato vai na mensagem pronta: é o que a imobiliária precisa
 * para achar o caso, e o inquilino raramente sabe de cor.
 */
const props = defineProps<{ codigo?: string }>()
const tenant = useTenant()

const link = computed(() => {
  const wa = onlyDigits(tenant.value?.whatsapp)
  if (!wa) return null
  const msg = props.codigo
    ? `Olá! Sou cliente e tenho uma dúvida sobre o contrato ${props.codigo}.`
    : 'Olá! Sou cliente e tenho uma dúvida sobre o meu contrato.'
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
})
</script>

<template>
  <aside v-if="link" class="aj">
    <div>
      <b>Ficou alguma dúvida?</b>
      <p>A {{ tenant?.name || 'imobiliária' }} responde pelo WhatsApp.</p>
    </div>
    <a :href="link" target="_blank" rel="noopener noreferrer" class="aj-btn">
      <AppIcon name="wa" />
      Falar no WhatsApp
    </a>
  </aside>
</template>

<style scoped>
.aj {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 32px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--ipe-soft);
}
.aj b {
  font-size: 16px;
}
.aj p {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--ink-2);
}
.aj-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}
.aj-btn:hover {
  background: var(--ink-2);
}
.aj-btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
</style>
