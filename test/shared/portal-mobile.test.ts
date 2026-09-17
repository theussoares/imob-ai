import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Travas de layout do portal para tela estreita.
 *
 * ⚠️ **Isto NÃO substitui abrir num celular.** O card 2.4 pede teste em
 * aparelho real, e é isso que pega fonte pequena demais, alvo de toque
 * apertado e rolagem travada. Nenhum teste de fonte vê essas coisas.
 *
 * O que dá para travar aqui é o erro mecânico que quebra a tela em 360px sem
 * ninguém perceber no desktop: uma largura fixa maior que a viewport, ou um
 * `min-width` que impede o conteúdo de encolher. Os dois passam despercebidos
 * porque o navegador do desenvolvedor tem espaço de sobra.
 */

/** Largura do aparelho mais estreito que a cliente vai usar. */
const LARGURA_ALVO = 360

const PAGINAS_PORTAL = join(process.cwd(), 'app', 'pages', 'area-cliente')
const LAYOUT_PORTAL = join(process.cwd(), 'app', 'layouts', 'portal.vue')

function arquivosVue(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosVue(caminho))
    else if (nome.endsWith('.vue')) saida.push(caminho)
  }
  return saida
}

/** Tira comentário de bloco e de linha, para a busca não acusar a explicação. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Só o bloco `<style>`: largura em `<script>` é lógica, não layout. */
function estilos(fonte: string): string {
  return [...fonte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
}

const ARQUIVOS = [...arquivosVue(PAGINAS_PORTAL), LAYOUT_PORTAL]

describe('layout do portal em 360px', () => {
  test('há telas de portal para conferir', () => {
    // Se a pasta for renomeada, este arquivo passaria vazio e mudo.
    expect(ARQUIVOS.length).toBeGreaterThan(3)
  })

  test('nenhuma largura fixa maior que a tela', () => {
    // `width: 420px` num cartão empurra a página inteira para o lado e cria
    // rolagem horizontal — o sintoma clássico de layout quebrado no celular.
    for (const caminho of ARQUIVOS) {
      const css = estilos(readFileSync(caminho, 'utf8'))
      for (const m of css.matchAll(/(?<!max-|min-)\bwidth:\s*(\d+)px/g)) {
        const px = Number(m[1])
        expect(px, `${caminho}: width ${px}px não cabe em ${LARGURA_ALVO}px`).toBeLessThanOrEqual(
          LARGURA_ALVO,
        )
      }
    }
  })

  test('nenhum min-width que impeça o conteúdo de encolher', () => {
    // `min-width: 500px` ganha de qualquer media query e trava a tela. O único
    // valor aceitável é 0, usado em filho de flex para permitir truncamento.
    for (const caminho of ARQUIVOS) {
      const css = estilos(readFileSync(caminho, 'utf8'))
      for (const m of css.matchAll(/min-width:\s*(\d+)px/g)) {
        const px = Number(m[1])
        expect(px, `${caminho}: min-width ${px}px trava a tela`).toBeLessThanOrEqual(LARGURA_ALVO)
      }
    }
  })

  // Havia aqui uma quarta regra: "max-width exige width:100% ou centralização".
  // Ela acusou `.portal-logo`, que usa `max-width` com `width: auto` — a forma
  // CERTA de dimensionar imagem. Regra que reprova código correto não protege
  // nada e ensina a afrouxar regra, então saiu. As três acima são mecânicas: ou
  // a largura cabe em 360px, ou não cabe.

  test('nada abre janela depois de um `await`', () => {
    // A regra do Safari: `window.open` precisa acontecer no MESMO turno do
    // event loop do gesto que o disparou. Depois de um `await` a ativação
    // transitória já passou — o Chrome costuma tolerar, o iOS recusa. E recusa
    // CALADO: não lança nada, então o `catch` da tela não vê, a mensagem de
    // erro fica vazia e o spinner só para. A pessoa toca em "Baixar" e não
    // acontece nada.
    //
    // Pior no caso do download: o servidor já gravou a trilha de LGPD e já
    // gastou a URL assinada de 60s. O registro diz que o documento foi baixado,
    // e ele não foi.
    //
    // O caminho certo é `location.href` com a URL já marcada como anexo
    // (`download` no `createSignedUrl`), que não é popup e não passa por essa
    // regra. Por isso a proibição é do `window.open`, e não do await.
    for (const caminho of ARQUIVOS) {
      // Sem comentários: a explicação de por que NÃO usar `window.open(...)`
      // mora justamente no arquivo que a regra protege. Foi a lição de
      // `portal-payload-guardrail.test.ts`, onde a busca crua reprovou código
      // certo por causa do comentário que o defendia.
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      expect(
        fonte.includes('window.open('),
        `${caminho}: window.open no portal é bloqueado no iOS quando vem depois de await`,
      ).toBe(false)
    }
  })

  test('campos de formulário não disparam o zoom do iOS', () => {
    // Fonte menor que 16px num input faz o Safari dar zoom ao focar, e a página
    // fica deslocada para o resto da sessão. É a coisa que mais denuncia um
    // portal que nunca foi aberto no iPhone.
    for (const caminho of ARQUIVOS) {
      const css = estilos(readFileSync(caminho, 'utf8'))
      for (const bloco of css.split('}')) {
        const seletor = bloco.split('{')[0] || ''
        if (!/\.inp\b|input|select|textarea/.test(seletor)) continue
        for (const m of bloco.matchAll(/font-size:\s*(\d+)px/g)) {
          expect(
            Number(m[1]),
            `${caminho}: input com fonte ${m[1]}px dispara zoom no iOS`,
          ).toBeGreaterThanOrEqual(16)
        }
      }
    }
  })
})
