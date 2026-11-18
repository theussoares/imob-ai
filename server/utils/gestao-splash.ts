/**
 * Esqueleto exibido nas rotas /gestao enquanto o painel carrega.
 *
 * A rota não renderiza no servidor (`ssr: false`), então o HTML inicial tinha o `#__nuxt` vazio e a
 * tela ficava branca até o JavaScript subir e o `carregar()` do store responder. Este bloco entra no
 * HTML, FORA do `#__nuxt` (montar o app limparia o conteúdo de dentro), e o plugin cliente
 * `gestao-splash.client.ts` o remove quando a tela real está pronta.
 *
 * Alternativa descartada: `app.spaLoadingTemplate` do Nuxt — só vale com `ssr: false` global; com
 * `routeRules` por rota (o nosso caso) o template não é emitido.
 *
 * Cores fixas e neutras: neste ponto ainda não se sabe o tenant nem o tema escolhido.
 */
export const GESTAO_SPLASH_HTML = `<div class="gestao-splash" aria-hidden="true">
  <style>
    /* Esqueleto do painel: aparece no HTML inicial (a rota /gestao não renderiza no servidor), antes de
       qualquer JavaScript, para não haver tela branca. Cores fixas e neutras: ainda não se sabe o
       tenant nem o tema escolhido. */
    .gestao-splash{position:fixed;inset:0;z-index:9999;display:grid;grid-template-rows:56px 1fr;background:#f4f4f5;font-family:system-ui,sans-serif}
    .gestao-splash .gs-top{display:flex;align-items:center;gap:10px;padding:0 16px;background:#fff;border-bottom:1px solid #e4e4e7}
    .gestao-splash .gs-main{display:grid;grid-template-columns:232px 1fr;min-height:0}
    .gestao-splash .gs-side{display:flex;flex-direction:column;gap:10px;padding:16px 12px;background:#fff;border-right:1px solid #e4e4e7}
    .gestao-splash .gs-ct{display:flex;flex-direction:column;gap:14px;padding:20px}
    .gestao-splash .gs{border-radius:8px;background:linear-gradient(90deg,#e4e4e7 25%,#f1f1f3 50%,#e4e4e7 75%);background-size:200% 100%;animation:gs-brilho 1.3s linear infinite}
    .gestao-splash .gs-acento{background:#facc15;opacity:.6;animation:none}
    @keyframes gs-brilho{to{background-position:-200% 0}}
    @media (max-width:767px){.gestao-splash .gs-main{grid-template-columns:1fr}.gestao-splash .gs-side{display:none}}
    @media (prefers-reduced-motion:reduce){.gestao-splash .gs{animation:none}}
  </style>
  <div class="gs-top"><div class="gs" style="width:32px;height:32px"></div><div class="gs" style="width:140px;height:16px"></div></div>
  <div class="gs-main">
    <div class="gs-side">
      <div class="gs gs-acento" style="height:44px"></div>
      <div class="gs" style="height:24px"></div><div class="gs" style="height:24px"></div><div class="gs" style="height:24px"></div><div class="gs" style="height:24px"></div><div class="gs" style="height:24px"></div>
    </div>
    <div class="gs-ct">
      <div class="gs" style="height:28px;width:260px"></div>
      <div class="gs" style="height:70px"></div>
      <div class="gs" style="height:120px"></div>
    </div>
  </div>
</div>
`
