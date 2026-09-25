import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * A política de `/privacidade` afirma o que o site coleta, com quem
 * compartilha e que não grava cookie. Ela é texto: nada nela quebra quando o
 * código muda. Este teste é o que quebra.
 *
 * Cada lista abaixo é o estado que a política descreve hoje. Mudou o código,
 * o teste cai, e a mensagem diz qual seção de `app/pages/privacidade.vue` e
 * qual questão de `docs/runbooks/lgpd-site-publico.md` rever. Atualizar a
 * lista SEM atualizar a política é o erro que este arquivo existe para tornar
 * visível na revisão.
 *
 * O caso mais caro é o cookie: a decisão de não ter banner depende de o site
 * não gravar nenhum. Um pixel de anúncio que entre sem banner que bloqueie o
 * script até o aceite é violação do Guia de Cookies da ANPD, não detalhe.
 */

const RAIZ = process.cwd()
const POLITICA = 'app/pages/privacidade.vue'
const PARECER = 'docs/runbooks/lgpd-site-publico.md'

function arquivos(dir: string, ext = /\.(ts|vue)$/): string[] {
  const out: string[] = []
  for (const nome of readdirSync(join(RAIZ, dir))) {
    const caminho = join(dir, nome)
    if (statSync(join(RAIZ, caminho)).isDirectory()) out.push(...arquivos(caminho, ext))
    else if (ext.test(nome)) out.push(caminho)
  }
  return out
}

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), 'utf8')
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '')
}

