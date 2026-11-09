import { describe, it, expect } from 'vitest'
import type { KbNode, KbNodeType } from '@/api/kb'
import {
  KB_LAZY_THRESHOLD,
  KB_MAX_PAGE_SIZE,
  buildKbMoveTargets,
  buildKbTree,
  canMoveKbNode,
  computeKbPath,
  filterKbTree,
  findKbMoveTarget,
  findKbNode,
  flattenKbTree,
  getKbAncestorTitles,
  getKbMoveNeighbor,
  getKbSiblingOrder,
  isLazyRequired,
  nextSortNo,
} from './kbTree'

function n(
  id: number,
  parentId: number,
  title: string,
  opt: { nodeType?: KbNodeType; sortNo?: number; hasChild?: boolean; path?: string } = {},
): KbNode {
  return {
    id,
    parentId,
    title,
    nodeType: opt.nodeType ?? 'DOC',
    sortNo: opt.sortNo ?? id * 10,
    path: opt.path ?? '/',
    status: 'DRAFT',
    version: 1,
    hasChild: opt.hasChild ?? false,
  }
}

/** 1 财务制度(FOLDER) / 3 报销制度(FOLDER, 挂在 1 下) / 7 差旅报销(DOC, 挂在 3 下) / 9 发票规范(DOC, 根) */
const FIXTURE: KbNode[] = [
  n(1, 0, '财务制度', { nodeType: 'FOLDER', hasChild: true, sortNo: 10, path: '/1/' }),
  n(3, 1, '报销制度', { nodeType: 'FOLDER', hasChild: true, sortNo: 10, path: '/1/3/' }),
  n(7, 3, '差旅费报销制度', { sortNo: 10, path: '/1/3/7/' }),
  n(9, 0, '发票规范', { sortNo: 20, path: '/9/' }),
]

describe('buildKbTree', () => {
  it('按 parent_id 建层级，同级按 sortNo 再按 id 升序', () => {
    const tree = buildKbTree([
      FIXTURE[3],
      n(11, 0, '排序靠后', { sortNo: 30 }),
      n(10, 0, '排序靠前', { sortNo: 5 }),
      FIXTURE[0],
      FIXTURE[2],
      FIXTURE[1],
    ])
    expect(tree.map((x) => x.title)).toEqual(['排序靠前', '财务制度', '发票规范', '排序靠后'])
    expect(tree[1].children[0].children[0].title).toBe('差旅费报销制度')
  })

  /** 对应「目录下再建目录」：层级不设上限，四级 FOLDER 嵌套仍能建树、出面包屑、防环 */
  it('目录下可再建目录：四级 FOLDER 嵌套，面包屑与防环同步生效', () => {
    const deep = [
      n(1, 0, 'L1', { nodeType: 'FOLDER', hasChild: true, path: '/1/' }),
      n(2, 1, 'L2', { nodeType: 'FOLDER', hasChild: true, path: '/1/2/' }),
      n(3, 2, 'L3', { nodeType: 'FOLDER', hasChild: true, path: '/1/2/3/' }),
      n(4, 3, 'L4', { nodeType: 'FOLDER', hasChild: true, path: '/1/2/3/4/' }),
      n(5, 4, 'DOC-L5', { path: '/1/2/3/4/5/' }),
    ]
    const tree = buildKbTree(deep)
    expect(tree).toHaveLength(1)
    let cursor = tree[0]
    for (const title of ['L2', 'L3', 'L4', 'DOC-L5']) {
      expect(cursor.children).toHaveLength(1)
      cursor = cursor.children[0]
      expect(cursor.title).toBe(title)
    }
    expect(getKbAncestorTitles(deep, 5)).toEqual(['L1', 'L2', 'L3', 'L4', 'DOC-L5'])
    // 无限嵌套下防环仍生效：祖先不能移进自己的后代
    expect(canMoveKbNode(deep, 1, 4)).toBe(false)
    expect(canMoveKbNode(deep, 4, 1)).toBe(true)
  })

  it('isLeaf：文件夹恒可展开；文档有子节点也可展开', () => {
    const tree = buildKbTree(FIXTURE)
    expect(tree[0].isLeaf).toBe(false)
    expect(tree[0].children[0].isLeaf).toBe(false)
    expect(tree[0].children[0].children[0].isLeaf).toBe(true)
    expect(tree[1].isLeaf).toBe(true)
  })

  it('父节点被 ACL 过滤掉时子节点挂根，不丢节点', () => {
    const tree = buildKbTree([n(7, 3, '孤儿文档')])
    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('孤儿文档')
  })

  it('自环 parentId === id 不会让节点消失或死循环', () => {
    const tree = buildKbTree([n(5, 5, '自环节点')])
    expect(tree).toHaveLength(1)
  })

  it('多节点环 A→B→C→A 全部挂根，节点数守恒', () => {
    const tree = buildKbTree([n(1, 2, 'A'), n(2, 3, 'B'), n(3, 1, 'C')])
    expect(tree).toHaveLength(3)
  })

  it('空数组返回空树', () => {
    expect(buildKbTree([])).toEqual([])
  })
})

