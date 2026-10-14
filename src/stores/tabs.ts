import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * 多页签（Tabs）状态。AdminLayout 监听路由变化自动 add，
 * 内容区顶部渲染页签条，点击切换、× 关闭。
 */
export interface TabItem {
  path: string
  title: string
  name?: string | symbol | null
}

/** 固定页签（affix）：工作台常驻不可关闭，参考 RuoYi TagsView 的 affix 语义 */
export const AFFIX_TAB_PATH = '/dashboard'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const active = ref('')

  function add(route: RouteLocationNormalizedLoaded) {
    const path = route.path
    if (!path) return
    if (!tabs.value.some((t) => t.path === path)) {
      const title =
        (route.meta?.title as string) ||
        (typeof route.name === 'string' ? route.name : '') ||
        path
      tabs.value.push({ path, title, name: route.name })
    }
    active.value = path
  }

  function close(path: string) {
    // 固定页签拒绝关闭（工作台常驻）
    if (path === AFFIX_TAB_PATH) return
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    // 关闭的是当前页签 → 激活相邻页签（优先右侧，否则左侧）
    if (active.value === path) {
      const next = tabs.value[idx] || tabs.value[idx - 1]
      active.value = next ? next.path : ''
    }
  }

  // 批量关闭后保证 affix 页签仍在集合里（被 slice 关掉则放回头部原位）
  const withAffix = (list: TabItem[]) => {
    if (!list.some((t) => t.path === AFFIX_TAB_PATH)) {
      const affix = tabs.value.find((t) => t.path === AFFIX_TAB_PATH)
      if (affix) list.unshift(affix)
    }
    return list
  }

  function closeOthers(path: string) {
    tabs.value = tabs.value.filter((t) => t.path === path || t.path === AFFIX_TAB_PATH)
    active.value = path
  }

  function closeLeft(path: string) {
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx <= 0) return
    tabs.value = withAffix(tabs.value.slice(idx))
    if (!tabs.value.some((t) => t.path === active.value)) active.value = path
  }

  function closeRight(path: string) {
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx < 0 || idx >= tabs.value.length - 1) return
    tabs.value = withAffix(tabs.value.slice(0, idx + 1))
    if (!tabs.value.some((t) => t.path === active.value)) active.value = path
  }

  function closeAll() {
    // 关闭全部仅保留工作台，激活态归工作台（affix 常驻，不产生空页签条）
    tabs.value = tabs.value.filter((t) => t.path === AFFIX_TAB_PATH)
    active.value = AFFIX_TAB_PATH
  }

  return { tabs, active, add, close, closeOthers, closeLeft, closeRight, closeAll }
})
