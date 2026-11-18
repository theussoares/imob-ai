<script setup lang="ts">
import { ACEITA_ARQUIVO, CATEGORIAS } from '../../domain/documentos'
import type { CategoriaDocumento } from '../../domain/types'

defineProps<{
  /** Erro devolvido por `enviarDocumento`, mostrado como veio. */
  erro: string
}>()

const emit = defineEmits<{
  enviar: [dados: { arquivo: File | null; categoria: CategoriaDocumento; processoId: string; tipo: 'venda' | 'locacao' }]
}>()

const dialogo = ref<HTMLDialogElement | null>(null)
const arquivo = ref<File | null>(null)
const categoria = ref<CategoriaDocumento>('pessoas')
const processoId = ref('')
/** Venda ou locação: decide de onde vêm as opções e para onde o documento vai. */
const tipo = ref<'venda' | 'locacao'>('venda')
const entrada = ref<HTMLInputElement | null>(null)

const CATEGORIAS_ESCOLHA = CATEGORIAS.filter((c) => c.chave !== 'todas') as { chave: CategoriaDocumento; rotulo: string }[]

/**
 * `<dialog>` nativo com `showModal()`: foco preso, Esc e backdrop vêm do
 * navegador. Modal feito à mão sem focus trap seria pior que não ter modal.
 * `inicial` pré-seleciona o processo quando a tela veio de `?processo=`.
 */
function abrir(inicial = '') {
  arquivo.value = null
  categoria.value = 'pessoas'
  processoId.value = inicial
  // O id diz o tipo: `L-…` é locação (a tela pode abrir já num processo, vindo de `?processo=`).
  tipo.value = inicial.startsWith('L-') ? 'locacao' : 'venda'
  rotuloEscolhido.value = inicial
  buscaProcesso.value = ''
  pagina.value = 1
  void buscar()
  dialogo.value?.showModal()
}

// --- escolha do processo: busca paginada no servidor ------------------------------------------
// A carteira pode passar dos 200 processos que o store guarda, e um `<select>` com todos não escala. O
// seletor pede a página ao mesmo endpoint das listas (só os visíveis a quem pergunta) e filtra pelo que
// a pessoa digita (código, imóvel, nome, CPF).
const store = useGestaoStore()
const buscaProcesso = ref('')
const pagina = ref(1)
const opcoes = ref<{ id: string; rotulo: string }[]>([])
const paginas = ref(1)
const total = ref(0)
const falhouBusca = ref(false)
const rotuloEscolhido = ref('')

