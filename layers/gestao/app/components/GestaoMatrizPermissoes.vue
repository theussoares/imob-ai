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

const select =
  'min-h-11 w-full min-w-28 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-2 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]'
</script>

<template>
  <section class="rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5" aria-labelledby="matriz-titulo">
    <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="matriz-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">Permissões por perfil</h2>
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

    <div class="overflow-x-auto">
      <table class="w-full border-collapse" data-testid="matriz">
        <caption class="sr-only">Permissões de cada perfil</caption>
        <thead>
          <tr>
            <th class="px-2 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]">Permissão</th>
            <th v-for="p in ORDEM_PERFIS" :key="p" class="px-2 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]">
              {{ PERFIS[p].nome }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in DEFINICOES_PERMISSAO" :key="d.chave" class="border-t border-[var(--line)]">
            <th scope="row" class="px-2 py-2 text-left text-[length:var(--fs-ui)] font-semibold">{{ d.rotulo }}</th>
            <td v-for="p in ORDEM_PERFIS" :key="p" class="px-2 py-2">
              <select
                :value="store.matriz.value[d.chave][p]"
                :class="select"
                :disabled="permissaoFixa(d.chave, p)"
                :aria-label="`${d.rotulo} — ${PERFIS[p].nome}`"
                :title="permissaoFixa(d.chave, p) ? 'O Dono sempre mantém esta permissão.' : undefined"
                :data-testid="`perm-${d.chave}-${p}`"
                @change="mudar(d.chave, p, ($event.target as HTMLSelectElement).value as PermValor)"
              >
                <option v-for="e in d.estados" :key="e" :value="e">{{ ROTULO_VALOR[e] }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
