<script setup lang="ts">
import { ORDEM_PERFIS, PERFIS } from '../../../domain/permissions'
import type { Perfil } from '../../../domain/types'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Entrar · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const tenant = useTenant()
const { entrar } = useGestaoSessao()
const escolhido = ref<Perfil | null>(null)

function confirmar() {
  if (!escolhido.value) return
  entrar(escolhido.value)
  navigateTo('/gestao/vendas')
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-[var(--surface)] p-4">
    <form
      class="flex w-full max-w-155 flex-col gap-3.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-7 shadow-[var(--shadow)]"
      @submit.prevent="confirmar"
    >
      <p class="font-extrabold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
      <h1 class="text-[length:var(--fs-title-lg)] font-extrabold">Entrar no sistema</h1>
      <p class="text-[var(--ink-soft)]">Escolha um perfil para ver o que cada pessoa enxerga.</p>

      <fieldset class="grid grid-cols-1 gap-2.5 border-0 p-0 sm:grid-cols-2">
        <legend class="sr-only">Perfil de acesso</legend>
        <label
          v-for="p in ORDEM_PERFIS"
          :key="p"
          class="relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border-[1.5px] p-3.5 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[color-mix(in_srgb,var(--brand)_40%,white)]"
          :class="
            escolhido === p
              ? 'border-[var(--brand)] bg-[var(--brand-ghost)]'
              : 'border-[var(--line-2)]'
          "
        >
          <input
            v-model="escolhido"
            type="radio"
            name="perfil"
            :value="p"
            class="absolute inset-0 cursor-pointer opacity-0"
            :data-testid="`perfil-${p}`"
          />
          <strong>{{ PERFIS[p].nome }}</strong>
          <span class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ PERFIS[p].descricao }}</span>
        </label>
      </fieldset>

      <button
        type="submit"
        class="min-h-12 rounded-xl bg-[var(--brand)] text-[length:var(--fs-body)] font-extrabold text-white enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]"
        :disabled="!escolhido"
        data-testid="entrar"
      >
        {{ escolhido ? `Entrar como ${PERFIS[escolhido].nome}` : 'Escolha um perfil' }}
      </button>
    </form>
  </main>
</template>