describe('flatten / find', () => {
  it('flattenKbTree 深度优先且数量守恒', () => {
    const flat = flattenKbTree(buildKbTree(FIXTURE))
    expect(flat).toHaveLength(4)
    expect(flat.map((x) => x.id)).toEqual([1, 3, 7, 9])
  })

  it('findKbNode 按 id 命中', () => {
    expect(findKbNode(FIXTURE, 3)?.title).toBe('报销制度')
    expect(findKbNode(FIXTURE, 999)).toBeUndefined()
  })
})

describe('排序与路径', () => {
  it('nextSortNo 取同父最大值 +10，空父返回 10', () => {
    expect(nextSortNo(FIXTURE, 0)).toBe(30)
    expect(nextSortNo(FIXTURE, 3)).toBe(20)
    expect(nextSortNo(FIXTURE, 999)).toBe(10)
  })

  it('computeKbPath 拼接物化路径，父 path 缺尾斜杠时补齐', () => {
    expect(computeKbPath(null, 7)).toBe('/7/')
    expect(computeKbPath({ ...FIXTURE[1] }, 7)).toBe('/1/3/7/')
    expect(computeKbPath({ ...FIXTURE[0], path: '/1' }, 3)).toBe('/1/3/')
  })
})

describe('canMoveKbNode 防环', () => {
  it('不能移到自己', () => {
    expect(canMoveKbNode(FIXTURE, 1, 1)).toBe(false)
  })

  it('不能移进自己的后代子树', () => {
    expect(canMoveKbNode(FIXTURE, 1, 3)).toBe(false)
    expect(canMoveKbNode(FIXTURE, 1, 7)).toBe(false)
  })

  it('可以移到兄弟节点或根', () => {
    expect(canMoveKbNode(FIXTURE, 7, 9)).toBe(true)
    expect(canMoveKbNode(FIXTURE, 7, 0)).toBe(true)
    expect(canMoveKbNode(FIXTURE, 9, 1)).toBe(true)
  })

  it('目标节点不存在时拒绝', () => {
    expect(canMoveKbNode(FIXTURE, 7, 999)).toBe(false)
  })

  it('祖先链本身有脏环也不会死循环', () => {
    const dirty = [n(1, 2, 'A'), n(2, 1, 'B'), n(3, 0, 'C')]
    expect(canMoveKbNode(dirty, 3, 1)).toBe(true)
  })
})

/** 11 根目录靠前(FOLDER,根) / 1 财务制度(FOLDER,根) / 3 报销制度(FOLDER,挂在 1 下) / 7 文档(挂在 3 下) / 9 文档(根) */
const MOVE_FIXTURE: KbNode[] = [
  n(1, 0, '财务制度', { nodeType: 'FOLDER', hasChild: true, sortNo: 20, path: '/1/' }),
  n(3, 1, '报销制度', { nodeType: 'FOLDER', hasChild: true, sortNo: 10, path: '/1/3/' }),
  n(7, 3, '差旅费报销制度', { sortNo: 10, path: '/1/3/7/' }),
  n(9, 0, '发票规范', { sortNo: 20, path: '/9/' }),
  n(11, 0, '根目录靠前', { nodeType: 'FOLDER', sortNo: 5, path: '/11/' }),
]

