<script setup lang="ts">
import { validarConfiguracoes } from '../../../domain/configuracoes'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `admin`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Configurações · Gestão' })

const store = useGestaoStore()
const toast = useToast()
await store.carregar()

// Cópia de trabalho: o que é digitado só vira configuração ao salvar e passar na validação.
const form = reactive(structuredClone(toRaw(store.config.value)))
const erro = ref('')

async function salvar() {
  const r = validarConfiguracoes(form)
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  const g = await store.definirConfig(r.config)
  if (!g.ok) {
    erro.value = g.erro
    return
  }
  erro.value = ''
  Object.assign(form, structuredClone(g.config))
  toast.success('Configurações salvas.')
}

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const card = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5'
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="salvar">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-extrabold">Configurações</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Dados da imobiliária e padrões para contratos novos.</p>
    </header>

    <section :class="card" aria-labelledby="cfg-imob">
      <h2 id="cfg-imob" class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-extrabold">Imobiliária</h2>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo" class="sm:col-span-2">Nome
          <input v-model="form.imobiliaria.nome" :class="campo" autocomplete="organization" data-testid="cfg-nome" />
        </label>
        <label :class="rotulo">CNPJ
          <input v-model="form.imobiliaria.cnpj" :class="campo" inputmode="numeric" placeholder="00.000.000/0000-00" data-testid="cfg-cnpj" />
        </label>
        <label :class="rotulo">Telefone
          <input v-model="form.imobiliaria.telefone" :class="campo" inputmode="tel" placeholder="(11) 99999-9999" data-testid="cfg-telefone" />
        </label>
        <label :class="rotulo" class="sm:col-span-2">E-mail
          <input v-model="form.imobiliaria.email" :class="campo" type="email" inputmode="email" autocomplete="email" data-testid="cfg-email" />
        </label>
      </div>
    </section>

    <section :class="card" aria-labelledby="cfg-padroes">
      <h2 id="cfg-padroes" class="m-0 mb-1 text-[length:var(--fs-title-sm)] font-extrabold">Padrões para contratos novos</h2>
      <p class="m-0 mb-3 text-[var(--ink-soft)]">Contratos já abertos mantêm o percentual que tinham.</p>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo">Comissão da venda (%)
          <input v-model.number="form.comissaoPct" :class="campo" type="number" min="0" max="100" step="0.1" data-testid="cfg-comissao" />
        </label>
        <label :class="rotulo">Taxa da imobiliária na locação (%)
          <input v-model.number="form.taxaLocacaoPct" :class="campo" type="number" min="0" max="100" step="0.1" data-testid="cfg-taxa" />
        </label>
      </div>
    </section>

    <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="cfg-erro">{{ erro }}</p>
    <div>
      <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-5 font-bold text-white hover:opacity-90" data-testid="cfg-salvar">
        Salvar configurações
      </button>
    </div>
  </form>
</template>
