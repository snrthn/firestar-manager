import type { MenuVO } from '@/types/auth'

/**
 * 菜单路由共享工具（router 动态注册 + store keep-alive 集合共用，单处维护防漂移）：
 * - routeNameFor：路由 path → 唯一路由名（与 router/index.ts syncDynamicRoutes 的
 *   addRoute name、AdminLayout keep-alive include 用的组件名三者同源）
 * - flattenMenus：拍平菜单树
 */

/** path（如 /system/user）→ 路由名（如 dyn_system_user）。静态段+动态注册共用同一规则 */
export function routeNameFor(path: string): string {
  return `dyn_${path.replace(/^\//, '').replace(/[^\w]/g, '_')}`
}

/** 拍平菜单树，收集所有节点（调用方按需再过滤 menuType/routePath） */
export function flattenMenus(menus: MenuVO[], out: MenuVO[] = []): MenuVO[] {
  for (const m of menus) {
    out.push(m)
    if (m.children?.length) flattenMenus(m.children, out)
  }
  return out
}
