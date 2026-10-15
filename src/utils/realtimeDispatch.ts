import { handleSessionExpired } from '@/api/sessionGuard'

/**
 * 实时事件分发：后端通过 SSE 推来的事件在此路由到前端处理。
 * 新增业务事件（审批 / 通知）只需在 switch 加 case，不动网关。
 */
export function dispatchRealtime(type: string, data: unknown) {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  switch (type) {
    case 'FORCE_LOGOUT':
      handleSessionExpired(
        (typeof payload.message === 'string' && payload.message) ||
        '您的账号已在其他设备登录，原会话已失效，请重新登录'
      )
      break
    // 预留：审批流 / 通知中心的入口，后续接 EventBus 或 ElNotification
    case 'APPROVAL_CREATED':
    case 'APPROVAL_DONE':
    case 'NOTIFY':
      // TODO: 接入通知中心（待审批 / 通知业务落地）
      console.info('[realtime]', type, payload)
      break
    default:
      console.warn('[realtime] unknown event type:', type, payload)
  }
}
