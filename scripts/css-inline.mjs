/**
 * Confere, num build de PRODUÇÃO, que o HTML dos sites de clientes não leva
 * `@font-face` dentro de `<style>` — e que a landing da raiz continua com as
 * fontes dela.
 *
 * Por que importa: CSS inline vem antes do conteúdo, e atrás dele fica o
 * preload da imagem do hero (ver o bloco `fonts` em nuxt.config.ts e
 * app/components/Hero.vue). Na home da Olmi eram 149 regras e 54 KB (24/09);
 * depois, 10 regras de Space Grotesk que um estilo escopado arrastava para o
 * HTML de todo cliente (corrigido ao passar as fontes para variável).
 *
 * Por que não é teste do Vitest nem spec do Playwright: o inline só existe no
 * build. O `pnpm dev` injeta o CSS de outro jeito, e o `e2e/` roda sobre ele —
 * ali o teste passaria sempre. E o build leva minutos, o que tiraria do
 * `pnpm test` a razão de existir.
 *
 * `test/app/fonte-por-variavel.test.ts` já barra a causa conhecida (nome de
 * fonte escrito à mão num estilo). Este script mede o efeito, qualquer que seja
 * a causa: o módulo de fontes mudando de comportamento numa atualização, a
 * landing deixando de ser lazy, uma regra `@font-face` escrita num componente.
 *
 * ⚠️ Cuidado com o host ao medir à mão: no `.env` de dev,
 * NUXT_PLATFORM_DOMAIN=localhost, então `http://localhost:3000/` É a landing
 * da raiz, não um cliente. Uma medição de 25/09 contou as 11 regras da landing
 * achando que eram do site de um cliente. Aqui o cliente vai por
 * `<slug>.localhost`, que o middleware resolve como subdomínio.
 *
 * Uso:
 *
 *   pnpm test:css-inline                     # build + verificação
 *   node scripts/css-inline.mjs              # só a verificação, sobre o .output que existir
 *   TENANT=olmi node scripts/css-inline.mjs  # outro cliente (padrão: demo)
 *
 * O `.output` precisa ser `NITRO_PRESET=node-server` — o preset `vercel` do
 * nuxt.config.ts não gera um servidor que se possa subir com `node`.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'

process.loadEnvFile('.env')

const PORT = Number(process.env.CSS_INLINE_PORT || 3111)
const TENANT = process.env.TENANT || 'demo'
const RAIZ = (process.env.NUXT_PLATFORM_DOMAIN || 'usemoradi.com.br').toLowerCase()
const CLIENTE = `${TENANT}.localhost`

/** Famílias da landing (MoradiLanding.vue). Se sumirem, a raiz cai na fonte de sistema sem erro. */
const FONTES_LANDING = ['Figtree', 'Schibsted Grotesk', 'Instrument Serif']
/** Fontes do tema padrão (main.css). Se sumirem, é o site do cliente que cai na fonte de sistema. */
const FONTES_CLIENTE = ['Inter', 'Space Grotesk']

const SERVIDOR = '.output/server/index.mjs'
if (!existsSync(SERVIDOR)) {
  console.error(`Sem ${SERVIDOR}. Rode antes: NITRO_PRESET=node-server pnpm build (ou pnpm test:css-inline).`)
  process.exit(1)
}

/**
 * `node:http`, não `fetch`: o fetch do Node (undici) descarta o cabeçalho
 * `Host`, e é o Host que escolhe o tenant. Com fetch, cliente e raiz saíam
 * idênticos — e a verificação passaria sem ter olhado o cliente.
 */
function get(host, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (res) => {
      let corpo = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (corpo += c))
      res.on('end', () => resolve({ status: res.statusCode, corpo }))
    })
    req.on('error', reject)
  })
}

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      await get(RAIZ, '/robots.txt')
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`o servidor não respondeu em ${PORT} em 30s`)
}

const familia = (regra) => /font-family:\s*"?([^";]+?)"?\s*;/.exec(regra)?.[1] ?? '?'
const regras = (css) => css.match(/@font-face\s*\{[^}]*\}/g) ?? []

async function medir(host, path) {
  const { status, corpo } = await get(host, path)
  const inline = [...corpo.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  const links = [...corpo.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1])
  let externo = ''
  for (const href of links) externo += (await get(host, href)).corpo
  const faces = regras(inline)
  return {
    host,
    path,
    status,
    titulo: /<title>([^<]*)/.exec(corpo)?.[1] ?? '',
    corpo,
    faces,
    bytes: faces.reduce((n, r) => n + r.length, 0),
    // Todas as famílias com @font-face que a página recebe, inline ou por <link>.
    familias: new Set([...faces, ...regras(externo)].map(familia)),
  }
}

const falhas = []
const servidor = spawn(process.execPath, [SERVIDOR], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
})

try {
  await esperarServidor()

  const home = await medir(CLIENTE, '/')
  // Uma página de imóvel real, tirada da própria home: o caminho muda por tenant.
  const imovel = /href="(\/[a-z0-9-]+\/[A-Za-z0-9-]+)"/.exec(home.corpo)?.[1]
  const paginas = [home]
  for (const p of [imovel, '/quem-somos', '/quero-vender', '/privacidade'].filter(Boolean)) {
    paginas.push(await medir(CLIENTE, p))
  }
  const raiz = await medir(RAIZ, '/')

  console.log('host · página · status · @font-face inline · bytes')
  for (const m of [...paginas, raiz]) {
    const porFamilia = {}
    for (const r of m.faces) porFamilia[familia(r)] = (porFamilia[familia(r)] ?? 0) + 1
    const detalhe = Object.keys(porFamilia).length ? ` ${JSON.stringify(porFamilia)}` : ''
    console.log(`${m.host} · ${m.path} · ${m.status} · ${m.faces.length} · ${m.bytes}${detalhe}`)
  }

  // Sem isto, um tenant inexistente cai na landing ou no 404 e a verificação
  // "passa" olhando a página errada.
  if (home.status !== 200 || /Moradi/.test(home.titulo)) {
    falhas.push(`${CLIENTE}/ não abriu o site do tenant "${TENANT}" (status ${home.status}, título "${home.titulo}"). Ajuste TENANT.`)
  }
  for (const m of paginas) {
    if (m.faces.length) {
      falhas.push(`${m.host}${m.path}: ${m.faces.length} @font-face inline (${m.bytes} bytes) — ${[...new Set(m.faces.map(familia))].join(', ')}`)
    }
  }
  for (const f of FONTES_CLIENTE) {
    if (!home.familias.has(f)) falhas.push(`${CLIENTE}/: nenhum @font-face de ${f} — o tema padrão ficaria na fonte de sistema`)
  }
  if (!/Moradi/.test(raiz.titulo)) {
    falhas.push(`${RAIZ}/ não abriu a landing (título "${raiz.titulo}"). Confira NUXT_PLATFORM_DOMAIN no .env.`)
  }
  for (const f of FONTES_LANDING) {
    if (!raiz.familias.has(f)) falhas.push(`${RAIZ}/: nenhum @font-face de ${f} — a landing ficaria na fonte de sistema`)
  }
} catch (e) {
  falhas.push(String(e?.message ?? e))
} finally {
  servidor.kill()
}

if (falhas.length) {
  console.error('\nFALHOU:\n- ' + falhas.join('\n- '))
  process.exit(1)
}
console.log('\nOK: nenhum @font-face inline nos sites de clientes; landing e tema padrão com as suas fontes.')
