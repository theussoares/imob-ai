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
  // Quem já respondeu "Sair sem salvar" não é perguntado de novo na MESMA
  // saída. Middleware que redireciona (o `?tenant=` fora de produção, o login
  // com a sessão vencida) reinicia a navegação, e o guard roda outra vez: o
  // diálogo reabria, e o `close` atrasado do primeiro respondia `false` ao
  // segundo — a pessoa clicava em sair e ficava. Não é o `liberado`, que é
  // para sempre: se a saída falhar, a proteção volta (ver o `afterEach`).
  let saindo = false;

  onBeforeRouteLeave(async () => {
    if (liberado || saindo || !isDirty()) return true;
    saindo = await askConfirm({
      title: "Sair sem salvar?",
      description: "As alterações feitas nesta tela serão perdidas.",
      confirmLabel: "Sair sem salvar",
      cancelLabel: "Continuar editando",
      danger: true,
    });
    return saindo;
  });

  // O redirect não passa por aqui (o vue-router só chama o `afterEach` da
  // navegação final); passa a navegação abortada ou cancelada, que deixa a
  // pessoa nesta tela com as alterações ainda não salvas.
  const pararDeOuvir = useRouter().afterEach((_to, _from, falha) => {
    if (falha) saindo = false;
  });
  onBeforeUnmount(pararDeOuvir);

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
