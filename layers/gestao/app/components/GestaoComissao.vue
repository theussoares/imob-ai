<script setup lang="ts">
import { brl, MSG_PAGO_SEM_COMPROVANTE, type NovoAdiantamento } from '../../domain/acoes-processo'
import { calcularComissao, validarAdiantamento } from '../../domain/commission'
import type { Processo, ResponsavelAdiantamento } from '../../domain/types'

const props = defineProps<{
  processo: Processo
  /** false em processo final, ou com o financeiro em análise/aprovado: lista só para consulta */
  editavel: boolean
}>()
const emit = defineEmits<{ registrar: [dados: NovoAdiantamento, arquivo: File | null]; remover: [id: string]; pagar: [id: string, arquivo: File | null] }>()

const ROTULO: Record<ResponsavelAdiantamento, string> = {
  vendedor: 'Vendedor',
  captador: 'Corretor captador',
  imob: 'Imobiliária',
}

const comissao = computed(() => calcularComissao(props.processo))

const resp = ref<ResponsavelAdiantamento>('vendedor')
const valor = ref(0)
const data = ref(new Date().toISOString().slice(0, 10))
const momento = ref<'adiantamento' | 'fim-contrato'>('adiantamento')
const pago = ref(false)
// O arquivo sobe pela tela do processo (que sabe o id); o registro guarda o nome.
const comprovante = ref<string | null>(null)
const arquivoComprovante = ref<File | null>(null)
const inputArquivo = ref<HTMLInputElement | null>(null)
const erroValor = ref('')
const erroComprovante = ref('')

const ROTULO_MOMENTO = { adiantamento: 'Adiantamento', 'fim-contrato': 'Fim de contrato' }

function escolherArquivo(e: Event) {
  arquivoComprovante.value = (e.target as HTMLInputElement).files?.[0] ?? null
  comprovante.value = arquivoComprovante.value?.name ?? null
}

function registrar() {
  // Valida aqui para mostrar o erro junto do campo; a ação pura valida de novo
  // (é ela a fonte da regra, a tela só antecipa a mensagem).
  // Cada erro junto do SEU campo (e o foco nele), não numa linha solta no fim do formulário.
  erroValor.value = erroComprovante.value = ''
  const v = validarAdiantamento(props.processo, { resp: resp.value, valor: valor.value })
  if (!v.ok) erroValor.value = v.erro
  if (pago.value && !comprovante.value) erroComprovante.value = MSG_PAGO_SEM_COMPROVANTE
  if (erroValor.value || erroComprovante.value) {
    document.getElementById(erroValor.value ? 'adi-valor' : 'adi-comprovante')?.focus()
    return
  }
  emit('registrar', {
    resp: resp.value,
    valor: valor.value,
    data: data.value,
    momento: momento.value,
    pago: pago.value,
    comprovante: comprovante.value,
  }, arquivoComprovante.value)
  valor.value = 0
  pago.value = false
  comprovante.value = null
  arquivoComprovante.value = null
  if (inputArquivo.value) inputArquivo.value.value = ''
}

function pagarComArquivo(e: Event, id: string) {
  const el = e.target as HTMLInputElement
  const arquivo = el.files?.[0] ?? null
  el.value = ''
  if (arquivo) emit('pagar', id, arquivo)
}

const botaoPagar =
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]'
const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] text-[var(--ink)]'
const rotuloCampo = 'flex flex-col gap-1 text-[length:var(--fs-label)] font-bold'
</script>

