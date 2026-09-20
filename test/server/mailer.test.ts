import { describe, expect, test } from 'vitest'
import { enderecoDeEnvio, montarFrom, nomeExibicaoSeguro, replyToValido } from '~~/server/utils/mailer'
import {
  emailAcessoLiberado,
  emailConvitePortal,
  emailRecuperacaoSenha,
  esc,
} from '~~/server/utils/email-templates'

describe('nomeExibicaoSeguro', () => {
  test('mantém um nome normal', () => {
    expect(nomeExibicaoSeguro('OLMI IMÓVEIS')).toBe('OLMI IMÓVEIS')
  })

  test('remove quebra de linha — o vetor de injeção de cabeçalho', () => {
    // Sem isto, o nome digitado no painel acrescenta cabeçalhos ao e-mail: um
    // `Bcc:` transformaria o convite num disparo para terceiros.
    const malicioso = 'OLMI\r\nBcc: alguem@exemplo.com'
    const limpo = nomeExibicaoSeguro(malicioso)
    expect(limpo).not.toContain('\r')
    expect(limpo).not.toContain('\n')
    expect(limpo).toBe('OLMI Bcc: alguem@exemplo.com')
  })

  test('remove caractere de controle que NÃO é espaço em branco', () => {
    // Este é o caso que só a limpeza de controle pega. `\r` e `\n` também são
    // colapsados pelo `\s+` seguinte, então um teste que use só eles passa
    // mesmo com a proteção removida — foi o que aconteceu ao conferir por
    // mutação. Bytes como \x00 e \x01 não são `\s`, e é neles que a regra de
    // controle é a única barreira.
    const comNulo = 'OLMI\u0000IMOVEIS\u0001X'
    const limpo = nomeExibicaoSeguro(comNulo)
    expect(limpo).not.toContain('\u0000')
    expect(limpo).not.toContain('\u0001')
    expect(limpo).toBe('OLMI IMOVEIS X')
  })

  test('remove os caracteres que quebram a sintaxe do From', () => {
    expect(nomeExibicaoSeguro('OLMI "IMÓVEIS" <x@y.com>')).toBe('OLMI IMÓVEIS x@y.com')
  })

  test('limita o tamanho', () => {
    expect(nomeExibicaoSeguro('a'.repeat(200)).length).toBe(78)
  })
})

describe('montarFrom', () => {
  test('monta "Nome <endereco>"', () => {
    expect(montarFrom('OLMI IMÓVEIS', 'nao-responda@usemoradi.com.br')).toBe(
      'OLMI IMÓVEIS <nao-responda@usemoradi.com.br>',
    )
  })

  test('nome vazio devolve só o endereço, sem cabeçalho quebrado', () => {
    // Um tenant cujo nome só tinha caracteres proibidos não pode gerar
    // `From: <endereco>` com um par de <> solto antes.
    expect(montarFrom('<<>>', 'nao-responda@usemoradi.com.br')).toBe(
      'nao-responda@usemoradi.com.br',
    )
  })

  test('o endereço remetente nunca vem do tenant', () => {
    // O nome é da imobiliária; o ENDEREÇO é sempre do domínio verificado da
    // plataforma. Trocar isso derrubaria SPF/DKIM e o e-mail iria para spam.
    const from = montarFrom('Imobiliária X', 'nao-responda@usemoradi.com.br')
    expect(from.endsWith('<nao-responda@usemoradi.com.br>')).toBe(true)
  })
})

describe('replyToValido', () => {
  test('aceita e-mail comum e recusa lixo', () => {
    expect(replyToValido('contato@olmi.com.br')).toBe('contato@olmi.com.br')
    expect(replyToValido(null)).toBeUndefined()
    expect(replyToValido('  ')).toBeUndefined()
    expect(replyToValido('sem-arroba')).toBeUndefined()
  })

  test('recusa e-mail com caractere de cabeçalho', () => {
    expect(replyToValido('a@b.com,c@d.com')).toBeUndefined()
    expect(replyToValido('a@b.com>')).toBeUndefined()
  })
})

describe('enderecoDeEnvio', () => {
  const FALLBACK = 'nao-responda@usemoradi.com.br'

  test('aceita o endereço dedicado', () => {
    expect(enderecoDeEnvio('nao-responda@olmiimoveis.com.br', FALLBACK)).toBe(
      'nao-responda@olmiimoveis.com.br',
    )
  })

  test('vazio ou nulo cai no fallback', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(enderecoDeEnvio(v, FALLBACK)).toBe(FALLBACK)
    }
  })

  test('recusa quebra de linha — o vetor de injeção de cabeçalho', () => {
    // `montarFrom` já limpa o NOME. O endereço nunca precisou disso porque era
    // constante de configuração; virando dado de linha, precisa da mesma
    // validação. Um `\r\n` aqui acrescenta um `Bcc:` ao e-mail.
    expect(enderecoDeEnvio('x@y.com\r\nBcc: alguem@exemplo.com', FALLBACK)).toBe(FALLBACK)
  })

  test('recusa o que quebra a sintaxe de `Nome <endereco>`', () => {
    for (const v of ['a<b@y.com', 'a>b@y.com', 'a"b@y.com', 'a;b@y.com', 'a,b@y.com']) {
      expect(enderecoDeEnvio(v, FALLBACK), v).toBe(FALLBACK)
    }
  })

  test('recusa o que não é endereço', () => {
    for (const v of ['semarroba', 'sem@dominio', '@y.com', 'a@b']) {
      expect(enderecoDeEnvio(v, FALLBACK), v).toBe(FALLBACK)
    }
  })

  test('fallback vazio continua vazio — quem trata é o guard de configuração', () => {
    // `enviarEmail` erra alto em produção quando não há remetente nenhum. Esta
    // função não inventa um endereço para esconder isso.
    expect(enderecoDeEnvio('lixo', '')).toBe('')
  })
})

