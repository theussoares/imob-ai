<script setup lang="ts">
import type { PortalUser } from '~~/shared/models/portal'
import type { PessoaDoContrato } from '~~/shared/models/lease'
import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { formatWhatsapp, isValidWhatsapp } from '~~/shared/utils/phone'

/**
 * Escolher a pessoa de um contrato: alguém da carteira, ou cadastrar ali.
 *
 * Existe porque os concorrentes (Imobzi) exigem o contato cadastrado ANTES da
 * locação, e esse vai-e-volta é o atrito que mais atrasa o primeiro contrato.
 * Aqui a pessoa nova nasce SEM acesso ao portal (0050) — só nome e WhatsApp
 * bastam; o convite é escolha à parte.
 */
const props = defineProps<{
  modelValue: PessoaDoContrato | null
  clientes: PortalUser[]
  rotulo: string
  /** Pede CPF/CNPJ com destaque (o inquilino: o boleto exige). */
  documentoImportante?: boolean
  excluirIds?: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [PessoaDoContrato | null] }>()

const uid = useId()
const busca = ref('')
const aberto = ref(false)
const criando = ref(false)
const nova = reactive({ name: '', phone: '', doc: '', email: '' })
const { display: phoneDisplay, onInput: onPhoneInput } = usePhoneInput(toRef(nova, 'phone'), 'whatsapp')

const escolhido = computed(() => {
  const v = props.modelValue
  if (!v) return null
  if ('id' in v) return props.clientes.find((c) => c.id === v.id) ?? null
  return null
})
const novaEscolhida = computed(() => (props.modelValue && 'nova' in props.modelValue ? props.modelValue.nova : null))

const resultados = computed(() => {
  const q = busca.value.trim().toLowerCase()
  const d = q.replace(/\D/g, '')
  return props.clientes
    .filter((c) => c.active && !props.excluirIds?.includes(c.id))
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').includes(q) ||
        (d.length >= 3 && ((c.doc ?? '').includes(d) || (c.phone ?? '').includes(d))),
    )
    .slice(0, 6)
})

function escolher(c: PortalUser) {
  emit('update:modelValue', { id: c.id })
  aberto.value = false
  busca.value = ''
}
function comecarNova() {
  criando.value = true
  aberto.value = false
  Object.assign(nova, { name: busca.value.trim(), phone: '', doc: '', email: '' })
  nextTick(() => document.getElementById(`${uid}-nome`)?.focus())
}
const erroNova = computed(() => {
  if (!nova.name.trim()) return 'Informe o nome.'
  if (nova.phone && !isValidWhatsapp(nova.phone)) return 'WhatsApp inválido (com DDD).'
  if (nova.doc.trim() && !tipoDeDocumento(nova.doc)) return 'CPF/CNPJ inválido.'
  if (nova.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nova.email.trim())) return 'E-mail inválido.'
  return ''
})
const tentouSalvar = ref(false)
function confirmarNova() {
  tentouSalvar.value = true
  if (erroNova.value) return
  emit('update:modelValue', {
    nova: {
      name: nova.name.trim(),
      phone: nova.phone || null,
      doc: nova.doc.replace(/\D/g, '') || null,
      email: nova.email.trim() || null,
    },
  })
  criando.value = false
  tentouSalvar.value = false
}
function trocar() {
  emit('update:modelValue', null)
  criando.value = false
  nextTick(() => document.getElementById(`${uid}-busca`)?.focus())
}
function fecharDepois() {
  // Deixa o clique no resultado acontecer antes de o painel sumir.
  setTimeout(() => (aberto.value = false), 150)
}
</script>

