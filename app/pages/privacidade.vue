<script setup lang="ts">
/**
 * Política de privacidade do site da imobiliária: o site público e a Área do
 * Cliente.
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
 * direitos) precisa de advogado. Os insumos preparados para essa revisão são
 * `docs/runbooks/0037-lgpd-area-do-cliente.md` (Área do Cliente) e
 * `docs/runbooks/lgpd-site-publico.md` (site público, com as bases legais
 * propostas e as fontes).
 *
 * ⚠️ Cada afirmação daqui tem que continuar verdadeira. Quem mudar o que o
 * site coleta (campo novo no formulário, ferramenta de estatística, pixel,
 * cookie) muda esta página no mesmo PR. Em especial: a seção "Cookies e
 * estatísticas" afirma que não há cookie de rastreamento, e é essa afirmação
 * que dispensa o banner — ver o runbook.
 *
 * ⚠️ E a responsabilidade é da imobiliária: ela é CONTROLADORA e o imob-ai é
 * OPERADOR. Esta página é um modelo para ela, não uma política nossa.
 */
const tenant = useTenant()
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true })

const nome = computed(() => tenant.value?.name || 'a imobiliária')

// `noindex` enquanto for rascunho, e isto não é cautela sobrando: a página
// responde na URL em QUALQUER domínio de tenant, então basta um crawler chegar
// — link externo, referrer, palpite — para um texto jurídico não revisado ser
// indexado como a política de privacidade de uma imobiliária real. O canonical
// ainda afirmaria que aquela é a versão autoritativa.
//
// ⚠️ Quando a revisão jurídica sair e a página for registrada em
// `STATIC_FOOTER_PAGES`, ESTA LINHA SAI JUNTO — publicar no rodapé e continuar
// pedindo para não indexar é contradição.
useHead(() => ({
  // Sem o nome da imobiliária: o `titleTemplate` do `app.vue` já o acrescenta
  // a todo título, e somar os dois rendia "Privacidade · OLMI · OLMI". (O
  // fallback anterior era pior que a duplicação: numa página sem tenant
  // resolvido, o título da política virava "Área do Cliente".)
  title: 'Privacidade',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  link: [{ rel: 'canonical', href: `${url.origin}/privacidade` }],
}))
</script>