describe('privacidade: o que a política afirma continua verdade', () => {
  test('nenhum cookie novo', () => {
    // `dev_tenant`: só com `allowTenantSwitch`, que é falso em produção.
    const PERMITIDOS = ['server/middleware/tenant.ts']
    const usos = ['app', 'server', 'shared']
      .flatMap((d) => arquivos(d))
      .filter((f) => /\b(setCookie|useCookie)\s*\(|document\.cookie/.test(semComentarios(ler(f))))
      .map((f) => relative(RAIZ, join(RAIZ, f)))
    expect(
      usos.filter((f) => !PERMITIDOS.includes(f)),
      `Cookie novo. A política (${POLITICA}, "Cookies e estatísticas") afirma que o site não grava ` +
        `cookie, e é isso que dispensa o banner (${PARECER}, "Banner de cookies"). Cookie estritamente ` +
        `necessário: descreva na política e acrescente o arquivo aqui. Qualquer outro: banner que ` +
        `bloqueie o script até o aceite, antes de ir ao ar.`,
    ).toEqual([])
  })

  test('nenhum terceiro novo recebendo dado do navegador', () => {
    // A CSP é a lista real do que a página pode carregar e para onde pode
    // mandar dado — o navegador bloqueia o resto. Por isso vigiar ela, e não
    // o código: um script colado no <head> por qualquer caminho passa por aqui.
    const config = semComentarios(ler('nuxt.config.ts'))
    const diretiva = (nome: string) =>
      (config.match(new RegExp(`"${nome}\\s+([^"]*)"`))?.[1] ?? '').split(/\s+/).filter((s) => s.startsWith('http') || s.startsWith('wss'))

    expect(
      { script: diretiva('script-src'), connect: diretiva('connect-src') },
      `Terceiro novo na CSP. Atualize "Com quem compartilhamos" em ${POLITICA} e a tabela de ` +
        `tratamentos em ${PARECER}. Se for rastreamento ou anúncio, veja "Banner de cookies" antes.`,
    ).toEqual({
      // Vercel Analytics e Speed Insights — "Cookies e estatísticas" e "Vercel" na política.
      script: ['https://va.vercel-scripts.com'],
      // Supabase — "Supabase" na política (banco e armazenamento, no Brasil).
      connect: ['https://*.supabase.co', 'wss://*.supabase.co'],
    })
  })

  test('nenhum serviço externo novo chamado pelo servidor', () => {
    const hosts = new Set<string>()
    for (const f of arquivos('server')) {
      for (const m of semComentarios(ler(f)).matchAll(/fetch\(\s*['"`]https:\/\/([^/'"`]+)/g)) hosts.add(m[1]!)
    }
    // Adaptadores de serviço externo (`server/services`) montam a URL a partir
    // de uma constante, não de um `fetch('https://…')` literal — e o Asaas
    // passou invisível à regex acima na primeira versão. Aqui, QUALQUER
    // endereço https escrito nesses arquivos conta como destino.
    for (const f of arquivos('server/services')) {
      for (const m of semComentarios(ler(f)).matchAll(/['"`]https:\/\/([a-z0-9.-]+)/g)) hosts.add(m[1]!)
    }
    // SDKs chamam o serviço por dentro, sem URL no nosso código: vigiados pelo
    // package.json. A regex pega os nomes típicos de quem recebe dado de
    // pessoa (e-mail, SMS, anúncio, rastreamento, suporte, pagamento).
    const pkg = JSON.parse(ler('package.json')) as { dependencies?: Record<string, string> }
    const sdks = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      /sdk|analytics|insights|pixel|gtag|tag-?manager|sentry|posthog|segment|mixpanel|amplitude|hotjar|clarity|intercom|crisp|tawk|zendesk|resend|sendgrid|mailgun|twilio|stripe|mercadopago|pagar/i.test(d),
    )

    expect(
      { hosts: [...hosts].sort(), sdks: sdks.sort() },
      `Serviço externo novo. Se ele recebe dado de visitante ou cliente, atualize "Com quem ` +
        `compartilhamos" em ${POLITICA} e veja a transferência internacional (Q3) em ${PARECER}.`,
    ).toEqual({
      hosts: [
        // Asaas — "Asaas" na política (boleto e Pix do aluguel, no Brasil),
        // produção e sandbox.
        'api-sandbox.asaas.com',
        'api.asaas.com',
        // Resend — "Resend" na política (e-mail de aviso de lead, EUA).
        'api.resend.com',
      ],
      sdks: [
        // Descrição por IA: recebe só dados do imóvel, nunca do visitante —
        // `test/server/descricao-prompt.test.ts` trava isso. Por isso não
        // aparece na política.
        '@anthropic-ai/sdk',
        '@vercel/analytics',
        '@vercel/speed-insights',
      ],
    })
  })

  test('nenhum campo novo gravado sobre o visitante', () => {
    const colunas = (arquivo: string, tabela: string) => {
      const src = semComentarios(ler(arquivo))
      const m = src.match(new RegExp(`from\\('${tabela}'\\)\\.insert\\(\\{([\\s\\S]*?)\\}\\)`))
      if (!m) throw new Error(`insert em ${tabela} não encontrado em ${arquivo}`)
      // `chave: valor` ou a forma abreviada `chave,` — as duas gravam coluna.
      return [...m[1]!.matchAll(/^\s*(\w+)\s*(?::|,|$)/gm)].map((c) => c[1]!).sort()
    }

    expect(
      {
        leads: colunas('server/repositories/lead.repository.ts', 'leads'),
        whatsapp_clicks: colunas('server/repositories/whatsapp-click.repository.ts', 'whatsapp_clicks'),
      },
      `Campo novo coletado do visitante. Atualize "Neste site" em ${POLITICA} e a tabela ` +
        `"O que o site público trata" em ${PARECER}.`,
    ).toEqual({
      // "Quando você pede contato" + "Proteção contra abuso" na política.
      leads: ['ip_hash', 'lead_type', 'message', 'name', 'phone', 'property_id', 'source', 'tenant_id'].sort(),
      // "Quando você clica para conversar pelo WhatsApp" na política.
      whatsapp_clicks: ['broker_id', 'destination', 'ip_hash', 'origin', 'property_id', 'tenant_id'].sort(),
    })
  })
})
