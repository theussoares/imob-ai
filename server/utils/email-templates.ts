/**
 * Templates dos e-mails transacionais (portal do cliente e avisos do painel).
 *
 * Duas regras que valem para todos:
 *
 * 1. **HTML de e-mail não é HTML de página.** Gmail e Outlook descartam
 *    `<style>` externo, grid e flex. Por isso o layout é tabela e o estilo é
 *    inline — feio de escrever, é o que chega inteiro na caixa de entrada.
 *
 * 2. **Toda interpolação passa por `esc`.** O nome da imobiliária é digitado no
 *    painel por ela, e o do cliente pelo cadastro: são dados de terceiro dentro
 *    de um HTML que vai para a caixa de entrada de outra pessoa.
 *
 * Todo template devolve HTML **e** texto. Cliente que bloqueia HTML, leitor de
 * tela e prévia de notificação usam a versão texto — e um e-mail só-HTML chega
 * vazio para quem mais precisa dele.
 */

import { formatBrPhone } from '~~/shared/utils/phone'

export function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface CorpoEmail {
  assunto: string
  html: string
  texto: string
}

interface DadosConvite {
  /** Nome do cliente, como cadastrado. */
  nomeCliente: string
  /** Nome da imobiliária. */
  nomeImobiliaria: string
  /** Link de definir senha, já com o token. */
  link: string
}

/** Envelope comum: um cartão centralizado, tabela, estilo inline. */
function moldura(corpo: string, rodape: string): string {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"',
    ' style="background:#f3f5f2;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"',
    ' style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 26px">',
    `<tr><td style="color:#111827;font-size:15px;line-height:1.55">${corpo}</td></tr>`,
    '</table>',
    `<div style="max-width:520px;margin:14px auto 0;color:#6b7280;font-size:12px;line-height:1.5">${rodape}</div>`,
    '</td></tr></table>',
  ].join('')
}

/** Botão que sobrevive ao Outlook (tabela, não `<a>` estilizado como bloco). */
function botao(link: string, rotulo: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">',
    '<tr><td style="background:#111827;border-radius:9px">',
    `<a href="${esc(link)}" style="display:inline-block;padding:12px 22px;color:#ffffff;`,
    `text-decoration:none;font-weight:600;font-size:15px">${esc(rotulo)}</a>`,
    '</td></tr></table>',
  ].join('')
}

/**
 * Convite para o cliente criar a senha e entrar no portal.
 *
 * O assunto leva o nome da imobiliária porque é o que o cliente reconhece: ele
 * não sabe o que é imob-ai nem Moradi. Se o assunto disser só "Seu acesso", o
 * e-mail parece golpe — e e-mail com link que parece golpe não é clicado.
 */
export function emailConvitePortal(d: DadosConvite): CorpoEmail {
  const imob = esc(d.nomeImobiliaria)
  const nome = esc(d.nomeCliente.split(' ')[0] || d.nomeCliente)

  const html = moldura(
    [
      `<p style="margin:0 0 14px">Olá, ${nome}.</p>`,
      `<p style="margin:0 0 14px">A <b>${imob}</b> criou seu acesso à Área do Cliente.`,
      ' Lá você encontra seus contratos, laudos de vistoria e comprovantes, a qualquer hora.</p>',
      '<p style="margin:0">Para começar, crie sua senha:</p>',
      botao(d.link, 'Criar minha senha'),
      '<p style="margin:0;color:#6b7280;font-size:13px">',
      'Se o botão não funcionar, copie e cole este endereço no navegador:<br>',
      `<span style="word-break:break-all">${esc(d.link)}</span></p>`,
    ].join(''),
    // Quem não pediu precisa saber o que fazer — e a instrução é falar com a
    // imobiliária, não conosco: o vínculo do cliente é com ela.
    `Você recebeu este e-mail porque a ${imob} cadastrou seu acesso.` +
      ' Se não reconhece este contato, responda a este e-mail.',
  )

  const texto = [
    `Olá, ${d.nomeCliente.split(' ')[0] || d.nomeCliente}.`,
    '',
    `A ${d.nomeImobiliaria} criou seu acesso à Área do Cliente, onde ficam seus`,
    'contratos, laudos de vistoria e comprovantes.',
    '',
    'Crie sua senha neste endereço:',
    d.link,
    '',
    `Você recebeu este e-mail porque a ${d.nomeImobiliaria} cadastrou seu acesso.`,
    'Se não reconhece este contato, responda a este e-mail.',
  ].join('\n')

  return { assunto: `${d.nomeImobiliaria} · seu acesso à Área do Cliente`, html, texto }
}