describe('buildKbMoveTargets 移动候选目录', () => {
  it('恒以虚拟「根目录」为首项，候选只含 FOLDER 且同级按 sortNo 排序', () => {
    const t = buildKbMoveTargets(MOVE_FIXTURE, 7)
    expect(t).toHaveLength(1)
    expect(t[0].id).toBe(0)
    expect(t[0].label).toBe('根目录')
    // 11(sortNo 5) 排在 1(sortNo 20) 前；9 是 DOC，不进候选
    expect(t[0].children.map((x) => x.label)).toEqual(['根目录靠前', '财务制度'])
    expect(t[0].children[1].children.map((x) => x.label)).toEqual(['报销制度'])
    expect(findKbMoveTarget(t, 9)).toBeUndefined()
  })

  it('移动文件夹时排除自身与整棵后代子树（防环前移到 UI 层）', () => {
    const t = buildKbMoveTargets(MOVE_FIXTURE, 1)
    expect(t[0].children.map((x) => x.label)).toEqual(['根目录靠前'])
    expect(findKbMoveTarget(t, 1)).toBeUndefined()
    expect(findKbMoveTarget(t, 3)).toBeUndefined() // 子文件夹
    expect(findKbMoveTarget(t, 7)).toBeUndefined() // 孙文档
  })

  it('移动文档时仍可选父级与兄弟目录，根恒在', () => {
    const t = buildKbMoveTargets(MOVE_FIXTURE, 7)
    expect(findKbMoveTarget(t, 7)).toBeUndefined()
    expect(findKbMoveTarget(t, 3)).toBeTruthy()
    expect(findKbMoveTarget(t, 11)).toBeTruthy()
    expect(findKbMoveTarget(t, 0)?.label).toBe('根目录')
  })

  it('isCurrentParent 只标当前父节点；根层节点标在虚拟根上', () => {
    const t = buildKbMoveTargets(MOVE_FIXTURE, 7)
    expect(t[0].isCurrentParent).toBe(false)
    expect(findKbMoveTarget(t, 3)?.isCurrentParent).toBe(true)
    expect(findKbMoveTarget(t, 11)?.isCurrentParent).toBe(false)
    expect(buildKbMoveTargets(MOVE_FIXTURE, 9)[0].isCurrentParent).toBe(true)
  })

  it('父目录被 ACL 过滤掉时子目录挂根，不丢可选位置', () => {
    const partial = [n(3, 1, '报销制度', { nodeType: 'FOLDER', path: '/1/3/' })]
    expect(buildKbMoveTargets(partial, 7)[0].children.map((x) => x.label)).toEqual(['报销制度'])
  })

  it('脏环数据不丢目录、不构成环、不死循环', () => {
    const dirty = [
      n(1, 2, 'A', { nodeType: 'FOLDER' }),
      n(2, 1, 'B', { nodeType: 'FOLDER' }),
      n(3, 0, 'C'),
    ]
    const t = buildKbMoveTargets(dirty, 3)
    expect(t[0].children).toHaveLength(2)
    expect(t[0].children.every((x) => x.children.length === 0)).toBe(true)
  })

  it('待移动 id 不存在时仍返回根目录 + 全部文件夹（不抛错）', () => {
    const t = buildKbMoveTargets(MOVE_FIXTURE, 999)
    expect(t[0].isCurrentParent).toBe(true)
    expect(t[0].children).toHaveLength(2)
    expect(findKbMoveTarget(t, 3)).toBeTruthy()
  })

  it('findKbMoveTarget 找不到时返回 undefined', () => {
    expect(findKbMoveTarget(buildKbMoveTargets(MOVE_FIXTURE, 7), 999)).toBeUndefined()
  })
})