<template>
  <section class="flex flex-col gap-4" aria-label="Comissão">
    <div class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <p class="m-0 text-[length:var(--fs-label)] font-bold text-[var(--ink-soft)]">
        Comissão total ({{ processo.pct }}% de {{ brl(processo.valor) }})
      </p>
      <p class="m-0 text-[length:var(--fs-title)] font-bold" data-testid="comissao-total">
        {{ brl(comissao.total) }}
      </p>
      <p class="m-0 text-[var(--ink-soft)]">
        Adiantado (só o pago) {{ brl(comissao.adiantado) }}
      </p>
      <p class="m-0 mt-2 text-[length:var(--fs-label)] font-bold text-[var(--ink-soft)]">Comissão final a receber</p>
      <p class="m-0 text-[length:var(--fs-title-sm)] font-bold" data-testid="comissao-final">
        {{ brl(comissao.restante) }}
      </p>
    </div>

    <ul class="m-0 [display:grid] list-none gap-3 p-0 sm:grid-cols-3">
      <li
        v-for="p in comissao.partes"
        :key="p.resp"
        class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
        :data-testid="`parte-${p.resp}`"
      >
        <p class="m-0 font-bold">{{ ROTULO[p.resp] }} · {{ p.pct }}%</p>
        <p class="m-0 text-[length:var(--fs-title-sm)] font-bold">{{ brl(p.total) }}</p>
        <p class="m-0 text-[var(--ink-soft)]">Adiantado (pago) {{ brl(p.adiantado) }}</p>
        <p class="m-0 text-[var(--ink-soft)]">Restante {{ brl(p.restante) }}</p>
      </li>
    </ul>

    <div class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <h3 class="m-0 mb-3 text-[length:var(--fs-body)] font-bold">Adiantamentos</h3>

      <p v-if="!processo.adiantamentos.length" class="m-0 text-[var(--ink-soft)]">Nenhum adiantamento registrado.</p>
      <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="a in processo.adiantamentos"
          :key="a.id"
          class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-b-0"
          data-testid="adiantamento-item"
        >
          <span>
            <strong>{{ brl(a.valor) }}</strong> · {{ ROTULO[a.resp] }} ·
            {{ a.data.split('-').reverse().join('/') }} · {{ ROTULO_MOMENTO[a.momento ?? 'adiantamento'] }} ·
            <span class="text-[var(--ink-soft)]">por {{ a.quem }}</span>
            <br />
            <span :class="a.pago ? 'font-bold text-[#064e3b]' : 'text-[var(--ink-soft)]'" data-testid="adiantamento-pago">
              {{ a.pago ? '✓ Pago' : 'Não pago' }}
            </span>
            <span v-if="a.comprovante" class="text-[var(--ink-soft)]" data-testid="adiantamento-comprovante">
              · Comprovante: {{ a.comprovante }}
            </span>
          </span>
          <span v-if="editavel && !a.pago" class="flex flex-wrap gap-2">
            <button
              v-if="a.comprovante"
              type="button"
              :class="botaoPagar"
              :aria-label="`Marcar como pago o adiantamento de ${brl(a.valor)}`"
              data-testid="adiantamento-marcar-pago"
              @click="emit('pagar', a.id, null)"
            >
              Marcar como pago
            </button>
            <label v-else :class="botaoPagar" data-testid="adiantamento-anexar-pagar">
              Anexar comprovante e marcar como pago<span class="sr-only"> ({{ brl(a.valor) }})</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="sr-only" data-testid="adiantamento-pagar-arquivo" @change="pagarComArquivo($event, a.id)" />
            </label>
          </span>
          <button
            v-if="editavel"
            type="button"
            class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--danger-line)] bg-[var(--paper)] px-3 font-bold text-[var(--danger)] hover:bg-[var(--danger-ghost)]"
            :aria-label="`Remover adiantamento de ${brl(a.valor)}`"
            @click="emit('remover', a.id)"
          >
            Remover
          </button>
        </li>
      </ul>

      <form v-if="editavel" class="mt-4 [display:grid] items-start gap-3 sm:grid-cols-2" novalidate @submit.prevent="registrar">
        <label :class="rotuloCampo">
          Responsável
          <select v-model="resp" :class="campo" data-testid="adiantamento-resp">
            <option v-for="(rot, k) in ROTULO" :key="k" :value="k">{{ rot }}</option>
          </select>
        </label>
        <label :class="rotuloCampo">
          Valor
          <GestaoCampoMoeda
            id="adi-valor"
            v-model="valor"
            :invalido="!!erroValor"
            data-testid="adiantamento-valor"
            :aria-describedby="erroValor ? 'adi-e-valor' : undefined"
            @input="erroValor = ''"
          />
          <span v-if="erroValor" id="adi-e-valor" class="font-semibold text-[var(--danger)]" role="alert" data-testid="adiantamento-erro">{{ erroValor }}</span>
        </label>
        <label :class="rotuloCampo">
          Data
          <input v-model="data" type="date" :class="campo" data-testid="adiantamento-data" />
        </label>
        <label :class="rotuloCampo">
          Momento
          <select v-model="momento" :class="campo" data-testid="adiantamento-momento">
            <option v-for="(rot, k) in ROTULO_MOMENTO" :key="k" :value="k">{{ rot }}</option>
          </select>
        </label>
        <label :class="rotuloCampo">
          Comprovante
          <input
            ref="inputArquivo"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            class="min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-2 py-2 text-[length:var(--fs-ui)]"
            id="adi-comprovante"
            data-testid="adiantamento-comprovante-arquivo"
            :aria-invalid="erroComprovante ? 'true' : undefined"
            :aria-describedby="erroComprovante ? 'adi-e-comprovante' : undefined"
            @change="escolherArquivo($event); erroComprovante = ''"
          />
          <span v-if="erroComprovante" id="adi-e-comprovante" class="font-semibold text-[var(--danger)]" role="alert">{{ erroComprovante }}</span>
        </label>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 font-bold">
          <input v-model="pago" type="checkbox" class="size-5 accent-[var(--brand)]" data-testid="adiantamento-pago-check" />
          Pago
        </label>
        <button
          type="submit"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 sm:col-span-2 sm:w-fit"
          data-testid="adiantamento-registrar"
        >
          Registrar
        </button>
      </form>
      <p v-else class="m-0 mt-3 text-[var(--ink-soft)]">Adiantamentos só para consulta: o processo está encerrado ou o financeiro não está aberto para edição.</p>
    </div>
  </section>
</template>
