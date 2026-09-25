<script setup lang="ts">
import type { PaymentAccountView, PaymentEnvironment, PaymentProviderName } from '~~/shared/models/cobranca'

/**
 * Configurações → Cobrança: conectar a conta Asaas DA IMOBILIÁRIA (spec B2).
 *
 * A chave vai para o servidor uma vez e nunca volta: depois de conectada, a
 * tela só conhece os 4 últimos caracteres. Por isso "trocar" pede a chave
 * inteira de novo, em vez de mostrar a atual num campo editável.
 */
const conta = ref<PaymentAccountView | null>(null)
const carregando = ref(true)
const erroCarga = ref('')
const editando = ref(false)

const provider = ref<PaymentProviderName>('asaas')
const environment = ref<PaymentEnvironment>('sandbox')
const apiKey = ref('')
const salvando = ref(false)
const erro = ref('')
const ok = ref('')
const confirmandoSaida = ref(false)

async function carregar() {
  carregando.value = true
  erroCarga.value = ''
  try {
    conta.value = (await adminFetch<{ conta: PaymentAccountView | null }>('/api/admin/cobranca/conta')).conta
    editando.value = !conta.value
  } catch {
    erroCarga.value = 'Não foi possível carregar a conta de cobrança.'
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function mensagem(e: unknown, padrao: string) {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || padrao
}

async function conectar() {
  erro.value = ''
  ok.value = ''
  if (provider.value === 'asaas' && !apiKey.value.trim()) {
    erro.value = 'Cole a chave de API do Asaas.'
    return
  }
  salvando.value = true
  try {
    const r = await adminFetch<{ conta: PaymentAccountView }>('/api/admin/cobranca/conta', {
      method: 'PUT',
      body: {
        provider: provider.value,
        environment: provider.value === 'simulado' ? 'sandbox' : environment.value,
        apiKey: provider.value === 'asaas' ? apiKey.value.trim() : undefined,
      },
    })
    conta.value = r.conta
    apiKey.value = ''
    editando.value = false
    ok.value = provider.value === 'asaas' ? 'Conta conectada. Os pagamentos passam a baixar sozinhos.' : 'Modo de demonstração ligado.'
  } catch (e) {
    erro.value = mensagem(e, 'Não foi possível conectar.')
  } finally {
    salvando.value = false
  }
}

async function desconectar() {
  salvando.value = true
  erro.value = ''
  try {
    await adminFetch('/api/admin/cobranca/conta', { method: 'DELETE' })
    conta.value = null
    editando.value = true
    confirmandoSaida.value = false
    ok.value = ''
  } catch (e) {
    erro.value = mensagem(e, 'Não foi possível desconectar.')
  } finally {
    salvando.value = false
  }
}

function trocar() {
  provider.value = conta.value?.provider ?? 'asaas'
  environment.value = conta.value?.environment ?? 'sandbox'
  editando.value = true
  ok.value = ''
}

const ambienteRotulo = (e: PaymentEnvironment) => (e === 'producao' ? 'Produção' : 'Sandbox (testes)')
const dataConexao = computed(() =>
  conta.value ? new Date(conta.value.connectedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
)
</script>

<template>
  <section class="admin-card cc" aria-labelledby="cc-t">
    <h3 id="cc-t" class="section-t cc-t">Cobrança por boleto e Pix</h3>
    <p class="hint-text cc-intro">
      Os boletos saem pela conta da imobiliária no Asaas: o dinheiro cai direto no CNPJ de vocês, e o pagamento
      baixa sozinho no contrato.
    </p>

    <p v-if="carregando" class="hint-text">Carregando…</p>
    <p v-else-if="erroCarga" class="cc-erro" role="alert">
      {{ erroCarga }} <button type="button" class="link-btn" @click="carregar">Tentar de novo</button>
    </p>

    <template v-else>
      <!-- Conectada -->
      <div v-if="conta && !editando" class="cc-ligada">
        <div class="cc-quem">
          <span class="cc-pill" :class="conta.environment === 'producao' ? 'prod' : 'teste'">
            {{ conta.provider === 'simulado' ? 'Demonstração' : ambienteRotulo(conta.environment) }}
          </span>
          <b>{{ conta.provider === 'simulado' ? 'Simulado' : 'Asaas' }}{{ conta.accountName && conta.provider !== 'simulado' ? `: ${conta.accountName}` : '' }}</b>
          <small v-if="conta.apiKeyLast4">Chave terminando em ••••{{ conta.apiKeyLast4 }}, conectada em {{ dataConexao }}</small>
          <small v-else>Boletos de mentira, para apresentar o fluxo. Nada é cobrado de ninguém.</small>
        </div>
        <div class="cc-acoes">
          <button type="button" class="admin-btn ghost sm" @click="trocar">Trocar conta</button>
          <button v-if="!confirmandoSaida" type="button" class="admin-btn danger-ghost sm" @click="confirmandoSaida = true">
            Desconectar
          </button>
        </div>
        <div v-if="confirmandoSaida" class="cc-confirma" role="alertdialog" aria-labelledby="cc-conf-t">
          <p id="cc-conf-t">
            <b>Desconectar a cobrança?</b> Os boletos já emitidos continuam valendo no Asaas, mas o pagamento deles
            deixa de baixar sozinho aqui. Novas cobranças não poderão ser emitidas.
          </p>
          <div class="cc-acoes">
            <button type="button" class="admin-btn danger sm" :disabled="salvando" @click="desconectar">
              {{ salvando ? 'Desconectando…' : 'Desconectar' }}
            </button>
            <button type="button" class="admin-btn ghost sm" @click="confirmandoSaida = false">Manter conectada</button>
          </div>
        </div>
      </div>

      <!-- Conectar -->
      <form v-else class="cc-form" @submit.prevent="conectar">
        <fieldset class="cc-opcoes">
          <legend class="admin-label">Onde emitir</legend>
          <label class="cc-opcao" :class="{ on: provider === 'asaas' }">
            <input v-model="provider" type="radio" value="asaas" />
            <span>
              <b>Minha conta Asaas</b>
              <small>Boleto registrado com Pix no mesmo documento. A tarifa é a do seu plano no Asaas.</small>
            </span>
          </label>
          <label class="cc-opcao" :class="{ on: provider === 'simulado' }">
            <input v-model="provider" type="radio" value="simulado" />
            <span>
              <b>Demonstração</b>
              <small>Emite e "paga" boletos de mentira, para apresentar o fluxo sem conta.</small>
            </span>
          </label>
        </fieldset>

        <template v-if="provider === 'asaas'">
          <div class="cc-amb" role="radiogroup" aria-label="Ambiente">
            <button
              v-for="e in (['sandbox', 'producao'] as const)"
              :key="e"
              type="button"
              role="radio"
              :aria-checked="environment === e"
              class="chip"
              :class="{ on: environment === e }"
              @click="environment = e"
            >
              {{ ambienteRotulo(e) }}
            </button>
          </div>
          <div>
            <label class="admin-label" for="cc-key">Chave de API</label>
            <input
              id="cc-key"
              v-model="apiKey"
              class="admin-input"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :placeholder="environment === 'sandbox' ? '$aact_hmlg_…' : '$aact_prod_…'"
            />
            <p class="hint-text">
              No Asaas: <b>Integrações → Chaves de API → Gerar chave</b>. Ela é guardada cifrada e não aparece de
              novo nesta tela. Para testar sem dinheiro de verdade, crie uma conta grátis em
              <a href="https://sandbox.asaas.com" target="_blank" rel="noopener">sandbox.asaas.com</a>.
            </p>
          </div>
        </template>

        <div class="cc-acoes">
          <button class="admin-btn" type="submit" :disabled="salvando">
            {{ salvando ? 'Conferindo com o Asaas…' : provider === 'asaas' ? 'Conectar conta' : 'Ligar demonstração' }}
          </button>
          <button v-if="conta" type="button" class="admin-btn ghost" @click="editando = false">Cancelar</button>
        </div>
      </form>

      <p v-if="erro" class="cc-erro" role="alert">{{ erro }}</p>
      <p v-if="ok" class="cc-ok" role="status">{{ ok }}</p>
    </template>
  </section>
</template>

<style scoped>
.cc {
  margin-top: 18px;
}
.cc-t {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.cc-intro {
  margin: -4px 0 16px;
  max-width: 62ch;
}
.cc-ligada {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.cc-quem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cc-quem small {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.cc-pill {
  align-self: flex-start;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: var(--fs-caption);
  font-weight: 700;
}
.cc-pill.teste {
  background: #fef3c7;
  color: #92400e;
}
.cc-pill.prod {
  background: #dcfce7;
  color: #166534;
}
.cc-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cc-confirma {
  flex-basis: 100%;
  padding: 14px;
  border-radius: var(--r-md);
  background: #fef2f2;
}
.cc-confirma p {
  margin: 0 0 12px;
  max-width: 62ch;
}
.cc-form {
  display: grid;
  gap: 16px;
  max-width: 620px;
}
.cc-opcoes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.cc-opcoes legend {
  margin-bottom: 8px;
}
.cc-opcao {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 13px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  cursor: pointer;
}
.cc-opcao.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.cc-opcao input {
  margin-top: 3px;
  accent-color: var(--brand);
}
.cc-opcao span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cc-opcao small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
  line-height: 1.45;
}
.cc-amb {
  display: flex;
  gap: 8px;
}
.cc-erro {
  margin: 12px 0 0;
  color: #b91c1c;
}
.cc-ok {
  margin: 12px 0 0;
  color: var(--wa-dark);
  font-weight: 600;
}
@media (max-width: 560px) {
  .cc-opcoes {
    grid-template-columns: 1fr;
  }
}
</style>
