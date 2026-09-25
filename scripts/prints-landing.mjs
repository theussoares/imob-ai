/**
 * Refaz os prints da demo usados na landing da Moradi (public/moradi/*.webp).
 *
 * A landing usa print REAL da demo, não ilustração (ver
 * docs/superpowers/specs/2026-09-24-landing-moradi-design.md): é prova que o
 * visitante confere clicando em "ver demo". Isso só vale enquanto o print for
 * igual ao site — toda mudança visual no catálogo pede rodar isto de novo.
 * Na primeira vez que o catálogo mudou, os prints ficaram mostrando até um
 * defeito já corrigido (o topo sem marca).
 *
 * As três cores dos prints de "sua marca" entram SÓ na captura, sobrescrevendo
 * as CSS vars que o SSR injeta por tenant: é o mesmo mecanismo do campo de cor
 * do painel, sem gravar nada no tenant da demo.
 *
 * Uso (com o dev server de pé; o atalho `?tenant=` só existe fora de produção):
 *
 *   node scripts/prints-landing.mjs                 # http://localhost:3000
 *   BASE_URL=http://localhost:3001 node scripts/prints-landing.mjs
 *   OUT_DIR=/tmp/antes node scripts/prints-landing.mjs   # não toca public/
 *
 * As dimensões de saída são as que a landing declara no `<img>` (width/height):
 * mudar aqui sem mudar lá faz a imagem distorcer ou pular o layout.
 */
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const TENANT = process.env.TENANT || 'demo'
const IMOVEL = process.env.IMOVEL || '/sobrado-3-quartos-quinta-da-lagoa/NC-0339'
// `OUT_DIR` grava em outra pasta: é como se compara antes/depois de uma
// mudança que não deve alterar o visual (ver a spec de temas), sem sobrescrever
// as imagens que a landing publica.
const OUT = process.env.OUT_DIR
  ? new URL(`file://${process.env.OUT_DIR.replace(/\/?$/, '/')}`)
  : new URL('../public/moradi/', import.meta.url)

/** Mesmas duplas da lista `temas` em app/components/MoradiLanding.vue. */
const TEMAS = [
  { arquivo: 'tema-verde', brand: '#0f3d38', wa: '#f87171' },
  { arquivo: 'tema-marinho', brand: '#1b2a4a', wa: '#c9a24a' },
  { arquivo: 'tema-vinho', brand: '#6d1f2f', wa: '#e0b48a' },
]

// O botão flutuante do devtools do Nuxt aparece no dev server e sairia no print.
const SEM_DEVTOOLS = '#nuxt-devtools-container, [id^="nuxt-devtools"] { display: none !important; }'

async function abrir(browser, { width, height, scale, mobile }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  // Grava o cookie de tenant do atalho de dev antes de qualquer captura.
  await page.goto(`${BASE}/?tenant=${TENANT}`, { waitUntil: 'networkidle' })
  return { ctx, page }
}

async function preparar(page, cores) {
  const vars = cores ? `html:root { --brand: ${cores.brand} !important; --wa: ${cores.wa} !important; }` : ''
  await page.addStyleTag({ content: SEM_DEVTOOLS + vars })
}

/** Espera as fotos visíveis decodificarem — print com card cinza não prova nada. */
async function fotosProntas(page) {
  await page.waitForFunction(() =>
    [...document.images]
      .filter((i) => {
        const r = i.getBoundingClientRect()
        return r.bottom > 0 && r.top < innerHeight && r.width > 0
      })
      .every((i) => i.complete && i.naturalWidth > 0),
  )
  await page.waitForTimeout(300)
}

async function rolarAteGrade(page) {
  await page.evaluate(() => {
    const grade = document.querySelector('.grid')
    const topo = document.querySelector('header.bar')?.getBoundingClientRect().height ?? 0
    window.scrollTo({ top: grade.getBoundingClientRect().top + scrollY - topo - 12, behavior: 'instant' })
  })
}

async function salvar(buf, arquivo, { width, height }) {
  const destino = new URL(`${arquivo}.webp`, OUT)
  await sharp(buf).resize(width, height, { fit: 'cover', position: 'top' }).webp({ quality: 70, effort: 6 }).toFile(destino.pathname)
  console.log(`✓ ${arquivo}.webp (${width}x${height})`)
}

const browser = await chromium.launch()
try {
  // Celular, três cores: 350x700 a 2x = 700x1400.
  for (const tema of TEMAS) {
    const { ctx, page } = await abrir(browser, { width: 350, height: 700, scale: 2, mobile: true })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await preparar(page, tema)
    await rolarAteGrade(page)
    await fotosProntas(page)
    await salvar(await page.screenshot(), tema.arquivo, { width: 700, height: 1400 })
    await ctx.close()
  }

  // Desktop: a primeira fileira de cards, 1400x532.
  {
    // 1280 e não 1200: a grade tem largura máxima fixa, então a janela mais
    // larga só acrescenta margem — e é essa margem que faz a fileira inteira,
    // com os botões, caber na proporção 1400x532 sem cortar embaixo.
    const { ctx, page } = await abrir(browser, { width: 1280, height: 900, scale: 1400 / 1280, mobile: false })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await preparar(page, TEMAS[0])
    await rolarAteGrade(page)
    await fotosProntas(page)
    const caixa = await page.evaluate(() => {
      const r = document.querySelector('.grid .prop').getBoundingClientRect()
      return { x: 0, y: Math.max(0, r.top - 8), width: innerWidth, height: r.height + 16 }
    })
    await salvar(await page.screenshot({ clip: caixa }), 'print-catalogo', { width: 1400, height: 532 })
    await ctx.close()
  }

  // Página do imóvel no celular, com a barra "Tenho interesse": 700x1371.
  {
    const { ctx, page } = await abrir(browser, { width: 350, height: 686, scale: 2, mobile: true })
    await page.goto(`${BASE}${IMOVEL}`, { waitUntil: 'networkidle' })
    await preparar(page, TEMAS[0])
    await fotosProntas(page)
    await salvar(await page.screenshot(), 'print-imovel', { width: 700, height: 1371 })
    await ctx.close()
  }
} finally {
  await browser.close()
}
