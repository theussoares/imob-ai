<script setup lang="ts">
import { FOTOS_IMOVEL_MAX } from '../../../../domain/imoveis-fotos'
import { ROTULO_SITUACAO_IMOVEL, ROTULO_STATUS_IMOVEL, situacaoImovel } from '../../../../domain/imoveis'
import { imovelParaForm } from '../../../../domain/imoveis-acoes'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()
const { reduzir } = useRedimensionarFoto()
await store.carregar()

// Só enxerga o que `imoveisVisiveis` devolve: corretor abrindo o imóvel de outro pela URL volta à lista.
const imovel = computed(() => store.imoveisVisiveis.value.find((i) => i.id === String(route.params.id)) ?? null)
if (!imovel.value) await navigateTo('/gestao/imoveis')
useHead({ title: computed(() => `${imovel.value?.title ?? 'Imóvel'} · Gestão`) })

const permissoes = computed(() => store.permissoesDoImovel(imovel.value))
const form = ref(imovel.value ? imovelParaForm(imovel.value) : null)
const erro = ref('')
const erroFoto = ref('')
const salvando = ref(false)
const enviandoFotos = ref(false)

async function salvar() {
  if (!imovel.value || !form.value) return
  salvando.value = true
  const r = await store.atualizarImovel(imovel.value.id, form.value)
  salvando.value = false
  erro.value = r.ok ? '' : r.erro
  if (r.ok) toast.success('Imóvel salvo.')
}

async function mudarStatus(e: Event) {
  if (!imovel.value) return
  const r = await store.mudarStatusImovel(imovel.value.id, (e.target as HTMLSelectElement).value as keyof typeof ROTULO_STATUS_IMOVEL)
  if (!r.ok) toast.error(r.erro)
  else if (form.value) form.value.status = r.imovel.status
}

async function adicionarFotos(arquivos: File[]) {
  if (!imovel.value) return
  erroFoto.value = ''
  enviandoFotos.value = true
  const novas = []
  for (const a of arquivos) {
    const f = await reduzir(a)
    if ('erro' in f) {
      erroFoto.value = f.erro
      enviandoFotos.value = false
      return
    }
    novas.push(f)
  }
  const r = await store.adicionarFotosImovel(imovel.value.id, novas)
  enviandoFotos.value = false
  if (!r.ok) erroFoto.value = r.erro
}

async function acaoFoto(fazer: () => Promise<{ ok: boolean; erro?: string }>) {
  const r = await fazer()
  erroFoto.value = r.ok ? '' : (r.erro ?? '')
}

async function excluir() {
  if (!imovel.value) return
  const ok = await askConfirm({
    title: `Excluir ${imovel.value.title}?`,
    description: 'O imóvel sai do gestão e do site. Isso não pode ser desfeito.',
    confirmLabel: 'Excluir',
    cancelLabel: 'Manter',
    danger: true,
  })
  if (!ok) return
  const r = await store.excluirImovel(imovel.value.id)
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  toast.success('Imóvel excluído.')
  await navigateTo('/gestao/imoveis')
}

const campo =
  'min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const card = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5'
</script>

<template>
  <div v-if="imovel && form" class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <NuxtLink to="/gestao/imoveis" class="inline-flex min-h-11 items-center text-[length:var(--fs-label)] font-semibold">← Imóveis</NuxtLink>
        <h1 class="m-0 mt-1 text-[length:var(--fs-title)] leading-tight font-extrabold" data-testid="imovel-titulo-pagina">{{ imovel.title }}</h1>
        <p class="mt-1 text-[var(--ink-soft)]">{{ imovel.id }} · {{ ROTULO_SITUACAO_IMOVEL[situacaoImovel(imovel.id, store.locacoes.value)] }}</p>
      </div>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">Anúncio no site
        <select :value="imovel.status" :class="campo" :disabled="!permissoes.editar" data-testid="imovel-status-rapido" @change="mudarStatus">
          <option v-for="(r, k) in ROTULO_STATUS_IMOVEL" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
    </header>

    <section :class="card">
      <GestaoImovelFotos
        :fotos="imovel.images"
        :max="FOTOS_IMOVEL_MAX"
        :erro="erroFoto"
        :ocupado="enviandoFotos"
        @adicionar="adicionarFotos"
        @capa="(id) => acaoFoto(() => store.definirCapaImovel(imovel!.id, id))"
        @mover="(id, d) => acaoFoto(() => store.moverFotoImovel(imovel!.id, id, d))"
        @remover="(id) => acaoFoto(() => store.removerFotoImovel(imovel!.id, id))"
      />
    </section>

    <GestaoImovelForm
      v-model="form"
      :corretores="store.corretores.value"
      :pode-trocar-corretor="permissoes.trocarCorretor"
      :telefone-site="store.config.value.imobiliaria.telefone"
      :erro="erro"
      :salvando="salvando"
      rotulo-salvar="Salvar alterações"
      @salvar="salvar"
    />

    <section v-if="permissoes.excluir" :class="card" class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 text-[var(--ink-soft)]">Excluir tira o imóvel do gestão e do site.</p>
      <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--danger)] bg-[var(--paper)] px-5 font-bold text-[var(--danger)] hover:bg-[var(--paper-2)]" data-testid="imovel-excluir" @click="excluir">
        Excluir imóvel
      </button>
    </section>
  </div>
</template>
