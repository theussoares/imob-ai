/**
 * Gera o card social da landing da Moradi (public/moradi/og.jpg, 1200×630).
 *
 * Arquivo estático e não a rota /og/home.jpg: sem tenant, aquela rota devolve
 * só um retângulo na cor da plataforma, porque o runtime da Vercel não tem
 * fontes e o sharp não consegue escrever texto lá (ver server/utils/og-render.ts).
 * O card da landing é peça de marca, com título e tipografia, e muda quando a
 * mensagem muda: rasterizar aqui, com as fontes de verdade, custa rodar um
 * script de vez em quando.
 *
 * Mudou o título do hero, a foto ou a cor? Rode de novo e troque o `?v=` em
 * MoradiLanding.vue (`OG_VERSAO`): o WhatsApp guarda o preview por URL e não
 * revalida.
 *
 * Uso: node scripts/og-landing.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const PUBLIC = new URL('../public/moradi/', import.meta.url)
const SAIDA = new URL('og.jpg', PUBLIC)

// JPEG no data URI: o Chromium do Playwright abre WebP, mas assim o HTML não
// depende de servidor nenhum, nem do dev server de pé.
const foto = await sharp(readFileSync(new URL('corretora-chaves.webp', PUBLIC)))
  .resize(640, 630, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 92 })
  .toBuffer()

// Mesmos tokens da landing (.lp em MoradiLanding.vue). Google Fonts só aqui, na
// geração: o arquivo final é um JPEG, e nenhum visitante baixa fonte de fora.
const html = `<!doctype html>
<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=Figtree:wght@500;600&family=Instrument+Serif:ital@1&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fbfbf9; color: #16181b; font-family: Figtree, sans-serif; }
  .card { display: grid; grid-template-columns: 560px 640px; height: 630px; }
  .txt { padding: 56px 40px 52px 64px; display: flex; flex-direction: column; }
  .logo { display: flex; align-items: center; gap: 12px; font: 800 38px/1 'Schibsted Grotesk'; letter-spacing: -0.03em; }
  .logo svg { width: 38px; height: 38px; }
  h1 { margin-top: auto; font: 800 62px/1.02 'Schibsted Grotesk'; letter-spacing: -0.035em; }
  h1 em { font: italic 400 68px/1 'Instrument Serif'; letter-spacing: -0.01em; }
  p { margin-top: 22px; font: 500 24px/1.35 Figtree; color: #3d4248; }
  .tag { margin-top: 30px; align-self: flex-start; background: #f4b400; color: #16181b; font: 600 22px/1 Figtree; padding: 14px 22px; border-radius: 999px; }
  .foto { background: url(data:image/jpeg;base64,${foto.toString('base64')}) center / cover; border-radius: 28px 0 0 28px; }
</style></head>
<body><div class="card">
  <div class="txt">
    <div class="logo"><svg viewBox="0 0 26 26"><path d="M13 2 24 10.5V23a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10.5Z" fill="#f4b400"/><path d="M8 24v-8.5a5 5 0 0 1 10 0V24" fill="none" stroke="#16181b" stroke-width="2.6"/></svg>moradi</div>
    <h1>Seus imóveis no Google, com a <em>sua</em> marca.</h1>
    <p>Site de imóveis para corretores e imobiliárias, no seu domínio.</p>
    <span class="tag">3 dias de teste grátis</span>
  </div>
  <div class="foto"></div>
</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const png = await page.screenshot({ type: 'png' })
await browser.close()

// Mesma receita do card das rotas /og (server/utils/og-render.ts): JPEG com
// mozjpeg, abaixo dos ~600 KB que o WhatsApp aceita.
await sharp(png).jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(SAIDA.pathname)
console.log('ok:', SAIDA.pathname)
