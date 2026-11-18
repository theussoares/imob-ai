<script setup lang="ts">
import { MENU, menuVisivel, PERFIS } from '../../domain/permissions'

const route = useRoute()
const tenant = useTenant()
const { sessao, sair } = useGestaoSessao()
const store = useGestaoStore()
const toast = useToast()

await store.carregar()

const itens = computed(() =>
  sessao.value ? MENU.filter((m) => menuVisivel(store.matriz.value, sessao.value!.perfil, m.chave)) : [],
)

// '/gestao' (dashboard) só fica ativo exato; as demais por prefixo.
const ativo = (rota: string) => (rota === '/gestao' ? route.path === '/gestao' : route.path.startsWith(rota))

async function trocarPerfil() {
  await sair()
  await navigateTo('/gestao/login')
}

async function restaurarDados() {
  await store.restaurar()
  toast.success('Dados de exemplo restaurados.')
}

const btn =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)]'
</script>

<template>
  <div class="gestao-tema flex min-h-dvh flex-col bg-[var(--surface)] text-[length:var(--fs-ui)] text-[var(--ink)]">
    <a
      href="#gestao-conteudo"
      class="absolute -left-[999px] top-2 z-50 rounded-lg bg-[var(--paper)] px-3 py-2 focus:left-2"
    >
      Ir para o conteúdo
    </a>

    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5 font-extrabold">
        <span
          class="[display:grid] size-8 place-items-center rounded-lg bg-[var(--brand)] font-extrabold text-[var(--gestao-amarelo)]"
          aria-hidden="true"
        >
          {{ (tenant?.name || 'G').slice(0, 1) }}
        </span>
        <span>{{ tenant?.name || 'Gestão' }}</span>
        <span
          v-if="!store.http"
          class="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]"
        >
          Demonstração
        </span>
      </div>
      <div v-if="sessao" class="flex flex-wrap items-center gap-2">
        <span class="mr-1 flex flex-col leading-tight">
          <strong>{{ sessao.nome }}</strong>
          <small class="text-[var(--ink-soft)]">{{ PERFIS[sessao.perfil].nome }}</small>
        </span>
        <button v-if="!store.http" type="button" :class="btn" @click="restaurarDados">Restaurar dados</button>
        <button type="button" :class="btn" @click="trocarPerfil">{{ store.http ? 'Sair' : 'Trocar perfil' }}</button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav
        v-if="sessao"
        class="flex flex-none gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--paper)] p-2 md:w-58 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-3"
        aria-label="Seções do painel"
      >
        <NuxtLink
          v-for="m in itens"
          :key="m.chave"
          :to="m.rota"
          class="flex min-h-11 items-center whitespace-nowrap rounded-[10px] px-3 font-semibold no-underline hover:bg-[var(--surface)]"
          :class="
            ativo(m.rota)
              ? 'bg-[var(--gestao-amarelo)] font-extrabold text-[var(--brand)] shadow-[inset_3px_0_0_var(--brand)]'
              : 'text-[var(--ink-soft)]'
          "
          :aria-current="ativo(m.rota) ? 'page' : undefined"
        >
          {{ m.rotulo }}
        </NuxtLink>
      </nav>

      <main id="gestao-conteudo" class="min-w-0 flex-1 p-3 outline-none md:p-5" tabindex="-1">
        <p
          v-if="store.erroCarga.value"
          role="alert"
          class="m-0 mb-3 rounded-[10px] border border-[var(--danger-line)] bg-[var(--danger-ghost)] px-3 py-2 font-semibold text-[var(--danger)]"
          data-testid="erro-carga"
        >
          {{ store.erroCarga.value }}
          <button type="button" class="ml-2 cursor-pointer font-bold underline" @click="store.carregar(true)">Tentar de novo</button>
        </p>
        <slot />
      </main>
    </div>

    <AdminToasts />
    <AdminConfirmDialog />
  </div>
</template>

<style>
/*
 * Tema do painel: preto, amarelo e cinza, fixo. O tenant customiza o verde do
 * SITE público; o painel interno tem identidade própria, e trocar --brand por
 * tenant mudaria o contraste de todo botão e badge. Os derivados (-ghost, -2)
 * são refeitos aqui porque color-mix() resolve no :root, onde --brand ainda é
 * o do tenant — redefinir só --brand não os atualiza.
 */
.gestao-tema {
  --gestao-amarelo: #facc15;
  --brand: #17171a;
  --brand-2: #2a2a2e;
  --brand-ghost: #fdf3b8;
  --surface: #f4f4f5;
  --paper: #ffffff;
  --ink: #17171a;
  --ink-soft: #52525b;
  --line: #e4e4e7;
  --line-2: #d4d4d8;
}
</style>
