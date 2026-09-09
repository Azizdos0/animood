import type { DiscussionPost, PostNode } from "./types";

export function buildPostTree(posts: DiscussionPost[]): PostNode[] {
  const byId = new Map<string, PostNode>();
  for (const p of posts) byId.set(p.id, { ...p, children: [] });
  const roots: PostNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parentPostId;
    const parent = parentId ? byId.get(parentId) : undefined;
    // root if no parent, parent missing (orphan), or self-reference
    if (!parent || parent.id === node.id) roots.push(node);
    else parent.children.push(node);
  }
  const byCreated = (a: PostNode, b: PostNode) => a.createdAt.localeCompare(b.createdAt);
  // Guard against cycles: only sort/recurse over nodes reachable from roots once.
  const seen = new Set<string>();
  const sortRec = (nodes: PostNode[]) => {
    nodes.sort(byCreated);
    for (const n of nodes) {
      if (seen.has(n.id)) { n.children = []; continue; }
      seen.add(n.id);
      sortRec(n.children);
    }
  };
  sortRec(roots);
  return roots;
}
