/**
 * 剪贴板工具（2026-10-16，文件管理「复制资源链接」）。
 *
 * navigator.clipboard 只在安全上下文（https / localhost）可用，
 * 生产若走 http 内网域名会直接不存在 → 降级 textarea + execCommand('copy')。
 */

/** 复制文本到剪贴板，成功返回 true；两种方式都失败返回 false（由调用方提示手动复制） */
export async function copyText(text: string): Promise<boolean> {
  // 优先：异步 Clipboard API（安全上下文）
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒/非安全上下文：落到降级方案
    }
  }
  // 降级：隐藏 textarea + execCommand（PS5.1 时代的活化石，但 http 场景只有它管用）
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
