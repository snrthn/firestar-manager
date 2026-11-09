/**
 * 知识库树形能力层（纯函数，无 DOM / 无请求依赖）
 *
 * 对应 V208 方案 A：文档与文件夹共用 sys_kb_doc 一行，用 parent_id + path 表达树。
 * 后端节点接口（/ai/kb/nodes）返回平铺骨架，前端在这里建树、过滤、防环；
 * 后端 Service 复用 MenuServiceImpl.validateNoCycle 做同一份防环判定，两边口径一致。
 *
 * 设计要点：
 *   ① 父节点被 ACL 过滤掉时子节点挂根，不让节点凭空消失（飞书官方会返回
 *      「items 为空但 hasMore=true」，前端不能把空当「没有子节点」）；
 *   ② 数据里可能存在历史脏环，建树时检测并挂根，避免死循环 / 节点全丢；
 *   ③ 搜索保留父链，命中节点的子树原样保留，符合飞书 / VS Code 的树过滤直觉。
 */
import type { KbNode } from '@/api/kb'

/** 节点数超过这个量级，后端置 lazyRequired，前端 el-tree 切 lazy + load */
export const KB_LAZY_THRESHOLD = 2000
/** 按父节点分页时的单页上限（对齐飞书 wiki node list 的 page_size 上限） */
export const KB_MAX_PAGE_SIZE = 50

export interface KbTreeNode extends KbNode {
  children: KbTreeNode[]
  /** el-tree props.isLeaf：无子节点的文档才是叶子，文件夹恒可展开 */
  isLeaf: boolean
}

function bySort(a: KbTreeNode, b: KbTreeNode): number {
  return (a.sortNo ?? 0) - (b.sortNo ?? 0) || a.id - b.id
}

/** 沿 parentId 链向上走，判断该节点是否处在「以自己为根的环」里 */
function inCycle(start: KbNode, map: Map<number, KbNode>): boolean {
  const seen = new Set<number>()
  let cursor: KbNode | undefined = map.get(start.parentId)
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === start.id) return true
    seen.add(cursor.id)
    cursor = cursor.parentId === 0 ? undefined : map.get(cursor.parentId)
  }
  return false
}

/** 平铺骨架 → el-tree 树；同级按 sortNo、id 升序 */
export function buildKbTree(nodes: readonly KbNode[]): KbTreeNode[] {
  const source = new Map<number, KbNode>()
  for (const n of nodes) source.set(n.id, n)

  const map = new Map<number, KbTreeNode>()
  for (const n of nodes) {
    map.set(n.id, { ...n, children: [], isLeaf: n.nodeType === 'DOC' && !n.hasChild })
  }

  const roots: KbTreeNode[] = []
  for (const node of map.values()) {
    const parent = node.parentId === 0 ? undefined : map.get(node.parentId)
    const usable = parent && parent.id !== node.id && !inCycle(node, source)
    if (usable) parent!.children.push(node)
    else roots.push(node)
  }

  const sortRec = (list: KbTreeNode[]) => {
    list.sort(bySort)
    for (const item of list) sortRec(item.children)
  }
  sortRec(roots)
  return roots
}

/** 树 → 平铺（拖拽、批量操作后回写用） */
export function flattenKbTree(tree: readonly KbTreeNode[]): KbTreeNode[] {
  const out: KbTreeNode[] = []
  const walk = (list: readonly KbTreeNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(tree)
  return out
}

export function findKbNode(nodes: readonly KbNode[], id: number): KbNode | undefined {
  return nodes.find((n) => n.id === id)
}

/** 同级下一个排序号，留 10 的间隙便于后续插入 */
export function nextSortNo(nodes: readonly KbNode[], parentId: number): number {
  let max = 0
  for (const n of nodes) {
    if (n.parentId === parentId && (n.sortNo ?? 0) > max) max = n.sortNo ?? 0
  }
  return max + 10
}

/** 物化路径 /1/3/7/；父节点 path 缺失时按根处理 */
export function computeKbPath(parent: KbNode | null | undefined, id: number): string {
  const base = parent?.path || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${id}/`
}

/**
 * 能否把 id 挂到 targetParentId 下。
 * 拒绝三种情况：移到自己、目标不存在、移进自己的后代子树（成环）。
 */
export function canMoveKbNode(
  nodes: readonly KbNode[],
  id: number,
  targetParentId: number,
): boolean {
  if (targetParentId === id) return false
  if (targetParentId === 0) return true
  const map = new Map<number, KbNode>()
  for (const n of nodes) map.set(n.id, n)
  const seen = new Set<number>()
  let cursor: KbNode | undefined = map.get(targetParentId)
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === id) return false
    seen.add(cursor.id)
    cursor = cursor.parentId === 0 ? undefined : map.get(cursor.parentId)
  }
  // seen 非空 = 目标节点确实存在且整条祖先链里没有 id；目标不存在时 while 一次未进
  return seen.size > 0
}

/** 面包屑：从根到该节点（含自身）的标题链 */
export function getKbAncestorTitles(nodes: readonly KbNode[], id: number): string[] {
  const map = new Map<number, KbNode>()
  for (const n of nodes) map.set(n.id, n)
  const out: string[] = []
  const seen = new Set<number>()
  let cursor: KbNode | undefined = map.get(id)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    out.unshift(cursor.title)
    cursor = cursor.parentId === 0 ? undefined : map.get(cursor.parentId)
  }
  return out
}

/** 树内搜索：命中节点保留整棵子树，未命中但子孙命中时保留父链 */
export function filterKbTree(tree: readonly KbTreeNode[], keyword: string): KbTreeNode[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return tree as KbTreeNode[]
  const walk = (list: readonly KbTreeNode[]): KbTreeNode[] => {
    const out: KbTreeNode[] = []
    for (const n of list) {
      const selfHit = n.title.toLowerCase().includes(q)
      const kids = walk(n.children)
      if (selfHit || kids.length) {
        out.push({ ...n, children: selfHit ? n.children : kids })
      }
    }
    return out
  }
  return walk(tree)
}

/** 是否该从「一次全量骨架」退化为「按父节点懒加载」 */
export function isLazyRequired(nodeCount: number): boolean {
  return nodeCount > KB_LAZY_THRESHOLD
}
