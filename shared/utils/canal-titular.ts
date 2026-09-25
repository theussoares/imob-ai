import { formatBrPhone, formatWhatsapp, isValidBrPhone, isValidWhatsapp, onlyDigits } from '~~/shared/utils/phone'

export interface CanalDoTitular {
  tipo: 'email' | 'whatsapp' | 'telefone'
  href: string
  rotulo: string
}

interface ContatosDaImobiliaria {
  email: string | null
  whatsapp: string | null
  phone: string | null
}

/**
 * Por onde o titular exerce os direitos da LGPD, na política de privacidade.
 *
 * A política precisa de um canal (LGPD art. 9º, IV; e, para quem não indica
 * encarregado, Res. CD/ANPD 2/2022, art. 11). Ela mostrava só o e-mail, e a
 * frase terminava em ponto quando a imobiliária não tinha um — foi o caso da
 * `tatiane` em 25/09: política sem canal nenhum.
 *
 * E-mail primeiro porque deixa registro escrito do pedido, que é o que a
 * imobiliária vai precisar mostrar se alguém disser que não foi atendido.
 * Depois WhatsApp, que também fica escrito, e só então telefone.
 *
 * `phone` aceita os dois formatos do app (ver shared/utils/phone.ts): o do
 * painel vem com DDI 55, e linha antiga pode estar sem.
 */
export function canalDoTitular(c: ContatosDaImobiliaria): CanalDoTitular | null {
  const email = (c.email || '').trim()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { tipo: 'email', href: `mailto:${email}`, rotulo: email }
  }

  if (isValidWhatsapp(c.whatsapp)) {
    return { tipo: 'whatsapp', href: `https://wa.me/${onlyDigits(c.whatsapp)}`, rotulo: formatWhatsapp(c.whatsapp) }
  }

  if (isValidWhatsapp(c.phone)) {
    return { tipo: 'telefone', href: `tel:+${onlyDigits(c.phone)}`, rotulo: formatWhatsapp(c.phone) }
  }
  if (isValidBrPhone(c.phone)) {
    return { tipo: 'telefone', href: `tel:+55${onlyDigits(c.phone)}`, rotulo: formatBrPhone(c.phone) }
  }

  return null
}
