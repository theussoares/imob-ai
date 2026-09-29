import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { stripComments } from '../helpers/strip-comments'

/**
 * Travas das telas de acesso (entrar, recuperar e definir senha, do painel e da
 * Área do Cliente) e do interior do portal.
 *
 * Teste de FONTE, como `telas-de-definir-senha.test.ts`: o repositório não tem
 * teste de componente (ver vitest.config.ts), e tudo o que isto cobre falha em
 * silêncio — a tela renderiza perfeitamente e o problema só aparece do lado do
 * atacante ou do navegador.
 */

const raiz = process.cwd()
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), 'utf8')

const TELAS = [
  ['app', 'pages', 'admin', 'login.vue'],
  ['app', 'pages', 'admin', 'recuperar-senha.vue'],
  ['app', 'pages', 'admin', 'definir-senha.vue'],
  ['app', 'pages', 'area-cliente', 'login.vue'],
  ['app', 'pages', 'area-cliente', 'recuperar-senha.vue'],
  ['app', 'pages', 'area-cliente', 'definir-senha.vue'],
] as const

/** Só o `<template>` — é onde mora o markup que o navegador interpreta. */
function template(fonte: string): string {
  const i = fonte.indexOf('<template>')
  const f = fonte.lastIndexOf('</template>')
  return i >= 0 && f > i ? fonte.slice(i, f) : ''
}

function arquivos(dir: string, ext = /\.vue$/): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const c = join(dir, nome)
    if (statSync(c).isDirectory()) out.push(...arquivos(c, ext))
    else if (ext.test(nome)) out.push(c)
  }
  return out
}

describe('campo de senha', () => {
  test('toda tela de acesso usa o AuthPasswordField, nunca um input de senha próprio', () => {
    // O campo único é o que volta a senha para `type="password"` no envio (ver
    // o comentário no componente). Uma tela com `<input type="password">` à mão
    // e um olho próprio perderia isso sem nenhum sintoma na tela: o
    // gerenciador de senhas só deixaria de oferecer salvar.
    for (const tela of TELAS) {
      const t = template(ler(...tela))
      expect(t, `${tela.join('/')} voltou a ter input de senha próprio`).not.toMatch(/type="password"/)
      if (/senha|password/i.test(t) && !tela.includes('recuperar-senha.vue')) {
        expect(t, `${tela.join('/')} não usa o campo único`).toContain('<AuthPasswordField')
      }
    }
  })

  test('o campo esconde a senha no envio do formulário', () => {
    const c = stripComments(ler('app', 'components', 'AuthPasswordField.vue'))
    expect(c).toMatch(/addEventListener\('submit'/)
    expect(c).toMatch(/removeEventListener\('submit'/)
  })

  test('o e-mail se apresenta como usuário ao gerenciador de senhas', () => {
    // `autocomplete="username"` é o par que os gerenciadores procuram junto do
    // `current-password`; com `email`, alguns não associam os dois campos.
    for (const tela of TELAS.filter((t) => t.at(-1) !== 'definir-senha.vue')) {
      expect(template(ler(...tela)), tela.join('/')).toContain('autocomplete="username"')
    }
  })
})

describe('token do convite não sai pelo Referer', () => {
  test('as duas telas de definir senha pedem no-referrer', () => {
    // O `?token_hash=` fica na URL até o clique em "Continuar", e a moldura
    // tem link externo (crédito no rodapé). OWASP: tela de redefinição com
    // `no-referrer`. O cabeçalho global cobre hoje; isto não depende dele.
    for (const tela of TELAS.filter((t) => t.at(-1) === 'definir-senha.vue')) {
      expect(ler(...tela), tela.join('/')).toMatch(/name: ['"]referrer['"], content: ['"]no-referrer['"]/)
    }
  })

  test('link externo das telas de acesso e do portal não manda Referer', () => {
    const alvos = [
      join(raiz, 'app', 'components', 'AuthShell.vue'),
      join(raiz, 'app', 'layouts', 'portal.vue'),
      ...arquivos(join(raiz, 'app', 'components', 'portal')),
    ]
    for (const f of alvos) {
      for (const m of template(readFileSync(f, 'utf8')).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
        expect(m[0], relative(raiz, f)).toMatch(/rel="noopener noreferrer"/)
      }
    }
  })
})

describe('todo target="_blank" do app tem noopener', () => {
  test('sem noopener, a página aberta ganha `window.opener`', () => {
    // E pode trocar a aba de origem (a do painel, logada) por uma página de
    // login falsa — o "tabnabbing". Navegadores novos já tratam _blank como
    // noopener, mas o painel é instalado como app e roda em WebView também.
    const violacoes: string[] = []
    for (const f of arquivos(join(raiz, 'app'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
        if (!/noopener/.test(m[0])) violacoes.push(`${relative(raiz, f)}: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`)
      }
    }
    expect(violacoes).toEqual([])
  })
})

describe('href com dado do banco', () => {
  test('o link do boleto passa por urlHttps', () => {
    const c = stripComments(ler('app', 'components', 'portal', 'BoletoItem.vue'))
    expect(c).toContain('urlHttps(props.boleto.paymentUrl)')
    expect(template(c), 'o template voltou a usar paymentUrl cru no href').not.toMatch(/:href="boleto\.paymentUrl"/)
  })
})

describe('páginas de mock', () => {
  test('toda página em app/pages/mock morre fora do dev', () => {
    // Mock tem dado inventado (contrato, boleto, Pix) com cara de real. Em
    // produção, `/mock/area-cliente` seria uma página pública que parece a
    // área do cliente de verdade de qualquer tenant — material pronto para
    // golpe. O 404 tem de estar no topo de CADA arquivo.
    const dir = join(raiz, 'app', 'pages', 'mock')
    for (const f of arquivos(dir)) {
      expect(readFileSync(f, 'utf8'), relative(raiz, f)).toMatch(
        /if \(!import\.meta\.dev\) throw createError\(\{ statusCode: 404/,
      )
    }
  })
})
