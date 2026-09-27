<script setup lang="ts">
import { credencialDaUrl, linkRecusadoNaUrl, validarNovaSenha, type TipoDeLink } from "~~/shared/utils/auth-credencial";

/**
 * Destino do link de convite: aqui a pessoa define a própria senha.
 *
 * Não usa o middleware `admin` de propósito — quem chega ainda não tem sessão
 * estabelecida; é justamente o token da URL que vai criá-la.
 *
 * A leitura da credencial mora em `shared/utils/auth-credencial.ts`, junto com
 * a da Área do Cliente: era o mesmo bloco copiado nos dois arquivos, e o que
 * difere de verdade é só o client do Supabase e o destino depois de salvar.
 */
definePageMeta({ layout: false });

const tenant = useTenant();

const password = ref("");
const confirmPassword = ref("");
const state = ref<"verificando" | "confirmar" | "confirmando" | "pronto" | "salvando" | "invalido">(
  "verificando",
);
const error = ref("");

const pendente = ref<{ tokenHash: string; otp: TipoDeLink } | null>(null);

async function continuar() {
  if (!pendente.value) return;
  state.value = "confirmando";
  try {
    const client = await getAdminSupabase();
    const { error: e } = await client.auth.verifyOtp({
      token_hash: pendente.value.tokenHash,
      type: pendente.value.otp,
    });
    if (e) throw e;
    history.replaceState(null, "", window.location.pathname);
    state.value = "pronto";
  } catch {
    state.value = "invalido";
  }
}

onMounted(async () => {
  const client = await getAdminSupabase();
  const credencial = credencialDaUrl(window.location.href);

  // Link antigo (`action_link`) que o Supabase já recusou: o motivo vem no
  // fragmento, e a sessão que houver no navegador é de outra pessoa ou velha.
  if (!credencial && linkRecusadoNaUrl(window.location.href)) {
    state.value = "invalido";
    return;
  }

  // O link novo NÃO é verificado ao abrir: a prévia do WhatsApp e o antivírus
  // do e-mail também "abrem" — e gastariam o convite (BUG-FUN-03). Só o clique
  // em "Continuar" gasta o token.
  if (credencial?.tipo === "token_hash") {
    pendente.value = { tokenHash: credencial.tokenHash, otp: credencial.otp };
    state.value = "confirmar";
    return;
  }

  try {
    if (credencial?.tipo === "code") {
      const { error: e } = await client.auth.exchangeCodeForSession(
        credencial.code,
      );
      if (e) throw e;
    } else if (credencial?.tipo === "tokens") {
      const { error: e } = await client.auth.setSession({
        access_token: credencial.accessToken,
        refresh_token: credencial.refreshToken,
      });
      if (e) throw e;
    } else {
      // Sem credencial na URL não quer dizer link inválido: também é o caso de
      // quem já estava logado e abriu o endereço direto.
      const { data } = await client.auth.getSession();
      if (!data.session) {
        state.value = "invalido";
        return;
      }
    }
    // Tira a credencial da barra de endereço: sem isto ela fica no histórico e
    // em qualquer print que a pessoa mandar pedindo ajuda.
    history.replaceState(null, "", window.location.pathname);
    state.value = "pronto";
  } catch {
    state.value = "invalido";
  }
});

async function save() {
  const problema = validarNovaSenha(password.value, confirmPassword.value);
  if (problema) {
    error.value = problema;
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
    error.value = friendlyErrorMessage(e, "Não foi possível definir a senha.");
    state.value = "pronto";
  }
}

