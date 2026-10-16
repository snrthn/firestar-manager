import request from './request'
import type { ApiResult } from '@/types/auth'
import type { FilePageVO, FileVO, FileDownloadLogPageVO } from '@/types/file'

// 文件管理接口（后端 /files/**）。读接口类级 file:view，上传/删除方法级 file:manage。

/** 文件分页列表（默认每页 10 条；keyword 模糊匹配 originalName/bizType） */
export function listFiles(
  pageNum = 1,
  pageSize = 10,
  params?: { bizType?: string; fileType?: string; keyword?: string },
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

/** 下载记录全量分页（菜单「下载记录」独立查询，不按文件过滤） */
export function listAllDownloadLogs(pageNum = 1, pageSize = 10, keyword?: string) {
  return request
    .get<ApiResult<FileDownloadLogPageVO>>('/files/download-logs', {
      params: { pageNum, pageSize, keyword: keyword || undefined },
    })
    .then((r) => r.data.data!)
}
