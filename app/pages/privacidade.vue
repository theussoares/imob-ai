<script setup lang="ts">
import { canalDoTitular } from '~~/shared/utils/canal-titular'
import { LEAD_RETENCAO_MESES } from '~~/shared/models/lead'
import { WHATSAPP_CONVERSA_RETENCAO_DIAS } from '~~/shared/models/whatsapp'
/**
 * Política de privacidade do site da imobiliária: o site público e a Área do
 * Cliente.
 *
 * Publicada em 25/09: está em `STATIC_FOOTER_PAGES` como `obrigatoria`, então
 * aparece no rodapé de TODA imobiliária e o painel não deixa esconder. O texto
 * foi revisado no parecer (`docs/runbooks/lgpd-site-publico.md`).
 *
 * O texto descreve com precisão o que o sistema faz — isso é o que engenharia
 * pode afirmar. A forma jurídica (bases legais nomeadas, prazos, redação dos
 * direitos) foi revisada em `docs/runbooks/lgpd-site-publico.md`, que traz o
 * parecer (bases legais, retenção, transferência internacional, Marco Civil)
 * com fundamento e fontes. A Área do Cliente tem o mapa em
 * `docs/runbooks/0037-lgpd-area-do-cliente.md`.
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

// Canal do titular (LGPD art. 9º, IV). Sem ele a frase de direitos terminava
// sem dizer por onde — ver shared/utils/canal-titular.ts.
const canal = computed(() =>
  tenant.value
    ? canalDoTitular({ email: tenant.value.email, whatsapp: tenant.value.whatsapp, phone: tenant.value.phone })
    : null,
)
const ROTULO_DO_CANAL = { email: 'pelo e-mail', whatsapp: 'pelo WhatsApp', telefone: 'pelo telefone' } as const

useHead(() => ({
  // Sem o nome da imobiliária: o `titleTemplate` do `app.vue` já o acrescenta
  // a todo título, e somar os dois rendia "Privacidade · OLMI · OLMI". (O
  // fallback anterior era pior que a duplicação: numa página sem tenant
  // resolvido, o título da política virava "Área do Cliente".)
  title: 'Privacidade',
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

    <!-- Leads do Canal Pro (0063): o portal repassa; e-mail e dados do MCMV são descartados. -->
    <h3>Quando você pede contato num portal</h3>
    <p>
      Se você chamou num anúncio de {{ nome }} no ZAP Imóveis, Viva Real ou
      OLX, o portal nos repassa seu nome, telefone, a mensagem e o imóvel. O
      pedido é tratado como os feitos neste site, pelo mesmo prazo. O e-mail e
      os dados de simulação de financiamento que o portal envia não são
      guardados.
    </p>

    <h3>Quando você clica para conversar pelo WhatsApp</h3>
    <p>
      Registramos de qual imóvel partiu o clique e para qual número a conversa
      foi, para que {{ nome }} saiba sobre o que você quer falar. O registro não
      diz quem você é: não guardamos seu nome nem seu número.
    </p>

    <!--
      Conversas do WhatsApp (0059): só quando a imobiliária conecta o número
      pela API oficial. Ver docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md
      e "Conversas do WhatsApp" em docs/runbooks/lgpd-site-publico.md.
    -->
    <h3>Quando você conversa pelo WhatsApp</h3>
    <p>
      Quando {{ nome }} atende pelo WhatsApp conectado ao sistema, as mensagens
      trocadas com você ficam registradas no painel dela, junto com o seu nome
      de perfil, o seu número e o imóvel sobre o qual você perguntou. É o que
      permite que outra pessoa da equipe continue o atendimento sem você ter de
      repetir tudo. Fotos, áudios, vídeos e documentos que você enviar também
      ficam guardados, em área restrita à equipe de {{ nome }}, junto com a
      conversa e pelo mesmo prazo. Arquivos acima de 16 MB não são guardados.
    </p>
    <!-- Triagem automática (0064): perguntas fixas, sem IA. -->
    <p>
      {{ nome }} pode usar uma triagem automática no WhatsApp: três perguntas
      fixas, com botões, sobre o que você procura (comprar, alugar ou
      anunciar), a faixa de valor e o bairro. Não é inteligência artificial, e
      você pode responder direto por texto, se preferir. As respostas ficam no
      seu pedido de contato, pelo mesmo prazo.
    </p>
    <p>
      Se {{ nome }} já conversava com você pelo app WhatsApp Business do
      celular, ela pode decidir trazer para o painel as conversas dos últimos
      6 meses. Por padrão, só as de quem já pediu contato; essas conversas não
      geram aviso nem mensagem nova para você.
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
        <b>Seus boletos:</b> se você aluga e {{ nome }} emite a cobrança pelo
        sistema, os boletos e Pix do aluguel, com vencimento, valor e se já
        foram pagos.
      </li>
      <li>
        <b>Registro dos seus acessos:</b> cada vez que um documento é baixado,
        guardamos quem baixou, quando e de qual endereço de internet. Guardamos
        também a data da sua primeira entrada na Área do Cliente, para que
        {{ nome }} saiba que o seu acesso está funcionando.
      </li>
    </ul>

    <h3>Para que usamos</h3>
    <p>
      Para dar a você acesso aos documentos da sua locação, cobrar e registrar
      o pagamento do aluguel, e manter registro de quem acessou o quê.
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

    <h2>Com base em quê</h2>
    <!-- Posições de Q1 em docs/runbooks/lgpd-site-publico.md. -->
    <ul>
      <li>
        <b>Pedido de contato e aviso à imobiliária:</b> para atender a um pedido
        seu, antes de um possível negócio (Lei 13.709/2018, art. 7º, V).
      </li>
      <li>
        <b>Clique no WhatsApp, proteção contra abuso e estatísticas de
        visita:</b> interesse legítimo de {{ nome }} em saber de onde vêm os
        contatos, proteger o site e entender como ele é usado, sem identificar
        você (art. 7º, IX).
      </li>
      <li>
        <b>Conversas pelo WhatsApp:</b> para atender a um pedido seu, antes de
        um possível negócio (art. 7º, V) — foi você quem escreveu.
      </li>
      <li>
        <b>Área do Cliente:</b> para cumprir o contrato que você tem com
        {{ nome }} (art. 7º, V) e manter o registro de quem acessou cada
        documento (art. 7º, IX).
      </li>
    </ul>

    <h2>Com quem compartilhamos</h2>
    <p>
      {{ nome }} não vende nem cede seus dados para publicidade. Para o site
      funcionar, eles passam por empresas que prestam serviço à plataforma e
      só podem usá-los para esse serviço:
    </p>
    <ul>
      <li><b>Supabase:</b> banco de dados e armazenamento de arquivos, no Brasil.</li>
      <li>
        <b>Vercel:</b> hospedagem do site, com o processamento no Brasil, e
        estatísticas de visita, nos Estados Unidos.
      </li>
      <li><b>Resend:</b> envio de e-mails, nos Estados Unidos.</li>
      <!--
        Asaas (0051): só quando a imobiliária conecta a cobrança. A conta é
        DELA no Asaas; recebe nome, CPF/CNPJ, e-mail e telefone do inquilino
        para emitir o boleto registrado, que exige o documento. Ver
        docs/runbooks/0037-lgpd-area-do-cliente.md.
      -->
      <li>
        <b>Asaas:</b> emissão de boletos e Pix do aluguel, no Brasil. Recebe o
        nome, o CPF ou CNPJ, o e-mail e o telefone de quem paga o aluguel,
        quando {{ nome }} cobra pelo sistema.
      </li>
      <li>
        <b>Meta (WhatsApp):</b> entrega das mensagens, com servidores fora do
        Brasil, quando {{ nome }} atende pelo WhatsApp conectado ao sistema.
        A conta do WhatsApp é de {{ nome }}.
      </li>
    </ul>
    <!--
      Transferência internacional (LGPD art. 33): as funções rodam em `gru1`
      (São Paulo, nuxt.config.ts), então o formulário e o hash de IP são
      processados no Brasil. O que sai do país é o e-mail de aviso (Resend),
      coberto pelo art. 33, IX, as conversas do WhatsApp (Meta), que o próprio
      titular iniciou no aplicativo da Meta, e as estatísticas anonimizadas da Vercel — ver
      Q3 em docs/runbooks/lgpd-site-publico.md. Não afirmar aqui garantia
      contratual que ninguém verificou.
    -->
    <p>
      Por isso, parte do tratamento dos seus dados acontece fora do Brasil.
    </p>

    <h2>Por quanto tempo guardamos</h2>
    <ul>
      <!--
        O prazo vem de LEAD_RETENCAO_MESES, a mesma constante que o expurgo do
        cron diário usa (server/api/cron/leads-parados.get.ts). As duas
        exceções abaixo são as do `purgeStaleLeads`: mudou lá, muda aqui.
      -->
      <li>
        <b>Pedidos de contato:</b> são apagados automaticamente depois de
        {{ LEAD_RETENCAO_MESES }} meses sem nenhum andamento, a menos que tenham
        virado negócio ou tenham um retorno agendado. Você pode pedir a exclusão
        antes disso, a qualquer momento.
      </li>
      <li>
        <b>Registros de clique no WhatsApp:</b> 90 dias. Depois disso são
        apagados automaticamente.
      </li>
      <!-- WHATSAPP_CONVERSA_RETENCAO_DIAS, lida direto; a do pedido de contato é a de cima. -->
      <li>
        <b>Conversas pelo WhatsApp, com os arquivos:</b> ficam enquanto existir
        o seu pedido de contato, e seguem o prazo dele. Conversa que não virou
        pedido de contato é apagada, com os arquivos,
        {{ WHATSAPP_CONVERSA_RETENCAO_DIAS }} dias depois da última mensagem.
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
      <template v-if="canal">{{ ROTULO_DO_CANAL[canal.tipo] }}
        <a :href="canal.href">{{ canal.rotulo }}</a></template><template
        v-else>pelos canais de atendimento informados neste site</template>.
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
