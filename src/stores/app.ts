import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局应用状态（占位）。后续可扩展：用户信息、权限、侧边栏折叠、主题等。
 */
export const useAppStore = defineStore('app', () => {
  const title = ref<string>(import.meta.env.VITE_APP_TITLE || '火星财务管理系统')
  const sidebarCollapsed = ref<boolean>(false)

  return { title, sidebarCollapsed }
})
