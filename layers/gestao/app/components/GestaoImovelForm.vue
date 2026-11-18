<script setup lang="ts">
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, temQuartos } from '~~/shared/models/property-type'
import { ROTULO_FINALIDADE, ROTULO_STATUS_IMOVEL, STATUS_IMOVEL } from '../../domain/imoveis'
import { errosImovel, type CampoImovel, type NovoImovel } from '../../domain/imoveis-acoes'

interface Props {
  corretores: { id: string; nome: string }[]
  podeTrocarCorretor: boolean
  telefoneSite: string
  erro: string
  salvando: boolean
  rotuloSalvar: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ salvar: [] }>()
const m = defineModel<NovoImovel>({ required: true })

// Erros por campo, todos de uma vez; o primeiro (ordem do formulário) recebe o foco. Depois do
// primeiro envio, cada edição reavalia: o erro de um campo some assim que ele passa a valer.
const erros = ref<Partial<Record<CampoImovel, string>>>({})
const tentou = ref(false)
watch(m, () => { if (tentou.value) erros.value = errosImovel(m.value) }, { deep: true })

function enviar() {
  tentou.value = true
  erros.value = errosImovel(m.value)
  const primeiro = Object.keys(erros.value)[0]
  if (!primeiro) {
    emit('salvar')
    return
  }
  const el = document.getElementById(`f-${primeiro}`)
  el?.focus()
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}
// aria-invalid + aria-describedby do campo; o texto do erro fica logo abaixo dele.
const aria = (c: CampoImovel) => ({ id: `f-${c}`, 'aria-invalid': erros.value[c] ? 'true' : undefined, 'aria-describedby': erros.value[c] ? `e-${c}` : undefined })

const num = (e: Event): number | null => {
  const v = (e.target as HTMLInputElement).value
  return v === '' ? null : Number(v)
}
const caracteristicas = computed({
  get: () => m.value.features.join(', '),
  set: (v: string) => {
    m.value.features = v.split(',').map((s) => s.trim()).filter(Boolean)
  },
})
const comQuartos = computed(() => (m.value.type ? temQuartos(m.value.type) : true))

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const secao = 'rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_1px_2px_rgba(20,22,26,0.05)] md:p-5 [display:grid] items-start gap-3 md:grid-cols-2'
const titulo = 'm-0 text-[length:var(--fs-body)] font-bold md:col-span-2'
</script>

