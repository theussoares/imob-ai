<script setup lang="ts">
/**
 * Destino do link de convite e do link de recuperação de senha.
 *
 * NÃO usa o middleware `portal` de propósito: quem chega ainda não tem sessão
 * estabelecida — é o token da URL que vai criá-la.
 *
 * O tratamento dos dois formatos de credencial (PKCE com `?code=` e implícito
 * com tokens no fragmento) é o mesmo da tela equivalente do painel: qual deles
 * chega depende de configuração do projeto, e errar aqui deixa a pessoa numa
 * tela morta sem explicação.
 */
definePageMeta({ layout: "portal" });

const tenant = useTenant();
const password = ref("");
const confirmPassword = ref("");
const state = ref<"verificando" | "pronto" | "salvando" | "invalido" | "ok">(
  "verificando",
);
const error = ref("");

onMounted(async () => {
  const client = await getPortalSupabase();

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
  error.value = "";
  if (password.value.length < 8) {
    error.value = "A senha precisa ter pelo menos 8 caracteres.";
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = "As senhas não são iguais.";
    return;
  }

  state.value = "salvando";
  const client = await getPortalSupabase();
  const { error: e } = await client.auth.updateUser({
    password: password.value,
  });
  if (e) {
    // O Supabase recusa senha vazada quando a proteção está ativa — a mensagem
    // dele é em inglês, então vale traduzir o caso mais provável.
    error.value = /pwned|compromised|weak/i.test(e.message)
      ? "Esta senha aparece em vazamentos conhecidos. Escolha outra."
      : "Não foi possível salvar a senha. Tente novamente.";
    state.value = "pronto";
    return;
  }
  state.value = "ok";
  await navigateTo("/area-cliente");
}

useSeoMeta({
  title: () => `Criar senha — ${tenant.value?.name || ""}`,
  robots: "noindex, nofollow",
});
</script>

<template>
  <div>
    <h1>Criar sua senha</h1>
    <p class="pc-sub">{{ tenant?.name }}</p>

    <p v-if="state === 'verificando'">Verificando o link…</p>

    <template v-else-if="state === 'invalido'">
      <p class="pc-msg erro">
        Este link não é mais válido. Links de acesso expiram — peça um novo à
        imobiliária.
      </p>
      <NuxtLink class="pc-link" to="/area-cliente/login"
        >Ir para o login</NuxtLink
      >
    </template>

    <form v-else @submit.prevent="save">
      <label for="pc-nova">Nova senha</label>
      <input
        id="pc-nova"
        v-model="password"
        type="password"
        autocomplete="new-password"
        required
      />

      <label for="pc-conf">Confirme a senha</label>
      <input
        id="pc-conf"
        v-model="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
      />

      <p v-if="error" class="pc-msg erro">{{ error }}</p>

      <button class="pc-btn" type="submit" :disabled="state === 'salvando'">
        {{ state === "salvando" ? "Salvando…" : "Salvar e entrar" }}
      </button>
    </form>
  </div>
</template>
