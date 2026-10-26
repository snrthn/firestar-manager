// 看板数据格式化工具（金额/百分比/大数缩写）

/** 金额格式化：千分位 + 固定小数位（默认 2 位），null/NaN 显示破折号 */
export function formatMoney(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** 比率(0~1)格式化为百分比字符串 */
export function formatPercent(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return (Number(v) * 100).toFixed(digits) + '%'
}

/** 普通数字千分位（笔数/天数等） */
export function formatNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN')
}

/** 坐标轴大数缩写：>=1万 显示为「x.x万」 */
export function formatWan(v: number): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}
