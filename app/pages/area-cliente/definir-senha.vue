<script setup lang="ts">
import { credencialDaUrl, linkRecusadoNaUrl, validarNovaSenha, type TipoDeLink } from '~~/shared/utils/auth-credencial'

/**
 * Destino do link de convite do cliente.
 *
 * Sem o middleware `portal` de propósito: quem chega ainda não tem sessão — é o
 * token da URL que vai criá-la.
 *
 * A leitura da credencial mora em `shared/utils/auth-credencial.ts`, junto com
 * a do painel: era o mesmo bloco copiado nos dois arquivos, e o que difere de
 * verdade é só o client do Supabase e o destino depois de salvar.
 */
// Mesma moldura do login (`PortalAuthShell`): o convite cai aqui, e é a
// primeira tela do portal que o cliente vê.
definePageMeta({ layout: false })

const tenant = useTenant()

const password = ref('')
const confirmPassword = ref('')
const state = ref<'verificando' | 'confirmar' | 'confirmando' | 'pronto' | 'salvando' | 'invalido'>('verificando')
const error = ref('')

const pendente = ref<{ tokenHash: string; otp: TipoDeLink } | null>(null)

async function continuar() {
  if (!pendente.value) return
  state.value = 'confirmando'
  try {
    const client = await getPortalSupabase()
    const { error: e } = await client.auth.verifyOtp({
      token_hash: pendente.value.tokenHash,
      type: pendente.value.otp,
    })
    if (e) throw e
    history.replaceState(null, '', window.location.pathname)
    state.value = 'pronto'
  } catch {
    state.value = 'invalido'
  }
}

onMounted(async () => {
  const client = await getPortalSupabase()
  const credencial = credencialDaUrl(window.location.href)

  // Link antigo (`action_link`) que o Supabase já recusou: o motivo vem no
  // fragmento, e a sessão que houver no navegador é de outra pessoa ou velha.
  if (!credencial && linkRecusadoNaUrl(window.location.href)) {
    state.value = 'invalido'
    return
  }

  // O link novo NÃO é verificado ao abrir: a prévia do WhatsApp e o antivírus
  // do e-mail também "abrem" — e gastariam o convite (BUG-FUN-03). Só o clique
  // em "Continuar" gasta o token.
  if (credencial?.tipo === 'token_hash') {
    pendente.value = { tokenHash: credencial.tokenHash, otp: credencial.otp }
    state.value = 'confirmar'
    return
  }

  try {
    if (credencial?.tipo === 'code') {
      const { error: e } = await client.auth.exchangeCodeForSession(credencial.code)
      if (e) throw e
    } else if (credencial?.tipo === 'tokens') {
      const { error: e } = await client.auth.setSession({
        access_token: credencial.accessToken,
        refresh_token: credencial.refreshToken,
      })
      if (e) throw e
    } else {
      // Sem credencial na URL não quer dizer link inválido: também é o caso de
      // quem já estava logado e abriu o endereço direto.
      const { data } = await client.auth.getSession()
      if (!data.session) {
        state.value = 'invalido'
        return
      }
    }
    // Tira a credencial da barra de endereço: sem isto ela fica no histórico e
    // em qualquer print que a pessoa mandar pedindo ajuda.
    history.replaceState(null, '', window.location.pathname)
    state.value = 'pronto'
  } catch {
    state.value = 'invalido'
  }
})

async function salvar() {
  const problema = validarNovaSenha(password.value, confirmPassword.value)
  if (problema) {
    error.value = problema
    return
  }
  state.value = 'salvando'
  error.value = ''
  try {
    const client = await getPortalSupabase()
    const { error: e } = await client.auth.updateUser({ password: password.value })
    if (e) throw e
    await navigateTo('/area-cliente')
  } catch (e: unknown) {
    // Antes isto mostrava `err.message` cru, que vem do Supabase em INGLÊS.
    // `friendly-error.ts` existe exatamente para isso ("nunca a frase crua do
    // banco") e o painel já usava; a cópia daqui tinha derivado. O lado pior
    // para derivar: quem lê esta tela é o cliente final, que não tem a quem
    // recorrer além do WhatsApp da imobiliária.
    error.value = friendlyErrorMessage(e, 'Não foi possível definir a senha.')
    state.value = 'pronto'
  }
}

