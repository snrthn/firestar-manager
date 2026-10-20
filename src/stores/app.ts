import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAbout } from '@/api/config'
import { fetchFileBlob } from '@/api/file'

/**
 * 全局应用状态（占位）。后续可扩展：用户信息、权限、主题等。
 */
export const useAppStore = defineStore('app', () => {
  const title = ref<string>(import.meta.env.VITE_APP_TITLE || '火星财务管理系统')
  // 侧栏默认展开；「菜单管理页内的树默认折叠」由 menu.vue 自身控制（虎哥 2026-10-14 修正：此前误把侧栏收起）
  const sidebarCollapsed = ref<boolean>(false)

  // ===== 品牌标识（虎哥 2026-10-21：侧栏 Logo 优先用参数配置里的 logo_url） =====
  // 数据来源 /system/config/about（登录即可访问，不需要 config:manage 权限），
  // 与「关于我们」弹窗同源下发，避免为一个 logo 单开请求。
  // 为空（V25 种子默认空串）或图片最终取不到时，侧栏回落「火」字块 + 系统名。
  const logoUrl = ref<string>('') // 供 <img> 渲染的最终地址（可能是 blob:）
  const logoRaw = ref<string>('') // 配置原值，用于判断是否需要重新解析
  // 已拉过就不再重复请求（侧栏/抽屉会各挂一次 AppSidebar，AdminLayout 也可能重挂）
  const brandLoaded = ref<boolean>(false)
  let lastBlob: string | null = null

  function releaseBlob() {
    if (lastBlob && lastBlob.startsWith('blob:')) {
      URL.revokeObjectURL(lastBlob)
      lastBlob = null
    }
  }

  /**
   * 把配置里的 logo 地址解析成 <img> 真正能渲染的地址。
   *
   * 关键坑：本地存储模式下后端 /files/{id}/raw 需要 JWT，而 <img src> 不会带任何请求头
   * （2026-10-21 实测：匿名 GET 该地址直接 401），所以「配了 logo 反而显示不出来」。
   * 同源/相对地址一律走 fetchFileBlob 带 token 取字节再转 object URL
   * —— 与 useAvatar（头像）完全同一套路；真外链 / OSS 签名地址免鉴权，直连即可。
   */
  async function resolveLogo(raw: string): Promise<string> {
    const url = (raw || '').trim()
    if (!url) return ''
    let relative: string | null = null
    if (url.startsWith('/')) {
      relative = url
    } else if (/^https?:\/\//i.test(url)) {
      try {
        const u = new URL(url)
        // 同源 = 本站文件中心地址 → 必须带 token 取；跨域外链则免鉴权直连
        if (u.origin === window.location.origin) relative = u.pathname + u.search
      } catch {
        // 非法 URL：当外链直连，加载不出来由 @error 兜底回落
      }
    }
    if (!relative) return url
    // fetchFileBlob 会自行拼 baseURL（默认 /api），这里去掉配置里可能带的 /api 前缀
    const blob = await fetchFileBlob(relative.replace(/^\/api/, ''))
    const obj = URL.createObjectURL(blob)
    lastBlob = obj
    return obj
  }

  /** 拉取系统名 + Logo：登录进站后调一次；失败静默回落默认值，不拦进站 */
  async function loadBrand(force = false) {
    if (brandLoaded.value && !force) return
    brandLoaded.value = true
    try {
      const d = await getAbout()
      if (d?.systemName) title.value = d.systemName
      const raw = (d?.logoUrl || '').trim()
      if (raw !== logoRaw.value || force) {
        logoRaw.value = raw
        releaseBlob()
        logoUrl.value = await resolveLogo(raw)
      }
    } catch {
      // 接口不可用 / 未配置都走默认标识，不影响主流程
      releaseBlob()
      logoRaw.value = ''
      logoUrl.value = ''
    }
  }

  /** 图片取不到（坏链 / 401 / 文件已删）时退出图片态，回落默认标识 */
  function markLogoBroken() {
    releaseBlob()
    logoRaw.value = ''
    logoUrl.value = ''
  }

  return { title, sidebarCollapsed, logoUrl, brandLoaded, loadBrand, markLogoBroken }
})
