import { fetchFileBlob } from '@/api/file'

// 富文本内网图片解析：后端文件字节接口需要 JWT 鉴权，而 <img> 标签发起的请求不带
// Authorization 头，直接引用 /api/files/{id}/raw 必然 401 加载失败。
// 这里把命中内网文件域的图片 URL，用 token 拉成 blob 再回填 <img>.src，使其在
// 编辑器与展示（RichView）两端都能正确显示。
//
// 命中规则：相对路径（含 /files/）或同源绝对路径（含 /files/）；其余（外链 https）放行
// 交给浏览器原生加载。

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export function isInternalFileUrl(src: string): boolean {
  if (!src) return false
  if (src.startsWith('/')) return src.includes('/files/')
  try {
    const u = new URL(src, window.location.origin)
    if (u.origin !== window.location.origin) return false
    return u.pathname.includes('/files/')
  } catch {
    return false
  }
}

/** 把任意内网文件 URL 规整为 fetchFileBlob 期望的「不含 base 前缀」的相对路径 */
export function toApiRelative(src: string): string {
  let path: string
  if (src.startsWith('/')) {
    path = src
  } else {
    try {
      const u = new URL(src, window.location.origin)
      path = u.pathname + u.search
    } catch {
      return src
    }
  }
  if (path.startsWith(API_BASE)) path = path.slice(API_BASE.length)
  return path || '/'
}

async function resolveOne(img: HTMLImageElement, tracked: string[]): Promise<void> {
  const src = img.getAttribute('src') || ''
  if (!isInternalFileUrl(src)) return
  img.dataset.richResolved = '1'
  try {
    const blob = await fetchFileBlob(toApiRelative(src))
    const url = URL.createObjectURL(blob)
    tracked.push(url)
    img.src = url
  } catch {
    // 拉取失败保持原样（破图），不阻塞其它内容
  }
}

/**
 * 一次性解析容器内所有内网图片（用于 RichView 展示端；tracked 收集生成的 blob URL，
 * 供调用方在内容更新/卸载时 revoke 防泄漏）。
 */
export async function resolveImagesIn(container: HTMLElement | null, tracked: string[] = []): Promise<void> {
  if (!container) return
  const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  for (const img of imgs) {
    if (img.dataset.richResolved === '1') continue
    await resolveOne(img, tracked)
  }
}

/**
 * 观察容器子节点变化，自动解析新插入的内网图片（用于编辑器编辑端；Tiptap 插入图片后
 * 异步拉 blob）。返回清理函数。
 */
export function observeImages(container: HTMLElement | null, onResolved?: (url: string) => void) {
  if (!container) return () => {}
  const mo = new MutationObserver(async (mutations) => {
    let childChanged = false
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
        childChanged = true
        break
      }
    }
    if (!childChanged) return
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
    for (const img of imgs) {
      if (img.dataset.richResolved === '1') continue
      const src = img.getAttribute('src') || ''
      if (!isInternalFileUrl(src)) continue
      img.dataset.richResolved = '1'
      try {
        const blob = await fetchFileBlob(toApiRelative(src))
        const url = URL.createObjectURL(blob)
        onResolved?.(url)
        img.src = url
      } catch {
        // 保持原样
      }
    }
  })
  mo.observe(container, { childList: true, subtree: true })
  return () => mo.disconnect()
}
