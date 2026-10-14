import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局应用状态（占位）。后续可扩展：用户信息、权限、侧边栏折叠、主题等。
 */
export const useAppStore = defineStore('app', () => {
  const title = ref<string>(import.meta.env.VITE_APP_TITLE || '火星财务管理系统')
  // 侧栏默认展开；「菜单管理页内的树默认折叠」由 menu.vue 自身控制（虎哥 2026-10-14 修正：此前误把侧栏收起）
  const sidebarCollapsed = ref<boolean>(false)

  return { title, sidebarCollapsed }
})
