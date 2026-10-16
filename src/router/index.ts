import { createRouter, createWebHistory } from 'vue-router'
import { defineAsyncComponent, defineComponent, h } from 'vue'
import type { Component } from 'vue'
import { useUserStore } from '@/stores/user'
import { startRealtime, stopRealtime } from '@/utils/realtimeClient'
import { routeNameFor, flattenMenus } from '@/utils/menuRoute'
import type { MenuVO } from '@/types/auth'
import PagePlaceholder from '@/components/PagePlaceholder.vue'

// 页面文件按后端 sys_menu.component 约定的相对路径存放（若依风格）：
// 视图根目录为 src/views，component 值即其下相对路径
// （如 system/user → src/views/system/user.vue）。
// 构建期 glob 收拢全部视图，运行时按 component 字符串解析——
// 好处：菜单管理页改 component 即改落地页，路由表不用跟着动；
// 视图文件缺失时兜底 PagePlaceholder，不至于白屏。
const viewModules = import.meta.glob('../views/**/*.vue') as Record<
  string,
  () => Promise<{ default: Component }>
>

// 视图解析：glob 收拢全部视图，运行时按 sys_menu.component 字符串查找；
// 好处：菜单管理页改 component 即改落地页，路由表不用跟着动。
// 找到 → 包一层 defineComponent 挂 name（keep-alive include 匹配组件名，见下方注释）；
// 缺失 → 兜底 PagePlaceholder，不至于白屏。
//
// ⚠️ 兜底分支必须把菜单上下文（title/path/perm）传给 PagePlaceholder：
// 2026-10-16 虎哥报障「新菜单占位页显示 undefined · 页面建设中 且无路由/权限标签」，
// 根因就是兜底分支裸挂组件、props 全空。旧的占位页（如 approval/list.vue）是
// 视图文件显式调用 <PagePlaceholder title=... path=... perm=...>，所以显示完整——
// 同一个组件、两条进入路径，只有兜底这条漏了 props，属于实现遗漏而非风格不统一。
const resolveView = (
  component: string,
  name: string,
  fallback?: { title: string; path?: string; perm?: string },
): Component => {
  const loader = viewModules[`../views/${component}.vue`]
  if (!loader) {
    const fb = fallback ?? { title: name }
    return defineComponent({
      name,
      setup: () => () => h(PagePlaceholder, fb),
    })
  }
  const inner = defineAsyncComponent(loader)
  // keep-alive 的 include 按「组件 name」匹配（不是路由名也不是 path），而 SFC
  // 默认没有 name——包一层 defineComponent 显式挂名，name 与路由名同规则
  // （routeNameFor，AdminLayout cachedRouteNames 同源才能命中）。
  // 内层异步组件引用稳定；keep-alive 缓存的是本包装层实例，切回页面即恢复状态。
  return defineComponent({ name, setup: () => () => h(inner) })
}

// 内置常驻路由（不随授权动态注册）：
// - /profile：header 用户下拉入口，sys_menu 无对应行，任何登录态可用。
// 注：/system/dict-data 曾在此硬编码放行，2026-10-15 语义修正后删除——
// 隐藏菜单（visible=0）与普通菜单走同一条授权链路：/auth/menus 返回可访问集
// （授权 ∧ 启用，visible 不参与）→ 动态注册；侧栏另按 visible 过滤展示。
// 特殊放行反而制造了「隐藏菜单不受授权控制」的语义裂缝，与虎哥定的三维度
// 正交模型（授权/状态/可见性）冲突。
const builtinPages: Array<{ path: string; name: string; title: string; component: string }> = [
  { path: 'profile', name: 'profile', title: '个人中心', component: 'profile/index' },
]

