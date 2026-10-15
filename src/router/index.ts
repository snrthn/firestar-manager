import { createRouter, createWebHistory } from 'vue-router'
import type { Component } from 'vue'
import { useUserStore } from '@/stores/user'
import { startRealtime, stopRealtime } from '@/utils/realtimeClient'
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

// 注意：直接返回 glob 的 loader 函数，不要再包 defineAsyncComponent——
// Vue Router 4 的 component 字段本身接受 `() => import()` 形式（内部自行
// 包装异步组件，见下方 /login 路由），外层再套 defineAsyncComponent 是重复
// 包装，会触发 [Vue Router warn] Component "default" ... defineAsyncComponent()。
const resolveView = (component: string): Component => {
  const loader = viewModules[`../views/${component}.vue`]
  return loader ?? PagePlaceholder
}

// 与 V4 种子菜单一一对应（route_path / component 同库）；title 同时喂给
// meta.title，面包屑 / 页签的文案直接从 meta.title 取，不依赖这份表。
const menuPages: Array<{ path: string; name: string; title: string; component: string }> = [
  { path: 'dashboard', name: 'dashboard', title: '工作台', component: 'dashboard/index' },
  { path: 'project', name: 'project', title: '项目列表', component: 'project/list' },
  { path: 'shipment', name: 'shipment', title: '发货管理', component: 'shipment/list' },
  { path: 'receivable', name: 'receivable', title: '应收管理', component: 'receivable/list' },
  { path: 'receipt', name: 'receipt', title: '收款管理', component: 'receipt/list' },
  { path: 'invoice', name: 'invoice', title: '发票管理', component: 'invoice/list' },
  { path: 'writeoff', name: 'writeoff', title: '核销管理', component: 'writeoff/list' },
  { path: 'return', name: 'return', title: '退货管理', component: 'return/list' },
  { path: 'approval', name: 'approval', title: '审批中心', component: 'approval/list' },
  { path: 'dashboard/data', name: 'dashboardData', title: '数据看板', component: 'dashboard/data' },
  // 个人中心（header 用户下拉入口，不进侧栏；component 落到 views/profile/index.vue）
  { path: 'profile', name: 'profile', title: '个人中心', component: 'profile/index' },
  // 组织架构（V8 迁移把它排在系统管理组 sort_no=1，路由注册顺序与侧栏顺序保持一致）
  { path: 'system/org', name: 'systemOrg', title: '组织架构', component: 'system/org' },
  { path: 'system/user', name: 'systemUser', title: '用户管理', component: 'system/user' },
  { path: 'system/role', name: 'systemRole', title: '角色管理', component: 'system/role' },
  { path: 'system/permission', name: 'systemPermission', title: '权限管理', component: 'system/permission' },
  { path: 'system/menu', name: 'systemMenu', title: '菜单管理', component: 'system/menu' },
  { path: 'system/post', name: 'systemPost', title: '岗位管理', component: 'system/post' },
  { path: 'system/dict', name: 'systemDict', title: '字典管理', component: 'system/dict' },
  // 字典数据（隐藏二级页）：菜单表里 visible=0，侧栏不渲染，从字典管理页进入；
  // 路由照常注册，直接输 URL / 刷新可访问（V7 迁移种子的 route_path 与此对齐）
  { path: 'system/dict-data', name: 'systemDictData', title: '字典数据', component: 'system/dict-data' },
  { path: 'system/file', name: 'systemFile', title: '文件管理', component: 'system/file' },
]

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
      // 子路由由 menuPages 数据驱动装配（glob 解析 component），
      // 未登录访问任意子路由都会被下方守卫拦回登录页。
      path: '/',
      component: () => import('../layouts/AdminLayout.vue'),
      // 默认定向到工作台（/dashboard），菜单「工作台」route_path 与之对应
      redirect: '/dashboard',
      children: menuPages.map((p) => ({
        path: p.path,
        name: p.name,
        component: resolveView(p.component),
        meta: { title: p.title },
      })),
    },
  ],
})

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
//   → 补摘 /auth/profile（修用户信息显示"未知"）+ /auth/menus（菜单数据就绪）再放行。
// _from 保位：vue-router 的 NavigationGuard 按位置推断参数类型，少写一个参数会把
// next 绑成 from 的类型（TS2349 not callable）；下划线前缀满足 noUnusedParameters。
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
      // 菜单与 userInfo 一样是内存态，F5 即丢。后期要做菜单装配，
      // 这里刷新恢复时顺带补摘一次 /auth/menus，先把数据就绪。
      // 菜单失败不阻塞导航：用户信息已恢复，顶多菜单空，再刷一次即可。
      try {
        await userStore.fetchMenus()
      } catch {
        // 菜单摘取失败不致命，保留已恢复的登录态直接放行
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
  // 已进入登录态：启动 SSE 实时连接（被顶号时服务端即时推 FORCE_LOGOUT，毫秒级弹「重新登录」模态框）
  startRealtime()
  next()
})

export default router
