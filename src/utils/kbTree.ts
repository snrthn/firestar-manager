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

/**
 * @deprecated 旧移动契约的兜底函数（§21 起前端不再计算排序号，顺序一律由服务端
 *    按相对位置整组重排）。保留仅为兼容与既有单测，新代码禁止调用。
 */
export function nextSortNo(nodes: readonly KbNode[], parentId: number): number {
  let max = 0
  for (const n of nodes) {
    if (n.parentId === parentId && (n.sortNo ?? 0) > max) max = n.sortNo ?? 0
  }
  return max + 10
}

/**
 * 同父「同级组」：按 sortNo、id 升序，<b>含自身</b>；目录(FOLDER)与文档(DOC)混排、不按类型分组。
 * 口径与后端 KbDocService.nodes() / KbTreeRules.resolveSiblingOrder 逐项一致，
 * 是根目录混排拖拽能得到确定顺序的前提。
 */
export function getKbSiblingOrder(nodes: readonly KbNode[], id: number): KbNode[] {
  const self = findKbNode(nodes, id)
  if (!self) return []
  return nodes
    .filter((n) => n.parentId === self.parentId)
    .sort((a, b) => (a.sortNo ?? 0) - (b.sortNo ?? 0) || a.id - b.id)
}

/**
 * 上移 / 下移的锚点兄弟：up → 前一个（发 BEFORE），down → 后一个（发 AFTER）。
 * 首尾边界返回 null，前端据此禁用菜单项；节点不存在也返回 null。
 */
export function getKbMoveNeighbor(
  nodes: readonly KbNode[],
  id: number,
  direction: 'up' | 'down',
): KbNode | null {
  const group = getKbSiblingOrder(nodes, id)
  const index = group.findIndex((n) => n.id === id)
  if (index < 0) return null
  return (direction === 'up' ? group[index - 1] : group[index + 1]) ?? null
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

/** 「移动到」弹窗的候选目录：id=0 为虚拟根目录，其余均为 FOLDER */
export interface KbMoveTarget {
  id: number
  label: string
  children: KbMoveTarget[]
  /** 是否就是待移动节点当前所在位置（选中它无需发请求） */
  isCurrentParent: boolean
}

/**
 * 构造「移动到」弹窗的目标目录树（纯函数，与后端 move 校验同口径）。
 *
 * ① 首项固定为虚拟根「根目录」id=0，后端 parentId=0 合法，永远可选；
 * ② 排除 movingId 自身及整棵后代子树 —— 移进自己/后代必成环，不展示比禁用更直观；
 * ③ 只保留 FOLDER：`KbDocService.move` 明确要求目标父节点必须是文件夹；
 * ④ 父被排除 / 被 ACL 过滤 / 祖先链成脏环时挂根，不丢可选目录（与 buildKbTree 同口径）；
 * ⑤ 同级按 sortNo、id 升序，标出当前父节点供 UI 禁用「无变化的提交」。
 */
export function buildKbMoveTargets(
  nodes: readonly KbNode[],
  movingId: number,
): KbMoveTarget[] {
  const source = new Map<number, KbNode>()
  for (const n of nodes) source.set(n.id, n)
  const currentParentId = source.get(movingId)?.parentId ?? 0

  // 迭代求后代闭包：脏数据存在环时也能收敛（seen 语义由 excluded 承担）
  const excluded = new Set<number>([movingId])
  let changed = true
  while (changed) {
    changed = false
    for (const n of nodes) {
      if (!excluded.has(n.id) && excluded.has(n.parentId)) {
        excluded.add(n.id)
        changed = true
      }
    }
  }

  const folders = nodes.filter((n) => n.nodeType === 'FOLDER' && !excluded.has(n.id))
  const targets = new Map<number, KbMoveTarget>()
  for (const f of folders) {
    targets.set(f.id, {
      id: f.id,
      label: f.title,
      children: [],
      isCurrentParent: f.id === currentParentId,
    })
  }

  const roots: KbMoveTarget[] = []
  for (const f of folders) {
    const self = targets.get(f.id)!
    const parent = f.parentId === 0 ? undefined : targets.get(f.parentId)
    const usable = parent && parent !== self && !inCycle(f, source)
    if (usable) parent!.children.push(self)
    else roots.push(self)
  }

  const sortRec = (list: KbMoveTarget[]) => {
    list.sort((a, b) =>
      (source.get(a.id)?.sortNo ?? 0) - (source.get(b.id)?.sortNo ?? 0) || a.id - b.id,
    )
    for (const item of list) sortRec(item.children)
  }
  sortRec(roots)

  return [{
    id: 0,
    label: '根目录',
    children: roots,
    isCurrentParent: currentParentId === 0,
  }]
}

/** 在候选目录树里按 id 找目标（弹窗「目标位置」回显用） */
export function findKbMoveTarget(
  targets: readonly KbMoveTarget[],
  id: number,
): KbMoveTarget | undefined {
  for (const t of targets) {
    if (t.id === id) return t
    const hit = findKbMoveTarget(t.children, id)
    if (hit) return hit
  }
  return undefined
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