describe('面包屑与搜索', () => {
  it('getKbAncestorTitles 返回根到自身的链', () => {
    expect(getKbAncestorTitles(FIXTURE, 7)).toEqual(['财务制度', '报销制度', '差旅费报销制度'])
    expect(getKbAncestorTitles(FIXTURE, 999)).toEqual([])
  })

  it('filterKbTree 命中子孙时保留父链，命中节点保留整棵子树', () => {
    const tree = buildKbTree(FIXTURE)
    const hit = filterKbTree(tree, '差旅')
    expect(hit).toHaveLength(1)
    expect(hit[0].title).toBe('财务制度')
    expect(hit[0].children[0].title).toBe('报销制度')
    expect(hit[0].children[0].children[0].title).toBe('差旅费报销制度')

    const hitFolder = filterKbTree(tree, '报销制度')
    expect(hitFolder[0].children[0].children).toHaveLength(1)
  })

  it('空关键词返回原树引用，不复制', () => {
    const tree = buildKbTree(FIXTURE)
    expect(filterKbTree(tree, '  ')).toBe(tree)
  })

  it('无命中返回空树', () => {
    expect(filterKbTree(buildKbTree(FIXTURE), '不存在')).toEqual([])
  })
})

describe('同级组与上移 / 下移锚点（§21）', () => {
  it('根目录混排：FOLDER 与 DOC 不分组，按 sortNo 再按 id 升序', () => {
    // 根级：11(sort 5, FOLDER) / 1(sort 20, FOLDER) / 9(sort 20, DOC)
    expect(getKbSiblingOrder(MOVE_FIXTURE, 1).map((x) => x.id)).toEqual([11, 1, 9])
    expect(getKbSiblingOrder(MOVE_FIXTURE, 9).map((x) => x.id)).toEqual([11, 1, 9])
  })

  it('子目录内只取同父节点，不把孙节点混进来', () => {
    // 3 挂在 1 下；7 挂在 3 下，不属于 3 的同级组
    expect(getKbSiblingOrder(MOVE_FIXTURE, 3).map((x) => x.id)).toEqual([3])
  })

  it('up / down 返回相邻兄弟，混排时也能跨类型命中', () => {
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 1, 'up')?.id).toBe(11)
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 1, 'down')?.id).toBe(9)
    // 9 是 DOC，它的上一个兄弟 1 是 FOLDER
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 9, 'up')?.nodeType).toBe('FOLDER')
  })

  it('首尾边界返回 null，供菜单禁用上移 / 下移', () => {
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 11, 'up')).toBeNull()
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 9, 'down')).toBeNull()
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 3, 'up')).toBeNull() // 独子
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 3, 'down')).toBeNull()
  })

  it('相同 sortNo 按 id 稳定排序，不出现随机顺序', () => {
    const tie = [
      n(6, 0, 'B', { sortNo: 10 }),
      n(5, 0, 'A', { sortNo: 10 }),
      n(9, 0, 'C', { sortNo: 10 }),
    ]
    expect(getKbSiblingOrder(tie, 5).map((x) => x.id)).toEqual([5, 6, 9])
    expect(getKbMoveNeighbor(tie, 5, 'down')?.id).toBe(6)
  })

  it('节点不存在返回空组 / null，不抛错', () => {
    expect(getKbSiblingOrder(MOVE_FIXTURE, 999)).toEqual([])
    expect(getKbMoveNeighbor(MOVE_FIXTURE, 999, 'up')).toBeNull()
  })
})

describe('加载阈值契约', () => {
  it('超过阈值才切懒加载，单页上限对齐飞书 50', () => {
    expect(isLazyRequired(KB_LAZY_THRESHOLD)).toBe(false)
    expect(isLazyRequired(KB_LAZY_THRESHOLD + 1)).toBe(true)
    expect(KB_MAX_PAGE_SIZE).toBe(50)
  })
})
