<script setup lang="ts">
import { rotuloImovel } from '../../domain/imoveis'

const store = useGestaoStore()
// A lista de imóveis só é buscada quando este formulário abre (as listas de contratos não a carregam).
onMounted(() => void store.carregar(false, ['imoveis']))
const { sessao } = useGestaoSessao()
const toast = useToast()

// Imóvel só de venda não aparece: não faria sentido abrir locação dele.
const opcoes = computed(() => store.imoveis.value.filter((i) => i.purpose === 'aluguel'))

const dialog = ref<HTMLDialogElement | null>(null)
const imovelId = ref('')
const locador = ref('')
const locatario = ref('')
const corretorId = ref('')
const erro = ref('')

// Corretor logado abre locação só em nome próprio: escolher outro faria a locação
// sumir da própria lista («corretor vê só as suas»).
const travado = computed(() => sessao.value?.perfil === 'corretor')

function abrir() {
  imovelId.value = opcoes.value[0]?.id ?? ''
  locador.value = locatario.value = erro.value = ''
  corretorId.value = sessao.value?.corretorId ?? store.corretores.value[0]?.id ?? ''
  dialog.value?.showModal()
}

function fechar() {
  if (dialog.value?.open) dialog.value.close()
}

async function enviar() {
  const imovel = store.imoveis.value.find((i) => i.id === imovelId.value)
  const r = await store.abrirLocacao({
    locador: locador.value,
    locatario: locatario.value,
    imovelId: imovelId.value,
    imovel: imovel ? rotuloImovel(imovel) : '',
    corretorId: corretorId.value,
  })
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  const nova = r.locacao!
  fechar()
  toast.success(`Locação ${nova.id} aberta.`)
  await navigateTo(`/gestao/locacao/${nova.id}`)
}

defineExpose({ abrir })

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(480px,calc(100vw-32px))] rounded-[14px] border-0 bg-[var(--paper)] p-0 text-[var(--ink)] shadow-[var(--shadow-lg)] backdrop:bg-black/45"
    aria-labelledby="nova-locacao-titulo"
    data-testid="modal-nova-locacao"
    @click.self="fechar"
  >
    <form class="[display:grid] gap-3 p-5" novalidate @submit.prevent="enviar">
      <h2 id="nova-locacao-titulo" class="text-[length:var(--fs-title-sm)] leading-snug font-bold">Nova locação</h2>
      <label :class="rotulo">
        Imóvel
        <select v-model="imovelId" :class="campo" data-testid="imovel">
          <option v-for="i in opcoes" :key="i.id" :value="i.id">{{ rotuloImovel(i) }}</option>
        </select>
      </label>
      <label :class="rotulo">
        Locador (proprietário)
        <input v-model="locador" :class="campo" type="text" autocomplete="off" data-testid="locador" />
      </label>
      <label :class="rotulo">
        Locatário (inquilino)
        <input v-model="locatario" :class="campo" type="text" autocomplete="off" data-testid="locatario" />
      </label>
      <label :class="rotulo">
        Corretor
        <select v-model="corretorId" :class="campo" :disabled="travado">
          <option v-for="c in store.corretores.value" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
      <p v-if="erro" role="alert" class="rounded-lg bg-[#fee2e2] px-3 py-2 text-[length:var(--fs-label)] font-bold text-[#7f1d1d]">
        {{ erro }}
      </p>
      <div class="mt-1 flex justify-end gap-2">
        <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="fechar">
          Cancelar
        </button>
        <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90">
          Abrir locação
        </button>
      </div>
    </form>
  </dialog>
</template>
