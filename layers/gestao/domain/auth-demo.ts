/**
 * Senha das 6 contas de demonstração. Isolada neste módulo de propósito: só é
 * carregada por `import()` dinâmico quando `public.gestaoDemo` está ligado, então
 * o bundle sem demo nem a contém (vira um chunk à parte que ninguém busca), e o
 * código de produção (`auth.ts`) recebe a senha por parâmetro — não tem literal.
 *
 * É credencial de contas fictícias (`@olmi.exemplo`) e aparece na faixa
 * «Demonstração». Não reutilize em nada real.
 */
export const SENHA_DEMO = 'Demo@Gestao#2026!'
