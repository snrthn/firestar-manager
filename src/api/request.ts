import axios from 'axios'
import type { AxiosResponse } from 'axios'
import router from '@/router'

// 全局 axios 实例。baseURL=/api：开发期经 vite 代理剥离 /api 转发到后端 2025，
// 部署期由 Nginx 同样剥离 /api。后端路由一律不带 /api（见后端 SecurityConfig 注释）。
const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 请求拦截器：携带 JWT
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器：统一处理业务码与 401
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const body = response.data
    // 后端约定 code===0 成功；非 0 为业务失败（HTTP 仍为 200）
    if (body && typeof body.code !== 'undefined' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    // 401：Token 无效/过期/已拉黑（后端 filter 直接写 401 JSON）
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default request
