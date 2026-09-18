import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * As duas telas de definir senha não podem se apresentar igual.
 *
 * ⚠️ O incidente: um convite da Área do Cliente caiu em `/admin/definir-senha`
 * por causa de um redirecionamento com caminho fixo. A pessoa preencheu a senha
 * INTEIRA e só descobriu o engano na tela seguinte, com "sua conta não tem
 * acesso a essa imobiliária".
 *
 * O redirecionamento já foi corrigido (`shared/utils/auth-redirect.ts`, com
 * teste próprio). O que este arquivo guarda é a outra metade: as telas eram
 * indistinguíveis — mesmo `<h1>`, mesmos rótulos, mesmo botão — e por isso o
 * bug ficou invisível para quem estava dentro dele.
 *
 * Isto é teste de FONTE porque o repositório não tem teste de componente
 * (decisão registrada no `vitest.config.ts`), e porque tudo o que ele cobre
 * falha em silêncio: a tela renderiza perfeitamente errada.
 */

function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

const PAINEL = ['app', 'pages', 'admin', 'definir-senha.vue'] as const
const PORTAL = ['app', 'pages', 'area-cliente', 'definir-senha.vue'] as const

/** O `<h1>` da tela, que é a primeira coisa que a pessoa lê. */
function titulo(...partes: string[]): string {
  const m = fonte(...partes).match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

describe('as duas telas se identificam', () => {
  test('os títulos são diferentes', () => {
    const doPainel = titulo(...PAINEL)
    const doPortal = titulo(...PORTAL)
    expect(doPainel, 'o painel perdeu o <h1>').toBeTruthy()
    expect(doPortal, 'o portal perdeu o <h1>').toBeTruthy()
    expect(doPainel, 'as duas telas voltaram a ter o mesmo título').not.toBe(doPortal)
  })

  test('cada título nomeia o próprio destino', () => {
    // Não basta serem diferentes: "Definir sua senha" e "Defina sua senha"
    // passariam no teste acima sem resolver nada. O que a pessoa precisa ler é
    // ONDE ela está.
    expect(titulo(...PAINEL).toLowerCase()).toContain('painel')
    expect(titulo(...PORTAL).toLowerCase()).toContain('área do cliente')
  })

  test('o botão que entrega a senha diz para onde leva', () => {
    // Última chance de perceber o engano antes de entregar a credencial.
    expect(fonte(...PAINEL)).toContain('Definir senha e entrar no painel')
    expect(fonte(...PORTAL)).toContain('Definir senha e entrar na Área do Cliente')
  })

  test('a aba do navegador também distingue as duas', () => {
    // Quem pede ajuda manda print. Com dois títulos iguais, nem o print diz em
    // qual das telas a pessoa estava.
    const tituloDaAba = (...p: string[]) => fonte(...p).match(/title: ['"](.+?)['"]/)?.[1]
    expect(tituloDaAba(...PAINEL)).not.toBe(tituloDaAba(...PORTAL))
  })
})

describe('uma implementação só do token do convite', () => {
  test('nenhuma das duas lê a credencial por conta própria', () => {
    // O bloco de PKCE/implícito estava copiado literalmente nos dois arquivos.
    // Duas cópias de uma regra que não varia é uma que vai derivar da outra —
    // e derivou, no tratamento de erro (ver o teste abaixo).
    for (const tela of [PAINEL, PORTAL]) {
      const f = fonte(...tela)
      expect(f, `${tela.join('/')} não usa a fonte única`).toContain('credencialDaUrl(')
      // O que se proíbe é EXTRAIR a credencial da URL, não passá-la adiante:
      // `access_token` continua aparecendo como parâmetro de `setSession`, que
      // é o nome que o Supabase exige.
      for (const cru of ['searchParams.get(', 'location.hash', 'URLSearchParams(']) {
        expect(f, `${tela.join('/')} voltou a ler ${cru} direto`).not.toContain(cru)
      }
    }
  })

  test('a regra da senha também é uma só', () => {
    for (const tela of [PAINEL, PORTAL]) {
      const f = fonte(...tela)
      expect(f, `${tela.join('/')} não usa validarNovaSenha`).toContain('validarNovaSenha(')
      expect(f, `${tela.join('/')} voltou a checar o tamanho à mão`).not.toContain('.length < 8')
    }
  })
})

describe('nenhuma das duas mostra erro cru do Supabase', () => {
  test('as duas passam por friendlyErrorMessage', () => {
    // A deriva que a duplicação produziu: o painel traduzia o erro e o portal
    // mostrava `err.message`, que vem do Supabase em INGLÊS. Caiu no lado pior
    // — quem lê a tela do portal é o cliente final, sem a quem recorrer além do
    // WhatsApp da imobiliária.
    for (const tela of [PAINEL, PORTAL]) {
      const f = fonte(...tela)
      expect(f, `${tela.join('/')} não traduz o erro`).toContain('friendlyErrorMessage(')
      expect(f, `${tela.join('/')} voltou a mostrar a mensagem crua`).not.toContain('err?.message')
    }
  })
})
