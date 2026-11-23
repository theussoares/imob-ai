<script setup lang="ts">
import { formImovelVazio } from '../../../../domain/imoveis-acoes'
import { FOTOS_IMOVEL_MAX } from '../../../../domain/imoveis-fotos'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Cadastrar imóvel · Gestão' })

const store = useGestaoStore()
const toast = useToast()
const { sessao } = useGestaoSessao()
await store.carregar(false, ['base', 'corretores', 'config', 'imoveis'])

// Sem permissão de criar, a tela não abre (a guarda de rota só conhece a seção).
if (!store.permissoesDoImovel(null).criar) await navigateTo('/gestao/imoveis')

// Quem cadastra vira o corretor vendedor; quem vê todos (recepção, jurídico, dono) escolhe.
const form = ref(formImovelVazio(sessao.value?.corretorId ?? ''))
const erro = ref('')
const salvando = ref(false)
const pendentes = useFotosPendentes()

async function salvar() {
  salvando.value = true
  const r = await store.cadastrarImovel(form.value)
  if (!r.ok) {
    salvando.value = false
    erro.value = r.erro
    return
  }
  // O imóvel já existe: falha nas fotos não desfaz o cadastro, só leva o usuário à edição para reenviar.
  const fotos = pendentes.paraEnvio()
  const enviadas = fotos.length ? await store.adicionarFotosImovel(r.imovel.id, fotos) : null
  salvando.value = false
  if (enviadas && !enviadas.ok) toast.error(`Imóvel ${r.imovel.id} cadastrado, mas as fotos não foram enviadas: ${enviadas.erro}`)
  else toast.success(`Imóvel ${r.imovel.id} cadastrado.`)
  await navigateTo(`/gestao/imoveis/${r.imovel.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header>
      <NuxtLink to="/gestao/imoveis" class="inline-flex min-h-11 items-center text-[length:var(--fs-label)] font-semibold">← Imóveis</NuxtLink>
      <h1 class="m-0 mt-1 text-[length:var(--fs-title)] leading-tight font-bold">Cadastrar imóvel</h1>
      <p class="mt-1 text-[var(--ink-soft)]">As fotos são o último passo e sobem junto com o cadastro.</p>
    </header>
    <GestaoImovelForm
      v-model="form"
      :corretores="store.corretores.value"
      :pode-trocar-corretor="store.permissoesDoImovel(null).trocarCorretor"
      :telefone-site="store.config.value.imobiliaria.telefone"
      :erro="erro"
      :salvando="salvando"
      rotulo-salvar="Salvar imóvel"
      :resumo-fotos="`${pendentes.fotos.value.length}/${FOTOS_IMOVEL_MAX}`"
      @salvar="salvar"
    >
      <template #fotos>
        <GestaoImovelFotos
          :fotos="pendentes.fotos.value"
          :max="FOTOS_IMOVEL_MAX"
          :erro="pendentes.erro.value"
          :ocupado="pendentes.ocupado.value"
          @adicionar="pendentes.adicionar"
          @capa="pendentes.capa"
          @mover="pendentes.mover"
          @remover="pendentes.remover"
        />
      </template>
    </GestaoImovelForm>
  </div>
</template>
