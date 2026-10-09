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

// 请求拦截：后续接入 JWT 后在此注入 Authorization
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => config,
  (error) => Promise.reject(error),
)

// 响应拦截：直接返回 data，统一错误出口
request.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => Promise.reject(error),
)

export default request
