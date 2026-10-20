/** 通知（P2）：铃铛面板数据源 + 管理端 */

/** 用户侧列表项（GET /notifications） */
export interface NotificationVO {
  id: number
  type: string
  title: string
  content: string
  level: string
  linkUrl: string | null
  bizType: string | null
  bizId: string | null
  read: boolean
  createdAt: string
  /** 兼容字段：后端 records VO 化部署前返回实体（已读态在 readAt），上线后可删 */
  readAt?: string | null
  /** 收件人显示名「昵称（用户名）」：仅管理端 records 返回，展开明细用人名替代裸 ID */
  receiverName?: string
}

/** 通知模板（GET /admin/notifications/templates） */
export interface NotificationTemplate {
  id: number
  code: string
  templateName: string
  type: string
  titleTpl: string
  contentTpl: string
  enabled: boolean
  updatedAt: string
}

/** 管理端手动发布请求 */
export interface PublishNotificationRequest {
  code?: string
  title?: string
  content?: string
  vars?: Record<string, string>
  linkUrl?: string
  level?: string
  receivers: number[]
}

/** 保存模板请求 */
export interface TemplateSaveRequest {
  templateName: string
  titleTpl: string
  contentTpl: string
  enabled: boolean
}

/** 通知级别中文映射（下拉展示用；value 仍是后端枚举 INFO/WARN/URGENT） */
export const LEVEL_LABELS: Record<string, string> = {
  INFO: '信息',
  WARN: '警告',
  URGENT: '紧急',
}

/** 模板下拉展示名：优先中文名称，为空兜底 code */
export function templateLabel(t: { code: string; templateName?: string }): string {
  return t.templateName && t.templateName.trim() ? t.templateName : t.code
}

/** SSE NOTIFY 事件载荷（后端 payload） */
export interface NotifyPushPayload {
  unreadCount: number
  latest?: { id: number; type: string; title: string; content?: string; linkUrl?: string | null; ts: string }
}

/**
 * 跳转链接合法性校验（站内 + 外链双支持，2026-10-20 虎哥要求）。
 * 站内：/ 开头的相对路径（不含空白）；外链：http(s):// + 点分节 host。
 * 空串合法（= 不跳转）。后端 publish 同规则校验（防绕过前端直调接口）。
 */
export function isValidLink(url: string): boolean {
  const s = url.trim()
  if (!s) return true
  return /^\/\S*$/.test(s) || /^https?:\/\/[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s)
}