useHead({
  title: "Definir senha do painel",
  // Página de credencial não tem por que ser indexada.
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>

<template>
  <div class="wrap">
    <div class="card">
      <!--
        Esta tela precisa dizer ONDE a pessoa está, e por um motivo concreto:
        ela é gêmea de `/area-cliente/definir-senha`, e um convite de cliente
        que caísse aqui por engano era indistinguível do certo — foi exatamente
        assim que um bug de redirecionamento passou despercebido, com a pessoa
        preenchendo a senha inteira antes de descobrir que estava no lugar
        errado.

        O markup é PRÓPRIO, e não a classe `.brand` que o `admin/login.vue`
        usa: aquela é compartilhada com o header do site público, onde `.mark`
        virou um espaço de logo de 140×65 (commit e7fe27a) e ficou grande
        demais para o ícone de 22px que as telas de acesso põem dentro dela —
        o login está com o bloco desalinhado desde então.
      -->
      <div class="quem">
        <img
          v-if="tenant?.logoUrl"
          :src="tenant.logoUrl"
          :alt="tenant?.name || ''"
          class="quem-logo"
        />
        <span v-else class="quem-icone"><AppIcon name="home" /></span>
        <span class="quem-txt">
          <b>{{ tenant?.name || "Painel" }}</b>
          <small>Área administrativa</small>
        </span>
      </div>

      <h1>Definir sua senha do painel</h1>

      <p v-if="state === 'verificando'" class="muted">Verificando convite...</p>

      <!-- MELHORIA 04: dizer POR QUE o link morre e qual é o próximo passo. O
           Supabase não distingue "já usado" de "vencido", então a frase cobre
           os dois sem chutar. -->
      <template v-else-if="state === 'invalido'">
        <p class="muted">
          Este link já foi usado ou passou do prazo. Por segurança, cada link
          vale uma vez só e por pouco tempo.
        </p>
        <p class="muted">
          Se você já definiu sua senha,
          <NuxtLink to="/admin/login">entre no painel</NuxtLink>. Se não lembra,
          <NuxtLink to="/admin/recuperar-senha">peça um link novo</NuxtLink> — ou
          peça outro convite a quem te convidou.
        </p>
      </template>

      <template v-else-if="state === 'confirmar' || state === 'confirmando'">
        <p class="muted">
          Você foi convidado para o painel da {{ tenant?.name || "imobiliária" }}.
          Continue para escolher sua senha.
        </p>
        <button class="admin-btn full" type="button" :disabled="state === 'confirmando'" @click="continuar">
          {{ state === "confirmando" ? "Conferindo o link..." : "Continuar" }}
        </button>
      </template>

      <template v-else>
        <p class="muted">
          Escolha uma senha para entrar no painel da {{ tenant?.name || "imobiliária" }}.
          Só você vai saber qual é.
        </p>
        <form @submit.prevent="save">
          <label class="admin-label" for="senha">Nova senha</label>
          <AdminPasswordInput id="senha" v-model="password" autocomplete="new-password" />

          <label class="admin-label" for="senha2">Repita a senha</label>
          <AdminPasswordInput id="senha2" v-model="confirmPassword" autocomplete="new-password" />

          <p v-if="error" class="err" role="alert">{{ error }}</p>

          <!-- O rótulo diz para onde leva: é a última chance de perceber que se
               está na tela errada antes de entregar a senha. -->
          <button
            class="admin-btn full"
            type="submit"
            :disabled="state === 'salvando'"
          >
            {{
              state === "salvando"
                ? "Salvando..."
                : "Definir senha e entrar no painel"
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
  border-radius: var(--r-md);
  background: var(--paper);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.quem {
  display: flex;
  align-items: center;
  gap: 11px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
/* Altura fixa e largura livre: a logo de cada imobiliária tem proporção
   própria, e travar a largura é o que achatou o bloco equivalente do login. */
.quem-logo {
  height: 38px;
  width: auto;
  max-width: 140px;
  object-fit: contain;
  flex: none;
}
.quem-icone {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
}
.quem-icone :deep(svg) {
  width: 20px;
  height: 20px;
}
.quem-txt {
  min-width: 0;
}
.quem-txt b {
  display: block;
  font-size: var(--fs-ui);
  line-height: 1.25;
}
.quem-txt small {
  display: block;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  letter-spacing: 0.02em;
}
h1 {
  font-family: var(--font-display);
  font-size: var(--fs-title);
  margin: 0 0 8px;
}
.muted {
  color: var(--ink-soft);
  font-size: var(--fs-ui);
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
  font-size: var(--fs-label);
  margin: 10px 0 0;
}
.full {
  width: 100%;
  margin-top: 16px;
}
</style>
