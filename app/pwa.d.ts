/**
 * Tipos dos módulos virtuais do vite-plugin-pwa (`virtual:pwa-register`).
 *
 * Eles só existem em tempo de build, então o TypeScript não os acha sozinho —
 * sem esta referência, `app/plugins/pwa.client.ts` não compila.
 */
/// <reference types="vite-plugin-pwa/client" />
