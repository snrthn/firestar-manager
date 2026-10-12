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

// 路由守卫：未携带 token 访问受保护页 → 跳登录；已登录访问登录页 → 跳首页。
// 刷新恢复：localStorage 只持久化了 token，userInfo/roles/permissions 都是内存 ref，
// F5 刷新即丢——所以「有 token 但 store 里 userInfo 为空」时（正是刷新后的状态）
// 先摘一次 /auth/profile 再放行，避免首页渲染时用户信息为空（显示"未知"）。
router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    next('/login')
    return
  }
  if (to.path === '/login' && token) {
    next('/')
    return
  }
  if (token) {
    const userStore = useUserStore()
    if (!userStore.userInfo) {
      try {
        await userStore.fetchProfile()
      } catch {
        // 摘取失败（token 过期/失效等）：响应拦截器已清 token 并跳登录，
        // 这里兜底再跳一次，避免导航卡死
        next('/login')
        return
      }
    }
  }
  next()
})

export default router