// 布局壳路由名：同时作为 addRoute 动态挂载业务页的父级引用（须在 createRouter 前声明，避免 TDZ）
const ADMIN_LAYOUT_NAME = 'AdminLayout'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // 登录页：独立全屏，不套后台布局壳
      path: '/login',
      name: 'login',
      component: () => import('../views/login/Login.vue'),
      meta: { title: '登录' },
    },
    {
      // 后台布局壳：所有登录后页面挂在其下。
      // 业务子路由不静态注册——登录态就绪后按授权菜单树动态 addRoute
      // （见下方 syncDynamicRoutes），未授权路径落 403 兜底页。
      // name 同时作为 addRoute 的挂载父级引用。
      path: '/',
      name: ADMIN_LAYOUT_NAME,
      component: () => import('../layouts/AdminLayout.vue'),
      // 默认定向到工作台（/dashboard），菜单「工作台」route_path 与之对应
      redirect: '/dashboard',
      children: [
        ...builtinPages.map((p) => ({
          path: p.path,
          name: p.name,
          component: resolveView(p.component, p.name, { title: p.title, path: '/' + p.path }),
          meta: { title: p.title },
        })),
        {
          // 兜底：未授权 / 不存在的路径落此页（壳内渲染，header 退出登录可用）。
          // 静态段路由（含后注册的动态路由）匹配优先级高于通配段，不会误吞。
          path: ':pathMatch(.*)*',
          name: 'Forbidden',
          component: () => import('../views/error/403.vue'),
          meta: { title: '无访问权限' },
        },
      ],
    },
  ],
})

// ===== 动态路由（RuoYi / Ant Design Pro 模式：路由表 = 授权集的投影）=====
// 修复前：业务页全量静态注册 + 守卫不比对授权 → 侧栏隐藏只是后端数据层过滤，
// 敲 URL 照样开页（虎哥 2026-10-15 报障：角色关了某菜单，侧栏不渲染但路由可
// 直达；页面壳能开，数据层靠 @RequirePerm 兜底返 403）。成熟平台同款做法：
//   - RuoYi-Vue3：getInfo → generateRoutes → router.addRoute → {...to, replace}
//     重新导航到原目标，未授权路径落 404 兜底（src/permission.js 实锤）；
//   - Ant Design Pro v5：路由声明 access 鉴权函数，false → 路由禁用 + 菜单
//     移除 + URL 直访显示 403 页（官方文档 authority-management）。
interface DynRoute {
  name: string
  path: string
}
const dynamicRoutes: DynRoute[] = []
// 已同步的菜单数据引用（身份比对）：menus 换成新引用才重跑同步，
// 避免每次导航都 remove+add 把页面组件重挂
let syncedMenus: MenuVO[] | null = null

/** 按授权菜单集合同步动态路由：移除失效项（切换用户/权限收紧）、注册新增项。
 *  只注册带 routePath 的节点——CATALOG（无路径）/ BUTTON（权限节点）/
 *  LINK（外链走 <a target=_blank>，不进 SPA 路由）天然被过滤。 */
