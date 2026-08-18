<script setup lang="ts">
/**
 * Destino do link de convite: aqui a pessoa define a própria senha.
 *
 * Não usa o middleware `admin` de propósito — quem chega ainda não tem sessão
 * estabelecida; é justamente o token da URL que vai criá-la.
 */
definePageMeta({ layout: false });

const password = ref("");
const confirmPassword = ref("");
const state = ref<"verificando" | "pronto" | "salvando" | "invalido">(
  "verificando",
);
const error = ref("");

onMounted(async () => {
  const client = await getAdminSupabase();

  // O Supabase entrega a credencial de duas formas conforme o fluxo do projeto:
  // PKCE devolve `?code=`, o implícito devolve tokens no fragmento (`#`). Qual
  // deles chega depende de configuração do projeto, então trato os dois — errar
  // aqui deixaria a pessoa numa tela morta, sem explicação.
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");

  try {
    if (code) {
      const { error: e } = await client.auth.exchangeCodeForSession(code);
      if (e) throw e;
    } else if (accessToken && refreshToken) {
      const { error: e } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (e) throw e;
    } else {
      // Também cobre quem já estava logado e abriu a URL direto.
      const { data } = await client.auth.getSession();
      if (!data.session) {
        state.value = "invalido";
        return;
      }
    }
    // Tira a credencial da barra de endereço: sem isto ela fica no histórico e
    // em qualquer print que a pessoa mandar pedindo ajuda.
    history.replaceState(null, "", url.pathname);
    state.value = "pronto";
  } catch {
    state.value = "invalido";
  }
});

async function save() {
  if (password.value.length < 8) {
    error.value = "A senha precisa ter pelo menos 8 caracteres.";
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = "As duas senhas não são iguais.";
    return;
  }
  state.value = "salvando";
  error.value = "";
  try {
    const client = await getAdminSupabase();
    const { error: e } = await client.auth.updateUser({
      password: password.value,
    });
    if (e) throw e;
    await navigateTo("/admin");
  } catch (e: unknown) {
    const err = e as { message?: string };
    error.value = err?.message || "Não foi possível definir a senha.";
    state.value = "pronto";
  }
}

useHead({
  title: "Definir senha · Painel",
  // Página de credencial não tem por que ser indexada.
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>

<template>
  <div class="wrap">
    <div class="card">
      <h1>Definir sua senha</h1>

      <p v-if="state === 'verificando'" class="muted">Verificando convite...</p>

      <template v-else-if="state === 'invalido'">
        <p class="muted">
          Este link de convite não é mais válido — ele pode ter expirado ou já
          ter sido usado.
        </p>
        <p class="muted">
          Peça um novo à pessoa que te convidou, ou
          <NuxtLink to="/admin/login">entre com sua senha</NuxtLink> se você já
          tem acesso.
        </p>
      </template>

      <template v-else>
        <p class="muted">
          Escolha uma senha para entrar no painel. Só você vai saber qual é.
        </p>
        <form @submit.prevent="save">
          <label class="admin-label" for="senha">Nova senha</label>
          <input
            id="senha"
            v-model="password"
            class="admin-input"
            type="password"
            autocomplete="new-password"
          />

          <label class="admin-label" for="senha2">Repita a senha</label>
          <input
            id="senha2"
            v-model="confirmPassword"
            class="admin-input"
            type="password"
            autocomplete="new-password"
          />

          <p v-if="error" class="err">{{ error }}</p>

          <button
            class="admin-btn full"
            type="submit"
            :disabled="state === 'salvando'"
          >
            {{
              state === "salvando" ? "Salvando..." : "Definir senha e entrar"
            }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--surface);
}
.card {
  width: 100%;
  max-width: 400px;
  padding: 28px;
  border-radius: 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
h1 {
  font-family: "Space Grotesk", sans-serif;
  font-size: 21px;
  margin: 0 0 8px;
}
.muted {
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.55;
  margin: 0 0 14px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.admin-label {
  margin-top: 8px;
}
.err {
  color: #b91c1c;
  font-size: 13.5px;
  margin: 10px 0 0;
}
.full {
  width: 100%;
  margin-top: 16px;
}
</style>
