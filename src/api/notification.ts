import request from './request'
import type {
  NotificationVO,
  NotificationTemplate,
  PublishNotificationRequest,
  TemplateSaveRequest,
} from '../types/notification'

/** 未读数（启动 / SSE 重连后校正用，以事实表为准） */
export function unreadCount() {
  return request.get('/notifications/unread-count').then((r) => r.data.data as number)
}

/** 游标分页列表（倒序）；lastId 为空 = 从最新开始 */
export function listNotifications(lastId?: number, size = 10) {
  return request
    .get('/notifications', { params: { lastId, size } })
    .then((r) => r.data.data as NotificationVO[])
}

/** 单条已读（幂等） */
export function markRead(id: number) {
  return request.post(`/notifications/${id}/read`).then((r) => r.data.data)
}

/** 全部已读 */
export function markAllRead() {
  return request.post('/notifications/read-all').then((r) => r.data.data as { updated: number })
}

// ===== 管理侧 =====

/** 手动发布（P2 验收触发器） */
export function publishNotification(payload: PublishNotificationRequest) {
  return request.post('/admin/notifications/publish', payload).then((r) => r.data.data as { inserted: number })
}

/**
 * 记录查询（分页）：receiver = 用户名或昵称关键字（纯数字按 ID 精确）。
 * 返回结构与 /admin/users/page 一致：records + total（IPage 序列化）。
 */
export function listRecords(params: {
  pageNum?: number
  pageSize?: number
  type?: string
  receiver?: string
  from?: string
  to?: string
}) {
  return request
    .get('/admin/notifications', { params })
    .then((r) => r.data.data as { records: NotificationVO[]; total: number })
}

/** 模板列表（下拉全量） */
export function listTemplates() {
  return request.get('/admin/notifications/templates').then((r) => r.data.data as NotificationTemplate[])
}

/** 模板分页检索（列表页）：按编码 / 模板名称模糊匹配，返回 records + total */
export function pageTemplates(params: {
  pageNum?: number
  pageSize?: number
  code?: string
  templateName?: string
}) {
  return request
    .get('/admin/notifications/templates/page', { params })
    .then((r) => r.data.data as { records: NotificationTemplate[]; total: number })
}

/** 保存模板文案/开关 */
export function saveTemplate(id: number, payload: TemplateSaveRequest) {
  return request.put(`/admin/notifications/templates/${id}`, payload).then((r) => r.data.data)
}