function syncDynamicRoutes(menus: MenuVO[]) {
  const desired = new Map<string, MenuVO>()
  for (const m of flattenMenus(menus)) {
    if (m.routePath) desired.set(m.routePath, m)
  }
  // 移除不再授权的（如退出后换账号登录，靠 diff 自动清理，无残留）
  for (let i = dynamicRoutes.length - 1; i >= 0; i--) {
    const rec = dynamicRoutes[i]
    if (!desired.has(rec.path)) {
      router.removeRoute(rec.name)
      dynamicRoutes.splice(i, 1)
    }
  }
  // 注册新增授权的
  for (const [path, vo] of desired) {
    if (dynamicRoutes.some((r) => r.path === path)) continue
    const name = routeNameFor(path)
    router.addRoute(ADMIN_LAYOUT_NAME, {
      path: path.replace(/^\//, ''), // 子路由相对路径，与静态表一致（'system/user'）
      name,
      component: resolveView(vo.component, name, {
        title: vo.menuName,
        path: vo.routePath,
        perm: vo.permCode ?? undefined,
      }),
      meta: { title: vo.menuName },
    })
    dynamicRoutes.push({ name, path })
  }
}

// 本地校验 JWT 是否在有效期内：只解 payload 不验签（签名校验归后端），
// 用于在「未登录」场景下避免向 /auth/profile 发注定失败的请求。
// 结构畸形 → false；未声明 exp → 按有效；exp 已过期 → false。
function isTokenAlive(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return false
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof payload.exp !== 'number') return true
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

// 路由守卫：
// - 未登录（无 token，或 token 已过期）：直接跳登录页，绝不触发 /auth/profile；
//   过期残留 token 顺手清掉，避免后续请求再吃 401。
// - 已登录访问登录页 → 跳工作台（/dashboard）。
// - 刷新恢复：token 有效但 store 里 userInfo 为空（F5 后内存态丢失，正是刷新后的状态）
//   → 补摘 /auth/profile（修用户信息显示"未知"）+ /auth/menus（授权菜单，用于动态注册路由）再放行。
// - 动态路由同步：menus 数组身份变化（登录/刷新补水/换账号）时才 remove+add，
//   同步后必须带着原目标重新导航一次——动态路由是导航解析后才注册的，此刻 to
//   已匹配到 403 兜底，直接 next() 会把用户摁在 403 页（RuoYi 同款 replace 重导航）。
// - _from 保位：vue-router 的 NavigationGuard 按位置推断参数类型，少写一个参数会把
//   next 绑成 from 的类型（TS2349 not callable）；下划线前缀满足 noUnusedParameters。
router.beforeEach(async (to, _from, next) => {
  const token = localStorage.getItem('token')
  if (!token || !isTokenAlive(token)) {
    if (token) localStorage.removeItem('token')
    stopRealtime()
    if (to.path === '/login') {
      next()
    } else {
      next('/login')
    }
    return
  }
  if (to.path === '/login') {
    next('/dashboard')
    return
  }
  const userStore = useUserStore()
  if (!userStore.userInfo) {
    try {
      await userStore.fetchProfile()
      // 菜单与 userInfo 一样是内存态，F5 即丢。这里刷新恢复时顺带补摘一次
      // /auth/menus，它是动态路由注册的授权数据源。
      // 菜单失败不踢登录（保留已恢复的登录态），但动态路由架构下没有
      // 「未注册还能开」的中间态：摘取失败 = 授权集为空 → 落 403 兜底页，
      // 刷新即可恢复（虎哥 2026-10-15 确认的 fail-closed 语义）。
      try {
        await userStore.fetchMenus()
      } catch {
        // 见上：落 403，不阻塞、不踢登录
      }
    } catch {
      // 摘取失败（后端关闭/网络断/502/401/token 被后台置黑）：登录态已不可用。
      // 必须先把本地 token 清掉再去登录页——否则抵达 /login 时
      // 「已登录访问登录页回跳 /」的规则会把导航打回 /，再次 fetchProfile
      // 再次失败，形成 /login ↔ / 无限循环，且每一圈都真发一次 /auth/profile
      // （2026-10-13 虎哥实测：登录后关后端、刷新页面即无限刷）。
      userStore.logoutLocal()
      next('/login')
      return
    }
  }
  if (userStore.menus !== syncedMenus) {
    syncDynamicRoutes(userStore.menus)
    syncedMenus = userStore.menus
    // 带着原目标重新导航：此刻路由表已补齐，重新匹配才能命中刚注册的
    // 动态路由；replace 避免浏览器历史堆栈里留一条 403 记录。
    // ⚠️ 必须按 path + query + hash 重组，不能写 next({ ...to })：
    //   第一趟 to 尚未匹配到动态路由，会被通配兜底路由 Forbidden 吞掉，
    //   to.name 因此被设为 'Forbidden'；vue-router 导航目标里 name 优先级
    //   高于 path，若把整个 to 透传，二次导航直接跳 403 页（2026-10-15
    //   复现：/system/user?tab=2 重导航后 name=Forbidden → 内容区全 403）。
    //   也不能写 { path: to.fullPath }（旧写法）：字符串形式 vue-router 不解析
    //   query，/target?q=1 会变 /target，参数丢失。正解：按 path 导航（避开
    //   catch-all 的 name）再把 query/hash 显式带上 → 命中真实页且参数保真。
    next({ path: to.path, query: to.query, hash: to.hash, replace: true })
    return
  }
  // 已进入登录态：启动 SSE 实时连接（被顶号时服务端即时推 FORCE_LOGOUT，毫秒级弹「重新登录」模态框）
  startRealtime()
  next()
})

export default router