interface DadosRecuperacao {
  nomeImobiliaria: string
  link: string
}

/**
 * Recuperação de senha.
 *
 * Diz explicitamente o que acontece se a pessoa NÃO pediu. Sem essa linha, quem
 * recebe um e-mail de redefinição que não solicitou conclui que a conta foi
 * invadida e liga para a imobiliária.
 */
export function emailRecuperacaoSenha(d: DadosRecuperacao): CorpoEmail {
  const imob = esc(d.nomeImobiliaria)

  const html = moldura(
    [
      '<p style="margin:0 0 14px">Recebemos um pedido para redefinir a senha do seu',
      ` acesso à Área do Cliente da <b>${imob}</b>.</p>`,
      '<p style="margin:0">Para criar uma nova senha:</p>',
      botao(d.link, 'Criar nova senha'),
      '<p style="margin:0;color:#6b7280;font-size:13px">',
      'Se o botão não funcionar, copie e cole este endereço no navegador:<br>',
      `<span style="word-break:break-all">${esc(d.link)}</span></p>`,
    ].join(''),
    'Se você não pediu isso, ignore este e-mail — sua senha atual continua valendo.',
  )

  const texto = [
    'Recebemos um pedido para redefinir a senha do seu acesso à Área do Cliente',
    `da ${d.nomeImobiliaria}.`,
    '',
    'Crie uma nova senha neste endereço:',
    d.link,
    '',
    'Se você não pediu isso, ignore este e-mail — sua senha atual continua valendo.',
  ].join('\n')

  return { assunto: `${d.nomeImobiliaria} · redefinir sua senha`, html, texto }
}


interface DadosAcessoLiberado {
  nomeCliente: string
  nomeImobiliaria: string
  /** Endereço do portal, para a pessoa saber onde entrar. */
  urlPortal: string
}

/**
 * "Seu acesso está pronto" — SEM token.
 *
 * Existe para o caso em que o e-mail já tem conta na plataforma e essa conta
 * ainda não era cliente desta imobiliária. Mandar um link de redefinição aí
 * seria forçar a troca de senha de uma conta que pode ser de outra pessoa,
 * usando o domínio verificado da plataforma como remetente — um convite vira
 * ferramenta de phishing contra qualquer endereço que alguém digite no painel.
 *
 * A pessoa entra com a senha que já tem. Se não lembrar, usa "esqueci minha
 * senha" no portal, que é um fluxo que ELA inicia.
 */
export function emailAcessoLiberado(d: DadosAcessoLiberado): CorpoEmail {
  const imob = esc(d.nomeImobiliaria)
  const nome = esc(d.nomeCliente.split(' ')[0] || d.nomeCliente)

  const html = moldura(
    [
      `<p style="margin:0 0 14px">Olá, ${nome}.</p>`,
      `<p style="margin:0 0 14px">A <b>${imob}</b> liberou seu acesso à Área do Cliente,`,
      ' onde ficam seus contratos, laudos de vistoria e comprovantes.</p>',
      '<p style="margin:0 0 14px">Como você já tem uma conta, entre com o seu e-mail e a',
      ' <b>senha que você já usa</b>.</p>',
      botao(d.urlPortal, 'Entrar na Área do Cliente'),
      '<p style="margin:0;color:#6b7280;font-size:13px">',
      'Não lembra a senha? Use a opção “Esqueci minha senha” na tela de entrada.</p>',
    ].join(''),
    `Você recebeu este e-mail porque a ${imob} liberou seu acesso.` +
      ' Se não reconhece este contato, responda a este e-mail.',
  )

  const texto = [
    `Olá, ${d.nomeCliente.split(' ')[0] || d.nomeCliente}.`,
    '',
    `A ${d.nomeImobiliaria} liberou seu acesso à Área do Cliente, onde ficam seus`,
    'contratos, laudos de vistoria e comprovantes.',
    '',
    'Como você já tem uma conta, entre com o seu e-mail e a senha que você já usa:',
    d.urlPortal,
    '',
    'Não lembra a senha? Use a opção "Esqueci minha senha" na tela de entrada.',
    '',
    `Você recebeu este e-mail porque a ${d.nomeImobiliaria} liberou seu acesso.`,
    'Se não reconhece este contato, responda a este e-mail.',
  ].join('\n')

  return { assunto: `${d.nomeImobiliaria} · seu acesso à Área do Cliente`, html, texto }
}


