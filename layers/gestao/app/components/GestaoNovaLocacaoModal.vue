<script setup lang="ts">
import { rotuloImovel } from '../../domain/imoveis'
import { errosNovaLocacao, type CampoNovaLocacao } from '../../domain/novo-processo'

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
const erros = ref<Partial<Record<CampoNovaLocacao, string>>>({})
const tentou = ref(false)
const form = () => ({ imovelId: imovelId.value, locador: locador.value, locatario: locatario.value, corretorId: corretorId.value })
watch([imovelId, locador, locatario, corretorId], () => {
  if (!tentou.value) return
  erros.value = errosNovaLocacao(form())
  erro.value = ''
})
const aria = (c: CampoNovaLocacao) => ({ id: `nl-${c}`, 'aria-invalid': (erros.value[c] ? 'true' : undefined) as 'true' | undefined, 'aria-describedby': erros.value[c] ? `nl-e-${c}` : undefined })
const enviando = ref(false)

// Corretor logado abre locação só em nome próprio: escolher outro faria a locação
// sumir da própria lista («corretor vê só as suas»).
const travado = computed(() => sessao.value?.perfil === 'corretor')

function abrir() {
  imovelId.value = ''
  tentou.value = false
  erros.value = {}
  locador.value = locatario.value = erro.value = ''
  corretorId.value = sessao.value?.corretorId ?? store.corretores.value[0]?.id ?? ''
  dialog.value?.showModal()
}

function fechar() {
  if (dialog.value?.open) dialog.value.close()
}

async function enviar() {
  if (enviando.value) return
  erro.value = ''
  enviando.value = true
  try {
    await enviarLocacao()
  } finally {
    enviando.value = false
  }
}

async function enviarLocacao() {
  tentou.value = true
  erros.value = errosNovaLocacao(form())
  const primeiro = Object.keys(erros.value)[0]
  if (primeiro) {
    document.getElementById(`nl-${primeiro}`)?.focus()
    return
  }
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
        <span>Imóvel<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="imovelId" :class="campo" v-bind="aria('imovelId')" required data-testid="imovel">
          <option value="" disabled>Escolha…</option>
          <option v-for="i in opcoes" :key="i.id" :value="i.id">{{ rotuloImovel(i) }}</option>
        </select>
        <span v-if="erros.imovelId" id="nl-e-imovelId" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.imovelId }}</span>
      </label>
      <label :class="rotulo">
        <span>Locador (proprietário)<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="locador" :class="campo" v-bind="aria('locador')" type="text" autocomplete="off" data-testid="locador" />
        <span v-if="erros.locador" id="nl-e-locador" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.locador }}</span>
      </label>
      <label :class="rotulo">
        <span>Locatário (inquilino)<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="locatario" :class="campo" v-bind="aria('locatario')" type="text" autocomplete="off" data-testid="locatario" />
        <span v-if="erros.locatario" id="nl-e-locatario" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.locatario }}</span>
      </label>
      <label :class="rotulo">
        <span>Corretor<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="corretorId" :class="campo" v-bind="aria('corretorId')" :disabled="travado">
          <option v-for="c in store.corretores.value" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
      <p class="m-0 text-[length:var(--fs-caption)] text-[var(--ink-soft)]"><span class="text-[var(--danger)]" aria-hidden="true">*</span> campo obrigatório</p>
      <p v-if="erro" role="alert" class="rounded-lg bg-[#fee2e2] px-3 py-2 text-[length:var(--fs-label)] font-bold text-[#7f1d1d]">
        {{ erro }}
      </p>
      <div class="mt-1 flex justify-end gap-2">
        <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="fechar">
          Cancelar
        </button>
        <button type="submit" :disabled="enviando" :aria-busy="enviando" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
          {{ enviando ? 'Abrindo…' : 'Abrir locação' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
