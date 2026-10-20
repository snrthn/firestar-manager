import request from './request'
import type { HelpArticle, PageResult } from '../types/feedback'

// ===== 前台（登录即可） =====

/** 启用中的文章列表（阅读页） */
export function listHelpArticles() {
  return request.get('/help/articles').then((r) => r.data.data as HelpArticle[])
}

/** 文章详情 */
export function getHelpArticle(id: number) {
  return request.get(`/help/articles/${id}`).then((r) => r.data.data as HelpArticle)
}

// ===== 管理端（system:help） =====

export function pageHelpArticles(params: {
  pageNum?: number
  pageSize?: number
  keyword?: string
}) {
  return request
    .get('/system/help/page', { params })
    .then((r) => r.data.data as PageResult<HelpArticle>)
}

export function createHelpArticle(payload: {
  title: string
  content: string
  category?: string
  sortNo?: number
}) {
  return request.post('/system/help', payload).then((r) => r.data.data as number)
}

export function updateHelpArticle(
  id: number,
  payload: {
    title: string
    content: string
    category?: string
    sortNo?: number
    status?: string
  },
) {
  return request.put(`/system/help/${id}`, payload).then((r) => r.data.data)
}

export function deleteHelpArticle(id: number) {
  return request.delete(`/system/help/${id}`).then((r) => r.data.data)
}
