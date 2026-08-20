<script setup lang="ts">
/**
 * Fundo do hero da landing: uma malha de blocos que sobe em curva pela direita.
 *
 * Ideia visual emprestada de um template de referência; a implementação é nossa
 * e menor — sem GSAP, sem scanline (aquele padrão de CRT fala com engenheiro, e
 * quem lê esta página é corretor) e com a malha presa ao hero em vez de fixa na
 * viewport inteira.
 *
 * Canvas em vez de mil `<div>`: são algumas centenas de blocos, e criar isso em
 * DOM custaria layout a cada resize.
 */
const canvas = ref<HTMLCanvasElement | null>(null);

let raf = 0;
let ro: ResizeObserver | null = null;

const BLOCK = 26;
const GAP = 2;

/** Tons sobre o fundo escuro do hero, do mais apagado ao destaque. */
const TONES = [
  "rgba(37, 99, 235, 0.10)",
  "rgba(37, 99, 235, 0.18)",
  "rgba(59, 130, 246, 0.28)",
  "rgba(96, 165, 250, 0.42)",
];

interface Block {
  x: number;
  y: number;
  tone: number;
  /** Fase da oscilação. Blocos diferentes acendem em momentos diferentes. */
  phase: number;
  /** Quanto o brilho varia. Zero = bloco parado. */
  pulse: number;
}

let blocks: Block[] = [];

/**
 * Distribuição determinística por posição.
 *
 * `Math.random()` daria um desenho diferente a cada resize — o fundo "pularia"
 * ao girar o celular. Isto é ruído estável: mesma célula, mesmo valor.
 */
function noise(c: number, r: number): number {
  const n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function build(w: number, h: number) {
  blocks = [];
  const cols = Math.ceil(w / (BLOCK + GAP));
  const rows = Math.ceil(h / (BLOCK + GAP));

  for (let c = 0; c < cols; c++) {
    const nx = cols > 1 ? c / (cols - 1) : 0;
    // Expoente alto concentra a malha na direita e deixa a esquerda quase
    // vazia. O texto do hero é centralizado, então ele cai na faixa de
    // densidade média — medido: 3% de cobertura na esquerda, 12% no meio, 47%
    // na direita. Curva mais suave encheria o meio e comeria a legibilidade.
    const alturaCurva = Math.pow(nx, 3.2);
    const topo = rows - Math.round(rows * alturaCurva * 0.92);

    for (let r = 0; r < rows; r++) {
      const n = noise(c, r);
      let densidade = 0;
      if (r >= topo) densidade = 0.94;
      else if (r >= topo - 3) densidade = 0.35;
      else if (nx > 0.55) densidade = 0.05;

      if (n > 1 - densidade) {
        const profundidade = Math.min(1, (r - topo + 4) / rows);
        blocks.push({
          x: c * (BLOCK + GAP),
          y: r * (BLOCK + GAP),
          tone: Math.min(
            TONES.length - 1,
            Math.floor(profundidade * 3 + noise(r, c) * 1.4),
          ),
          phase: noise(c + 7, r + 3) * Math.PI * 2,
          // Só uma minoria pulsa: malha inteira piscando vira distração.
          pulse: noise(r + 11, c + 5) > 0.82 ? 0.5 : 0,
        });
      }
    }
  }
}

function draw(t: number) {
  const el = canvas.value;
  const ctx = el?.getContext("2d");
  if (!el || !ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, el.width / dpr, el.height / dpr);

  for (const b of blocks) {
    let alpha = 1;
    if (b.pulse)
      alpha =
        1 - b.pulse + b.pulse * (0.5 + 0.5 * Math.sin(t / 1400 + b.phase));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = TONES[b.tone]!;
    ctx.fillRect(b.x, b.y, BLOCK, BLOCK);
  }
  ctx.globalAlpha = 1;
}

function resize() {
  const el = canvas.value;
  if (!el) return;
  const { width, height } = el.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  build(width, height);
  draw(performance.now());
}

onMounted(() => {
  resize();

  // Quem pediu menos animação recebe a malha parada — ela já funciona como
  // composição estática, então não há motivo para desenhar nada.
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!semMovimento.matches) {
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  ro = new ResizeObserver(resize);
  if (canvas.value) ro.observe(canvas.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="pixel-field" aria-hidden="true" />
</template>

<style scoped>
.pixel-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  /* Decoração: não pode roubar clique do conteúdo do hero. */
  pointer-events: none;
}
</style>