// ---- Avisos de lead para a imobiliária --------------------------------------

/** Lead como o aviso precisa dele: só o que ajuda a responder rápido. */
export interface LeadDoAviso {
  nome: string
  /** Telefone sem DDI, só dígitos — o formato que o formulário público grava. */
  telefone: string
  mensagem: string | null
  /** Rótulo já traduzido ("Quer comprar"), vindo de `shared/models/lead`. */
  tipo: string
  imovel: { codigo: string; titulo: string } | null
}

/**
 * Link de WhatsApp para a imobiliária responder o lead com um toque.
 *
 * É o motivo de o aviso existir: o lead de 09/09 na OLMI ficou sem resposta
 * porque ninguém abriu o painel. Um e-mail que obriga a abrir o painel para
 * achar o telefone repete metade do problema; o link leva direto à conversa, já
 * com a primeira frase escrita.
 *
 * O telefone do formulário vem sem DDI (ver `isValidBrPhone`); o `wa.me` exige
 * o DDI, e sem ele abre a conversa com um número de outro país.
 */
export function linkWhatsappDoLead(lead: LeadDoAviso, nomeImobiliaria: string): string {
  const primeiroNome = lead.nome.split(' ')[0] || lead.nome
  const sobre = lead.imovel ? ` sobre o imóvel ${lead.imovel.codigo}` : ''
  const texto = `Olá, ${primeiroNome}! Aqui é da ${nomeImobiliaria}. Recebemos seu contato pelo site${sobre}.`
  return `https://wa.me/55${lead.telefone}?text=${encodeURIComponent(texto)}`
}

interface DadosNovoLead {
  nomeImobiliaria: string
  lead: LeadDoAviso
  /** Quadro de leads no painel. `null` quando não há endereço a afirmar. */
  urlPainel: string | null
}

/**
 * "Chegou um lead" — para quem atende na imobiliária.
 *
 * O assunto carrega o nome do cliente e o imóvel porque é o que aparece na
 * notificação do celular: quem lê só a prévia precisa saber que é um contato
 * novo e sobre o quê, sem abrir.
 */
