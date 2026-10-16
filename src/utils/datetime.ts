import dayjs from 'dayjs'

/**
 * 全局统一的时间展示格式（虎哥 2026-10-16：后端 LocalDateTime 序列化带 'T'，
 * 各页裸渲染出现 2026-10-16T14:14:23 这类 ISO 串，全部收敛到本工具）。
 *
 * 用法：
 *   import { formatDateTime } from '@/utils/datetime'
 *   {{ formatDateTime(row.createdAt) }}
 *
 * 约定：空值统一渲染 '—'，与各页原有的空值兜底保持一致。
 */
export function formatDateTime(dt: string | number | Date | null | undefined): string {
  if (dt === null || dt === undefined || dt === '') return '—'
  const d = dayjs(dt)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : '—'
}

/** 纯日期（YYYY-MM-DD），列表里只关心天粒度的列用 */
export function formatDate(dt: string | number | Date | null | undefined): string {
  if (dt === null || dt === undefined || dt === '') return '—'
  const d = dayjs(dt)
  return d.isValid() ? d.format('YYYY-MM-DD') : '—'
}
