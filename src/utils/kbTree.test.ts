import { describe, it, expect } from 'vitest'
import type { KbNode, KbNodeType } from '@/api/kb'
import {
  KB_LAZY_THRESHOLD,
  KB_MAX_PAGE_SIZE,
  buildKbTree,
  canMoveKbNode,
  computeKbPath,
  filterKbTree,
  findKbNode,
  flattenKbTree,
  getKbAncestorTitles,
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

describe('加载阈值契约', () => {
  it('超过阈值才切懒加载，单页上限对齐飞书 50', () => {
    expect(isLazyRequired(KB_LAZY_THRESHOLD)).toBe(false)
    expect(isLazyRequired(KB_LAZY_THRESHOLD + 1)).toBe(true)
    expect(KB_MAX_PAGE_SIZE).toBe(50)
  })
})
