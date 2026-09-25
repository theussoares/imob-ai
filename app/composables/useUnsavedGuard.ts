/**
 * Pergunta antes de sair de um formulário com alterações não salvas.
 *
 * O formulário de imóvel tem ~2800px no celular e fotos já enviadas: um toque
 * em "← Voltar", em "Cancelar" ou num item do menu descartava a ficha inteira,
 * sem aviso nenhum. É o erro mais caro do painel — o trabalho some e a pessoa
 * só descobre ao voltar.
 *
 * Duas saídas, dois mecanismos:
 * - navegação dentro do painel: `onBeforeRouteLeave` com o diálogo do próprio
 *   painel ([[useConfirm]]), que diz o que se perde;
 * - fechar a aba, recarregar, sair do app instalado: `beforeunload`. O
 *   navegador não deixa customizar esse texto — é o aviso genérico dele, e é o
 *   único que existe nesse momento.
 *
 * `isDirty` é função, não ref: quem chama compara com o que carregou, e só ele
 * sabe o que conta como "mudou". `release()` existe para o salvar: depois de
 * gravar, a própria tela navega para a lista, e perguntar ali seria absurdo.
 */
export function useUnsavedGuard(isDirty: () => boolean) {
  const { askConfirm } = useConfirm();
  let liberado = false;

  onBeforeRouteLeave(async () => {
    if (liberado || !isDirty()) return true;
    return await askConfirm({
      title: "Sair sem salvar?",
      description: "As alterações feitas nesta tela serão perdidas.",
      confirmLabel: "Sair sem salvar",
      cancelLabel: "Continuar editando",
      danger: true,
    });
  });

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (liberado || !isDirty()) return;
    e.preventDefault();
    // Chrome antigo e Safari ainda exigem o returnValue preenchido.
    e.returnValue = "";
  }
  onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
  onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));

  return {
    release: () => {
      liberado = true;
    },
  };
}