export function emailNovoLead(d: DadosNovoLead): CorpoEmail {
  const { lead } = d
  const tel = formatBrPhone(lead.telefone)
  const wa = linkWhatsappDoLead(lead, d.nomeImobiliaria)
  const sobre = lead.imovel ? `${lead.imovel.codigo} · ${lead.imovel.titulo}` : null

  const linhas: [string, string][] = [
    ['Nome', lead.nome],
    ['Telefone', tel],
    ['Interesse', lead.tipo],
    ...(sobre ? ([['Imóvel', sobre]] as [string, string][]) : []),
  ]

  const tabela = [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;font-size:15px">',
    ...linhas.map(
      ([k, v]) =>
        `<tr><td style="color:#6b7280;padding:3px 14px 3px 0;vertical-align:top">${esc(k)}</td>` +
        `<td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`,
    ),
    '</table>',
  ].join('')

  const html = moldura(
    [
      `<p style="margin:0 0 16px">Chegou um contato novo pelo site da <b>${esc(d.nomeImobiliaria)}</b>.</p>`,
      tabela,
      lead.mensagem
        ? `<p style="margin:14px 0 0;padding:12px 14px;background:#f3f5f2;border-radius:8px;white-space:pre-wrap">${esc(lead.mensagem)}</p>`
        : '',
      botao(wa, 'Responder no WhatsApp'),
      d.urlPainel
        ? `<p style="margin:0;font-size:14px"><a href="${esc(d.urlPainel)}" style="color:#111827">Abrir no quadro de leads</a></p>`
        : '',
    ].join(''),
    'Quanto antes o primeiro retorno, maior a chance de o contato virar visita.' +
      ' Depois de responder, mova o lead para “Em contato” no painel — assim ele sai do lembrete diário.',
  )

  const texto = [
    `Chegou um contato novo pelo site da ${d.nomeImobiliaria}.`,
    '',
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    ...(lead.mensagem ? ['', 'Mensagem:', lead.mensagem] : []),
    '',
    'Responder no WhatsApp:',
    wa,
    ...(d.urlPainel ? ['', 'Quadro de leads:', d.urlPainel] : []),
    '',
    'Depois de responder, mova o lead para "Em contato" no painel — assim ele sai do lembrete diário.',
  ].join('\n')

  const assuntoSobre = lead.imovel ? ` · ${lead.imovel.codigo}` : ''
  return { assunto: `Novo lead: ${lead.nome}${assuntoSobre}`, html, texto }
}

interface DadosLeadsParados {
  nomeImobiliaria: string
  leads: (LeadDoAviso & { recebidoEm: string })[]
  urlPainel: string | null
}

/**
 * Lembrete diário: leads que ninguém tocou desde que chegaram.
 *
 * É a segunda rede. O aviso imediato pode cair no spam, chegar num fim de
 * semana ou ser lido e esquecido; este volta a aparecer até alguém mexer no
 * lead — o que é exatamente o sinal de que ele foi atendido.
 */
export function emailLeadsParados(d: DadosLeadsParados): CorpoEmail {
  const n = d.leads.length
  const titulo = n === 1 ? '1 lead ainda sem resposta' : `${n} leads ainda sem resposta`

  const itens = d.leads.map((l) => {
    const wa = linkWhatsappDoLead(l, d.nomeImobiliaria)
    const sobre = l.imovel ? ` · ${l.imovel.codigo}` : ''
    return {
      html:
        '<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb">' +
        `<b>${esc(l.nome)}</b>${esc(sobre)}<br>` +
        `<span style="color:#6b7280;font-size:13px">${esc(formatBrPhone(l.telefone))} · chegou em ${esc(l.recebidoEm)}</span><br>` +
        `<a href="${esc(wa)}" style="color:#111827;font-size:14px">Responder no WhatsApp</a>` +
        '</td></tr>',
      texto: `- ${l.nome}${sobre} · ${formatBrPhone(l.telefone)} · chegou em ${l.recebidoEm}\n  ${wa}`,
    }
  })

  const html = moldura(
    [
      `<p style="margin:0 0 6px">Estes contatos chegaram pelo site da <b>${esc(d.nomeImobiliaria)}</b>`,
      ' e continuam como “Novo” no painel, sem nenhuma alteração há mais de um dia.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;font-size:15px">',
      ...itens.map((i) => i.html),
      '</table>',
      d.urlPainel ? botao(d.urlPainel, 'Abrir o quadro de leads') : '',
    ].join(''),
    'Este lembrete sai uma vez por dia. Um lead deixa de aparecer quando muda de etapa' +
      ' ou recebe qualquer anotação no painel.',
  )

  const texto = [
    `${titulo} — ${d.nomeImobiliaria}`,
    '',
    'Estes contatos continuam como "Novo" no painel, sem alteração há mais de um dia:',
    '',
    ...itens.map((i) => i.texto),
    ...(d.urlPainel ? ['', 'Quadro de leads:', d.urlPainel] : []),
    '',
    'Um lead deixa de aparecer quando muda de etapa ou recebe qualquer anotação no painel.',
  ].join('\n')

  return { assunto: `${d.nomeImobiliaria} · ${titulo}`, html, texto }
}
