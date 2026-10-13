import { ref } from 'vue'

/**
 * 响应式断点（B 端中后台通用事实标准，对齐 Ant Design / Bootstrap 4）。
 *   xs <576 · sm ≥576 · md ≥768 · lg ≥992 · xl ≥1200 · xxl ≥1600
 * 关键决策阈值见下：<992 侧栏转抽屉，≥992 侧栏固定展开。
 *
 * 设计为「模块级单例」：所有调用方共享同一份响应式状态，
 * resize 监听器只挂一次（组件卸载不移除，随应用生命周期存在）。
 */

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'

/** 侧栏固定展开 / 抽屉化 的分界（笔记本 1366 为基准设计宽度） */
export const SIDEBAR_DRAWER_MAX = 992

function compute(w: number): Breakpoint {
  if (w >= 1600) return 'xxl'
  if (w >= 1200) return 'xl'
  if (w >= SIDEBAR_DRAWER_MAX) return 'lg'
  if (w >= 768) return 'md'
  if (w >= 576) return 'sm'
  return 'xs'
}

const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1920)
const current = ref<Breakpoint>(compute(width.value))
const isCompact = ref(width.value < SIDEBAR_DRAWER_MAX)

let bound = false
function onResize() {
  width.value = window.innerWidth
  current.value = compute(width.value)
  isCompact.value = width.value < SIDEBAR_DRAWER_MAX
}

export function useBreakpoint() {
  if (!bound && typeof window !== 'undefined') {
    window.addEventListener('resize', onResize)
    bound = true
  }
  return { width, current, isCompact }
}
