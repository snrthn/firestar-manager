import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * 多页签（Tabs）状态。AdminLayout 监听路由变化自动 add，
 * 内容区顶部渲染页签条，点击切换、× 关闭。
 */
export interface TabItem {
  /**
   * 完整路径（path?query）——页签唯一键，跳转/关闭/激活/去重全用它。
   * 修复（虎哥 2026-10-15 实测）：此前只存 route.path，带 query 的页面
   * （全系统唯一用例 /system/dict-data?typeCode=X）切走再切回时
   * go(t.path) 丢 query，页面读到空 typeCode 显示「未知类型」；
   * 且同 path 不同 query 会被合并成一个页签互相顶掉。
   * 按 fullPath 做身份一并解决（RuoYi/vue-element-admin 同款语义）。
   */
  fullPath: string
  path: string
  title: string
  name?: string | symbol | null
}

/** 固定页签（affix）：工作台常驻不可关闭，参考 RuoYi TagsView 的 affix 语义。
 *  工作台无 query，fullPath 与 path 同值，各比较场景按需取用。 */
export const AFFIX_TAB_PATH = '/dashboard'
// 播种用标题：与 router/index.ts 的 menuPages 种子表对齐（静态表，不随后端菜单名变动）
const AFFIX_TAB_TITLE = '工作台'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const active = ref('')

  // 固定页签钉位不变式：affix 永远在数组左一（= 页签条最左），不在集合里则补种。
  // 对应 RuoYi addAffixView 的 unshift 语义：普通页签 push 追加，affix 只能钉头部；
  // 且 delOthers/delLeft/delRight/delAll 全部对 affix 豁免（RuoYi-Vue3 tagsView.js 实锤）。
  // 修复前只做了「不可关闭」没钉位：刷新落在深页时当前页先入栈，之后再点开
  // 工作台 → push 追加到中后部（虎哥 2026-10-15 实测「老往中间跑」）。
  function pinAffix() {
    const idx = tabs.value.findIndex((t) => t.path === AFFIX_TAB_PATH)
    if (idx > 0) {
      const [affix] = tabs.value.splice(idx, 1)
      tabs.value.unshift(affix)
    } else if (idx === -1) {
      tabs.value.unshift({
        fullPath: AFFIX_TAB_PATH,
        path: AFFIX_TAB_PATH,
        title: AFFIX_TAB_TITLE,
        name: 'dashboard',
      })
    }
  }

  function add(route: RouteLocationNormalizedLoaded) {
    // fullPath 兜底 path：正常路由fullPath 必非空，防御性写法防脏数据
    const fullPath = route.fullPath || route.path
    if (!fullPath) return
    if (!tabs.value.some((t) => t.fullPath === fullPath)) {
      const title =
        (route.meta?.title as string) ||
        (typeof route.name === 'string' ? route.name : '') ||
        route.path
      // RuoYi 语义分流：固定页签 unshift 钉左一，其余 push 追加。
      // affix 的 fullPath 归一为 AFFIX_TAB_PATH（无 query），避免 ?a=1 之类
      // 参数把工作台页签顶成非 affix 身份。
      if (route.path === AFFIX_TAB_PATH) {
        tabs.value.unshift({
          fullPath: AFFIX_TAB_PATH,
          path: AFFIX_TAB_PATH,
          title,
          name: route.name,
        })
      } else {
        tabs.value.push({ fullPath, path: route.path, title, name: route.name })
      }
    }
    // 每次入栈后兜底钉位：刷新后首个 add 的往往是深页（当前页先于工作台入栈），
    // 此时把工作台补种到左一——等价于 RuoYi「affix 启动即播种」的语义。
    pinAffix()
    active.value = fullPath
  }

  function close(fullPath: string) {
    // 固定页签拒绝关闭（工作台常驻）
    if (fullPath === AFFIX_TAB_PATH) return
    const idx = tabs.value.findIndex((t) => t.fullPath === fullPath)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    // 关闭的是当前页签 → 激活相邻页签（优先右侧，否则左侧）
    if (active.value === fullPath) {
      const next = tabs.value[idx] || tabs.value[idx - 1]
      active.value = next ? next.fullPath : ''
    }
  }

  function closeOthers(fullPath: string) {
    tabs.value = tabs.value.filter((t) => t.fullPath === fullPath || t.path === AFFIX_TAB_PATH)
    pinAffix() // filter 只做保留不保序，affix 可能已不在左一，钉回去
    active.value = fullPath
  }

  function closeLeft(fullPath: string) {
    const idx = tabs.value.findIndex((t) => t.fullPath === fullPath)
    if (idx <= 0) return
    tabs.value = tabs.value.slice(idx)
    pinAffix() // slice 可能把 affix 切掉 → 补种回左一（RuoYi delLeftTags 同款豁免）
    if (!tabs.value.some((t) => t.fullPath === active.value)) active.value = fullPath
  }

  function closeRight(fullPath: string) {
    const idx = tabs.value.findIndex((t) => t.fullPath === fullPath)
    if (idx < 0 || idx >= tabs.value.length - 1) return
    tabs.value = tabs.value.slice(0, idx + 1)
    pinAffix()
    if (!tabs.value.some((t) => t.fullPath === active.value)) active.value = fullPath
  }

  function closeAll() {
    // 关闭全部仅保留工作台，激活态归工作台（affix 常驻，不产生空页签条）
    tabs.value = tabs.value.filter((t) => t.path === AFFIX_TAB_PATH)
    active.value = AFFIX_TAB_PATH
  }

  return { tabs, active, add, close, closeOthers, closeLeft, closeRight, closeAll }
})
