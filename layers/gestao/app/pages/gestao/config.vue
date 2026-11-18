<script setup lang="ts">
import { errosConfiguracoes, validarConfiguracoes, type CampoConfig } from '../../../domain/configuracoes'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `admin`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Configurações · Gestão' })

const store = useGestaoStore()
const toast = useToast()
await store.carregar(false, ['base', 'config'])

// Cópia de trabalho: o que é digitado só vira configuração ao salvar e passar na validação.
const form = reactive(structuredClone(toRaw(store.config.value)))
const erro = ref('')
// Erros junto de cada campo (todos de uma vez) e foco no primeiro; depois da 1ª tentativa, cada edição reavalia.
const erros = ref<Partial<Record<CampoConfig, string>>>({})
const tentou = ref(false)
watch(form, () => { if (tentou.value) erros.value = errosConfiguracoes(form) }, { deep: true })
const aria = (c: CampoConfig) => ({ id: `cfg-${c}`, 'aria-invalid': erros.value[c] ? 'true' : undefined, 'aria-describedby': erros.value[c] ? `cfg-e-${c}` : undefined })

async function salvar() {
  tentou.value = true
  erros.value = errosConfiguracoes(form)
  const primeiro = Object.keys(erros.value)[0]
  if (primeiro) {
    erro.value = ''
    document.getElementById(`cfg-${primeiro}`)?.focus()
    return
  }
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
const card = 'rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_1px_2px_rgba(20,22,26,0.05)] md:p-5'
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="salvar">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Configurações</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Dados da imobiliária e padrões para contratos novos.</p>
    </header>

    <section :class="card" aria-labelledby="cfg-imob">
      <h2 id="cfg-imob" class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-bold">Imobiliária</h2>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo" class="sm:col-span-2">Nome
          <input v-model="form.imobiliaria.nome" :class="campo" autocomplete="organization" v-bind="aria('nome')" data-testid="cfg-nome" />
          <span v-if="erros.nome" id="cfg-e-nome" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.nome }}</span>
        </label>
        <label :class="rotulo">CNPJ
          <input v-model="form.imobiliaria.cnpj" :class="campo" inputmode="numeric" placeholder="00.000.000/0000-00" v-bind="aria('cnpj')" data-testid="cfg-cnpj" />
          <span v-if="erros.cnpj" id="cfg-e-cnpj" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.cnpj }}</span>
        </label>
        <label :class="rotulo">Telefone
          <input v-model="form.imobiliaria.telefone" :class="campo" inputmode="tel" placeholder="(11) 99999-9999" v-bind="aria('telefone')" data-testid="cfg-telefone" />
          <span v-if="erros.telefone" id="cfg-e-telefone" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.telefone }}</span>
        </label>
        <label :class="rotulo" class="sm:col-span-2">E-mail
          <input v-model="form.imobiliaria.email" :class="campo" type="email" inputmode="email" autocomplete="email" v-bind="aria('email')" data-testid="cfg-email" />
          <span v-if="erros.email" id="cfg-e-email" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.email }}</span>
        </label>
      </div>
    </section>

    <section :class="card" aria-labelledby="cfg-padroes">
      <h2 id="cfg-padroes" class="m-0 mb-1 text-[length:var(--fs-title-sm)] font-bold">Padrões para contratos novos</h2>
      <p class="m-0 mb-3 text-[var(--ink-soft)]">Contratos já abertos mantêm o percentual que tinham.</p>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo">Comissão da venda (%)
          <input v-model.number="form.comissaoPct" :class="campo" type="number" min="0" max="100" step="0.1" v-bind="aria('comissaoPct')" data-testid="cfg-comissao" />
          <span v-if="erros.comissaoPct" id="cfg-e-comissaoPct" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.comissaoPct }}</span>
        </label>
        <label :class="rotulo">Taxa da imobiliária na locação (%)
          <input v-model.number="form.taxaLocacaoPct" :class="campo" type="number" min="0" max="100" step="0.1" v-bind="aria('taxaLocacaoPct')" data-testid="cfg-taxa" />
          <span v-if="erros.taxaLocacaoPct" id="cfg-e-taxaLocacaoPct" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.taxaLocacaoPct }}</span>
        </label>
      </div>
    </section>

    <section :class="card" aria-labelledby="cfg-encargos">
      <h2 id="cfg-encargos" class="m-0 mb-1 text-[length:var(--fs-title-sm)] font-bold">Atraso do aluguel</h2>
      <p class="m-0 mb-3 text-[var(--ink-soft)]">Multa e juros cobrados sobre o aluguel vencido. Os valores iniciais (2% de multa e 1% ao mês) são só um ponto de partida: <strong>ajuste conforme o contrato da imobiliária</strong>. Os juros contam por dia, a partir do dia seguinte ao vencimento.</p>
      <div class="[display:grid] gap-3 sm:grid-cols-2">
        <label :class="rotulo">Multa por atraso (%)
          <input v-model.number="form.multaAtrasoPct" :class="campo" type="number" min="0" max="100" step="0.1" v-bind="aria('multaAtrasoPct')" data-testid="cfg-multa" />
          <span v-if="erros.multaAtrasoPct" id="cfg-e-multaAtrasoPct" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.multaAtrasoPct }}</span>
        </label>
        <label :class="rotulo">Juros ao mês (%)
          <input v-model.number="form.jurosMesPct" :class="campo" type="number" min="0" max="100" step="0.1" v-bind="aria('jurosMesPct')" data-testid="cfg-juros" />
          <span v-if="erros.jurosMesPct" id="cfg-e-jurosMesPct" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.jurosMesPct }}</span>
        </label>
      </div>
    </section>

    <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="cfg-erro">{{ erro }}</p>
    <div>
      <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-5 font-bold text-[var(--brand)] hover:opacity-90" data-testid="cfg-salvar">
        Salvar configurações
      </button>
    </div>
  </form>
</template>
