<script setup lang="ts">
/**
 * Recarregar a tela, para o painel instalado como app.
 *
 * Em janela própria não há barra de endereço nem botão de recarregar, e o
 * "puxar para atualizar" não existe nesse modo — nem no Android, nem no iOS. O
 * único jeito de ver um lead novo ou um dado corrigido era fechar o app pela
 * tela de recentes. No navegador comum o botão sobra, então só aparece
 * instalado.
 *
 * Se já há versão nova esperando, recarregar pela versão velha seria perder a
 * chance: o botão aplica a atualização, que também recarrega.
 */
const { instalado } = usePwaInstall()
const { temAtualizacao, aplicarAtualizacao } = usePwaUpdate()
const recarregando = ref(false)

async function recarregar() {
  recarregando.value = true
  if (temAtualizacao.value) await aplicarAtualizacao()
  else window.location.reload()
}
</script>

<template>
  <button
    v-if="instalado"
    class="admin-btn ghost"
    type="button"
    :disabled="recarregando"
    @click="recarregar"
  >
    {{ recarregando ? "Recarregando..." : "Recarregar" }}
  </button>
</template>