<template>
  <div class="pp">
    <span class="admin-label" :id="`${uid}-rotulo`">{{ rotulo }}</span>

    <!-- Escolhido -->
    <div v-if="escolhido || novaEscolhida" class="pp-escolhido">
      <div class="pp-quem">
        <b>{{ escolhido?.name ?? novaEscolhida?.name }}</b>
        <small>
          <template v-if="escolhido">
            {{ [escolhido.phone && formatWhatsapp(escolhido.phone), escolhido.doc && formatarDocumento(escolhido.doc)].filter(Boolean).join(' · ') || 'Sem contato cadastrado' }}
          </template>
          <template v-else>Novo cadastro, criado junto com o contrato</template>
        </small>
        <small v-if="documentoImportante && !(escolhido?.doc ?? novaEscolhida?.doc)" class="pp-aviso">
          Sem CPF/CNPJ: vai aparecer como pendência para emitir boleto.
        </small>
      </div>
      <button type="button" class="link-btn" @click="trocar">Trocar</button>
    </div>

    <!-- Cadastro rápido -->
    <div v-else-if="criando" class="pp-nova" role="group" :aria-labelledby="`${uid}-rotulo`">
      <div class="pp-grid">
        <div class="pp-span">
          <label class="admin-label" :for="`${uid}-nome`">Nome *</label>
          <input :id="`${uid}-nome`" v-model="nova.name" class="admin-input" autocomplete="off" />
        </div>
        <div>
          <label class="admin-label" :for="`${uid}-fone`">WhatsApp</label>
          <input :id="`${uid}-fone`" class="admin-input" type="tel" :value="phoneDisplay" placeholder="+55 (67) 99123-4567" @input="onPhoneInput" />
        </div>
        <div>
          <label class="admin-label" :for="`${uid}-doc`">CPF/CNPJ{{ documentoImportante ? ' *' : '' }}</label>
          <input :id="`${uid}-doc`" v-model="nova.doc" class="admin-input" inputmode="numeric" @blur="nova.doc = formatarDocumento(nova.doc)" />
        </div>
        <div class="pp-span">
          <label class="admin-label" :for="`${uid}-email`">E-mail <small class="pp-opc">(para dar acesso ao portal)</small></label>
          <input :id="`${uid}-email`" v-model="nova.email" class="admin-input" type="email" autocomplete="off" />
        </div>
      </div>
      <p v-if="tentouSalvar && erroNova" class="pp-erro" role="alert">{{ erroNova }}</p>
      <div class="pp-acoes">
        <button type="button" class="admin-btn sm" @click="confirmarNova">Usar esta pessoa</button>
        <button type="button" class="admin-btn ghost sm" @click="criando = false">Cancelar</button>
      </div>
    </div>

    <!-- Busca -->
    <div v-else class="pp-busca">
      <input
        :id="`${uid}-busca`"
        v-model="busca"
        class="admin-input"
        type="search"
        role="combobox"
        :aria-expanded="aberto"
        :aria-controls="`${uid}-lista`"
        :aria-labelledby="`${uid}-rotulo`"
        placeholder="Buscar na carteira por nome, CPF ou telefone"
        autocomplete="off"
        @focus="aberto = true"
        @input="aberto = true"
        @blur="fecharDepois"
      />
      <ul v-if="aberto" :id="`${uid}-lista`" class="pp-lista" role="listbox">
        <li v-for="c in resultados" :key="c.id" role="option" :aria-selected="false">
          <button type="button" @mousedown.prevent="escolher(c)" @click="escolher(c)">
            <b>{{ c.name }}</b>
            <small>{{ [c.phone && formatWhatsapp(c.phone), c.doc && formatarDocumento(c.doc)].filter(Boolean).join(' · ') }}</small>
          </button>
        </li>
        <li v-if="busca.trim() && !resultados.length" class="pp-nada">Ninguém com "{{ busca }}" na carteira.</li>
        <li>
          <button type="button" class="pp-criar" @mousedown.prevent="comecarNova" @click="comecarNova">
            <AppIcon name="plus" /> Cadastrar {{ busca.trim() ? `"${busca.trim()}"` : 'nova pessoa' }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.pp {
  position: relative;
}
.pp-escolhido {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid color-mix(in srgb, var(--brand) 35%, var(--line-2));
  border-radius: var(--r-md);
  background: var(--brand-ghost);
}
.pp-quem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pp-quem small {
  color: var(--ink-soft);
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
}
.pp-quem .pp-aviso {
  color: #8a5a00;
}
.pp-busca {
  position: relative;
}
.pp-lista {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--paper);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  max-height: 320px;
  overflow-y: auto;
}
.pp-lista button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: 1px;
  padding: 9px 10px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pp-lista button:hover,
.pp-lista button:focus-visible {
  background: var(--surface);
  outline: none;
}
.pp-lista small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
}
.pp-nada {
  padding: 9px 10px;
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.pp-lista .pp-criar {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--brand);
  font-weight: 700;
  border-top: 1px solid var(--line);
  border-radius: 0 0 var(--r-sm) var(--r-sm);
}
.pp-criar :deep(svg) {
  width: 16px;
  height: 16px;
}
.pp-nova {
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.pp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pp-span {
  grid-column: 1 / -1;
}
.pp-opc {
  font-weight: 500;
  color: var(--ink-soft);
}
.pp-erro {
  margin: 10px 0 0;
  color: #b91c1c;
  font-size: var(--fs-label);
}
.pp-acoes {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
@media (max-width: 560px) {
  .pp-grid {
    grid-template-columns: 1fr;
  }
}
</style>
