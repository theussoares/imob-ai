<script setup lang="ts">
/**
 * O mesmo aviso do painel, no vocabulário de quem está do outro lado.
 *
 * Sessão expirada que vira tela branca é o que mais gera "não está funcionando"
 * — e aqui o efeito é pior que no painel: o inquilino não tem com quem abrir
 * chamado, ele liga para a imobiliária. O texto diz o que aconteceu e o que
 * fazer, sem jargão e sem culpar a pessoa.
 */
const { expired, reconnect } = useSessionExpired("portal");
const saindo = ref(false);

async function entrarDeNovo() {
  saindo.value = true;
  await reconnect();
}
</script>

<template>
  <div v-if="expired" class="pc-expirou" role="alert">
    <p>
      <strong>Sua sessão expirou.</strong>
      Entre de novo para continuar vendo seus contratos.
    </p>
    <button
      type="button"
      class="pc-btn"
      :disabled="saindo"
      @click="entrarDeNovo"
    >
      {{ saindo ? "Saindo…" : "Entrar de novo" }}
    </button>
  </div>
</template>

<style scoped>
.pc-expirou {
  background: #fbeee7;
  border: 1px solid #f0d6c6;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 16px;
  color: #7a2a08;
  font-size: 0.92rem;
}
.pc-expirou p {
  margin: 0 0 12px;
  line-height: 1.45;
}
/* O botão herda `.pc-btn` do layout (altura de toque, foco visível). Só o
   `margin-top` do layout não serve aqui, porque o parágrafo já dá o respiro. */
.pc-expirou .pc-btn {
  margin-top: 0;
  width: 100%;
}
</style>
