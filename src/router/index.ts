import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import Home from '../views/Home.vue'
import Login from '../views/login/Login.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
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
// - 已登录访问登录页 → 跳首页。
// - 刷新恢复：token 有效但 store 里 userInfo 为空（F5 后内存态丢失，正是刷新后的状态）
//   → 补摘 /auth/profile（修用户信息显示"未知"）+ /auth/menus（菜单数据就绪）再放行。
router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('token')
  if (!token || !isTokenAlive(token)) {
    if (token) localStorage.removeItem('token')
    next(to.path === '/login' ? undefined : '/login')
    return
  }
  if (to.path === '/login') {
    next('/')
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
  next()
})

export default router
