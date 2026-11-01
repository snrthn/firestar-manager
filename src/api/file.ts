import request from './request'
import { handleSessionExpired } from './sessionGuard'
import type { ApiResult } from '@/types/auth'
import type { FilePageVO, FileVO, FileDownloadLogPageVO } from '@/types/file'

// 文件管理接口（后端 /files/**）。读接口（list/detail/download/preview/raw）对登录用户开放
// （业务页展示附件不再受 file:view 门禁约束）；上传/删除/改名方法级 file:manage 收口；
// 下载记录全量视图（/files/download-logs）仍保留 file:view。

/** 文件分页列表（默认每页 10 条；keyword 模糊匹配 originalName/bizType） */
export function listFiles(
  pageNum = 1,
  pageSize = 10,
  params?: { bizType?: string; bizId?: number; fileType?: string; keyword?: string },
) {
  return request
    .get<ApiResult<FilePageVO>>('/files/list', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 上传文件（multipart/form-data；bizType/bizId/fileType 可选，预置阶段仅传文件） */
export function uploadFile(form: FormData) {
  return request
    .post<ApiResult<FileVO>>('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data.data!)
}

/** 文件详情（不返回内容） */
export function getFileDetail(id: number) {
  return request.get<ApiResult<FileVO>>(`/files/${id}`).then((r) => r.data.data!)
}

/** 取下载签名 URL（浏览器直连 OSS；本地模式返回后端 /raw 代理地址） */
export function downloadFileUrl(id: number) {
  return request.get<ApiResult<string>>(`/files/${id}/download`).then((r) => r.data.data!)
}

/** 取预览签名 URL（Content-Disposition: inline，仅 PDF/图片可预览） */
export function previewFileUrl(id: number) {
  return request.get<ApiResult<string>>(`/files/${id}/preview`).then((r) => r.data.data!)
}

/** 删除文件（仅标记 DELETED，DB 记录与 OSS 对象保留，file:manage） */
export function deleteFile(id: number) {
  return request.delete<ApiResult<null>>(`/files/${id}`).then((r) => r.data)
}

/** 更新文件别名（V23；文件管理处维护，file:manage；传空串清空回退原始名） */
export function updateFileAlias(id: number, alias: string) {
  return request
    .put<ApiResult<FileVO>>(`/files/${id}/alias`, null, { params: { alias } })
    .then((r) => r.data.data!)
}

/**
 * 带 token 拉取文件字节（blob）—— 修「window.open 新页签 403」：
 * 本地存储模式下后端只签发相对路径 /files/{id}/raw，浏览器直接导航不带 Authorization 头。
 * 这里手动拼 baseURL + JWT 头把字节取回来，再本地打开/下载。
 *
 * ⚠️ 为什么用原生 fetch 而不是 axios 的 responseType:'blob'：
 *   2026-10-16 实测（Node 22 + 同版本 axios 1.7.7 + 同款响应拦截器复现），
 *   axios 的 blob 行为依赖 adapter——Node http adapter 会把它降级成 string；
 *   浏览器侧一旦命中非 Blob 变体，下游 URL.createObjectURL(blob) 直接抛
 *   "Overload resolution failed"（参数不是 Blob/MediaSource，且无任何上下文）。
 *   原生 fetch + res.blob() 是浏览器标准路径，铁产 Blob，与 adapter 无关。
 *
 * ⚠️ OSS 模式（绝对签名 URL）不要走本函数：签名 URL 本身免鉴权，但浏览器直连有跨域
 *    读取限制，且设计上就是让浏览器直连 OSS 省流量。由调用方按 url.startsWith('http') 分流。
 */
export async function fetchFileBlob(relativeUrl: string): Promise<Blob> {
  const base = import.meta.env.VITE_API_BASE || '/api'
  const token = localStorage.getItem('token')
  const res = await fetch(`${base}${relativeUrl}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  // 401：token 缺失/过期/被顶下线 → 与 axios 拦截器同一条会话守卫出口
  if (res.status === 401) {
    // 透传发送时刻的 token：若这是重登录前的旧请求 401，属僵尸请求，守卫静默忽略。
    handleSessionExpired('登录状态已失效，请重新登录', token)
    throw new Error('登录状态已失效')
  }
  if (!res.ok) {
    // 错误响应体是后端 Result JSON 壳，读出来取 message，别只报 HTTP 码
    const text = await res.text().catch(() => '')
    let msg = `文件获取失败（HTTP ${res.status}）`
    try {
      const body = JSON.parse(text)
      if (body?.message) msg = body.message
    } catch {
      // 非 JSON 壳，用默认文案
    }
    throw new Error(msg)
  }

  const blob = await res.blob()
  // 防御性校验：非 Blob 时给带类型信息的可诊断错误，
  // 避免下游 createObjectURL 抛出没有上下文的 "Overload resolution failed"
  if (!(blob instanceof Blob)) {
    throw new Error(`文件响应异常：预期二进制流，实际拿到 ${Object.prototype.toString.call(blob)}`)
  }
  return blob
}

/** 下载记录全量分页（菜单「下载记录」独立查询，不按文件过滤） */
export function listAllDownloadLogs(pageNum = 1, pageSize = 10, keyword?: string) {
  return request
    .get<ApiResult<FileDownloadLogPageVO>>('/files/download-logs', {
      params: { pageNum, pageSize, keyword: keyword || undefined },
    })
    .then((r) => r.data.data!)
}