<template>
  <form class="[display:grid] gap-4" novalidate data-testid="imovel-form" @submit.prevent="enviar">
    <p class="m-0 text-[length:var(--fs-label)] text-[var(--ink-soft)]"><span class="text-[var(--danger)]" aria-hidden="true">*</span> campo obrigatório</p>
    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Anúncio</legend>
      <label :class="rotulo" class="md:col-span-2"><span>Título<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="m.title" :class="campo" autocomplete="off" placeholder="Apartamento 3 quartos" v-bind="aria('title')" data-testid="imovel-titulo" />
        <span v-if="erros.title" id="e-title" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.title }}</span>
      </label>
      <label :class="rotulo"><span>Tipo<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="m.type" :class="campo" v-bind="aria('type')" data-testid="imovel-tipo">
          <option value="" disabled>Escolha…</option>
          <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
        </select>
        <span v-if="erros.type" id="e-type" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.type }}</span>
      </label>
      <label :class="rotulo"><span>Finalidade<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="m.purpose" :class="campo" v-bind="aria('purpose')" data-testid="imovel-finalidade">
          <option value="" disabled>Escolha…</option>
          <option v-for="(r, k) in ROTULO_FINALIDADE" :key="k" :value="k">{{ r }}</option>
        </select>
        <span v-if="erros.purpose" id="e-purpose" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.purpose }}</span>
      </label>
      <label :class="rotulo"><span>{{ m.purpose === 'aluguel' ? 'Aluguel mensal (R$)' : 'Preço (R$)' }}<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input :value="m.price ?? ''" :class="campo" type="number" min="0" step="any" inputmode="decimal" v-bind="aria('price')" data-testid="imovel-preco" @input="m.price = num($event)" />
        <span v-if="erros.price" id="e-price" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.price }}</span>
      </label>
      <label :class="rotulo">Situação do anúncio
        <select v-model="m.status" :class="campo" data-testid="imovel-status">
          <option v-for="s in STATUS_IMOVEL" :key="s" :value="s">{{ ROTULO_STATUS_IMOVEL[s] }}</option>
        </select>
      </label>
      <label :class="rotulo" class="md:col-span-2">Descrição
        <textarea v-model="m.description" :class="campo" class="min-h-28 py-2" data-testid="imovel-descricao" />
      </label>
      <label :class="rotulo" class="md:col-span-2">Características (separe por vírgula)
        <input v-model="caracteristicas" :class="campo" autocomplete="off" placeholder="Churrasqueira, portaria 24h" data-testid="imovel-caracteristicas" />
      </label>
      <label class="flex min-h-11 items-center gap-2 font-semibold">
        <input v-model="m.featured" type="checkbox" class="size-5" data-testid="imovel-destaque" /> Destaque no site
      </label>
      <label class="flex min-h-11 items-center gap-2 font-semibold">
        <input v-model="m.highStandard" type="checkbox" class="size-5" /> Alto padrão
      </label>
    </fieldset>

    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Endereço</legend>
      <label :class="rotulo">CEP
        <input v-model="m.addressZip" :class="campo" inputmode="numeric" autocomplete="off" placeholder="00000-000" v-bind="aria('addressZip')" data-testid="imovel-cep" />
        <span v-if="erros.addressZip" id="e-addressZip" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.addressZip }}</span>
      </label>
      <label :class="rotulo">Rua
        <input v-model="m.addressStreet" :class="campo" autocomplete="off" />
      </label>
      <label :class="rotulo">Número
        <input v-model="m.addressNumber" :class="campo" autocomplete="off" />
      </label>
      <label :class="rotulo"><span>Bairro<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="m.neighborhood" :class="campo" autocomplete="off" v-bind="aria('neighborhood')" data-testid="imovel-bairro" />
        <span v-if="erros.neighborhood" id="e-neighborhood" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.neighborhood }}</span>
      </label>
      <label :class="rotulo"><span>Cidade<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="m.city" :class="campo" autocomplete="off" v-bind="aria('city')" data-testid="imovel-cidade" />
        <span v-if="erros.city" id="e-city" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.city }}</span>
      </label>
      <label :class="rotulo"><span>UF<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="m.state" :class="campo" maxlength="2" autocomplete="off" v-bind="aria('state')" data-testid="imovel-uf" />
        <span v-if="erros.state" id="e-state" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.state }}</span>
      </label>
      <label :class="rotulo" class="md:col-span-2">Referência interna (condomínio, bloco)
        <input v-model="m.location" :class="campo" autocomplete="off" data-testid="imovel-referencia" />
      </label>
    </fieldset>

    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Medidas</legend>
      <label :class="rotulo"><span>Área (m²)<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input :value="m.area ?? ''" :class="campo" type="number" min="0" step="any" inputmode="decimal" v-bind="aria('area')" data-testid="imovel-area" @input="m.area = num($event)" />
        <span v-if="erros.area" id="e-area" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.area }}</span>
      </label>
      <template v-if="comQuartos">
        <label :class="rotulo">Quartos
          <input :value="m.bedrooms ?? ''" :class="campo" v-bind="aria('bedrooms')" type="number" min="0" step="1" inputmode="numeric" data-testid="imovel-quartos" @input="m.bedrooms = num($event)" />
        <span v-if="erros.bedrooms" id="e-bedrooms" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.bedrooms }}</span>
        </label>
        <label :class="rotulo">Suítes
          <input :value="m.suites ?? ''" :class="campo" v-bind="aria('suites')" type="number" min="0" step="1" inputmode="numeric" @input="m.suites = num($event)" />
        <span v-if="erros.suites" id="e-suites" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.suites }}</span>
        </label>
        <label :class="rotulo">Banheiros
          <input :value="m.bathrooms ?? ''" :class="campo" v-bind="aria('bathrooms')" type="number" min="0" step="1" inputmode="numeric" @input="m.bathrooms = num($event)" />
        <span v-if="erros.bathrooms" id="e-bathrooms" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.bathrooms }}</span>
        </label>
        <label :class="rotulo">Vagas
          <input :value="m.parking ?? ''" :class="campo" v-bind="aria('parking')" type="number" min="0" step="1" inputmode="numeric" @input="m.parking = num($event)" />
        <span v-if="erros.parking" id="e-parking" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.parking }}</span>
        </label>
      </template>
    </fieldset>

    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Interno (não vai para o site)</legend>
      <label :class="rotulo"><span>Proprietário<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <input v-model="m.ownerName" :class="campo" autocomplete="off" v-bind="aria('ownerName')" data-testid="imovel-proprietario" />
        <span v-if="erros.ownerName" id="e-ownerName" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.ownerName }}</span>
      </label>
      <label :class="rotulo">Telefone do proprietário
        <GestaoCampoTelefone v-model="m.ownerPhone" :classe="campo" :erro-externo="erros.ownerPhone" v-bind="aria('ownerPhone')" data-testid="imovel-telefone-proprietario" />
      </label>
      <label :class="rotulo"><span>Corretor vendedor<span class="text-[var(--danger)]" aria-hidden="true"> *</span></span>
        <select v-model="m.brokerId" :class="campo" :disabled="!props.podeTrocarCorretor" v-bind="aria('brokerId')" data-testid="imovel-corretor">
          <option value="" disabled>Escolha…</option>
          <option v-for="c in props.corretores" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
        <span v-if="erros.brokerId" id="e-brokerId" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.brokerId }}</span>
      </label>
      <p class="m-0 self-end text-[length:var(--fs-label)] text-[var(--ink-soft)]" data-testid="imovel-contato-site">
        Contato no site: WhatsApp da imobiliária{{ props.telefoneSite ? ` (${props.telefoneSite})` : '' }}. O corretor aparece no anúncio só se estiver configurado para aparecer.
      </p>
    </fieldset>

    <p v-if="Object.keys(erros).length" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="imovel-erros-resumo">Corrija {{ Object.keys(erros).length }} {{ Object.keys(erros).length === 1 ? 'campo' : 'campos' }} antes de salvar.</p>
    <p v-if="props.erro && !Object.keys(erros).length" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="imovel-erro">{{ props.erro }}</p>
    <div>
      <button type="submit" :disabled="props.salvando" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-5 font-bold text-[var(--brand)] hover:opacity-90 disabled:opacity-60" data-testid="imovel-salvar">
        {{ props.salvando ? 'Salvando…' : props.rotuloSalvar }}
      </button>
    </div>
  </form>
</template>
