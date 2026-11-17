<script setup lang="ts">
import { formImovelVazio } from '../../../../domain/imoveis-acoes'
import { CORRETORES } from '../../../../domain/seed'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Cadastrar imóvel · Gestão' })

const store = useGestaoStore()
const toast = useToast()
const { sessao } = useGestaoSessao()
await store.carregar()

// Sem permissão de criar, a tela não abre (a guarda de rota só conhece a seção).
if (!store.permissoesDoImovel(null).criar) await navigateTo('/gestao/imoveis')

// Quem cadastra vira o corretor vendedor; quem vê todos (recepção, jurídico, dono) escolhe.
const form = ref(formImovelVazio(sessao.value?.corretorId ?? ''))
const erro = ref('')
const salvando = ref(false)

async function salvar() {
  salvando.value = true
  const r = await store.cadastrarImovel(form.value)
  salvando.value = false
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  toast.success(`Imóvel ${r.imovel.id} cadastrado.`)
  await navigateTo(`/gestao/imoveis/${r.imovel.id}`)
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <header>
      <NuxtLink to="/gestao/imoveis" class="inline-flex min-h-11 items-center text-[length:var(--fs-label)] font-semibold">← Imóveis</NuxtLink>
      <h1 class="m-0 mt-1 text-[length:var(--fs-title)] leading-tight font-extrabold">Cadastrar imóvel</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Depois de salvar você envia as fotos.</p>
    </header>
    <GestaoImovelForm
      v-model="form"
      :corretores="CORRETORES"
      :pode-trocar-corretor="store.permissoesDoImovel(null).trocarCorretor"
      :telefone-site="store.config.value.imobiliaria.telefone"
      :erro="erro"
      :salvando="salvando"
      rotulo-salvar="Salvar imóvel"
      @salvar="salvar"
    />
  </div>
</template>
