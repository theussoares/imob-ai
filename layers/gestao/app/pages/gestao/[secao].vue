<script setup lang="ts">
import { MENU } from '../../../domain/permissions'

// Seções do menu que ainda não têm tela (Imóveis, Locação, Financeiro…).
// Rotas reais (vendas, documentos) têm arquivo próprio e vencem esta.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const item = MENU.find((m) => m.rota === `/gestao/${route.params.secao}`)
if (!item) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada', fatal: true })
</script>

<template>
  <GestaoEmBreve :titulo="item!.rotulo" />
</template>
