<script setup lang="ts">
import type { PaymentAccountView, PaymentEnvironment, PaymentProviderName } from '~~/shared/models/cobranca'
import { PROVIDER_LABELS } from '~~/shared/models/cobranca'

/**
 * Configurações → Cobrança: conectar a conta DA IMOBILIÁRIA no Asaas ou na Cora (spec B2).
 *
 * A chave (Asaas) ou o certificado e a chave privada (Cora) vão para o servidor
 * uma vez e nunca voltam: depois de conectada, a tela só conhece os 4 últimos
 * caracteres. Por isso "trocar" pede tudo de novo, em vez de mostrar o atual
 * num campo editável. Os arquivos são lidos no navegador e enviados como texto;
 * não ficam em nenhum estado depois do envio.
 */
const conta = ref<PaymentAccountView | null>(null)
/** Último evento do provedor desde a conexão (MELHORIA 02). */
const ultimoAviso = ref<string | null>(null)
const carregando = ref(true)
const erroCarga = ref('')
const editando = ref(false)

const provider = ref<PaymentProviderName>('asaas')
const environment = ref<PaymentEnvironment>('sandbox')
const apiKey = ref('')
const clientId = ref('')
const certificatePem = ref('')
const privateKeyPem = ref('')
const nomeCertificado = ref('')
const nomeChave = ref('')
const salvando = ref(false)
const erro = ref('')
const ok = ref('')
const confirmandoSaida = ref(false)

