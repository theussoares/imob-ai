// Aplica o tema salvo assim que o app sobe (ver `useGestaoTema`).
export default defineNuxtPlugin(() => {
  if (!useRoute().path.startsWith('/gestao')) return
  useGestaoTema().iniciar()
})
