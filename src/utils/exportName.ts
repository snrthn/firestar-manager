import dayjs from 'dayjs'

/**
 * 导出/下载文件的统一命名：中文业务名 + 时间戳（虎哥 2026-11-22）。
 *
 * 例：`buildExportName('收款管理')` → `收款管理_20261122_004512.xlsx`
 *
 * 说明：文件落盘名由前端 <a download> 决定（走后端 blob 下载时后端
 * Content-Disposition 不生效），所以各处导出必须走本工具，避免出现
 * `receipt_export.xlsx` 这类无时间戳的英文名、多次导出互相覆盖。
 */
export function buildExportName(baseName: string, ext = 'xlsx'): string {
  return `${baseName}_${dayjs().format('YYYYMMDD_HHmmss')}.${ext}`
}
