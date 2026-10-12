import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

/**
 * Axios 实例（对接后端 firestar-service）。
 * baseURL 取自 .env 的 VITE_API_BASE：
 *   - 开发：/api（由 vite proxy 转发到后端 2025）
 *   - 生产/测试/预发：填真实后端地址
 */
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
})

// 请求拦截：注入 JWT Authorization（Bearer）
// token 存 localStorage（登录时由 user store 写入），登出/401 时清除
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截：直接返回 data，统一错误出口
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const body: any = response.data
    // 后端统一响应壳 Result{code,msg,data}：HTTP 200 但业务码非 0 也按失败抛出，
    // 并带上后端 msg（否则如登录密码错误会被当成功处理，只剩前端兜底文案）。
    // 只对带 code 字段的壳生效——/system/db-check 等直返对象的接口不受影响。
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body
  },
  (error) => {
    // 401：token 缺失/过期/已被登出（黑名单）→ 清本地并跳登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default request
