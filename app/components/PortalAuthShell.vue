<script setup lang="ts">
/**
 * As telas de acesso da Área do Cliente sobre o `AuthShell`: o lado esquerdo
 * explica o portal para quem chega pelo convite.
 */

/**
 * Só o que o portal entrega a TODO cliente de TODA imobiliária. O boleto entra
 * como documento (categoria `boleto` em PORTAL_DOC_LABELS), que existe sem a
 * cobrança integrada; "pagar com Pix" só vale onde a flag `cobranca` está
 * ligada, e esta tela não tem como saber disso antes do login — prometer aqui
 * seria prometer o que a imobiliária talvez não tenha.
 */
const RECURSOS = [
  { icone: 'contract', t: 'Seus contratos', d: 'Situação, início, término, aluguel e vencimento' },
  { icone: 'notes', t: '2ª via de boleto', d: 'Baixe os boletos que a imobiliária publicou' },
  { icone: 'check', t: 'Vistorias e recibos', d: 'Contrato assinado, vistoria e comprovantes' },
  { icone: 'calendar', t: 'Extrato de repasse', d: 'Para o proprietário acompanhar o mês' },
] as const
</script>

<template>
  <AuthShell marca="Área do Cliente" :recursos="RECURSOS">
    <template #titulo>Seu aluguel em dia, <em>sem precisar ligar</em> para a imobiliária</template>
    <template #texto>
      Contratos, boletos, vistorias e extratos num lugar só, no celular ou no
      computador, a qualquer hora.
    </template>
    <slot />
  </AuthShell>
</template>
