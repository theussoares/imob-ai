<script setup lang="ts">
import { completarProcesso, validarContato, validarPdf } from '../../domain/novo-processo'
import { CORRETORES } from '../../domain/seed'

const store = useGestaoStore()
const { sessao } = useGestaoSessao()
const toast = useToast()

const dialog = ref<HTMLDialogElement | null>(null)
const imovel = ref('')
const vendedor = ref('')
const comprador = ref('')
const corretorId = ref('')
const telVendedor = ref('')
const emailVendedor = ref('')
const telComprador = ref('')
const emailComprador = ref('')
const arquivo = ref<File | null>(null)
const erro = ref('')

// Corretor logado abre processo só em nome próprio: deixar escolher outro
// furaria a regra «corretor vê só os seus» (ele criaria um processo que some
// da própria lista). Os demais perfis escolhem.
const travado = computed(() => sessao.value?.perfil === 'corretor')

function abrir() {
  imovel.value = ''
  vendedor.value = ''
  comprador.value = ''
  telVendedor.value = emailVendedor.value = telComprador.value = emailComprador.value = ''
  arquivo.value = null
  erro.value = ''
  corretorId.value = sessao.value?.corretorId ?? CORRETORES[0]?.id ?? ''
  // showModal() e não `open`: só ele dá focus trap, Esc e backdrop nativos.
  dialog.value?.showModal()
}

function fechar() {
  if (dialog.value?.open) dialog.value.close()
}

function escolherArquivo(e: Event) {
  arquivo.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function enviar() {
  // Valida antes de criar: senão o processo nasceria e o erro de formato
  // deixaria o usuário reenviando um formulário que já criou o registro.
  const invalido =
    validarContato('vendedor', { telefone: telVendedor.value, email: emailVendedor.value }) ??
    validarContato('comprador', { telefone: telComprador.value, email: emailComprador.value }) ??
    validarPdf(arquivo.value)
  if (invalido) {
    erro.value = invalido
    return
  }
  const r = store.aplicar((e, ator) =>
    store.acoes.abrirProcesso(
      e,
      {
        imovel: imovel.value,
        vendedor: vendedor.value,
        comprador: comprador.value,
        corretorId: corretorId.value,
      },
      ator,
    ),
  )
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  // O processo novo entra na frente da lista (acoes.abrirProcesso).
  const novo = r.estado.processos[0]!
  // No demo o PDF não sobe: guardamos só que existe contrato (pdf: true).
  store.aplicar((e) =>
    completarProcesso(e, novo.id, {
      vendedor: { telefone: telVendedor.value, email: emailVendedor.value },
      comprador: { telefone: telComprador.value, email: emailComprador.value },
      pdf: !!arquivo.value,
    }),
  )
  fechar()
  toast.success(`Processo ${novo.id} aberto.`)
  await navigateTo(`/gestao/vendas/${novo.id}`)
}

defineExpose({ abrir })

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
</script>

<template>
  <!-- margin auto: o preflight do Tailwind zera a margem que centraliza o <dialog> modal. -->
  <dialog
    ref="dialog"
    class="m-auto w-[min(480px,calc(100vw-32px))] rounded-[14px] border-0 bg-[var(--paper)] p-0 text-[var(--ink)] shadow-[var(--shadow-lg)] backdrop:bg-black/45"
    aria-labelledby="novo-processo-titulo"
    data-testid="modal-novo-processo"
    @click.self="fechar"
  >
    <form class="[display:grid] gap-3 p-5" novalidate @submit.prevent="enviar">
      <h2 id="novo-processo-titulo" class="text-[length:var(--fs-title-sm)] leading-snug font-extrabold">
        Novo processo de venda
      </h2>

      <label :class="rotulo">
        Imóvel
        <input v-model="imovel" :class="campo" type="text" autocomplete="off" autofocus placeholder="Ex.: Apto 302 — Ed. Aurora" />
      </label>
      <label :class="rotulo">
        Vendedor
        <input v-model="vendedor" :class="campo" type="text" autocomplete="off" />
      </label>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo">
          Telefone do vendedor (opcional)
          <input v-model="telVendedor" :class="campo" type="tel" inputmode="tel" autocomplete="off" data-testid="telefone-vendedor" />
        </label>
        <label :class="rotulo">
          E-mail do vendedor (opcional)
          <input v-model="emailVendedor" :class="campo" type="email" autocomplete="off" data-testid="email-vendedor" />
        </label>
      </div>
      <label :class="rotulo">
        Comprador
        <input v-model="comprador" :class="campo" type="text" autocomplete="off" />
      </label>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo">
          Telefone do comprador (opcional)
          <input v-model="telComprador" :class="campo" type="tel" inputmode="tel" autocomplete="off" data-testid="telefone-comprador" />
        </label>
        <label :class="rotulo">
          E-mail do comprador (opcional)
          <input v-model="emailComprador" :class="campo" type="email" autocomplete="off" data-testid="email-comprador" />
        </label>
      </div>
      <label :class="rotulo">
        Corretor
        <select v-model="corretorId" :class="campo" :disabled="travado">
          <option v-for="c in CORRETORES" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>

      <label :class="rotulo">
        Anexar contrato (PDF, opcional)
        <input
          type="file"
          accept="application/pdf,.pdf"
          class="min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 text-[length:var(--fs-ui)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--brand-ghost)] file:px-3 file:py-1.5 file:font-bold"
          data-testid="anexo-contrato"
          @change="escolherArquivo"
        />
        <span v-if="arquivo" class="text-[var(--ink-soft)]">Arquivo: {{ arquivo.name }}</span>
      </label>

      <p v-if="erro" role="alert" class="rounded-lg bg-[#fee2e2] px-3 py-2 text-[length:var(--fs-label)] font-bold text-[#7f1d1d]">
        {{ erro }}
      </p>

      <div class="mt-1 flex justify-end gap-2">
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
          Abrir processo
        </button>
      </div>
    </form>
  </dialog>
</template>
