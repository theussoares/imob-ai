<script setup lang="ts">
const tenant = useTenant()

// Prédios da animação: altura (% do painel) e atraso. Fixos no código, e não
// sorteados, para o SSR e o cliente renderizarem igual (sem erro de hidratação).
const predios = [
  { h: 34, d: 0 }, { h: 52, d: 0.15 }, { h: 41, d: 0.3 }, { h: 68, d: 0.45 },
  { h: 47, d: 0.6 }, { h: 58, d: 0.75 }, { h: 38, d: 0.9 }, { h: 63, d: 1.05 },
]
</script>

<template>
  <div class="[display:grid] min-h-dvh bg-[var(--surface)] lg:grid-cols-[1.05fr_1fr]">
    <aside
      class="relative hidden overflow-hidden bg-[var(--brand)] p-12 text-white lg:flex lg:flex-col"
      aria-hidden="true"
    >
      <div class="relative z-10 flex items-center gap-2.5 font-bold">
        <span class="[display:grid] size-9 place-items-center rounded-[9px] bg-[var(--gestao-amarelo)] font-bold text-[var(--brand)]">
          {{ (tenant?.name || 'G').slice(0, 1) }}
        </span>
        {{ tenant?.name || 'Gestão' }}
      </div>

      <div class="relative z-10 mt-20 max-w-sm">
        <p class="m-0 text-[length:var(--fs-display)] leading-tight font-bold">
          Vendas e locações <span class="text-[var(--gestao-amarelo)]">sob controle</span>, em um só lugar.
        </p>
        <p class="mt-4 mb-0 text-[#a1a1aa]">Imóveis, contratos e financeiro com acesso por perfil.</p>
      </div>

      <div class="auth-skyline absolute inset-x-0 bottom-0 flex h-[38%] items-end gap-3 px-12">
        <span
          v-for="(p, i) in predios"
          :key="i"
          class="auth-predio relative flex-1 rounded-t-md bg-[#26262a]"
          :style="{ height: p.h + '%', animationDelay: p.d + 's' }"
        >
          <span class="auth-janela absolute top-3 left-1/2 h-1.5 w-3/5 -translate-x-1/2 rounded-sm bg-[var(--gestao-amarelo)]" :style="{ animationDelay: p.d + 1.2 + 's' }" />
          <span class="auth-janela absolute top-8 left-1/2 h-1.5 w-3/5 -translate-x-1/2 rounded-sm bg-[var(--gestao-amarelo)]" :style="{ animationDelay: p.d + 2 + 's' }" />
        </span>
      </div>
    </aside>

    <main class="[display:grid] place-items-center p-4">
      <slot />
    </main>
  </div>
</template>

<style>
/* Os prédios crescem em sequência e as janelas piscam devagar. Quem pede menos
   movimento no sistema vê a cena parada e completa. */
.auth-predio {
  transform-origin: bottom;
  animation: auth-sobe 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.auth-janela {
  animation: auth-pisca 4s ease-in-out infinite;
}
@keyframes auth-sobe {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
@keyframes auth-pisca {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@media (prefers-reduced-motion: reduce) {
  .auth-predio, .auth-janela { animation: none; }
}
</style>
