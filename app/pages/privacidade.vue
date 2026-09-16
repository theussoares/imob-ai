<script setup lang="ts">
/**
 * Política de privacidade da Área do Cliente.
 *
 * ⚠️ **RASCUNHO — NÃO PUBLICADO.** Esta página existe e responde na URL, mas
 * NÃO está em `STATIC_FOOTER_PAGES`, então não aparece no rodapé de site
 * nenhum. Registrar lá é o ato de publicar, e ele depende de revisão jurídica.
 *
 * O motivo de não registrar já: o registro torna a página visível no rodapé de
 * TODA imobiliária por padrão. Uma política de privacidade não revisada no ar,
 * no site de um cliente real, é pior que nenhuma.
 *
 * O texto descreve com precisão o que o sistema faz — isso é o que engenharia
 * pode afirmar. A forma jurídica (bases legais nomeadas, prazos, redação dos
 * direitos) precisa de advogado. Ver `docs/runbooks/0037-lgpd-area-do-cliente.md`,
 * que é o insumo preparado para essa revisão.
 *
 * ⚠️ E a responsabilidade é da imobiliária: ela é CONTROLADORA e o imob-ai é
 * OPERADOR. Esta página é um modelo para ela, não uma política nossa.
 */
const tenant = useTenant()
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true })

const nome = computed(() => tenant.value?.name || 'a imobiliária')

useHead(() => ({
  title: `Privacidade · ${tenant.value?.name || 'Área do Cliente'}`,
  link: [{ rel: 'canonical', href: `${url.origin}/privacidade` }],
}))
</script>

<template>
  <article class="doc">
    <h1>Privacidade e proteção de dados</h1>
    <p class="intro">
      Como {{ nome }} trata os seus dados na Área do Cliente.
    </p>

    <h2>Quem trata os seus dados</h2>
    <p>
      {{ nome }} é a responsável pelos seus dados. A plataforma que opera a Área
      do Cliente trata esses dados apenas seguindo as instruções dela.
    </p>
    <p>
      Qualquer pedido sobre os seus dados — acesso, correção, exclusão — deve ser
      feito diretamente a {{ nome }}.
    </p>

    <h2>Que dados usamos</h2>
    <ul>
      <li><b>Seu cadastro:</b> nome, e-mail, CPF ou CNPJ e telefone.</li>
      <li>
        <b>Os documentos do seu contrato:</b> contrato de locação, laudo de
        vistoria, comprovantes e demais arquivos que {{ nome }} publicar para
        você.
      </li>
      <li>
        <b>Registro dos seus acessos:</b> cada vez que um documento é baixado,
        guardamos quem baixou, quando e de qual endereço de internet.
      </li>
    </ul>

    <h2>Para que usamos</h2>
    <p>
      Para dar a você acesso aos documentos da sua locação, e para manter
      registro de quem acessou o quê.
    </p>

    <h2>Quem mais vê os seus documentos</h2>
    <!--
      Esta seção é a que mais importa dizer, porque é contraintuitiva: a pessoa
      supõe que "todo mundo do contrato vê tudo". Não vê, e essa é uma garantia
      concreta do sistema, não uma promessa.
    -->
    <p>
      <b>As outras partes do contrato não veem os documentos endereçados a
      você.</b> Quem aluga não vê o extrato de repasse do proprietário, e o
      proprietário não vê os seus comprovantes de pagamento.
    </p>
    <p>
      Cada documento é publicado por {{ nome }} para um público definido, e o
      sistema só entrega o arquivo a quem está nesse público.
    </p>

    <h2>Como os documentos são guardados</h2>
    <p>
      Os arquivos ficam em armazenamento privado. Eles não têm endereço público:
      cada download gera um link temporário, válido por menos de um minuto, e
      criado só depois de conferirmos que você tem direito àquele documento.
    </p>

    <h2>Por quanto tempo guardamos</h2>
    <p>
      Seu cadastro e seus documentos ficam disponíveis enquanto durar a relação
      com {{ nome }}. O registro de acessos é mantido por mais tempo, porque é
      ele que permite responder quem acessou cada documento.
    </p>

    <h2>Seus direitos</h2>
    <p>
      A Lei Geral de Proteção de Dados garante a você, entre outros, o direito de
      confirmar que tratamos seus dados, de acessá-los, de corrigir o que estiver
      errado e de pedir a exclusão do que não for necessário guardar.
    </p>
    <p>
      Para exercer qualquer um deles, fale com {{ nome }}
      <template v-if="tenant?.email">pelo e-mail
        <a :href="`mailto:${tenant.email}`">{{ tenant.email }}</a></template>.
    </p>
  </article>
</template>

<style scoped>
.doc {
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 16px 56px;
  line-height: 1.65;
}
h1 {
  font-size: 26px;
  margin: 0 0 6px;
}
h2 {
  font-size: 18px;
  margin: 28px 0 8px;
}
.intro {
  color: #6b7280;
  margin: 0 0 8px;
}
p {
  margin: 0 0 12px;
}
ul {
  margin: 0 0 12px;
  padding-left: 20px;
}
li {
  margin-bottom: 6px;
}
</style>
