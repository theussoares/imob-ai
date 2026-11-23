<script setup lang="ts">
// A guarda do middleware já barra quem não tem acesso à seção `imoveis`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Imóveis · Gestão' })

const tela = useImoveisScreen()
const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold text-[var(--ink)] no-underline hover:bg-[var(--brand-ghost)]'
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Imóveis</h1>
        <p class="mt-1 text-[var(--ink-soft)]">O que você cadastra aqui é o que aparece no site da imobiliária.</p>
      </div>
      <NuxtLink v-if="tela.podeCriar" to="/gestao/imoveis/novo" class="inline-flex min-h-11 items-center rounded-[10px] bg-[var(--gestao-amarelo)] px-5 font-bold text-[var(--brand)] no-underline hover:opacity-90" data-testid="imovel-novo">
        Cadastrar imóvel
      </NuxtLink>
    </header>

    <GestaoImoveisFiltros v-model:q="tela.q" :filtro="tela.filtro" @mudar="tela.mudar" />

    <p v-if="tela.resultado?.truncado" role="note" class="m-0 rounded-xl border border-[var(--line-2)] bg-[var(--paper)] p-3 text-[var(--ink-soft)]" data-testid="imovel-truncado">
      Esta busca leu só os 1000 imóveis mais recentes. Refine o texto ou os filtros para achar um mais antigo.
    </p>

    <div v-if="tela.falhou" role="alert" class="[display:grid] justify-items-start gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-5">
      <p class="font-bold">Não foi possível carregar os imóveis.</p>
      <button type="button" :class="btn" @click="tela.carregar">Tentar de novo</button>
    </div>
    <div v-else-if="!tela.resultado" class="[display:grid] gap-3 md:grid-cols-2" aria-busy="true">
      <GestaoSkeletonCard v-for="n in 4" :key="n" />
      <span class="sr-only">Carregando imóveis…</span>
    </div>
    <p v-else-if="!tela.itens.length" class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink-soft)]" data-testid="imovel-vazio">
      Nenhum imóvel encontrado com esse filtro.
      <button v-if="tela.temFiltro" type="button" class="ml-2 min-h-11 cursor-pointer border-0 bg-transparent font-bold text-[var(--brand)] underline" data-testid="imovel-limpar-filtros" @click="tela.limpar">Limpar filtros</button>
    </p>
    <ul v-else class="m-0 list-none [display:grid] gap-3 p-0 md:grid-cols-2" data-testid="imovel-lista">
      <GestaoImovelCard v-for="i in tela.itens" :key="i.id" :imovel="i" :corretor="tela.nomeCorretor(i.brokerId)" />
    </ul>

    <GestaoPaginacao v-if="tela.resultado" :pagina="tela.resultado.pagina" :paginas="tela.resultado.paginas" :total="tela.resultado.total" rotulo="imóveis" @ir="tela.irParaPagina" />
  </div>
</template>
