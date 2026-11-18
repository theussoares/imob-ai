<script setup lang="ts">
import {
  alterarPermissao,
  DEFINICOES_PERMISSAO,
  matrizPadrao,
  ORDEM_PERFIS,
  PERFIS,
  permissaoFixa,
  ROTULO_VALOR,
} from '../../domain/permissions'
import type { PermChave, PermValor, Perfil } from '../../domain/types'

// Só o Dono chega aqui (a tela de usuários exibe este bloco para `admin`). O Jurídico vê
// os usuários e convida, mas não muda o que cada perfil pode fazer.
const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()

async function mudar(chave: PermChave, perfil: Perfil, valor: PermValor) {
  const r = alterarPermissao(store.matriz.value, chave, perfil, valor)
  if (!r.ok) {
    toast.error(r.erro)
    return
  }
  const g = await store.definirMatriz(r.matriz)
  if (!g.ok) return void toast.error(g.erro)
  toast.success('Permissão atualizada.')
}

async function restaurar() {
  const ok = await askConfirm({
    title: 'Restaurar as permissões padrão?',
    description: 'Todos os perfis voltam ao que o sistema define de fábrica.',
    confirmLabel: 'Restaurar',
    cancelLabel: 'Manter',
    danger: true,
  })
  if (!ok) return
  const g = await store.definirMatriz(matrizPadrao())
  if (!g.ok) return void toast.error(g.erro)
  toast.success('Permissões restauradas.')
}

// No celular a tabela mostra um perfil por vez: com 4 colunas ela estourava a largura e exigia rolagem lateral.
const perfilMovel = ref<Perfil>(ORDEM_PERFIS[0]!)
const col = (p: Perfil) => (p === perfilMovel.value ? '' : 'hidden md:table-cell')
</script>

<template>
  <section class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_1px_2px_rgba(20,22,26,0.05)] md:p-5" aria-labelledby="matriz-titulo">
    <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="matriz-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Permissões por perfil</h2>
        <p class="m-0 text-[var(--ink-soft)]">A mudança vale na hora para o menu e para as telas.</p>
      </div>
      <button
        type="button"
        class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)]"
        data-testid="matriz-restaurar"
        @click="restaurar"
      >
        Restaurar padrão
      </button>
    </div>

    <label class="mb-3 [display:grid] gap-1 text-[length:var(--fs-label)] font-semibold md:hidden">
      Perfil
      <select v-model="perfilMovel" class="min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)]" data-testid="matriz-perfil">
        <option v-for="p in ORDEM_PERFIS" :key="p" :value="p">{{ PERFIS[p].nome }}</option>
      </select>
    </label>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse" data-testid="matriz">
        <caption class="sr-only">Permissões de cada perfil</caption>
        <thead>
          <tr>
            <th class="px-2 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]">Permissão</th>
            <th v-for="p in ORDEM_PERFIS" :key="p" :class="col(p)" class="px-2 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]">
              {{ PERFIS[p].nome }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in DEFINICOES_PERMISSAO" :key="d.chave" class="border-t border-[var(--line)]">
            <th scope="row" class="px-2 py-2 text-left text-[length:var(--fs-ui)] font-semibold">{{ d.rotulo }}</th>
            <td v-for="p in ORDEM_PERFIS" :key="p" :class="col(p)" class="px-2 py-2">
              <!-- Sim/Não vira interruptor; com um terceiro estado ("Só os próprios") vira grupo de chips. -->
              <button
                v-if="d.estados.length === 2 && d.estados.includes('sim') && d.estados.includes('nao')"
                type="button"
                role="switch"
                :aria-checked="store.matriz.value[d.chave][p] === 'sim'"
                :aria-label="`${d.rotulo} — ${PERFIS[p].nome}`"
                :disabled="permissaoFixa(d.chave, p)"
                :title="permissaoFixa(d.chave, p) ? 'O Dono sempre mantém esta permissão.' : undefined"
                class="relative h-7 w-12 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="store.matriz.value[d.chave][p] === 'sim' ? 'bg-[var(--brand)]' : 'bg-[var(--line-2)]'"
                :data-testid="`perm-${d.chave}-${p}`"
                @click="mudar(d.chave, p, store.matriz.value[d.chave][p] === 'sim' ? 'nao' : 'sim')"
              >
                <span
                  class="absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform"
                  :class="store.matriz.value[d.chave][p] === 'sim' ? 'translate-x-5' : ''"
                />
              </button>
              <div v-else role="radiogroup" :aria-label="`${d.rotulo} — ${PERFIS[p].nome}`" class="inline-flex gap-1" :data-testid="`perm-${d.chave}-${p}`">
                <button
                  v-for="e in d.estados"
                  :key="e"
                  type="button"
                  role="radio"
                  :aria-checked="store.matriz.value[d.chave][p] === e"
                  :disabled="permissaoFixa(d.chave, p)"
                  class="min-h-8 cursor-pointer whitespace-nowrap rounded-full border px-2.5 text-[length:var(--fs-caption)] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  :class="store.matriz.value[d.chave][p] === e ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line-2)] text-[var(--ink-soft)]'"
                  @click="mudar(d.chave, p, e)"
                >
                  {{ ROTULO_VALOR[e] }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
