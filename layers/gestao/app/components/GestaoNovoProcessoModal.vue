<script setup lang="ts">
import { rotuloImovel } from '../../domain/imoveis'
import { errosNovoProcesso, type CampoNovoProcesso } from '../../domain/novo-processo'

const store = useGestaoStore()
const { sessao } = useGestaoSessao()
const toast = useToast()

const dialog = ref<HTMLDialogElement | null>(null)
const imovelId = ref('')
// Só imóveis à venda (abrir venda de um imóvel só de aluguel não faria sentido), buscados no servidor.
const busca = useBuscaImoveis('venda', imovelId)
const vendedor = ref('')
const comprador = ref('')
const corretorId = ref('')
const telVendedor = ref('')
const emailVendedor = ref('')
const telComprador = ref('')
const emailComprador = ref('')
const arquivo = ref<File | null>(null)
const erro = ref('')
// Erros por campo (todos de uma vez), com foco no primeiro. Depois da 1ª tentativa, cada edição reavalia:
// o erro some assim que o campo passa a valer. `erro` (banner) fica só para falha do servidor.
const erros = ref<Partial<Record<CampoNovoProcesso, string>>>({})
const tentou = ref(false)
const form = () => ({
  imovelId: imovelId.value, vendedor: vendedor.value, telVendedor: telVendedor.value, emailVendedor: emailVendedor.value,
  comprador: comprador.value, telComprador: telComprador.value, emailComprador: emailComprador.value, corretorId: corretorId.value,
})
watch([imovelId, vendedor, comprador, corretorId, telVendedor, emailVendedor, telComprador, emailComprador, arquivo], () => {
  if (!tentou.value) return
  erros.value = errosNovoProcesso(form(), arquivo.value)
  erro.value = ''
})
const aria = (c: CampoNovoProcesso) => ({ id: `np-${c}`, 'aria-invalid': (erros.value[c] ? 'true' : undefined) as 'true' | undefined, 'aria-describedby': erros.value[c] ? `np-e-${c}` : undefined })
const enviando = ref(false)

// Corretor logado abre processo só em nome próprio: deixar escolher outro
// furaria a regra «corretor vê só os seus» (ele criaria um processo que some
// da própria lista). Os demais perfis escolhem.
const travado = computed(() => sessao.value?.perfil === 'corretor')

function abrir() {
  imovelId.value = ''
  tentou.value = false
  erros.value = {}
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
  tentou.value = true
  erros.value = errosNovoProcesso(form(), arquivo.value)
  const primeiro = Object.keys(erros.value)[0]
  if (primeiro) {
    document.getElementById(`np-${primeiro}`)?.focus()
    return
  }
  const imovel = busca.achar(imovelId.value)
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
        <span>Buscar imóvel</span>
        <input v-model="busca.q" type="search" :class="campo" autocomplete="off" placeholder="Título, bairro, código ou proprietário" data-testid="imovel-busca-opcoes" />
        <span v-if="busca.falhou" role="alert" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">Não foi possível buscar os imóveis. <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-bold underline" @click="busca.buscar()">Tentar de novo</button></span>
        <span v-else-if="busca.restantes" class="text-[length:var(--fs-caption)] font-normal text-[var(--ink-soft)]" data-testid="imovel-busca-restantes">Mostrando os mais recentes; mais {{ busca.restantes }} — digite para refinar.</span>
      </label>
      <label :class="rotulo">
        <span>Imóvel<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="imovelId" :class="campo" v-bind="aria('imovelId')" required data-testid="imovel">
          <option value="" disabled>Escolha…</option>
          <option v-for="i in busca.opcoes" :key="i.id" :value="i.id">{{ rotuloImovel(i) }}</option>
        </select>
        <span v-if="erros.imovelId" id="np-e-imovelId" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.imovelId }}</span>
      </label>
      <label :class="rotulo">
        <span>Vendedor<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="vendedor" :class="campo" v-bind="aria('vendedor')" type="text" autocomplete="off" />
        <span v-if="erros.vendedor" id="np-e-vendedor" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.vendedor }}</span>
      </label>
      <div class="[display:grid] items-start gap-3 sm:grid-cols-2">
        <label :class="rotulo">
          Telefone do vendedor (opcional)
          <GestaoCampoTelefone v-model="telVendedor" :classe="campo" :erro-externo="erros.telVendedor" v-bind="aria('telVendedor')" data-testid="telefone-vendedor" />
        </label>
        <label :class="rotulo">
          E-mail do vendedor (opcional)
          <input v-model="emailVendedor" :class="campo" v-bind="aria('emailVendedor')" type="email" autocomplete="off" data-testid="email-vendedor" />
        <span v-if="erros.emailVendedor" id="np-e-emailVendedor" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.emailVendedor }}</span>
        </label>
      </div>
      <label :class="rotulo">
        <span>Comprador<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="comprador" :class="campo" v-bind="aria('comprador')" type="text" autocomplete="off" />
        <span v-if="erros.comprador" id="np-e-comprador" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.comprador }}</span>
      </label>
      <div class="[display:grid] items-start gap-3 sm:grid-cols-2">
        <label :class="rotulo">
          Telefone do comprador (opcional)
          <GestaoCampoTelefone v-model="telComprador" :classe="campo" :erro-externo="erros.telComprador" v-bind="aria('telComprador')" data-testid="telefone-comprador" />
        </label>
        <label :class="rotulo">
          E-mail do comprador (opcional)
          <input v-model="emailComprador" :class="campo" v-bind="aria('emailComprador')" type="email" autocomplete="off" data-testid="email-comprador" />
        <span v-if="erros.emailComprador" id="np-e-emailComprador" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.emailComprador }}</span>
        </label>
      </div>
      <label :class="rotulo">
        <span>Corretor<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="corretorId" :class="campo" v-bind="aria('corretorId')" :disabled="travado">
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
          v-bind="aria('arquivo')"
          @change="escolherArquivo"
        />
        <span v-if="erros.arquivo" id="np-e-arquivo" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.arquivo }}</span>
        <span v-if="arquivo" class="text-[var(--ink-soft)]">Arquivo: {{ arquivo.name }}</span>
      </label>

      <p class="m-0 text-[length:var(--fs-caption)] text-[var(--ink-soft)]"><span class="text-[var(--danger)]" aria-hidden="true">*</span> campo obrigatório</p>
      <p v-if="!busca.opcoes.length" class="m-0 text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ busca.q ? 'Nenhum imóvel à venda com essa busca.' : 'Nenhum imóvel à venda cadastrado.' }}</p>
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
