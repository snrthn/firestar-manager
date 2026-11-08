import { describe, it, expect } from 'vitest'
import { flattenMenus, routeNameFor } from './menuRoute'

// MenuVO 字段繁多，这里只构造测试所需最小形状
const mk = (over: Record<string, unknown>): any => ({
  id: 1,
  menuName: 'x',
  menuType: 'MENU',
  routePath: '/x',
  permCode: '',
  visible: 1,
  isCache: 0,
  children: [],
  ...over,
})

describe('menuRoute 工具（P1 RBAC）', () => {
  it('flattenMenus 拍平多层嵌套菜单树', () => {
    const tree = [
      mk({ id: 1, children: [mk({ id: 2, children: [mk({ id: 3 })] })] }),
      mk({ id: 4 }),
    ]
    const flat = flattenMenus(tree)
    expect(flat.map((m) => m.id)).toEqual([1, 2, 3, 4])
  })

  it('routeNameFor 把 path 转成合法路由名（去斜杠/特殊字符）', () => {
    expect(routeNameFor('/system/user')).toBe('dyn_system_user')
    expect(routeNameFor('/project')).toBe('dyn_project')
    expect(routeNameFor('/write-off/ledger')).toBe('dyn_write_off_ledger')
  })
})
