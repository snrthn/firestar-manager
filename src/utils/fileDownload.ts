import { fetchFileBlob } from '@/api/file'

/**
 * 文件下载/预览的公共落地工具（2026-10-16，虎哥）。
 *
 * 背景：本地存储模式下后端签发的是相对路径 /files/{id}/raw，window.open 直接导航
 * 不带 JWT → 403；且「嘭」地新开一个浏览器页签本身就很割裂。
 * 统一收口为：字节取回来 → 本地 objectURL → <a download> 落盘 / <iframe><img> 渲染，
 * 全程不起新页签、不过 window.open。
 */

/** blob → 触发浏览器下载（同源 objectURL，download 属性生效） */
export function saveBlobAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟 revoke：立即撤销个别浏览器会取消未完成的下载
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * 统一下载入口：url 为后端签发地址。
 * - 绝对地址（OSS 签名 URL）：免鉴权直连，<a> 点击后由 Content-Disposition=attachment 落盘，不开新页签；
 * - 相对路径（本地模式 /files/{id}/raw）：带 token 取 blob 再下载。
 */
export async function downloadViaBackend(url: string, filename: string) {
  if (url.startsWith('http')) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename // 跨域时浏览器忽略该属性，由响应头的 Content-Disposition 决定
    document.body.appendChild(a)
    a.click()
    a.remove()
    return
  }
  const blob = await fetchFileBlob(url)
  saveBlobAs(blob, filename)
}
