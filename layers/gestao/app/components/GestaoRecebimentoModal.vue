<script setup lang="ts">
import { brl } from '../../domain/acoes-processo'
import { FORMAS_PAGAMENTO, validarPagamento, type ContextoRecebimento, type DadosRecebimentoForm } from '../../domain/cobranca'
import { hojeISO } from '../../domain/avisos-locacao'
import { agoraBrasilData } from '../../domain/periodo'
import type { FormaPagamentoCobranca } from '../../domain/types'

/**
 * Formulário de pagamento do aluguel e de repasse ao locador: valor, data, forma e comprovante
 * (opcional). Valor e data são validados aqui para mostrar o erro no campo; o domínio valida de novo
 * (o servidor nunca confia na tela). O valor sugerido é o que falta (com multa e juros, no pagamento)
 * e pode ser editado: pagamento menor que o devido fica como parcial.
 */
const props = defineProps<{ enviar: (d: DadosRecebimentoForm) => Promise<string | null> }>()

const dialog = ref<HTMLDialogElement | null>(null)
const ctx = ref<ContextoRecebimento | null>(null)
const hoje = ref(hojeISO(agoraBrasilData()))
const valor = ref<number | null>(null)
const data = ref(hoje.value)
const forma = ref<FormaPagamentoCobranca | ''>('')
const comprovante = ref('')
const erros = ref<Partial<Record<'valor' | 'data' | 'forma', string>>>({})
const erro = ref('')
const tentou = ref(false)
const enviando = ref(false)

function abrir(c: ContextoRecebimento) {
  ctx.value = c
  hoje.value = hojeISO(agoraBrasilData())
  valor.value = c.sugerido
  data.value = hoje.value
  forma.value = ''
  comprovante.value = ''
  erros.value = {}
  erro.value = ''
  tentou.value = false
  dialog.value?.showModal()
}
function fechar() {
  if (dialog.value?.open) dialog.value.close()
}
defineExpose({ abrir })

function conferir() {
  const e: typeof erros.value = {}
  const msg = validarPagamento({ valor: valor.value ?? 0, data: data.value, forma: (forma.value || 'x') as FormaPagamentoCobranca }, hoje.value)
  if (msg) {
    if (/valor/i.test(msg)) e.valor = msg
    else if (/data/i.test(msg)) e.data = msg
    else e.forma = msg
  }
  if (!forma.value) e.forma = 'Escolha a forma de pagamento.'
  erros.value = e
  return e
}
watch([valor, data, forma], () => {
  if (!tentou.value) return
  conferir()
  erro.value = ''
})

function escolherArquivo(e: Event) {
  // O demo não sobe binário: o comprovante é o nome do arquivo escolhido.
  comprovante.value = (e.target as HTMLInputElement).files?.[0]?.name ?? ''
}

async function confirmar() {
  if (enviando.value) return
  erro.value = ''
  tentou.value = true
  const e = conferir()
  const primeiro = (['valor', 'data', 'forma'] as const).find((k) => e[k])
  if (primeiro) {
    document.getElementById(`rc-${primeiro}`)?.focus()
    return
  }
  enviando.value = true
  try {
    const falha = await props.enviar({ valor: valor.value!, data: data.value, forma: forma.value as FormaPagamentoCobranca, comprovante: comprovante.value || null })
    if (falha) erro.value = falha
    else fechar()
  } finally {
    enviando.value = false
  }
}

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const aria = (c: 'valor' | 'data' | 'forma') => ({ id: `rc-${c}`, 'aria-invalid': erros.value[c] ? 'true' : undefined, 'aria-describedby': erros.value[c] ? `rc-e-${c}` : undefined })
const OBR = ' *'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(480px,calc(100vw-32px))] rounded-[14px] border-0 bg-[var(--paper)] p-0 text-[var(--ink)] shadow-[var(--shadow-lg)] backdrop:bg-black/45"
    aria-labelledby="recebimento-titulo"
    data-testid="modal-recebimento"
    @click.self="fechar"
  >
    <form v-if="ctx" class="[display:grid] items-start gap-3 p-5" novalidate @submit.prevent="confirmar">
      <h2 id="recebimento-titulo" class="m-0 text-[length:var(--fs-title-sm)] leading-snug font-bold">{{ ctx.modo === 'pagamento' ? 'Registrar pagamento' : 'Registrar repasse' }}</h2>
      <p class="m-0 text-[var(--ink-soft)]">{{ ctx.titulo }}</p>
      <dl v-if="ctx.resumo.length" class="m-0 [display:grid] gap-1 rounded-[10px] bg-[var(--surface)] px-3 py-2 text-[length:var(--fs-label)]" data-testid="recebimento-resumo">
        <div v-for="r in ctx.resumo" :key="r.rotulo" class="flex justify-between gap-3">
          <dt class="text-[var(--ink-soft)]">{{ r.rotulo }}</dt>
          <dd class="m-0 font-bold">{{ brl(r.valor) }}</dd>
        </div>
      </dl>

      <label :class="rotulo">
        <span>{{ ctx.modo === 'pagamento' ? 'Valor pago (R$)' : 'Valor repassado (R$)' }}<span class="text-[var(--danger)]" aria-hidden="true">{{ OBR }}</span></span>
        <input v-model.number="valor" :class="campo" v-bind="aria('valor')" type="number" min="0" step="0.01" inputmode="decimal" data-testid="rc-valor" />
        <span v-if="erros.valor" id="rc-e-valor" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.valor }}</span>
      </label>
      <label :class="rotulo">
        <span>Data<span class="text-[var(--danger)]" aria-hidden="true">{{ OBR }}</span></span>
        <input v-model="data" :class="campo" v-bind="aria('data')" type="date" :max="hoje" data-testid="rc-data" />
        <span v-if="erros.data" id="rc-e-data" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.data }}</span>
      </label>
      <label :class="rotulo">
        <span>Forma<span class="text-[var(--danger)]" aria-hidden="true">{{ OBR }}</span></span>
        <select v-model="forma" :class="campo" v-bind="aria('forma')" data-testid="rc-forma">
          <option value="" disabled>Escolha…</option>
          <option v-for="f in FORMAS_PAGAMENTO" :key="f" :value="f">{{ f }}</option>
        </select>
        <span v-if="erros.forma" id="rc-e-forma" class="text-[length:var(--fs-caption)] font-semibold text-[var(--danger)]">{{ erros.forma }}</span>
      </label>
      <label :class="rotulo">
        Comprovante (opcional)
        <input
          type="file"
          class="min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 text-[length:var(--fs-ui)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--brand-ghost)] file:px-3 file:py-1.5 file:font-bold"
          data-testid="rc-comprovante"
          @change="escolherArquivo"
        />
      </label>
      <p class="m-0 text-[length:var(--fs-caption)] text-[var(--ink-soft)]"><span class="text-[var(--danger)]" aria-hidden="true">*</span> campo obrigatório</p>
      <p v-if="erro" role="alert" class="m-0 rounded-lg bg-[#fee2e2] px-3 py-2 text-[length:var(--fs-label)] font-bold text-[#7f1d1d]" data-testid="rc-erro">{{ erro }}</p>
      <div class="mt-1 flex justify-end gap-2">
        <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="fechar">Cancelar</button>
        <button type="submit" :disabled="enviando" :aria-busy="enviando" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-wait disabled:opacity-60" data-testid="rc-confirmar">
          {{ enviando ? 'Registrando…' : 'Registrar' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
