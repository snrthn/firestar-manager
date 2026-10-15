import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import router from '@/router'

/**
 * 会话失效全局守卫：所有 axios 实例的 401 统一收敛到这里。
 * - 单例模态框：无论多少个请求同时 401（页面加载并发是常态），
 *   模块级 showing 标志保证同一时刻只弹一个框，杜绝 toast 叠加。
 * - 模态框而非 toast：强制下线是「必须确认」的交互（vue-element-admin 等
 *   成熟后台同款），toast 会自动消失且可叠加，模态框语义明确。
 * - 确认后回登录页；期间 token 已清，路由守卫/心跳立即停摆。
 */
let showing = false

export function handleSessionExpired(msg?: string) {
  if (showing) return
  showing = true
  localStorage.removeItem('token')
  ElMessageBox.alert(msg || '您的账号已在其他设备登录，原会话已失效，请重新登录', '会话已失效', {
    confirmButtonText: '重新登录',
    type: 'warning',
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false,
  })
    .catch(() => {})
    .finally(() => {
      showing = false
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login')
      }
    })
}

/**
 * 401 后把请求 promise 静默挂起（永不 settle）：拦截器已弹框 + 跳登录，
 * 页面级 catch 的兜底 toast（如 axios 默认 "Request failed with status code 401"）
 * 是重复噪音，不再让它执行。被踢后马上跳登录页，挂起的请求无人关心。
 */
export const hangSilently = (): Promise<never> => new Promise(() => {})
