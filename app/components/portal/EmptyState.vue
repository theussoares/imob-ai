<script setup lang="ts">
/**
 * Estado vazio da Área do Cliente.
 *
 * Área em branco parece bug, e quem está do outro lado não abre chamado — liga
 * para a imobiliária. Então todo vazio aqui diz três coisas: o que está
 * faltando, por que pode estar faltando, e qual é o próximo passo real.
 *
 * O próximo passo é quase sempre "falar com a imobiliária", porque o cliente
 * não tem nenhuma ação dentro do portal que resolva um documento que ninguém
 * publicou. O botão só aparece se a imobiliária tiver WhatsApp cadastrado — um
 * botão que não leva a lugar nenhum seria pior que a ausência dele.
 */
const props = defineProps<{
  titulo: string;
  descricao: string;
  /** Assunto que vai na mensagem pronta do WhatsApp. */
  assunto?: string;
}>();

const tenant = useTenant();

const whatsappLink = computed(() => {
  const numero = (tenant.value?.whatsapp || "").replace(/\D/g, "");
  if (!numero) return "";
  const msg = props.assunto
    ? `Olá! Sou cliente e preciso de ajuda com ${props.assunto}.`
    : "Olá! Sou cliente e preciso de ajuda com a área do cliente.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
});
</script>

<template>
  <div class="pc-vazio">
    <p class="pc-vazio-t">{{ titulo }}</p>
    <p class="pc-vazio-d">{{ descricao }}</p>
    <a
      v-if="whatsappLink"
      class="pc-vazio-cta"
      :href="whatsappLink"
      target="_blank"
      rel="noopener"
    >
      Falar com a imobiliária
    </a>
  </div>
</template>

<style scoped>
.pc-vazio {
  border: 1px dashed #d8e0dc;
  border-radius: 12px;
  padding: 22px 18px;
  text-align: center;
}
.pc-vazio-t {
  margin: 0 0 6px;
  font-weight: 600;
  color: var(--brand);
}
.pc-vazio-d {
  margin: 0;
  font-size: 0.9rem;
  color: #5c6b67;
  line-height: 1.5;
  text-wrap: pretty;
}
.pc-vazio-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 16px;
  padding: 11px 18px;
  border-radius: 9px;
  border: 1px solid var(--brand);
  color: var(--brand);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
  /* Alvo de toque: o portal é usado no celular por padrão, não por exceção. */
  min-height: 46px;
}
.pc-vazio-cta:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
</style>