describe('templates', () => {
  const CONVITE = {
    nomeCliente: 'Giane de Cassia Martins Colli',
    nomeImobiliaria: 'OLMI IMÓVEIS',
    link: 'https://olmi.com.br/area-cliente/definir-senha?code=abc',
  }

  test('o convite traz o nome da imobiliária no assunto', () => {
    // O cliente não sabe o que é imob-ai nem Moradi. Assunto genérico com link
    // dentro parece golpe, e e-mail que parece golpe não é clicado.
    const { assunto } = emailConvitePortal(CONVITE)
    expect(assunto).toContain('OLMI IMÓVEIS')
  })

  test('o convite sai em HTML e em texto', () => {
    // Cliente que bloqueia HTML, leitor de tela e prévia de notificação usam a
    // versão texto — sem ela o e-mail chega vazio para quem mais precisa.
    const c = emailConvitePortal(CONVITE)
    expect(c.html).toContain(CONVITE.link)
    expect(c.texto).toContain(CONVITE.link)
    expect(c.texto).not.toContain('<table')
  })

  test('o link aparece também como texto copiável no HTML', () => {
    // Botão que não funciona em cliente antigo deixaria a pessoa sem saída.
    const { html } = emailConvitePortal(CONVITE)
    const ocorrencias = html.split(CONVITE.link).length - 1
    expect(ocorrencias).toBeGreaterThanOrEqual(2)
  })

  test('nome de imobiliária com HTML é escapado', () => {
    // O nome é digitado no painel por ela e vai para a caixa de entrada de
    // outra pessoa.
    const { html } = emailConvitePortal({
      ...CONVITE,
      nomeImobiliaria: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('nome de cliente com HTML é escapado', () => {
    const { html } = emailConvitePortal({ ...CONVITE, nomeCliente: '<img onerror=x>' })
    expect(html).not.toContain('<img')
  })

  test('a recuperação diz o que fazer se a pessoa não pediu', () => {
    // Sem essa linha, quem recebe um "redefinir senha" que não solicitou conclui
    // que a conta foi invadida e liga para a imobiliária.
    const r = emailRecuperacaoSenha({ nomeImobiliaria: 'OLMI IMÓVEIS', link: 'https://x/y' })
    expect(r.texto.toLowerCase()).toContain('não pediu')
    expect(r.html.toLowerCase()).toContain('não pediu')
  })
})

describe('esc', () => {
  test('escapa os cinco caracteres que importam', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  test('escapa o & primeiro, sem duplicar', () => {
    // Ordem errada produziria &amp;lt; — texto quebrado na caixa de entrada.
    expect(esc('<')).toBe('&lt;')
    expect(esc('&lt;')).toBe('&amp;lt;')
  })
})

describe('emailAcessoLiberado — o aviso SEM token', () => {
  const DADOS = {
    nomeCliente: 'Giane de Cassia Martins Colli',
    nomeImobiliaria: 'OLMI IMÓVEIS',
    urlPortal: 'https://olmi.com.br/area-cliente/login',
  }

  test('não carrega token de nenhuma espécie', () => {
    // A razão de existir deste template. Um link com `code=`/`token=` aqui
    // devolveria o problema que ele foi criado para resolver: qualquer membro
    // de qualquer tenant forçando a redefinição de senha de uma conta alheia,
    // com o domínio verificado da plataforma no remetente.
    const c = emailAcessoLiberado(DADOS)
    for (const proibido of ['code=', 'token=', 'access_token', 'refresh_token', 'type=recovery']) {
      expect(c.html).not.toContain(proibido)
      expect(c.texto).not.toContain(proibido)
    }
  })

  test('aponta para o login, não para definir-senha', () => {
    const c = emailAcessoLiberado(DADOS)
    expect(c.texto).toContain('/area-cliente/login')
    expect(c.texto).not.toContain('definir-senha')
  })

  test('diz para usar a senha que a pessoa já tem', () => {
    // Sem esta frase, quem recebe procura um link que não existe e liga para a
    // imobiliária.
    expect(emailAcessoLiberado(DADOS).texto.toLowerCase()).toContain('senha que você já usa')
  })

  test('escapa o nome da imobiliária', () => {
    const c = emailAcessoLiberado({ ...DADOS, nomeImobiliaria: '<script>x</script>' })
    expect(c.html).not.toContain('<script>')
  })
})
