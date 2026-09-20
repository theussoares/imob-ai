<script setup lang="ts">
const { podeInstalar, somenteInstrucao, instalado, instalar } = usePwaInstall();
const mostrandoInstrucao = ref(false);

async function clicar() {
  if (podeInstalar.value) return instalar();
  mostrandoInstrucao.value = !mostrandoInstrucao.value;
}
</script>

<template>
  <!-- Nada a oferecer: ou já está instalado, ou o navegador não permite (e não
       é iOS, onde dá para instalar à mão). -->
  <template v-if="!instalado && (podeInstalar || somenteInstrucao)">
    <button type="button" class="instalar" @click="clicar">
      {{ podeInstalar ? "Instalar app ↓" : "Instalar app ?" }}
    </button>

    <!-- iOS não dispara `beforeinstallprompt`: no iPhone e no iPad a
         instalação é manual, e sem estas três linhas o corretor não descobre
         que ela existe. -->
    <p v-if="mostrandoInstrucao" class="instrucao">
      No iPhone ou iPad, abra este painel no <strong>Safari</strong>, toque em
      <strong>Compartilhar</strong> e escolha
      <strong>Adicionar à Tela de Início</strong>.
    </p>
  </template>
</template>

<style scoped>
.instalar {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  /* Herda o espaçamento dos links da nav para não destoar deles. */
  padding: inherit;
  color: inherit;
}
/* Cores herdadas do contexto, não fixas: este componente aparece na sidebar
   (fundo escuro) e na tela de login (fundo claro). */
.instrucao {
  margin: 4px 10px 8px;
  font-size: 12px;
  line-height: 1.5;
  color: inherit;
  opacity: 0.75;
}
.instrucao strong {
  opacity: 1;
  font-weight: 600;
}
</style>
