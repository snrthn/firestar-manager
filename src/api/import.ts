import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ImportBatch, ImportKeyOption, ImportSubmitResult } from '@/types/import'

// 历史数据导入接口（后端 /import/**）
// 上传/下载走单独配置：上传 60s 超时，二进制下载不走 Result 封装。

/** 已注册的导入类型 */
export function importKeys() {
  return request
    .get<ApiResult<ImportKeyOption[]>>('/import/keys')
    .then((r) => r.data.data!)
}

/**
 * 提交导入（上传即走）：内部先传原始文件再落批次，立即返回批次号。
 * @param parentBatchNo 修正重传时填原失败批次号
 */
export function submitImport(key: string, file: File, parentBatchNo?: string) {
  const form = new FormData()
  form.append('file', file)
  if (parentBatchNo) form.append('parentBatchNo', parentBatchNo)
  return request
    .post<ApiResult<ImportSubmitResult>>(`/import/${key}/submit`, form, {
      timeout: 60000,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data.data!)
}

/** 批次详情 */
export function importBatchDetail(id: number) {
  return request
    .get<ApiResult<ImportBatch>>(`/import/batches/${id}`)
    .then((r) => r.data.data!)
}

/** 导入历史（默认只看本人） */
export function importHistory(importKey?: string, limit = 50) {
  return request
    .get<ApiResult<ImportBatch[]>>('/import/history', { params: { importKey, limit } })
    .then((r) => r.data.data!)
}

/** 归档批次 */
export function archiveImport(id: number) {
  return request.post<ApiResult<void>>(`/import/batches/${id}/archive`).then((r) => r.data)
}

/**
 * 用带 JWT 的 fetch 取二进制（模板/错误 xlsx），返回 blob。
 * 不走 request 实例的响应拦截器（二进制无 code 字段）。
 */
async function fetchBinary(url: string): Promise<Blob> {
  const base = import.meta.env.VITE_API_BASE || '/api'
  const token = localStorage.getItem('token')
  const res = await fetch(`${base}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`下载失败（${res.status}）`)
  return res.blob()
}

/** 下载空模板 */
export function downloadTemplate(key: string): Promise<Blob> {
  return fetchBinary(`/import/templates/${key}`)
}

/** 下载错误回执 xlsx（含错误信息列 + 隐藏批次号/行号） */
export function downloadErrors(id: number): Promise<Blob> {
  return fetchBinary(`/import/batches/${id}/errors.xlsx`)
}
