import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listNotifications,
  markAllRead as apiMarkAllRead,
  markRead as apiMarkRead,
  unreadCount as apiUnreadCount,
} from '@/api/notification'
import type { NotificationVO, NotifyPushPayload } from '@/types/notification'

/**
 * 通知 store（铃铛 + 面板状态）。
 *
 * 【事实表兜底】unreadCount 的唯一权威来源是 GET /notifications/unread-count
 * （后端 COUNT 事实表）。SSE 推送只负责「加速」：收到 NOTIFY 事件时先用
 * 推送值更新角标，latest 插顶；断网期间到达的通知在重连后由 init() 校正，
 * 不丢数（P2 验收点③）。
 */
export const useNotifyStore = defineStore('notify', () => {
  const unreadCount = ref(0)
  const items = ref<NotificationVO[]>([])
  const panelOpen = ref(false)
  const loading = ref(false)
  const loadedAll = ref(false)

  /** 游标：列表当前最小 id（倒序分页） */
  let cursor: number | undefined

  /** 登录后 / SSE 重连后调用：校正未读数 */
  async function init() {
    await refreshUnread()
  }

  async function refreshUnread() {
    try {
      unreadCount.value = await apiUnreadCount()
    } catch {
      // 网络失败不打断 header 渲染，下次推送/打开面板再试
    }
  }

  function openPanel() {
    panelOpen.value = true
    // 首条 content 为空 = SSE latest 插顶的占位项（推送不塞全文，见 onPush），
    // 打开面板时按事实表重拉，把正文补全
    const needReload = items.value.length === 0 || (items.value[0] && !items.value[0].content)
    if (needReload && !loading.value) {
      reload()
    }
  }

  function closePanel() {
    panelOpen.value = false
  }

  /** 重新加载列表（全部已读后面板要即时反映） */
  async function reload() {
    items.value = []
    cursor = undefined
    loadedAll.value = false
    await loadMore()
  }

  /** 滚动加载更多（游标分页） */
  async function loadMore() {
    if (loading.value || loadedAll.value) return
    loading.value = true
    try {
      const page = await listNotifications(cursor, 10)
      items.value.push(...page)
      if (page.length > 0) {
        cursor = page[page.length - 1].id
      }
      if (page.length < 10) {
        loadedAll.value = true
      }
    } finally {
      loading.value = false
    }
  }

  /** 单条已读（先调接口成功再动本地态，失败保留未读） */
  async function readOne(id: number) {
    try {
      await apiMarkRead(id)
    } catch {
      return false
    }
    const item = items.value.find((n) => n.id === id)
    if (item && !item.read) {
      item.read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    return true
  }

  /** 全部已读 */
  async function readAll() {
    try {
      await apiMarkAllRead()
    } catch {
      return false
    }
    items.value.forEach((n) => (n.read = true))
    unreadCount.value = 0
    return true
  }

  /**
   * SSE NOTIFY 推送处理（realtimeDispatch 调用）。
   * 未读数直接用推送值（后端落库后 COUNT 出来的，准）；
   * latest 插顶供面板即时可见——面板没开就算了，打开时按事实表拉。
   */
  function onPush(payload: NotifyPushPayload) {
    if (typeof payload.unreadCount === 'number') {
      unreadCount.value = payload.unreadCount
    }
    const latest = payload.latest
    if (latest && !items.value.some((n) => n.id === latest.id)) {
      items.value.unshift({
        id: latest.id,
        type: latest.type,
        title: latest.title,
        // 后端 latestOf 已带 content/linkUrl；插顶项也带上，
        // 未打开面板直接点历史条目时详情弹窗有正文、「查看详情」按钮不丢
        content: latest.content || '',
        // linkUrl 曾硬编码 null → 详情弹窗「查看详情」按钮对 SSE 新通知永远
        // 不显示（2026-10-20 虎哥实测"很多条只展示过一次"的根因）
        linkUrl: latest.linkUrl ?? null,
        level: 'INFO',
        bizType: null,
        bizId: null,
        read: false,
        createdAt: latest.ts,
      })
    }
  }

  return {
    unreadCount,
    items,
    panelOpen,
    loading,
    loadedAll,
    init,
    refreshUnread,
    openPanel,
    closePanel,
    reload,
    loadMore,
    readOne,
    readAll,
    onPush,
  }
})
