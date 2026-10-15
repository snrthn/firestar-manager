import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin, logout as apiLogout, getProfile, getMenus } from '@/api/auth'
import { routeNameFor, flattenMenus } from '@/utils/menuRoute'
import type { LoginRequest, ProfileVO, MenuVO } from '@/types/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref<ProfileVO | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  // menus = 可访问路由集（后端 /auth/menus：授权 ∧ ENABLED，visible 不参与），
  // 动态路由同步（router syncDynamicRoutes）消费这份全集。
  const menus = ref<MenuVO[]>([])

  /**
   * 侧栏展示集：visible=1 且非 BUTTON（按钮是权限节点，不占侧栏位置）。
   * 三维度正交（2026-10-15 语义定稿）：访问控制 = 授权 ∧ 启用（路由集口径）；
   * visible 只管侧栏展不展示——隐藏菜单 URL 仍可达；父节点隐藏则整子树不上侧栏
   * （父都不展示了，子无处挂），但路由可达性不受影响。
   */
  const visibleMenus = computed(() => filterVisible(menus.value))

  function filterVisible(nodes: MenuVO[]): MenuVO[] {
    const out: MenuVO[] = []
    for (const n of nodes) {
      if (n.visible !== 1 || n.menuType === 'BUTTON') continue
      out.push(n.children?.length ? { ...n, children: filterVisible(n.children) } : n)
    }
    return out
  }

  /**
   * keep-alive 缓存路由名集合：isCache=1 的 MENU（目录/按钮/外链无页面可缓存）。
   * name 与动态路由注册名同规则（routeNameFor）——resolveView 包装组件的 name
   * 也是它，AdminLayout <keep-alive :include> 靠这三者同源才能命中。
   */
  const cachedRouteNames = computed(() =>
    flattenMenus(menus.value)
      .filter((m) => m.menuType === 'MENU' && m.isCache === 1 && m.routePath)
      .map((m) => routeNameFor(m.routePath)),
  )

  async function login(data: LoginRequest) {
    const resp = await apiLogin(data)
    token.value = resp.token
    localStorage.setItem('token', resp.token)
    await fetchProfile()
    await fetchMenus()
    return resp
  }

  async function fetchProfile() {
    const p = await getProfile()
    userInfo.value = p
    roles.value = (p.roles || []).map((r) => r.roleCode)
    permissions.value = p.permissions || []
    return p
  }

  async function fetchMenus() {
    menus.value = await getMenus()
    return menus.value
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {
      // 即使后端登出失败（如 token 已失效），前端本地也清空
    }
    logoutLocal()
  }

  function logoutLocal() {
    token.value = ''
    userInfo.value = null
    roles.value = []
    permissions.value = []
    menus.value = []
    localStorage.removeItem('token')
  }

  function hasPermission(perm: string) {
    return permissions.value.includes(perm)
  }

  return {
    token,
    userInfo,
    roles,
    permissions,
    menus,
    visibleMenus,
    cachedRouteNames,
    login,
    fetchProfile,
    fetchMenus,
    logout,
    logoutLocal,
    hasPermission,
  }
})