useHead({
  title: 'Definir senha da Área do Cliente',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    // O token do convite fica na URL (`?token_hash=`) até o clique em
    // "Continuar", e esta tela tem link externo (crédito no rodapé). O
    // Referrer-Policy global já manda só a origem para fora; isto zera o
    // Referer inteiro aqui, como o OWASP recomenda para telas de redefinição —
    // defesa que não depende de alguém lembrar do cabeçalho em nuxt.config.
    { name: 'referrer', content: 'no-referrer' },
  ],
})
</script>

<template>
  <PortalAuthShell>
    <div>
      <!--
        O título nomeia o destino, e não por preciosismo: esta tela é gêmea de
        `/admin/definir-senha`, e um convite que caísse na errada era
        indistinguível do certo — foi assim que um bug de redirecionamento
        passou despercebido, com a pessoa preenchendo a senha inteira antes de
        descobrir que estava no lugar errado.

        O `PortalAuthShell` já põe logo e nome da imobiliária no topo; o que
        faltava era dizer QUAL acesso está sendo criado.
      -->
      <h1>Definir sua senha da Área do Cliente</h1>

      <p v-if="state === 'verificando'" class="pa-sub">Verificando o convite…</p>

      <!-- MELHORIA 04: o porquê e o próximo passo, em vez de só "não é válido".
           O Supabase não distingue "já usado" de "vencido"; a frase cobre os
           dois sem chutar. -->
      <div v-else-if="state === 'invalido'">
        <p class="pa-sub">
          Este link já foi usado ou passou do prazo. Por segurança, cada link
          vale uma vez só e por pouco tempo.
        </p>
        <p class="pa-sub">
          Se você já definiu sua senha, é só entrar. Se não lembra, peça um link
          novo — ele chega no seu e-mail em instantes.
        </p>
        <NuxtLink to="/area-cliente/login" class="pa-link">Ir para o login</NuxtLink>
        <NuxtLink to="/area-cliente/recuperar-senha" class="pa-link">Pedir um link novo</NuxtLink>
      </div>

      <div v-else-if="state === 'confirmar' || state === 'confirmando'">
        <p class="pa-sub">
          Continue para escolher a senha do seu acesso
          <template v-if="tenant?.name">à {{ tenant.name }}</template>.
        </p>
        <button class="pa-btn" type="button" :disabled="state === 'confirmando'" @click="continuar">
          {{ state === 'confirmando' ? 'Conferindo o link…' : 'Continuar' }}
        </button>
      </div>

      <template v-else>
        <p class="pa-sub">
          Escolha uma senha para acessar seus contratos e documentos
          <template v-if="tenant?.name">na {{ tenant.name }}</template>.
        </p>

        <form @submit.prevent="salvar">
          <label class="pa-lbl" for="senha">Nova senha</label>
          <AuthPasswordField id="senha" v-model="password" autocomplete="new-password" />

          <label class="pa-lbl" for="confirma">Repita a senha</label>
          <AuthPasswordField id="confirma" v-model="confirmPassword" autocomplete="new-password" />

          <p v-if="error" class="pa-erro" role="alert">{{ error }}</p>

          <!-- O rótulo diz para onde leva: é a última chance de perceber que se
               está na tela errada antes de entregar a senha. -->
          <button class="pa-btn" type="submit" :disabled="state === 'salvando'">
            {{ state === 'salvando' ? 'Salvando…' : 'Definir senha e entrar na Área do Cliente' }}
          </button>
        </form>
      </template>
    </div>
  </PortalAuthShell>
</template>

<style scoped>
.pa-sub {
  margin: 8px 0 16px;
}
.pa-link {
  display: inline-block;
  margin-top: 4px;
}
.pa-link + .pa-link {
  margin-left: 16px;
}
</style>
