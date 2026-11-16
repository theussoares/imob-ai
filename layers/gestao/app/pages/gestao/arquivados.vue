<script setup lang="ts">
import { restaurarProcesso } from '../../../domain/acoes-ciclo'
import { restaurarLocacao } from '../../../domain/acoes-locacao'
import { CORRETORES } from '../../../domain/seed'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Arquivados' })

const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()

await store.carregar()

const podeRestaurar = computed(() => !!store.caps()?.arquivar)
// Arquivados não entram em `visiveis` (a lista de contratos os esconde); aqui o
// filtro é só «arquivado». Quem chega a esta tela já passou pelo guarda de menu.
const arquivados = computed(() => [
  ...store.processos.value
    .filter((p) => p.arquivado)
    .map((p) => ({ tipo: 'venda' as const, id: p.id, status: p.status, titulo: `${p.vendedor.nome} e ${p.comprador.nome}`, imovel: p.imovel, corretorId: p.corretorId, updated: p.updated })),
  ...store.locacoes.value
    .filter((l) => l.arquivado)
    .map((l) => ({ tipo: 'locacao' as const, id: l.id, status: l.status, titulo: `${l.locador.nome} e ${l.locatario.nome}`, imovel: l.imovel, corretorId: l.corretorId, updated: l.updated })),
])
const nomeCorretor = (id: string) => CORRETORES.find((c) => c.id === id)?.nome ?? '—'

async function restaurar(id: string, tipo: 'venda' | 'locacao') {
  const ok = await askConfirm({
    title: `Restaurar o contrato ${id}?`,
    description: `Ele volta para a lista de contratos de ${tipo === 'venda' ? 'venda' : 'locação'}, ainda como somente consulta.`,
    confirmLabel: 'Restaurar',
    cancelLabel: 'Voltar',
  })
  if (!ok) return
  const r = store.aplicar((s, a) => (tipo === 'venda' ? restaurarProcesso(s, id, a) : restaurarLocacao(s, id, a)))
  if (r.ok) toast.success('Contrato restaurado.')
  else toast.error(r.erro)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="m-0 text-[length:var(--fs-title)] font-extrabold">Arquivados</h1>
      <p class="m-0 text-[var(--ink-soft)]">Contratos encerrados que saíram da lista. Nada é apagado: dá para restaurar.</p>
    </div>

    <p
      v-if="!arquivados.length"
      class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink-soft)]"
      data-testid="arquivados-vazio"
    >
      Nenhum contrato arquivado. Contratos concluídos ou cancelados podem ser arquivados na etapa 8.
    </p>

    <ul v-else class="m-0 flex list-none flex-col gap-3 p-0" data-testid="arquivados-lista">
      <li
        v-for="p in arquivados"
        :key="`${p.tipo}-${p.id}`"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
        data-testid="arquivado-item"
        :data-processo-id="p.id"
      >
        <div class="min-w-0">
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <strong>{{ p.id }}</strong>
            <GestaoStatusChip :status="p.status" />
          </div>
          <p class="m-0 font-bold">{{ p.titulo }}</p>
          <p class="m-0 text-[var(--ink-soft)]">{{ p.imovel }} · {{ nomeCorretor(p.corretorId) }} · {{ p.updated }}</p>
        </div>
        <button
          v-if="podeRestaurar"
          type="button"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]"
          data-testid="restaurar-contrato"
          @click="restaurar(p.id, p.tipo)"
        >
          Restaurar contrato
        </button>
      </li>
    </ul>
  </div>
</template>
