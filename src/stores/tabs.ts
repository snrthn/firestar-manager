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
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    // 关闭的是当前页签 → 激活相邻页签（优先右侧，否则左侧）
    if (active.value === path) {
      const next = tabs.value[idx] || tabs.value[idx - 1]
      active.value = next ? next.path : ''
    }
  }

  function closeOthers(path: string) {
    tabs.value = tabs.value.filter((t) => t.path === path)
    active.value = path
  }

  function closeAll() {
    tabs.value = []
    active.value = ''
  }

  return { tabs, active, add, close, closeOthers, closeAll }
})
