import { handleSessionExpired } from '@/api/sessionGuard'
import { useNotifyStore } from '@/stores/notify'
import type { NotifyPushPayload } from '@/types/notification'
// 函数式调用前 main.ts 已 app.use(ElNotification)（注入 app context）
import ElNotification from 'element-plus/es/components/notification/index.mjs'

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
      console.info('[realtime]', type, payload)
      break
    case 'CONNECTED':
      // 握手确认帧（SseRealtimeGateway.connect 发，data 为 "{}"）：无业务含义，
      // 静默处理——没有这个 case 时每次连接/重连都会走 default 打 console.warn
      break
    case 'NOTIFY':
      // 通知铃铛：未读数用推送值，latest 插顶（面板打开时按事实表补全正文）
      useNotifyStore().onPush(payload as unknown as NotifyPushPayload)
      // 铃铛徽标之外的二次反馈：右下角轻提醒展示标题+正文（2026-10-20 虎哥要求）
      {
        const latest = (payload as unknown as NotifyPushPayload).latest
        if (latest) {
          ElNotification({
            title: latest.title || '新通知',
            message: latest.content || '您收到一条新通知，点击右上角铃铛查看详情',
            position: 'bottom-right',
            duration: 4500,
          })
        }
      }
      break
    default:
      console.warn('[realtime] unknown event type:', type, payload)
  }
}