async function carregar() {
  carregando.value = true
  erroCarga.value = ''
  try {
    const r = await adminFetch<{ conta: PaymentAccountView | null; ultimoAviso: string | null }>('/api/admin/cobranca/conta')
    conta.value = r.conta
    ultimoAviso.value = r.ultimoAviso
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

/** Lê um arquivo .pem/.key escolhido pelo usuário. Limite curto: um certificado tem ~2 KB. */
async function lerArquivo(ev: Event, alvo: 'certificado' | 'chave') {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  if (f.size > 20_000) {
    erro.value = 'Esse arquivo é grande demais para ser um certificado ou uma chave da Cora.'
    return
  }
  erro.value = ''
  const texto = await f.text()
  if (alvo === 'certificado') {
    certificatePem.value = texto
    nomeCertificado.value = f.name
  } else {
    privateKeyPem.value = texto
    nomeChave.value = f.name
  }
}

async function conectar() {
  erro.value = ''
  ok.value = ''
  if (provider.value === 'asaas' && !apiKey.value.trim()) {
    erro.value = 'Cole a chave de API do Asaas.'
    return
  }
  if (provider.value === 'cora' && (!clientId.value.trim() || !certificatePem.value || !privateKeyPem.value)) {
    erro.value = 'Informe o client_id e envie o certificado (.pem) e a chave privada (.key) da Cora.'
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
        clientId: provider.value === 'cora' ? clientId.value.trim() : undefined,
        certificatePem: provider.value === 'cora' ? certificatePem.value : undefined,
        privateKeyPem: provider.value === 'cora' ? privateKeyPem.value : undefined,
      },
    })
    conta.value = r.conta
    ultimoAviso.value = null
    apiKey.value = ''
    clientId.value = ''
    certificatePem.value = ''
    privateKeyPem.value = ''
    nomeCertificado.value = ''
    nomeChave.value = ''
    editando.value = false
    ok.value = provider.value === 'simulado' ? 'Modo de demonstração ligado.' : 'Conta conectada. Os pagamentos passam a baixar sozinhos.'
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
const nomeDoProvedor = computed(() => (conta.value ? PROVIDER_LABELS[conta.value.provider].split(' (')[0]! : ''))
const diasParaVencer = computed(() => {
  const v = conta.value?.certificateExpiresAt
  return v ? Math.floor((Date.parse(v) - Date.now()) / 86_400_000) : null
})
const validadeDoCertificado = computed(() =>
  conta.value?.certificateExpiresAt
    ? new Date(conta.value.certificateExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '',
)
const dataConexao = computed(() =>
  conta.value ? new Date(conta.value.connectedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
)
</script>

<template>
  <section class="admin-card cc" aria-labelledby="cc-t">
    <h3 id="cc-t" class="section-t cc-t">Cobrança por boleto e Pix</h3>
    <p class="hint-text cc-intro">
      Os boletos saem pela conta da imobiliária no Asaas ou na Cora: o dinheiro cai direto no CNPJ de vocês, e o
      pagamento baixa sozinho no contrato.
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
          <b>{{ nomeDoProvedor }}{{ conta.accountName && conta.provider !== 'simulado' ? `: ${conta.accountName}` : '' }}</b>
          <small v-if="conta.apiKeyLast4">Chave terminando em ••••{{ conta.apiKeyLast4 }}, conectada em {{ dataConexao }}</small>
          <small v-else-if="conta.provider === 'cora'">
            client_id terminando em ••••{{ conta.clientIdLast4 }}, conectada em {{ dataConexao }}. Certificado válido até {{ validadeDoCertificado }}.
          </small>
          <small v-if="conta.provider === 'cora' && diasParaVencer !== null && diasParaVencer <= 30" class="cc-aviso" role="alert">
            {{ diasParaVencer < 0 ? 'O certificado da Cora venceu: os boletos novos não saem.' : `O certificado da Cora vence em ${diasParaVencer} dias.` }}
            Gere um novo na Cora e use "Trocar conta" para enviá-lo.
          </small>
          <small v-else>Boletos de mentira, para apresentar o fluxo. Nada é cobrado de ninguém.</small>
          <small v-if="conta.provider !== 'simulado' && ultimoAviso" class="cc-aviso ok">
            Último aviso de pagamento d{{ conta.provider === 'cora' ? 'a' : 'o' }} {{ nomeDoProvedor }}: {{ new Date(ultimoAviso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
          </small>
          <small v-else-if="conta.provider !== 'simulado'" class="cc-aviso">
            Nenhum aviso {{ conta.provider === 'cora' ? 'da' : 'do' }} {{ nomeDoProvedor }} desde a conexão. É normal se nenhum boleto foi pago ainda; se um pagamento
            não baixou sozinho, use "Consultar" na cobrança e reconecte a conta aqui.
          </small>
        </div>
        <div class="cc-acoes">
          <button type="button" class="admin-btn ghost sm" @click="trocar">Trocar conta</button>
          <button v-if="!confirmandoSaida" type="button" class="admin-btn danger-ghost sm" @click="confirmandoSaida = true">
            Desconectar
          </button>
        </div>
        <div v-if="confirmandoSaida" class="cc-confirma" role="alertdialog" aria-labelledby="cc-conf-t">
          <p id="cc-conf-t">
            <b>Desconectar a cobrança?</b> Os boletos já emitidos continuam valendo no provedor, mas o pagamento deles
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
          <label class="cc-opcao" :class="{ on: provider === 'cora' }">
            <input v-model="provider" type="radio" value="cora" />
            <span>
              <b>Minha conta Cora</b>
              <small>Boleto registrado com Pix no mesmo documento, pela conta PJ da imobiliária na Cora.</small>
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

        <template v-if="provider === 'asaas' || provider === 'cora'">
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
          <template v-if="provider === 'cora'">
            <div>
              <label class="admin-label" for="cc-cid">client_id</label>
              <input id="cc-cid" v-model="clientId" class="admin-input" autocomplete="off" spellcheck="false" placeholder="int-…" />
            </div>
            <div>
              <label class="admin-label" for="cc-cert">Certificado (.pem)</label>
              <input id="cc-cert" class="admin-input" type="file" accept=".pem,.crt,.cer" @change="lerArquivo($event, 'certificado')" />
              <small v-if="nomeCertificado" class="hint-text">Lido: {{ nomeCertificado }}</small>
            </div>
            <div>
              <label class="admin-label" for="cc-pk">Chave privada (.key)</label>
              <input id="cc-pk" class="admin-input" type="file" accept=".key,.pem" @change="lerArquivo($event, 'chave')" />
              <small v-if="nomeChave" class="hint-text">Lido: {{ nomeChave }}</small>
            </div>
            <p class="hint-text">
              Na Cora: <b>Conta → Integrações via APIs → Integração direta</b> gera o client_id, o certificado e a
              chave. Os dois arquivos são guardados cifrados e não aparecem de novo nesta tela. O certificado tem
              validade: avisamos antes de vencer.
            </p>
          </template>
          <div v-else>
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
            {{ salvando ? `Conferindo com ${provider === 'cora' ? 'a Cora' : 'o Asaas'}…` : provider === 'simulado' ? 'Ligar demonstração' : 'Conectar conta' }}
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
.cc-aviso {
  color: #92400e;
}
.cc-aviso.ok {
  color: var(--ink-soft);
}
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
  grid-template-columns: 1fr 1fr 1fr;
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
  color: var(--ok);
  font-weight: 600;
}
@media (max-width: 560px) {
  .cc-opcoes {
    grid-template-columns: 1fr;
  }
}
</style>
