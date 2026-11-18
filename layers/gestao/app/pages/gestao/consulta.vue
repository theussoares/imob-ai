<script setup lang="ts">
import { brl } from '../../../domain/acoes-processo'
import {
  FINALIDADES,
  ROTULO_SITUACAO_CONSULTA,
  type ConsultaFeita,
  type Finalidade,
} from '../../../domain/consulta'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `consulta`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Consulta cadastral · Gestão' })

const store = useGestaoStore()
await store.carregar()

const documento = ref('')
const finalidade = ref<Finalidade | ''>('')
const contratoId = ref('')
const erro = ref('')
const resultado = ref<ConsultaFeita | null>(null)

const contratos = computed(() => [
  ...store.visiveis.value.map((p) => ({ id: p.id, rotulo: `${p.id} · venda · ${p.imovel}` })),
  ...store.locacoesVisiveis.value.map((l) => ({ id: l.id, rotulo: `${l.id} · locação · ${l.imovel}` })),
])

async function consultar() {
  const r = await store.consultar({ documento: documento.value, finalidade: finalidade.value, contratoId: contratoId.value })
  if (!r.ok) {
    erro.value = r.erro
    resultado.value = null
    return
  }
  erro.value = ''
  resultado.value = r.consulta
  // O documento digitado não fica na tela depois da consulta: só a versão mascarada do histórico.
  documento.value = ''
}

const dia = (iso: string) => iso.split('-').reverse().join('/')
const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const card = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5'
const th = 'px-3 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]'
const td = 'px-3 py-2 align-top text-[length:var(--fs-ui)]'
</script>

<template>
  <div class="flex flex-col gap-4">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-extrabold">Consulta cadastral</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Verifique restrições de crédito de locatário, comprador ou fiador.</p>
    </header>

    <p class="m-0 rounded-xl border-2 border-dashed border-[var(--accent)] p-3 text-[length:var(--fs-label)]" data-testid="consulta-aviso-simulada">
      <strong class="text-[var(--accent)]">Resultado simulado:</strong> ainda não há contrato com SPC ou Serasa. Os dados abaixo
      são de exemplo e não valem como consulta real.
    </p>

    <form :class="card" class="[display:grid] gap-3 md:grid-cols-[1fr_14rem]" novalidate @submit.prevent="consultar">
      <label :class="rotulo">CPF ou CNPJ
        <input v-model="documento" :class="campo" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" data-testid="consulta-documento" />
      </label>
      <label :class="rotulo">Finalidade
        <select v-model="finalidade" :class="campo" data-testid="consulta-finalidade">
          <option value="" disabled>Escolha…</option>
          <option v-for="f in FINALIDADES" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label :class="rotulo" class="md:col-span-2">Contrato relacionado (opcional)
        <select v-model="contratoId" :class="campo" data-testid="consulta-contrato">
          <option value="">Nenhum</option>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.rotulo }}</option>
        </select>
      </label>
      <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)] md:col-span-2" data-testid="consulta-erro">{{ erro }}</p>
      <div class="md:col-span-2">
        <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-5 font-bold text-[var(--brand)] hover:opacity-90" data-testid="consulta-enviar">
          Consultar
        </button>
      </div>
    </form>

    <section v-if="resultado" :class="card" class="[display:grid] gap-3" aria-labelledby="res-titulo" data-testid="consulta-resultado">
      <h2 id="res-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">
        {{ resultado.documentoMascarado }} ·
        <span :class="resultado.situacao === 'com-restricoes' ? 'text-[#7f1d1d]' : 'text-[#064e3b]'" data-testid="consulta-situacao">
          {{ ROTULO_SITUACAO_CONSULTA[resultado.situacao] }}
        </span>
      </h2>
      <p class="m-0 text-[var(--ink-soft)]">
        Pontuação de exemplo: <strong class="text-[var(--ink)]" data-testid="consulta-score">{{ resultado.score }}</strong> de 1000.
      </p>
      <ul v-if="resultado.restricoes.length" class="m-0 flex list-none flex-col gap-2 p-0" data-testid="consulta-restricoes">
        <li v-for="(r, i) in resultado.restricoes" :key="i" class="rounded-xl border border-[var(--line)] p-3">
          <strong>{{ r.fonte }}</strong> · {{ r.credor }} · {{ brl(r.valor) }} · desde {{ dia(r.desde) }}
        </li>
      </ul>
      <p v-else class="m-0 text-[var(--ink-soft)]">Nenhuma restrição encontrada.</p>
    </section>

    <section :class="card" aria-labelledby="hist-consultas">
      <h2 id="hist-consultas" class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-extrabold">Consultas feitas ({{ store.consultas.value.length }})</h2>
      <p v-if="!store.consultas.value.length" class="m-0 text-[var(--ink-soft)]" data-testid="consulta-vazio">Nenhuma consulta feita ainda.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse" data-testid="consulta-historico">
          <caption class="sr-only">Histórico de consultas, da mais recente à mais antiga</caption>
          <thead>
            <tr>
              <th :class="th">Quando</th>
              <th :class="th">Documento</th>
              <th :class="th">Finalidade</th>
              <th :class="th">Resultado</th>
              <th :class="th">Quem</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in store.consultas.value" :key="c.id" class="border-t border-[var(--line)]" data-testid="consulta-linha">
              <td :class="td" class="whitespace-nowrap">{{ c.quando }}</td>
              <td :class="td">{{ c.documentoMascarado }}<div v-if="c.contratoId" class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ c.contratoId }}</div></td>
              <td :class="td">{{ c.finalidade }}</td>
              <td :class="td" class="font-bold">{{ ROTULO_SITUACAO_CONSULTA[c.situacao] }}</td>
              <td :class="td">{{ c.quem }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
