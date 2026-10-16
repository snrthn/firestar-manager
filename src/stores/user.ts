import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin, logout as apiLogout, getProfile, getMenus } from '@/api/auth'
import { routeNameFor, flattenMenus } from '@/utils/menuRoute'
import { useTabsStore } from '@/stores/tabs'
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

    // 页签清场（RuoYi logout 语义 delAllViews + resetAffix，2026-10-16 收口）：
    // 此前登出只清用户态，页签残留——换账号再登会带着上一账号打开的页面，
    // 其中越权页面的页签点击即 403/404，且上一账号的查询条件/表单草稿
    // 也一并「过户」给新账号，属于数据串号风险。
    // closeAll 保留工作台固定页签并把激活态归位 /dashboard，下次登录即干净起点。
    // keep-alive 缓存无需手动清：cachedRouteNames 由 menus 计算，menus 已清空，
    // include 变空时 Vue 自动清空缓存池（AdminLayout <keep-alive :include>）。
    // 本函数是主动退出与 401 过期守卫（router/index.ts）的共同出口，一处收口全覆盖。
    useTabsStore().closeAll()
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
