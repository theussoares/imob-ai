<script setup lang="ts">
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, temQuartos } from '../../../../shared/models/property-type'
import { ROTULO_FINALIDADE, ROTULO_STATUS_IMOVEL, STATUS_IMOVEL } from '../../domain/imoveis'
import type { NovoImovel } from '../../domain/imoveis-acoes'

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
const secao = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5 [display:grid] gap-3 md:grid-cols-2'
const titulo = 'm-0 text-[length:var(--fs-body)] font-bold md:col-span-2'
</script>

<template>
  <form class="[display:grid] gap-4" novalidate data-testid="imovel-form" @submit.prevent="emit('salvar')">
    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Anúncio</legend>
      <label :class="rotulo" class="md:col-span-2">Título
        <input v-model="m.title" :class="campo" autocomplete="off" placeholder="Apartamento 3 quartos" data-testid="imovel-titulo" />
      </label>
      <label :class="rotulo">Tipo
        <select v-model="m.type" :class="campo" data-testid="imovel-tipo">
          <option value="" disabled>Escolha…</option>
          <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
        </select>
      </label>
      <label :class="rotulo">Finalidade
        <select v-model="m.purpose" :class="campo" data-testid="imovel-finalidade">
          <option value="" disabled>Escolha…</option>
          <option v-for="(r, k) in ROTULO_FINALIDADE" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
      <label :class="rotulo">{{ m.purpose === 'aluguel' ? 'Aluguel mensal (R$)' : 'Preço (R$)' }}
        <input :value="m.price ?? ''" :class="campo" type="number" min="0" step="any" inputmode="decimal" data-testid="imovel-preco" @input="m.price = num($event)" />
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
        <input v-model="m.addressZip" :class="campo" inputmode="numeric" autocomplete="off" placeholder="00000-000" data-testid="imovel-cep" />
      </label>
      <label :class="rotulo">Rua
        <input v-model="m.addressStreet" :class="campo" autocomplete="off" />
      </label>
      <label :class="rotulo">Número
        <input v-model="m.addressNumber" :class="campo" autocomplete="off" />
      </label>
      <label :class="rotulo">Bairro
        <input v-model="m.neighborhood" :class="campo" autocomplete="off" data-testid="imovel-bairro" />
      </label>
      <label :class="rotulo">Cidade
        <input v-model="m.city" :class="campo" autocomplete="off" data-testid="imovel-cidade" />
      </label>
      <label :class="rotulo">UF
        <input v-model="m.state" :class="campo" maxlength="2" autocomplete="off" data-testid="imovel-uf" />
      </label>
      <label :class="rotulo" class="md:col-span-2">Referência interna (condomínio, bloco)
        <input v-model="m.location" :class="campo" autocomplete="off" data-testid="imovel-referencia" />
      </label>
    </fieldset>

    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Medidas</legend>
      <label :class="rotulo">Área (m²)
        <input :value="m.area ?? ''" :class="campo" type="number" min="0" step="any" inputmode="decimal" data-testid="imovel-area" @input="m.area = num($event)" />
      </label>
      <template v-if="comQuartos">
        <label :class="rotulo">Quartos
          <input :value="m.bedrooms ?? ''" :class="campo" type="number" min="0" step="1" inputmode="numeric" data-testid="imovel-quartos" @input="m.bedrooms = num($event)" />
        </label>
        <label :class="rotulo">Suítes
          <input :value="m.suites ?? ''" :class="campo" type="number" min="0" step="1" inputmode="numeric" @input="m.suites = num($event)" />
        </label>
        <label :class="rotulo">Banheiros
          <input :value="m.bathrooms ?? ''" :class="campo" type="number" min="0" step="1" inputmode="numeric" @input="m.bathrooms = num($event)" />
        </label>
        <label :class="rotulo">Vagas
          <input :value="m.parking ?? ''" :class="campo" type="number" min="0" step="1" inputmode="numeric" @input="m.parking = num($event)" />
        </label>
      </template>
    </fieldset>

    <fieldset :class="secao" class="m-0 min-w-0">
      <legend :class="titulo" class="float-left mb-2 w-full p-0">Interno (não vai para o site)</legend>
      <label :class="rotulo">Proprietário
        <input v-model="m.ownerName" :class="campo" autocomplete="off" data-testid="imovel-proprietario" />
      </label>
      <label :class="rotulo">Telefone do proprietário
        <input v-model="m.ownerPhone" :class="campo" inputmode="tel" autocomplete="off" placeholder="(67) 99999-9999" data-testid="imovel-telefone-proprietario" />
      </label>
      <label :class="rotulo">Corretor vendedor
        <select v-model="m.brokerId" :class="campo" :disabled="!props.podeTrocarCorretor" data-testid="imovel-corretor">
          <option value="" disabled>Escolha…</option>
          <option v-for="c in props.corretores" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
      <p class="m-0 self-end text-[length:var(--fs-label)] text-[var(--ink-soft)]" data-testid="imovel-contato-site">
        Contato no site: WhatsApp da imobiliária{{ props.telefoneSite ? ` (${props.telefoneSite})` : '' }}. O corretor aparece no anúncio só se estiver configurado para aparecer.
      </p>
    </fieldset>

    <p v-if="props.erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="imovel-erro">{{ props.erro }}</p>
    <div>
      <button type="submit" :disabled="props.salvando" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-5 font-bold text-white hover:opacity-90 disabled:opacity-60" data-testid="imovel-salvar">
        {{ props.salvando ? 'Salvando…' : props.rotuloSalvar }}
      </button>
    </div>
  </form>
</template>
