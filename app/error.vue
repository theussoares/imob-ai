<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()
</script>

<template>
  <div style="min-height: 70vh; display: grid; place-items: center; padding: 40px 18px; text-align: center">
    <div>
      <p class="eyebrow"><span class="dot" />Ops</p>
      <h1 style="font-size: 40px; margin: 16px 0 8px">
        {{ error.statusCode === 404 ? 'Página não encontrada' : 'Algo deu errado' }}
      </h1>
      <p style="color: var(--ink-soft); max-width: 40ch; margin: 0 auto 22px">
        {{ error.statusCode === 404 ? 'O conteúdo que você procura não existe ou foi movido.' : 'Tente novamente em instantes.' }}
      </p>
      <button class="admin-btn" @click="clearError({ redirect: '/' })">Voltar ao início</button>
    </div>
  </div>
</template>