<template>
  <article class="doc">
    <h1>Privacidade e proteção de dados</h1>
    <p class="intro">
      Como {{ nome }} trata os seus dados neste site e na Área do Cliente.
    </p>

    <h2>Quem trata os seus dados</h2>
    <p>
      {{ nome }} é a responsável pelos seus dados. A plataforma que opera este
      site trata esses dados apenas seguindo as instruções dela.
    </p>
    <p>
      Qualquer pedido sobre os seus dados (acesso, correção, exclusão) deve ser
      feito diretamente a {{ nome }}.
    </p>

    <h2>Neste site</h2>

    <h3>Quando você pede contato</h3>
    <p>
      Nos formulários de contato e de "Quero vender", guardamos o que você
      preenche: nome, telefone, a mensagem e o imóvel sobre o qual você
      perguntou. No "Quero vender", também o tipo e o bairro do seu imóvel.
    </p>
    <p>
      Usamos esses dados só para responder ao seu pedido. {{ nome }} recebe um
      aviso por e-mail com o seu nome e telefone para poder retornar. Não
      cadastramos você em lista de e-mail nem enviamos propaganda.
    </p>

    <h3>Quando você clica para conversar pelo WhatsApp</h3>
    <p>
      Registramos de qual imóvel partiu o clique e para qual número a conversa
      foi, para que {{ nome }} saiba sobre o que você quer falar. O registro não
      diz quem você é: não guardamos seu nome nem seu número.
    </p>

    <h3>Proteção contra abuso</h3>
    <p>
      Para impedir envios automáticos em massa, guardamos uma versão
      embaralhada do seu endereço de internet (IP). Ela serve para perceber
      repetição, mas não permite recuperar o endereço original.
    </p>

    <h2>Cookies e estatísticas de visita</h2>
    <p>
      Este site <b>não usa cookies de rastreamento nem de publicidade</b>, e não
      tem ferramentas de anúncio de terceiros.
    </p>
    <p>
      Medimos quantas pessoas visitam cada página sem cookies e sem um
      identificador que acompanhe você: a contagem usa um código que muda todo
      dia e não permite reconhecer você de um dia para o outro, nem em outros
      sites. As páginas da Área do Cliente ficam fora dessa medição.
    </p>
    <p>
      Fazemos isso porque é necessário para manter o site funcionando bem e
      entender o que as pessoas procuram, sem expor quem você é.
    </p>

    <h2>Na Área do Cliente</h2>

    <h3>Que dados usamos</h3>
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

    <h3>Para que usamos</h3>
    <p>
      Para dar a você acesso aos documentos da sua locação, e para manter
      registro de quem acessou o quê.
    </p>

    <h3>Quem mais vê os seus documentos</h3>
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

    <h3>Como os documentos são guardados</h3>
    <p>
      Os arquivos ficam em armazenamento privado. Eles não têm endereço público:
      cada download gera um link temporário, válido por menos de um minuto, e
      criado só depois de conferirmos que você tem direito àquele documento.
    </p>

    <h2>Com quem compartilhamos</h2>
    <p>
      {{ nome }} não vende nem cede seus dados para publicidade. Para o site
      funcionar, eles passam por empresas que prestam serviço à plataforma e
      só podem usá-los para esse serviço:
    </p>
    <ul>
      <li><b>Supabase:</b> banco de dados e armazenamento de arquivos, no Brasil.</li>
      <li><b>Vercel:</b> hospedagem do site e estatísticas de visita, nos Estados Unidos.</li>
      <li><b>Resend:</b> envio de e-mails, nos Estados Unidos.</li>
    </ul>
    <!--
      Transferência internacional (LGPD art. 33): Vercel e Resend processam nos
      EUA. O mecanismo (cláusulas-padrão da Res. CD/ANPD 19/2024 nos DPAs) está
      A CONFIRMAR pelo advogado — ver docs/runbooks/lgpd-site-publico.md, item 3.
      Não afirmar aqui garantia contratual que ainda não foi verificada.
    -->
    <p>
      Por isso, parte do tratamento dos seus dados acontece fora do Brasil.
    </p>

    <h2>Por quanto tempo guardamos</h2>
    <ul>
      <!--
        Retenção de leads: o sistema NÃO apaga pedidos de contato sozinho. A
        frase abaixo descreve o comportamento real. Quando o prazo for decidido
        (proposta de 24 meses sem interação, no runbook) e o expurgo existir,
        ela muda junto — nunca antes do job existir.
      -->
      <li>
        <b>Pedidos de contato:</b> ficam guardados até que {{ nome }} os apague.
        Você pode pedir a exclusão a qualquer momento.
      </li>
      <li>
        <b>Registros de clique no WhatsApp:</b> 90 dias. Depois disso são
        apagados automaticamente.
      </li>
      <li>
        <b>Cadastro e documentos da Área do Cliente:</b> enquanto durar a
        relação com {{ nome }}. O registro de acessos é mantido por mais tempo,
        porque é ele que permite responder quem acessou cada documento.
      </li>
    </ul>

    <h2>Seus direitos</h2>
    <p>
      A Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 18) garante a você
      o direito de:
    </p>
    <ul>
      <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
      <li>corrigir dados incompletos, errados ou desatualizados;</li>
      <li>
        pedir que dados desnecessários, excessivos ou tratados em desacordo com
        a lei sejam anonimizados, bloqueados ou eliminados;
      </li>
      <li>pedir a portabilidade dos seus dados a outro fornecedor;</li>
      <li>saber com quem seus dados foram compartilhados;</li>
      <li>
        quando o tratamento depender do seu consentimento, ser informado sobre
        a possibilidade de não dar o consentimento, revogá-lo e pedir a
        eliminação dos dados tratados com base nele.
      </li>
    </ul>
    <p>
      Para exercer qualquer um deles, fale com {{ nome }}
      <template v-if="tenant?.email">pelo e-mail
        <a :href="`mailto:${tenant.email}`">{{ tenant.email }}</a></template>.
      Você também pode apresentar reclamação à Autoridade Nacional de Proteção
      de Dados (ANPD).
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
  font-size: var(--fs-title-lg);
  margin: 0 0 6px;
}
h2 {
  font-size: var(--fs-title-sm);
  margin: 28px 0 8px;
}
h3 {
  font-size: 1rem;
  margin: 18px 0 6px;
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
