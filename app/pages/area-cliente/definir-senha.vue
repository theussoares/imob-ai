<script setup lang="ts">
/**
 * Destino do link de convite do cliente.
 *
 * Sem o middleware `portal` de propósito: quem chega ainda não tem sessão — é o
 * token da URL que vai criá-la. É o mesmo desenho de
 * `app/pages/admin/definir-senha.vue`, com o client do PORTAL.
 */
definePageMeta({ layout: 'portal' })

const password = ref('')
const confirmPassword = ref('')
const state = ref<'verificando' | 'pronto' | 'salvando' | 'invalido'>('verificando')
const error = ref('')

onMounted(async () => {
  const client = await getPortalSupabase()

  // O Supabase entrega a credencial de duas formas conforme o fluxo do projeto:
  // PKCE devolve `?code=`, o implícito devolve tokens no fragmento (`#`). Tratar
  // só um deixaria a pessoa numa tela morta, sem explicação — e aqui ela é um
  // cliente final, que não tem a quem recorrer além do WhatsApp da imobiliária.
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')

  try {
    if (code) {
      const { error: e } = await client.auth.exchangeCodeForSession(code)
      if (e) throw e
    } else if (accessToken && refreshToken) {
      const { error: e } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (e) throw e
    } else {
      // Também cobre quem já estava logado e abriu a URL direto.
      const { data } = await client.auth.getSession()
      if (!data.session) {
        state.value = 'invalido'
        return
      }
    }
    // Tira a credencial da barra de endereço: sem isto ela fica no histórico e
    // em qualquer print que a pessoa mandar pedindo ajuda.
    history.replaceState(null, '', url.pathname)
    state.value = 'pronto'
  } catch {
    state.value = 'invalido'
  }
})

async function salvar() {
  if (password.value.length < 8) {
    error.value = 'A senha precisa ter pelo menos 8 caracteres.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'As duas senhas não são iguais.'
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
    const err = e as { message?: string }
    error.value = err?.message || 'Não foi possível definir a senha.'
    state.value = 'pronto'
  }
}

useHead({
  title: 'Definir senha · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="senha-wrap">
    <div class="senha-card">
      <h1>Definir sua senha</h1>

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

      <form v-else @submit.prevent="salvar">
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

        <button class="btn" type="submit" :disabled="state === 'salvando'">
          {{ state === 'salvando' ? 'Salvando…' : 'Salvar e entrar' }}
        </button>
      </form>
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
