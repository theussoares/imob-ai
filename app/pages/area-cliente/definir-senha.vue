<script setup lang="ts">
import { credencialDaUrl, validarNovaSenha } from '~~/shared/utils/auth-credencial'

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
definePageMeta({ layout: 'portal' })

const tenant = useTenant()

const password = ref('')
const confirmPassword = ref('')
const state = ref<'verificando' | 'pronto' | 'salvando' | 'invalido'>('verificando')
const error = ref('')

onMounted(async () => {
  const client = await getPortalSupabase()
  const credencial = credencialDaUrl(window.location.href)

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
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="senha-wrap">
    <div class="senha-card">
      <!--
        O título nomeia o destino, e não por preciosismo: esta tela é gêmea de
        `/admin/definir-senha`, e um convite que caísse na errada era
        indistinguível do certo — foi assim que um bug de redirecionamento
        passou despercebido, com a pessoa preenchendo a senha inteira antes de
        descobrir que estava no lugar errado.

        O layout `portal` já põe logo e nome da imobiliária no topo; o que
        faltava era dizer QUAL acesso está sendo criado.
      -->
      <h1>Definir sua senha da Área do Cliente</h1>

      <p v-if="state === 'verificando'" class="muted">Verificando o convite…</p>

      <div v-else-if="state === 'invalido'">
        <p class="muted">
          Este link de convite não é mais válido — ele pode ter expirado ou já
          ter sido usado.
        </p>
        <p class="muted">
          Peça um novo convite à imobiliária, ou entre com a senha que você já
          definiu.
        </p>
        <NuxtLink to="/area-cliente/login" class="link">Ir para o login</NuxtLink>
      </div>

      <template v-else>
        <p class="muted">
          Escolha uma senha para acessar seus contratos e documentos
          <template v-if="tenant?.name">na {{ tenant.name }}</template>.
        </p>

        <form @submit.prevent="salvar">
          <label class="lbl" for="senha">Nova senha</label>
          <input
            id="senha"
            v-model="password"
            class="inp"
            type="password"
            autocomplete="new-password"
            required
          >

          <label class="lbl" for="confirma">Repita a senha</label>
          <input
            id="confirma"
            v-model="confirmPassword"
            class="inp"
            type="password"
            autocomplete="new-password"
            required
          >

          <p v-if="error" class="erro" role="alert">{{ error }}</p>

          <!-- O rótulo diz para onde leva: é a última chance de perceber que se
               está na tela errada antes de entregar a senha. -->
          <button class="btn" type="submit" :disabled="state === 'salvando'">
            {{ state === 'salvando' ? 'Salvando…' : 'Definir senha e entrar na Área do Cliente' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.senha-wrap {
  display: grid;
  place-items: center;
  padding: 18px 0 40px;
}
.senha-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 22px 20px;
}
h1 {
  font-size: 21px;
  margin: 0 0 14px;
}
.muted {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 10px;
}
.lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
}
.inp {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  font-size: 16px;
  padding: 11px 12px;
  margin-bottom: 14px;
  background: #fff;
}
.inp:focus {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
.erro {
  color: #b91c1c;
  font-size: 13px;
  margin: 0 0 12px;
}
.btn {
  width: 100%;
  border: 0;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.link {
  display: inline-block;
  margin-top: 8px;
  font-size: 13px;
  color: #4b5563;
}
</style>
