<script setup lang="ts">
/**
 * As telas de acesso do painel da imobiliária sobre o `AuthShell`.
 *
 * Foto em vez do preto liso da Área do Cliente: é a mesma família (a mesma
 * moldura, o mesmo amarelo), mas quem abre o painel precisa perceber de
 * relance que está na porta da EQUIPE — as duas telas de definir senha já
 * foram confundidas uma vez. A foto é a da landing, uma corretora no celular à
 * mesa: é o uso real do painel, que é instalado como app.
 *
 * Os recursos listados são os três que todo painel tem (itens `principal` do
 * AdminSidebar). Agenda, contratos e Área do Cliente dependem de flag por
 * imobiliária, e antes do login não há como saber quais estão ligados.
 */
const RECURSOS = [
  { icone: 'home', t: 'Imóveis', d: 'Cadastre e publique no site na hora' },
  { icone: 'contacts', t: 'Contatos', d: 'Formulários e cliques no WhatsApp' },
  { icone: 'site', t: 'Meu site', d: 'Textos, cores e destaques' },
] as const

const FOTO = {
  src: '/moradi/corretora-mesa.webp',
  alt: 'Corretora usando o celular à mesa de trabalho, com o notebook aberto',
}
</script>

<template>
  <AuthShell marca="Painel da imobiliária" :recursos="RECURSOS" :foto="FOTO">
    <template #titulo>Sua imobiliária <em>inteira</em> num painel só</template>
    <template #texto>
      Do cadastro do imóvel ao contato do interessado, no computador ou no
      celular, instalado como app.
    </template>
    <slot />
    <template #depois><slot name="depois" /></template>
  </AuthShell>
</template>