let seq = 0
async function buscar() {
  const minha = ++seq
  falhouBusca.value = false
  try {
    const f = { pagina: pagina.value, q: buscaProcesso.value, status: '' }
    const r = tipo.value === 'venda' ? await store.paginaDeVendas(f) : await store.paginaDeLocacoes(f)
    if (minha !== seq) return
    opcoes.value = r.itens.map((p) => ({ id: p.id, rotulo: `${p.id} · ${p.imovel}` }))
    paginas.value = r.paginas
    total.value = r.total
    const atual = opcoes.value.find((o) => o.id === processoId.value)
    if (atual) rotuloEscolhido.value = atual.rotulo
  } catch {
    if (minha === seq) falhouBusca.value = true
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(buscaProcesso, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagina.value = 1
    void buscar()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

// Trocar o tipo troca a lista de onde se escolhe; o processo escolhido era de outro tipo e sai.
watch(tipo, () => {
  processoId.value = ''
  rotuloEscolhido.value = ''
  buscaProcesso.value = ''
  pagina.value = 1
  void buscar()
})

function irPara(p: number) {
  pagina.value = p
  void buscar()
}

function escolher(o: { id: string; rotulo: string }) {
  processoId.value = o.id
  rotuloEscolhido.value = o.rotulo
}

function fechar() {
  dialogo.value?.close()
}

function escolheu(e: Event) {
  arquivo.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

defineExpose({ abrir, fechar })

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
const rotulo = 'mb-1 block text-[length:var(--fs-label)] font-bold'
</script>

<template>
  <dialog
    ref="dialogo"
    class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-[var(--ink)] backdrop:bg-black/50"
    aria-labelledby="enviar-doc-titulo"
    data-testid="modal-enviar"
  >
    <form class="flex flex-col gap-4" @submit.prevent="emit('enviar', { arquivo, categoria, processoId, tipo })">
      <h2 id="enviar-doc-titulo" class="text-[length:var(--fs-title-sm)] font-extrabold">Enviar documento</h2>

      <div>
        <label for="enviar-doc-arquivo" :class="rotulo">Arquivo</label>
        <input
          id="enviar-doc-arquivo"
          ref="entrada"
          type="file"
          :accept="ACEITA_ARQUIVO"
          :class="[campo, 'py-2']"
          aria-describedby="enviar-doc-ajuda"
          @change="escolheu"
        />
        <p id="enviar-doc-ajuda" class="mt-1 text-[length:var(--fs-caption)] text-[var(--ink-soft)]">
          PDF, JPG, PNG ou WEBP, até 15 MB.
        </p>
      </div>

      <div>
        <label for="enviar-doc-categoria" :class="rotulo">Categoria</label>
        <select id="enviar-doc-categoria" v-model="categoria" :class="campo">
          <option v-for="c in CATEGORIAS_ESCOLHA" :key="c.chave" :value="c.chave">{{ c.rotulo }}</option>
        </select>
      </div>

      <div>
        <label for="enviar-doc-tipo" :class="rotulo">Tipo de contrato</label>
        <select id="enviar-doc-tipo" v-model="tipo" :class="campo" data-testid="enviar-doc-tipo">
          <option value="venda">Venda</option>
          <option value="locacao">Locação</option>
        </select>
      </div>

      <div>
        <label for="enviar-doc-processo" :class="rotulo">Contrato</label>
        <input
          id="enviar-doc-processo"
          v-model="buscaProcesso"
          type="search"
          :class="campo"
          placeholder="Buscar por código, imóvel, nome ou CPF"
          autocomplete="off"
          aria-describedby="enviar-doc-processo-escolhido"
          data-testid="enviar-doc-busca-processo"
        />
        <p id="enviar-doc-processo-escolhido" class="mt-1 text-[length:var(--fs-caption)] text-[var(--ink-soft)]" aria-live="polite" data-testid="enviar-doc-processo-escolhido">
          {{ processoId ? `Escolhido: ${rotuloEscolhido}` : 'Nenhum contrato escolhido.' }}
        </p>
        <p v-if="falhouBusca" role="alert" class="mt-2 font-semibold text-[#7f1d1d]">
          Não foi possível buscar os contratos.
          <button type="button" class="cursor-pointer font-bold underline" @click="buscar">Tentar de novo</button>
        </p>
        <ul v-else class="m-0 mt-2 flex max-h-48 list-none flex-col gap-1 overflow-y-auto p-0" role="listbox" aria-label="Contratos" data-testid="enviar-doc-opcoes">
          <li v-for="o in opcoes" :key="o.id" role="option" :aria-selected="o.id === processoId">
            <button
              type="button"
              :class="[
                'min-h-11 w-full cursor-pointer rounded-[10px] border px-3 text-left',
                o.id === processoId ? 'border-[var(--brand)] bg-[var(--brand-ghost)] font-bold' : 'border-[var(--line-2)] bg-[var(--paper)] hover:bg-[var(--brand-ghost)]',
              ]"
              @click="escolher(o)"
            >
              {{ o.rotulo }}
            </button>
          </li>
          <li v-if="!opcoes.length" class="px-1 text-[var(--ink-soft)]">Nenhum contrato encontrado.</li>
        </ul>
        <GestaoPaginacao class="mt-2" :pagina="pagina" :paginas="paginas" :total="total" rotulo="contratos" @ir="irPara" />
      </div>

      <p v-if="erro" role="alert" class="rounded-lg bg-[#fee2e2] px-3 py-2 font-semibold text-[#7f1d1d]">
        {{ erro }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]"
          @click="fechar"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
        >
          Enviar
        </button>
      </div>
    </form>
  </dialog>
</template>
