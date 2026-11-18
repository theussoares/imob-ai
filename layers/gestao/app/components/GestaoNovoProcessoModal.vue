<script setup lang="ts">
import { rotuloImovel } from '../../domain/imoveis'
import { validarContato, validarPdf } from '../../domain/novo-processo'

const store = useGestaoStore()
// A lista de imóveis só é buscada quando este formulário abre.
onMounted(() => void store.carregar(false, ['imoveis']))
// Só imóveis à venda: abrir venda de um imóvel só de aluguel não faria sentido.
const opcoes = computed(() => store.imoveis.value.filter((i) => i.purpose === 'venda'))
const { sessao } = useGestaoSessao()
const toast = useToast()

const dialog = ref<HTMLDialogElement | null>(null)
const imovelId = ref('')
const vendedor = ref('')
const comprador = ref('')
const corretorId = ref('')
const telVendedor = ref('')
const emailVendedor = ref('')
const telComprador = ref('')
const emailComprador = ref('')
const arquivo = ref<File | null>(null)
const erro = ref('')
const enviando = ref(false)

// Corretor logado abre processo só em nome próprio: deixar escolher outro
// furaria a regra «corretor vê só os seus» (ele criaria um processo que some
// da própria lista). Os demais perfis escolhem.
const travado = computed(() => sessao.value?.perfil === 'corretor')

function abrir() {
  imovelId.value = opcoes.value[0]?.id ?? ''
  vendedor.value = ''
  comprador.value = ''
  telVendedor.value = emailVendedor.value = telComprador.value = emailComprador.value = ''
  arquivo.value = null
  erro.value = ''
  corretorId.value = sessao.value?.corretorId ?? store.corretores.value[0]?.id ?? ''
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
  if (enviando.value) return
  // Limpa o erro da tentativa anterior: sem isto o banner velho («Informe o imóvel.») ficava
  // na tela durante o envio do formulário já corrigido.
  erro.value = ''
  enviando.value = true
  try {
    await enviarProcesso()
  } finally {
    enviando.value = false
  }
}

async function enviarProcesso() {
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
  const imovel = store.imoveis.value.find((i) => i.id === imovelId.value)
  const r = await store.abrirProcesso({
    imovel: imovel ? rotuloImovel(imovel) : '',
    imovelId: imovelId.value,
    vendedor: vendedor.value,
    comprador: comprador.value,
    corretorId: corretorId.value,
    pct: store.config.value.comissaoPct,
  })
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  const novo = r.processo!
  const contatos = {
    vendedor: { telefone: telVendedor.value, email: emailVendedor.value },
    comprador: { telefone: telComprador.value, email: emailComprador.value },
  }
  if (store.http) {
    // O servidor abre o processo só com os nomes; telefone e e-mail entram pelo cadastro de cada parte
    // (a mesma ação da etapa 2/3) e o contrato em PDF sobe como documento do processo.
    for (const quem of ['vendedor', 'comprador'] as const) {
      const c = contatos[quem]
      if (c.telefone.trim() || c.email.trim()) await store.executar('venda', novo.id, 'salvarPessoa', { quem, cpf: '', telefone: c.telefone, email: c.email })
    }
    if (arquivo.value) {
      const up = await store.enviarDocumento('venda', novo.id, { name: arquivo.value.name, size: arquivo.value.size, file: arquivo.value }, { categoria: 'venda' })
      if (!up.ok) toast.error(`Processo aberto, mas o contrato não subiu: ${up.erro}`)
    }
  } else {
    // No demo o PDF não sobe: guardamos só que existe contrato (pdf: true).
    await store.executar('venda', novo.id, 'completarProcesso', { ...contatos, pdf: !!arquivo.value })
  }
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
      <h2 id="novo-processo-titulo" class="text-[length:var(--fs-title-sm)] leading-snug font-bold">
        Novo processo de venda
      </h2>

      <label :class="rotulo">
        Imóvel
        <select v-model="imovelId" :class="campo" data-testid="imovel">
          <option v-for="i in opcoes" :key="i.id" :value="i.id">{{ rotuloImovel(i) }}</option>
        </select>
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
          <option v-for="c in store.corretores.value" :key="c.id" :value="c.id">{{ c.nome }}</option>
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

      <p v-if="!opcoes.length" class="m-0 text-[length:var(--fs-label)] text-[var(--ink-soft)]">Nenhum imóvel à venda cadastrado.</p>
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
          :disabled="enviando"
          :aria-busy="enviando"
          class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {{ enviando ? 'Abrindo…' : 'Abrir processo' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
