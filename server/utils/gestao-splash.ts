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
 * O tema (claro/escuro) é lido da mesma chave do localStorage que `useGestaoTema` usa; o tenant ainda não é conhecido, então as cores são neutras.
 */
export const GESTAO_SPLASH_HTML = `<script>try{var t=localStorage.getItem('gestao_tema');if(t==='escuro'||(t!=='claro'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('gestao-escuro')}catch(e){}</script><div class="gestao-splash" aria-hidden="true">
  <div class="gs-intro"><div class="gs-logo"></div><div class="gs-pred"><i style="height:32px;animation-delay:.2s"></i><i style="height:50px;animation-delay:.45s"></i><i style="height:40px;animation-delay:1.45s"></i><i style="height:76px;animation-delay:.95s"></i><i style="height:46px;animation-delay:1.2s"></i><i style="height:62px;animation-delay:1.45s"></i></div></div>
  <p class="gs-falha">Não foi possível carregar o painel. <a href="">Tentar de novo</a></p>
  <style>
    /* Esqueleto do painel: aparece no HTML inicial (a rota /gestao não renderiza no servidor), antes de
       qualquer JavaScript, para não haver tela branca. Cores fixas e neutras: ainda não se sabe o
       tenant nem o tema escolhido. */
    .gestao-splash{position:fixed;inset:0;z-index:9999;display:grid;grid-template-rows:56px 1fr;background:#f4f4f5;font-family:system-ui,sans-serif}
    .gestao-splash .gs-top{display:flex;align-items:center;gap:10px;padding:0 16px;background:#fff;border-bottom:1px solid #e4e4e7}
    .gestao-splash .gs-main{display:grid;grid-template-columns:232px 1fr;min-height:0}
    .gestao-splash .gs-side{display:flex;flex-direction:column;gap:10px;padding:16px 12px;background:#fff;border-right:1px solid #e4e4e7}
    .gestao-splash .gs-ct{display:flex;flex-direction:column;gap:14px;padding:20px}
    .gestao-splash .gs{border-radius:8px;background:linear-gradient(90deg,#e4e4e7 25%,#f1f1f3 50%,#e4e4e7 75%);background-size:200% 100%;animation:gs-brilho 1.3s linear infinite,gs-entra .5s ease-out backwards}
    .gestao-splash .gs-acento{background:#facc15;opacity:.6;animation:gs-entra .5s ease-out backwards}
    /* Entrada: o logo "pulsa" e os blocos sobem em sequência, em vez de aparecerem de uma vez. */
    .gestao-splash .gs-logo{width:32px;height:32px;border-radius:8px;background:#17171a;display:grid;place-items:center;animation:gs-pulso 1.4s ease-in-out infinite}
    .gestao-splash .gs-logo:after{content:"";width:10px;height:10px;border-radius:3px;background:#facc15}
        .gestao-splash .gs-side>*:nth-child(1){animation-delay:.05s}.gestao-splash .gs-side>*:nth-child(2){animation-delay:.1s}.gestao-splash .gs-side>*:nth-child(3){animation-delay:.15s}.gestao-splash .gs-side>*:nth-child(4){animation-delay:.2s}.gestao-splash .gs-side>*:nth-child(5){animation-delay:.25s}.gestao-splash .gs-side>*:nth-child(6){animation-delay:.3s}
    .gestao-splash .gs-ct>*:nth-child(1){animation-delay:.15s}.gestao-splash .gs-ct>*:nth-child(2){animation-delay:.25s}.gestao-splash .gs-ct>*:nth-child(3){animation-delay:.35s}
    /* Abertura: prédios sobem (~2,7 s). Se o painel já estiver pronto, o plugin remove tudo antes
       de 3 s e o esqueleto nunca aparece; se não, a camada some aos 3 s e o esqueleto fica até o
       painel estar pronto. Tudo em CSS, sem depender de JavaScript. */
    .gestao-splash .gs-intro{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;background:#f4f4f5;animation:gs-intro-sai .35s ease 3s forwards}
    .gestao-splash .gs-intro .gs-logo{width:52px;height:52px;border-radius:13px}
    .gestao-splash .gs-intro .gs-logo:after{width:16px;height:16px;border-radius:4px}
    .gestao-splash .gs-pred{display:flex;align-items:flex-end;gap:7px;height:76px}
    .gestao-splash .gs-pred i{display:block;width:17px;background:#d4d4d8;border-radius:3px 3px 0 0;transform-origin:bottom;animation:gs-sobe 1.3s cubic-bezier(.2,.8,.2,1) backwards}
    .gestao-splash .gs-pred i:after{content:"";display:block;width:9px;height:3px;margin:6px auto 0;border-radius:2px;background:#facc15;animation:gs-pisca 1s ease-in-out infinite}
    @keyframes gs-sobe{from{transform:scaleY(0)}}
    @keyframes gs-pisca{50%{opacity:.25}}
    @keyframes gs-intro-sai{to{opacity:0;visibility:hidden}}
    /* Se nada carregou depois de 20 s (rede caída, script bloqueado), diz isso em vez de ficar parado. */
    .gestao-splash .gs-falha{position:absolute;left:0;right:0;bottom:32px;z-index:3;text-align:center;color:#52525b;font-size:14px;opacity:0;animation:gs-falha-mostra .3s ease 20s forwards}
    .gestao-splash .gs-falha a{color:#17171a;font-weight:700}
    @keyframes gs-falha-mostra{to{opacity:1}}
    @keyframes gs-entra{from{opacity:0;transform:translateY(8px)}}
    @keyframes gs-pulso{50%{transform:scale(.88)}}
    @keyframes gs-brilho{to{background-position:-200% 0}}
    @media (max-width:767px){.gestao-splash .gs-main{grid-template-columns:1fr}.gestao-splash .gs-side{display:none}}
    @media (prefers-reduced-motion:reduce){.gestao-splash .gs,.gestao-splash .gs-logo,.gestao-splash .gs-pred i,.gestao-splash .gs-pred i:after{animation:none}.gestao-splash .gs-intro{animation-duration:.01s;animation-delay:.6s}}
    /* Tema escuro: a classe é posta no <html> pelo script acima, antes do primeiro quadro. */
    html.gestao-escuro .gestao-splash,html.gestao-escuro .gestao-splash .gs-intro{background:#111113}
    html.gestao-escuro .gestao-splash .gs-top,html.gestao-escuro .gestao-splash .gs-side{background:#1c1c1f;border-color:#2e2e33}
    html.gestao-escuro .gestao-splash .gs{background:linear-gradient(90deg,#2e2e33 25%,#3a3a40 50%,#2e2e33 75%);background-size:200% 100%}
    html.gestao-escuro .gestao-splash .gs-acento{background:#facc15}
    html.gestao-escuro .gestao-splash .gs-pred i{background:#44444b}
    html.gestao-escuro .gestao-splash .gs-logo{background:#f4f4f5}
    html.gestao-escuro .gestao-splash .gs-falha{color:#a1a1aa}
    html.gestao-escuro .gestao-splash .gs-falha a{color:#f4f4f5}
  </style>
  <div class="gs-top"><div class="gs-logo"></div><div class="gs" style="width:140px;height:16px"></div></div>
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
