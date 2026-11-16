<script setup lang="ts">
import { REQUISITOS_SENHA, validarSenha } from '../../domain/auth'

/**
 * Campo de senha com mostrar/ocultar. Com `requisitos`, mostra também o medidor
 * de força e a lista do que falta — as regras vêm de `REQUISITOS_SENHA`, a mesma
 * fonte que o domínio usa para validar, então tela e regra não divergem.
 *
 * O medidor e a lista dizem o estado em TEXTO («Forte», «Cumprido»): cor sozinha
 * não chega a quem não distingue verde de vermelho.
 */
const props = withDefaults(
  defineProps<{
    label: string
    id: string
    email?: string
    nome?: string
    requisitos?: boolean
    autocomplete?: 'new-password' | 'current-password'
    testid?: string
    erro?: string
  }>(),
  { email: '', nome: '', requisitos: false, autocomplete: 'new-password', testid: undefined, erro: '' },
)

const modelo = defineModel<string>({ default: '' })
const visivel = ref(false)

const resultado = computed(() => validarSenha(modelo.value, { email: props.email, nome: props.nome }))
const itens = computed(() =>
  REQUISITOS_SENHA.map((r) => ({
    id: r.id,
    rotulo: r.rotulo,
    ok: r.ok(modelo.value, { email: props.email, nome: props.nome }),
  })),
)

const ROTULOS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte']
const COR = ['bg-[var(--line-2)]', 'bg-[var(--danger)]', 'bg-[var(--accent)]', 'bg-[var(--ok)]', 'bg-[var(--ok)]']
const idAjuda = computed(() => `${props.id}-ajuda`)
const idErro = computed(() => `${props.id}-erro`)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="font-bold">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        v-model="modelo"
        :type="visivel ? 'text' : 'password'"
        :autocomplete="autocomplete"
        autocapitalize="none"
        spellcheck="false"
        class="min-h-12 w-full rounded-xl border-[1.5px] bg-[var(--paper)] py-2 pr-24 pl-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        :class="erro ? 'border-[var(--danger)]' : 'border-[var(--line-2)]'"
        :aria-invalid="!!erro"
        :aria-describedby="[requisitos ? idAjuda : '', erro ? idErro : ''].filter(Boolean).join(' ') || undefined"
        :data-testid="testid"
      />
      <button
        type="button"
        class="absolute top-0.5 right-0.5 min-h-11 min-w-20 cursor-pointer rounded-lg px-3 font-bold text-[var(--brand)] hover:bg-[var(--brand-ghost)] focus-visible:outline-3 focus-visible:outline-[var(--brand)]"
        :aria-pressed="visivel"
        :aria-controls="id"
        @click="visivel = !visivel"
      >
        {{ visivel ? 'Ocultar' : 'Mostrar' }}
      </button>
    </div>

    <p v-if="erro" :id="idErro" role="alert" class="m-0 font-semibold text-[var(--danger)]">{{ erro }}</p>

    <div v-if="requisitos" :id="idAjuda" class="flex flex-col gap-2" data-testid="senha-requisitos">
      <div class="flex items-center gap-2" data-testid="senha-forca" :data-forca="resultado.forca">
        <div class="flex flex-1 gap-1" aria-hidden="true">
          <span
            v-for="n in 4"
            :key="n"
            class="h-1.5 flex-1 rounded-full"
            :class="n <= resultado.forca ? COR[resultado.forca] : 'bg-[var(--line)]'"
          />
        </div>
        <span class="min-w-24 text-right text-[length:var(--fs-label)] font-bold text-[var(--ink-soft)]">
          Força: {{ ROTULOS[resultado.forca] }}
        </span>
      </div>
      <ul class="m-0 [display:grid] list-none grid-cols-1 gap-x-4 gap-y-0.5 p-0 text-[length:var(--fs-label)] sm:grid-cols-2">
        <li v-for="i in itens" :key="i.id" class="flex items-start gap-1.5" :data-ok="i.ok">
          <span :class="i.ok ? 'text-[var(--ok)]' : 'text-[var(--ink-soft)]'" aria-hidden="true">{{ i.ok ? '✓' : '○' }}</span>
          <span :class="i.ok ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'">
            {{ i.rotulo }}<span class="sr-only">: {{ i.ok ? 'cumprido' : 'pendente' }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
