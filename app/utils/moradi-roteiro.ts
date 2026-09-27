/**
 * Roteiro do chat da landing (`MoradiChat.vue`) e os preços que ele cita.
 *
 * Os preços moram aqui, e não no componente da landing, porque agora são dois
 * leitores: o card de plano e a resposta do chat. Digitados duas vezes, o
 * primeiro reajuste deixaria um deles mentindo. Ver
 * docs/superpowers/specs/2026-09-27-chat-roteiro-landing-design.md.
 */

export type PrazoPlano = 12 | 6

export const PRECOS = {
  corretor: { 12: 149, 6: 189 },
  imobiliaria: { 12: 400, 6: 450 },
} as const satisfies Record<string, Record<PrazoPlano, number>>

export type AcaoRoteiro =
  | { tipo: 'no'; para: string; rotulo: string }
  | { tipo: 'link'; href: string; rotulo: string; whatsapp?: boolean }
  | { tipo: 'secao'; id: string; rotulo: string }

export interface NoRoteiro {
  /** Parágrafos da resposta, cada um vira um balão. */
  falas: string[]
  acoes: AcaoRoteiro[]
}

export interface ContextoRoteiro {
  wa: (mensagem: string) => string
  demoUrl: string
  cotaIa: number
}

export const NO_INICIAL = 'inicio'

const voltar: AcaoRoteiro = { tipo: 'no', para: NO_INICIAL, rotulo: 'Voltar ao início' }

export function montarRoteiro({ wa, demoUrl, cotaIa }: ContextoRoteiro): Record<string, NoRoteiro> {
  const { corretor: c, imobiliaria: i } = PRECOS
  const pessoa = (rotulo: string, mensagem: string): AcaoRoteiro => ({
    tipo: 'link',
    href: wa(mensagem),
    rotulo,
    whatsapp: true,
  })

  return {
    inicio: {
      falas: [
        'Oi! Aqui estão as respostas para o que mais perguntam sobre a Moradi.',
        'Sobre o que você quer saber?',
      ],
      acoes: [
        { tipo: 'no', para: 'precos', rotulo: 'Quanto custa' },
        { tipo: 'no', para: 'teste', rotulo: 'Como é o teste grátis' },
        { tipo: 'no', para: 'site', rotulo: 'O que vem no site' },
        { tipo: 'no', para: 'dominio', rotulo: 'Domínio e contrato' },
        { tipo: 'no', para: 'pessoa', rotulo: 'Falar com uma pessoa' },
      ],
    },

    precos: {
      falas: [
        `Corretor: R$ ${c[12]}/mês no contrato de 12 meses, ou R$ ${c[6]} no de 6.`,
        `Imobiliária: R$ ${i[12]}/mês no de 12 meses, ou R$ ${i[6]} no de 6. Inclui descrição por IA, vários corretores, contratos e Área do Cliente.`,
        'Para redes e carteiras grandes, o plano Sob medida é combinado com você.',
      ],
      acoes: [
        { tipo: 'no', para: 'qual-plano', rotulo: 'Qual é o meu?' },
        { tipo: 'no', para: 'teste', rotulo: 'Quero testar antes' },
        { tipo: 'secao', id: 'planos', rotulo: 'Ver os planos na página' },
        voltar,
      ],
    },

    'qual-plano': {
      falas: [
        'Vende por conta própria? O Corretor resolve.',
        'Tem equipe, locação ou carteira de contratos? Vá de Imobiliária.',
        'Mais de um site, rede ou muitos imóveis para importar? Sob medida.',
      ],
      acoes: [
        pessoa('Quero o Corretor', 'Olá! Quero o plano Corretor da Moradi. Como começo?'),
        pessoa('Quero o Imobiliária', 'Olá! Quero o plano Imobiliária da Moradi. Como começo?'),
        pessoa('Conversar sobre o Sob medida', 'Olá! Quero conversar sobre o plano Sob medida da Moradi.'),
        voltar,
      ],
    },

    teste: {
      falas: [
        'São 3 dias grátis no painel de verdade, com os seus imóveis, sem cobrança nenhuma.',
        'O acesso é liberado por nós, pelo WhatsApp. Não há cadastro pelo site.',
      ],
      acoes: [
        pessoa('Pedir meu teste grátis', 'Olá! Quero o teste grátis de 3 dias da Moradi. Como faço?'),
        { tipo: 'link', href: demoUrl, rotulo: 'Ver o site de demonstração' },
        voltar,
      ],
    },

    site: {
      falas: [
        'Catálogo com busca, uma página por imóvel pronta para o Google, WhatsApp em cada anúncio e funil de leads.',
        'Os imóveis vão também para ZAP, Viva Real e OLX, pelo feed do Canal Pro.',
      ],
      acoes: [
        { tipo: 'link', href: demoUrl, rotulo: 'Ver o site de demonstração' },
        { tipo: 'no', para: 'ia', rotulo: 'Como é a descrição por IA?' },
        { tipo: 'secao', id: 'recursos', rotulo: 'Ver todos os recursos' },
        voltar,
      ],
    },

    ia: {
      falas: [
        'A IA escreve a descrição do anúncio a partir dos dados do imóvel e da foto de capa.',
        `Nada vai para o site sem você revisar. No plano Imobiliária, são até ${cotaIa} descrições por mês.`,
      ],
      acoes: [
        { tipo: 'no', para: 'precos', rotulo: 'Ver os preços' },
        { tipo: 'secao', id: 'ia', rotulo: 'Ver um exemplo' },
        voltar,
      ],
    },

    dominio: {
      falas: [
        'No teste, o site roda em seunome.usemoradi.com.br. Ao fechar, compramos o domínio registrado no seu nome, ou usamos o que você já tem.',
        'O contrato é de 6 ou 12 meses. Se não renovar, imóveis, fotos e domínio continuam seus.',
      ],
      acoes: [
        pessoa('Tirar uma dúvida sobre o meu domínio', 'Olá! Tenho uma dúvida sobre domínio na Moradi.'),
        { tipo: 'secao', id: 'duvidas', rotulo: 'Ver todas as dúvidas' },
        voltar,
      ],
    },

    pessoa: {
      falas: [
        'O atendimento é pelo WhatsApp, e quem responde é quem faz o site.',
      ],
      acoes: [
        pessoa('Abrir o WhatsApp', 'Olá! Vim pelo site da Moradi e tenho uma dúvida.'),
        voltar,
      ],
    },
  }
}
