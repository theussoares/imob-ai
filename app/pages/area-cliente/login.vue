<script setup lang="ts">
/**
 * Entrada da Área do Cliente.
 *
 * Tela funcional, com as cores do tenant. O acabamento (logo, estados vazios,
 * mobile fino) é o card 2.1 — aqui o que importa é o fluxo funcionar de ponta a
 * ponta.
 */
definePageMeta({ layout: "portal" });

const tenant = useTenant();
const route = useRoute();
const { signIn, init, user, loadMe } = usePortalAuth();

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");
const modo = ref<"login" | "recuperar">("login");
const enviado = ref(false);

// Quem chega com ?erro=sem-acesso foi recusado pelo servidor. A mensagem não
// especula o motivo (não é cliente, está desativado, plano suspenso) porque o
// motivo é assunto da imobiliária, não de quem está na tela.
if (route.query.erro === "sem-acesso") {
  error.value =
    "Esta conta não tem acesso à área do cliente desta imobiliária. Fale com a imobiliária.";
}

onMounted(async () => {
  await init();
  // Já logado e com acesso: não faz sentido mostrar o formulário.
  if (user.value && (await loadMe())) await navigateTo("/area-cliente");
});

async function entrar() {
  error.value = "";
  loading.value = true;
  try {
    await signIn(email.value.trim(), password.value);
    const me = await loadMe();
    if (!me) {
      error.value =
        "Esta conta não tem acesso à área do cliente desta imobiliária. Fale com a imobiliária.";
      return;
    }
    await navigateTo("/area-cliente");
  } catch {
    // Mensagem única para senha errada e e-mail inexistente, de propósito:
    // diferenciar os dois diz a um estranho quais e-mails existem na base.
    error.value = "E-mail ou senha incorretos.";
  } finally {
    loading.value = false;
  }
}

async function recuperar() {
  error.value = "";
  loading.value = true;
  try {
    const { resetPassword } = usePortalAuth();
    await resetPassword(email.value);
    enviado.value = true;
  } catch {
    // Também não revela se o e-mail existe.
    enviado.value = true;
  } finally {
    loading.value = false;
  }
}

useSeoMeta({
  title: () => `Área do cliente — ${tenant.value?.name || ""}`,
  robots: "noindex, nofollow",
});
</script>

<template>
  <div>
    <h1>Área do cliente</h1>
    <p class="pc-sub">{{ tenant?.name }}</p>

    <template v-if="modo === 'login'">
      <form @submit.prevent="entrar">
        <label for="pc-email">E-mail</label>
        <input
          id="pc-email"
          v-model="email"
          type="email"
          autocomplete="username"
          required
        />

        <label for="pc-senha">Senha</label>
        <input
          id="pc-senha"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />

        <p v-if="error" class="pc-msg erro">{{ error }}</p>

        <button class="pc-btn" type="submit" :disabled="loading">
          {{ loading ? "Entrando…" : "Entrar" }}
        </button>
      </form>
      <button
        type="button"
        class="pc-link"
        @click="
          modo = 'recuperar';
          error = '';
        "
      >
        Esqueci minha senha
      </button>
    </template>

    <template v-else>
      <p v-if="enviado" class="pc-msg ok">
        Se este e-mail estiver cadastrado, você vai receber um link para criar
        uma nova senha.
      </p>
      <form v-else @submit.prevent="recuperar">
        <label for="pc-email-rec">E-mail</label>
        <input
          id="pc-email-rec"
          v-model="email"
          type="email"
          autocomplete="username"
          required
        />
        <button class="pc-btn" type="submit" :disabled="loading">
          {{ loading ? "Enviando…" : "Enviar link" }}
        </button>
      </form>
      <button
        type="button"
        class="pc-link"
        @click="
          modo = 'login';
          enviado = false;
        "
      >
        Voltar para o login
      </button>
    </template>
  </div>
</template>
