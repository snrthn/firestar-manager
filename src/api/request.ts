import axios from 'axios'
import type { AxiosResponse } from 'axios'
import { handleSessionExpired, hangSilently } from './sessionGuard'

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
    // 401：Token 无效/过期/已拉黑/账号在其它设备登录（后端 filter 直接写 401 JSON）
    // 统一收敛到会话守卫：单例模态框去重 + 静默挂起（页级 catch 不再弹重复错误）
    if (error.response?.status === 401) {
      handleSessionExpired(error.response.data?.message)
      return hangSilently()
    }
    // 其它非 2xx（如安装向导关闭后的真 403、db-check 的 503）：
    // 把后端响应体里的中文 message 提到 error.message，否则页面 catch 只能看到
    // axios 默认的 "Request failed with status code 403" 英文串。
    // 只改 message、不动 error.response 结构——dashboard 的 db-check 诊断要读
    // e.response.data.errors，不能换成裸 Error。
    const msg = error.response?.data?.message
    if (msg && error.message !== msg) {
      error.message = msg
    }
    return Promise.reject(error)
  },
)

export default request
