/** 问题反馈 + 帮助中心 类型定义（V32，2026-10-21） */

/** 反馈主表行（列表/我的/接收的） */
export interface FeedbackRow {
  id: number
  title: string
  /** 列表页不需要 content，详情才拉全文 */
  content?: string
  receiverId: number
  status: string
  /** 问题类别（字典 feedback_category，V34） */
  category?: string
  createdAt: string
  updatedAt: string
}

/** 反馈详情（detail 接口返回） */
export interface FeedbackDetail extends FeedbackRow {
  content: string
  creator: string
  receiver: string
  isCreator: boolean
}

/** 留言行 */
export interface FeedbackMessageRow {
  id: number
  content: string
  createdAt: string
  sender: string
  isSelf: boolean
}

/** 接收人选项 */
export interface ReceiverOption {
  id: number
  username: string
  nickname: string
}

/** MyBatis-Plus IPage 序列化结构 */
export interface PageResult<T> {
  records: T[]
  total: number
}

/** 帮助中心文章 */
export interface HelpArticle {
  id: number
  title: string
  content: string
  category: string
  sortNo: number
  status: string
  createdAt: string
  updatedAt: string
}

/** SSE 推送的反馈事件 payload（realtimeDispatch 消费） */
export interface FeedbackPushPayload {
  feedbackId: number
  title: string
  status?: string
  sender?: string
}
