<script setup lang="ts">
import type { Desempenho, DesempenhoPeriodo } from "~~/shared/models/whatsapp";
import { DESEMPENHO_PERIODOS, duracao } from "~~/shared/models/whatsapp";

/**
 * Quanto a equipe demora para responder quem chama no WhatsApp.
 *
 * É a tela do dono da imobiliária: a pergunta dele não é "quantas conversas",
 * é "alguém ficou esperando?". Por isso "Esperando agora" vem junto dos tempos,
 * e "Sem resposta" é a única faixa em vermelho — com ícone e texto, não só cor.
 */
const periodo = ref<DesempenhoPeriodo>(7);

const { data, pending, error, refresh } = useLazyAsyncData(
  () => `admin:whatsapp:desempenho:${periodo.value}`,
  () => adminFetch<Desempenho>("/api/admin/whatsapp/desempenho", { query: { dias: periodo.value } }),
  { server: false, watch: [periodo] },
);

const maiorFaixa = computed(() => Math.max(1, ...(data.value?.faixas.map((f) => f.n) ?? [1])));
const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
const numero = (n: number) => n.toLocaleString("pt-BR");
</script>

<template>
  <section class="desemp" aria-labelledby="desemp-t">
    <div class="topo">
      <h2 id="desemp-t">Desempenho do atendimento</h2>
      <div class="seg" role="radiogroup" aria-label="Período">
        <button
          v-for="d in DESEMPENHO_PERIODOS"
          :key="d"
          type="button"
          role="radio"
          :aria-checked="periodo === d"
          :class="{ on: periodo === d }"
          @click="periodo = d"
        >
          {{ d }} dias
        </button>
      </div>
    </div>

    <div v-if="pending && !data" class="skel" aria-busy="true" aria-label="Carregando desempenho">
      <span v-for="i in 4" :key="i" class="skel-tile" />
    </div>
    <div v-else-if="error" class="admin-card estado" role="alert">
      <p>Não foi possível carregar o desempenho.</p>
      <button type="button" class="admin-btn" @click="refresh()">Tentar de novo</button>
    </div>
    <div v-else-if="data && !data.total && !data.esperandoAgora" class="admin-card estado">
      <p class="estado-t">Nenhuma conversa nos últimos {{ data.dias }} dias.</p>
      <p class="estado-d">Os números aparecem assim que alguém mandar mensagem para o número conectado.</p>
    </div>

    <template v-else-if="data">
      <div class="kpis">
        <div class="tile">
          <span class="t-rotulo">Primeira resposta (mediana)</span>
          <span class="t-valor">{{ duracao(data.medianaMin) }}</span>
          <span class="t-nota">metade das conversas foi respondida em até isso</span>
        </div>
        <div class="tile">
          <span class="t-rotulo">90% respondidas em até</span>
          <span class="t-valor">{{ duracao(data.p90Min) }}</span>
          <span class="t-nota">as mais demoradas ficam de fora deste número</span>
        </div>
        <div class="tile">
          <span class="t-rotulo">Respondidas</span>
          <span class="t-valor">{{ pct(data.respondidas, data.total) }}%</span>
          <span class="t-nota">{{ numero(data.respondidas) }} de {{ numero(data.total) }} conversas novas</span>
        </div>
        <div class="tile" :class="{ alerta: data.esperandoAgora }">
          <span class="t-rotulo">
            <AppIcon v-if="data.esperandoAgora" name="alert" /> Esperando resposta agora
          </span>
          <span class="t-valor">{{ numero(data.esperandoAgora) }}</span>
          <span class="t-nota">
            {{ data.esperandoAgora ? `a mais antiga há ${duracao(data.maiorEsperaMin)}` : "ninguém esperando" }}
          </span>
        </div>
      </div>

      <figure class="admin-card dist">
        <figcaption>
          <strong>Tempo até a primeira resposta</strong>
          <span>conversas novas nos últimos {{ data.dias }} dias</span>
        </figcaption>
        <ul class="barras">
          <li
            v-for="f in data.faixas"
            :key="f.chave"
            class="barra"
            :class="{ sem: f.chave === 'sem' }"
            tabindex="0"
            :aria-label="`${f.rotulo}: ${f.n} conversas, ${pct(f.n, data.total)}%`"
          >
            <span class="b-rotulo">
              <AppIcon v-if="f.chave === 'sem' && f.n" name="alert" />
              {{ f.rotulo }}
            </span>
            <span class="b-trilho">
              <!-- A escala reserva a largura do rótulo de valor: a maior barra termina
                 antes dele, e o número nunca é cortado. Faixa com conversa tem
                 pelo menos 2px, para "1" não sumir ao lado de "300". -->
              <span
                class="b-marca"
                :style="{ width: f.n ? `max(2px, calc((100% - 96px) * ${f.n / maiorFaixa}))` : '0' }"
              />
              <span class="b-valor">{{ numero(f.n) }} · {{ pct(f.n, data.total) }}%</span>
            </span>
            <span class="b-dica" role="tooltip">
              {{ numero(f.n) }} conversa{{ f.n === 1 ? "" : "s" }} ({{ pct(f.n, data.total) }}%)
              {{ f.chave === "sem" ? "ainda sem resposta" : `respondida${f.n === 1 ? "" : "s"} em ${f.rotulo.toLowerCase()}` }}
            </span>
          </li>
        </ul>
      </figure>

      <div v-if="data.porCorretor.length" class="admin-card tabela-card">
        <table class="tabela">
          <caption>Por corretor do contato</caption>
          <thead>
            <tr>
              <th scope="col">Corretor</th>
              <th scope="col" class="num">Conversas</th>
              <th scope="col" class="num">Mediana</th>
              <th scope="col" class="num">90% em até</th>
              <th scope="col" class="num">Sem resposta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in data.porCorretor" :key="c.brokerId ?? 'sem'">
              <th scope="row">{{ c.nome }}</th>
              <td class="num">{{ numero(c.total) }}</td>
              <td class="num">{{ duracao(c.medianaMin) }}</td>
              <td class="num">{{ duracao(c.p90Min) }}</td>
              <td class="num" :class="{ ruim: c.semResposta }">
                <span class="celula-ruim"><AppIcon v-if="c.semResposta" name="alert" />{{ numero(c.semResposta) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="nota">
          O corretor é o do contato no funil. Quem responde pelo celular do número conectado também conta — a resposta
          é da imobiliária.
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.desemp {
  display: grid;
  gap: 14px;
}
.topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.topo h2 {
  margin: 0;
  font-size: var(--fs-ui);
}
.seg {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border-radius: var(--r-pill);
  padding: 3px;
}
.seg button {
  border: 0;
  background: transparent;
  border-radius: var(--r-pill);
  padding: 7px 14px;
  min-height: 36px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  cursor: pointer;
}
.seg button.on {
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.seg button:focus-visible,
.barra:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Stat tiles */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.tile {
  display: grid;
  gap: 4px;
  align-content: start;
  background: var(--paper);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  padding: 14px 16px;
}
.t-rotulo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.t-rotulo :deep(svg) {
  width: 16px;
  height: 16px;
}
.t-valor {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--ink);
}
.t-nota {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.tile.alerta {
  border-color: var(--danger-line);
  background: var(--danger-ghost);
}
.tile.alerta .t-rotulo {
  color: var(--danger);
  font-weight: 600;
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Distribuição: barras horizontais, uma série */
.dist {
  margin: 0;
  display: grid;
  gap: 12px;
}
.dist figcaption {
  display: grid;
  gap: 2px;
}
.dist figcaption span {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.barras {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.barra {
  position: relative;
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 32px;
  border-radius: var(--r-sm);
  cursor: default;
}
.b-rotulo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-label);
  color: var(--ink);
  white-space: nowrap;
}
.b-rotulo :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--danger);
}
.b-trilho {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* Linha de base: a barra cresce dela. */
  border-left: 1px solid var(--line-2);
}
.b-marca {
  height: 20px;
  min-width: 0;
  background: var(--brand);
  /* Canto arredondado só na ponta dos dados; quadrado na base. */
  border-radius: 0 4px 4px 0;
}
.barra.sem .b-marca {
  background: var(--danger);
}
.b-valor {
  flex: none;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.b-dica {
  position: absolute;
  left: 142px;
  bottom: calc(100% + 4px);
  z-index: 5;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  /* Claro com borda, e não escuro: por cima da barra da linha de cima (na cor
     da marca, escura) um balão escuro se confundia com ela. */
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--line-2);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
  font-size: var(--fs-caption);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
}
.barra:hover .b-dica,
.barra:focus-visible .b-dica {
  opacity: 1;
}
.barra:hover {
  background: var(--surface);
}
@media (prefers-reduced-motion: reduce) {
  .b-dica {
    transition: none;
  }
}
@media (max-width: 560px) {
  .barra {
    grid-template-columns: 116px minmax(0, 1fr);
    gap: 8px;
  }
  .b-dica {
    left: 0;
  }
}

/* Tabela por corretor */
.tabela-card {
  overflow-x: auto;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-label);
}
.tabela caption {
  text-align: left;
  font-weight: 600;
  font-size: var(--fs-ui);
  margin-bottom: 8px;
}
.tabela th,
.tabela td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
.tabela thead th {
  color: var(--ink-soft);
  font-weight: 500;
}
.tabela tbody th {
  font-weight: 500;
}
.num {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}
.ruim {
  color: var(--danger);
  font-weight: 600;
}
.celula-ruim {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.celula-ruim :deep(svg) {
  width: 14px;
  height: 14px;
  flex: none;
}
.nota {
  margin: 10px 0 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}

.estado {
  display: grid;
  gap: 6px;
}
.estado p {
  margin: 0;
}
.estado-t {
  font-weight: 600;
}
.estado-d {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.skel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.skel-tile {
  height: 96px;
  border-radius: var(--r-md);
  background: var(--surface);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skel-tile {
    animation: none;
  }
}
</style>
