/** Operações de árvore compartilhadas pela Árvore de Falhas e pelo RCA Apollo.
 *  Puras e imutáveis — o editor só as chama e passa o resultado adiante. */

export type TreeNode<T> = T & { id: string; children: Array<TreeNode<T>> };

type AnyNode = { id: string; children: AnyNode[] };

export function updateNode<T extends AnyNode>(
  nodes: T[],
  id: string,
  fn: (node: T) => T,
): T[] {
  return nodes.map((node) => {
    if (node.id === id) return fn(node);
    return { ...node, children: updateNode(node.children as T[], id, fn) } as T;
  });
}

export function removeNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  return nodes
    .filter((node) => node.id !== id)
    .map(
      (node) =>
        ({ ...node, children: removeNode(node.children as T[], id) }) as T,
    );
}

/** Insere `node` logo DEPOIS de `afterId`, no mesmo nível. */
export function addSibling<T extends AnyNode>(
  nodes: T[],
  afterId: string,
  node: T,
): T[] {
  const out: T[] = [];
  for (const current of nodes) {
    out.push({
      ...current,
      children: addSibling(current.children as T[], afterId, node),
    } as T);
    if (current.id === afterId) out.push(node);
  }
  return out;
}

/** Torna o nó filho do IRMÃO ANTERIOR. Sem irmão anterior, não há para onde indentar. */
export function indentNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  const index = nodes.findIndex((n) => n.id === id);
  if (index > 0) {
    const previous = nodes[index - 1];
    const moving = nodes[index];
    const next = [...nodes];
    next[index - 1] = {
      ...previous,
      children: [...previous.children, moving],
    } as T;
    next.splice(index, 1);
    return next;
  }
  if (index === 0) return nodes; // primeiro do nível: nada a fazer
  return nodes.map(
    (n) => ({ ...n, children: indentNode(n.children as T[], id) }) as T,
  );
}

/** Sobe o nó para o nível do pai, logo DEPOIS dele. Um nó de raiz não tem para onde subir. */
export function outdentNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  // Um filho direto de algum `nodes[i]` sobe para este nível.
  const out: T[] = [];
  let moved = false;
  for (const node of nodes) {
    const childIndex = node.children.findIndex((c) => c.id === id);
    if (childIndex >= 0) {
      const child = node.children[childIndex] as T;
      out.push({
        ...node,
        children: node.children.filter((c) => c.id !== id),
      } as T);
      out.push(child);
      moved = true;
      continue;
    }
    out.push({ ...node, children: outdentNode(node.children as T[], id) } as T);
  }
  // `moved` existe só para deixar explícito que a raiz não sobe: se `id` estava na raiz,
  // nenhum ramo acima o encontrou como filho e a árvore volta inalterada.
  void moved;
  return out;
}
