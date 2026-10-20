import request from './request'
import type {
  FeedbackDetail,
  FeedbackMessageRow,
  FeedbackRow,
  PageResult,
  ReceiverOption,
} from '../types/feedback'

/** 可选接收人（全员启用用户） */
export function listReceivers() {
  return request.get('/feedback/receivers').then((r) => r.data.data as ReceiverOption[])
}

/** 创建反馈（category 字典 feedback_category） */
export function createFeedback(payload: {
  title: string
  content: string
  receiverId: number
  category?: string
}) {
  return request.post('/feedback', payload).then((r) => r.data.data as number)
}

export interface FeedbackQuery {
  pageNum?: number
  pageSize?: number
  status?: string
  category?: string
}

/** 我提交的 */
export function listMyFeedback(params: FeedbackQuery) {
  return request
    .get('/feedback/my', { params })
    .then((r) => r.data.data as PageResult<FeedbackRow>)
}

/** 我接收的 */
export function listReceivedFeedback(params: FeedbackQuery) {
  return request
    .get('/feedback/received', { params })
    .then((r) => r.data.data as PageResult<FeedbackRow>)
}

/** 详情 */
export function getFeedback(id: number) {
  return request.get(`/feedback/${id}`).then((r) => r.data.data as FeedbackDetail)
}

/** 留言时间线（正序） */
export function listFeedbackMessages(id: number) {
  return request.get(`/feedback/${id}/messages`).then((r) => r.data.data as FeedbackMessageRow[])
}

/** 追加留言 */
export function addFeedbackMessage(id: number, content: string) {
  return request.post(`/feedback/${id}/messages`, { content }).then((r) => r.data.data as number)
}

/** 状态流转 */
export function changeFeedbackStatus(id: number, status: string) {
  return request.put(`/feedback/${id}/status`, { status }).then((r) => r.data.data)
}
