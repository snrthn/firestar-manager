<script setup lang="ts">
/**
 * AI 助手（云效式浮动面板）
 *
 * 交互参照阿里云效 STAROps 助手：
 *   右下角悬浮按钮 → 默认右侧抽屉（贴右边缘、占满高）；右上角「新建会话 / 最近会话下拉 / 关闭」；
 *   拖动标题栏可把抽屉拖成浮动卡片，左侧/底边/左下角可缩放，双击标题栏复位成抽屉；
 *   面板打开时入口按钮自动隐藏（避免遮挡）；空态是居中欢迎区（无背景色），有消息后切换为气泡列表 + 输入框。
 *
 * 组件分工（不重复造轮子）：
 *   - 气泡列表 / 滚动状态机 / 回底按钮 / 未读角标：vue-element-plus-x 的 BubbleList
 *   - Markdown（GFM + Shiki 高亮 + LaTeX + 流式）：x-markdown-vue（见 AiMarkdown.vue，懒加载）
 *   - 思考过程折叠：Thinking
 *   - 输入框（@ 提及 / 附件入口 / 发送态）：XSender
 *   - 业务渲染（发货单草稿卡、日期分隔等）：BubbleList 的 #item 插槽
 *
 * 自研的部分只剩「壳」——面板布局、历史会话下拉、「新建会话」与本地会话快照，
 * 因为后端还没有历史会话接口（见 persistCurrent / conversations 的注释）。
 *
 * 与旧版的兼容点：
 *   - 入口仍受 AdminLayout 的 v-has-perm="'ai:assistant:use'" 控制，父级不用改；
 *   - SSE 客户端继续复用 @/api/ai.ts#streamChat（它处理了 200+JSON 拒绝体、非 event-stream 等边界）；
 *   - 草稿确认仍走原 POST /shipment（原权限 + 原审批流），语义不变。
 *
 * 旧组件已备份为同目录 AiAssistantFab.vue.bak。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from 'vue'
import { BubbleList, Thinking, Welcome, XSender } from 'vue-element-plus-x'
import 'vue-element-plus-x/styles/index.css'
import { ChatDotRound, Check, Clock, Close, FullScreen, Loading, Menu, Plus, Rank } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { streamChat, fetchLatestDraft } from '@/api/ai'
import request from '@/api/request'
import AiMarkdown from './AiMarkdown.vue'

// ===== 数据结构 =====
interface DraftLine {
  itemId: number
  itemName: string
  specModel?: string
  unit?: string
  quantity?: number
  shippedQty?: number
  remaining?: number
  shipmentQty: number
  unitPrice?: number
  lineAmount?: number
}
interface DraftPreview {
  projectId: number
  projectNo?: string
  projectName?: string
  customerName?: string
  contractAmount?: number
  lines: DraftLine[]
  totalAmount?: number
  errors?: string[]
  warnings?: string[]
}

type ReasoningStatus = 'start' | 'thinking' | 'end' | 'error' | 'cancel'

/** 列表项：在 BubbleList 的 item 结构上挂业务字段（多余字段会被原样透传） */
interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  placement: 'start' | 'end'
  content: string
  loading?: boolean
  fallback?: boolean
  /** 思考过程（后端补 reasoning 帧后自动填充） */
  reasoning?: string
  reasoningStatus?: ReasoningStatus
  /** 非气泡节点：draft = 发货单草稿卡 */
  itemType?: 'draft'
  draft?: DraftPreview
  draftCreated?: boolean
  draftCreating?: boolean
}

interface StoredConv {
  id: string
  title: string
  time: number
  items: ChatItem[]
}

// ===== 状态 =====
const visible = ref(false)
const messages = ref<ChatItem[]>([])
const streaming = ref(false)
const listRef = ref<any>(null)
const senderRef = ref<any>(null)

const conversations = ref<StoredConv[]>([])
const activeId = ref<string | null>(null)
/** 后端会话 id（meta 帧带回），Coze 模式下流结束按会话补拉草稿 */
const remoteConvId = ref<number | null>(null)
let draftReceived = false

let controller: AbortController | null = null
/** 流式输出的节流缓冲：每 60ms 合并一次，避免每个 token 都重渲染整段 Markdown */
let pendingText = ''
let flushTimer: number | null = null
let activeItem: ChatItem | null = null

const asItem = (i: unknown) => i as ChatItem
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ===== 输入框 @ 上下文快捷插入 =====
const ctxItems = [
  { label: '@ 正在进行的项目', text: '@项目 ' },
  { label: '@ 待审批的出库单', text: '@出库单 ' },
  { label: '@ 本月应收', text: '@应收 ' },
]

// ===== 历史会话（本地快照；后端历史接口就绪后换成服务端分页，其余不用改） =====
const STORE_KEY = 'firestar_ai_local_convs_v1'

function loadConversations() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    conversations.value = raw ? (JSON.parse(raw) as StoredConv[]) : []
  } catch {
    conversations.value = []
  }
}
function saveConversations() {
  try {
    // 只留最近 20 条，避免 sessionStorage 膨胀
    sessionStorage.setItem(STORE_KEY, JSON.stringify(conversations.value.slice(0, 20)))
  } catch {
    /* 隐私模式等场景忽略 */
  }
}
loadConversations()

function titleOf(items: ChatItem[]) {
  const first = items.find((m) => m.role === 'user' && m.content.trim())
  if (!first) return '新会话'
  const t = first.content.trim().replace(/\s+/g, ' ')
  return t.length > 18 ? `${t.slice(0, 18)}…` : t
}

/** 把当前消息列表写回会话快照（发送/结束/切换/关闭时调用） */
function persistCurrent() {
  if (!activeId.value || messages.value.length === 0) return
  const idx = conversations.value.findIndex((c) => c.id === activeId.value)
  const items = JSON.parse(JSON.stringify(messages.value)) as ChatItem[]
  const title = titleOf(messages.value)
  if (idx >= 0) {
    conversations.value[idx] = { ...conversations.value[idx], title, items }
  } else {
    conversations.value.unshift({ id: activeId.value, title, time: Date.now(), items })
  }
  saveConversations()
}

function newConversation() {
  if (streaming.value) stop()
  persistCurrent()
  activeId.value = null
  remoteConvId.value = null
  messages.value = []
}

function switchTo(id: string) {
  if (id === activeId.value) return
  if (streaming.value) stop()
  persistCurrent()
  const conv = conversations.value.find((c) => c.id === id)
  if (!conv) return
  activeId.value = id
  remoteConvId.value = null
  messages.value = JSON.parse(JSON.stringify(conv.items)) as ChatItem[]
}

function dayLabel(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ===== 面板几何：三种显示模式，切换只走头部下拉菜单 =====
/**
 * 模式（对齐云效助手的「浮动 / 右侧停靠 / 全屏」菜单）：
 *   - dock：贴右边缘、占满视口高；宽度默认 600px，只允许拖左边缘调整；
 *   - float：自由卡片；拖标题栏移动，拖右下角斜向调整宽高；
 *   - fullscreen：铺满视口。
 * 关键约束：**缩放永远不改变模式**（此前"一改宽度就跳出悬浮模式"是 bug），
 * 模式只有 setMode() 一个写入点。
 */
type PanelMode = 'dock' | 'float' | 'fullscreen'

const DEFAULT_DOCK_W = 600
const MIN_W = 380
const MIN_H = 420
const FLOAT_H = 760
/** 浮动卡片上下左右与视口至少保留的可抓区域（px） */
const KEEP_X = 120
const KEEP_Y = 56

const geom = reactive({ left: 0, top: 0, width: DEFAULT_DOCK_W, height: 0 })
const mode = ref<PanelMode>('dock')

/** 模式菜单（el-popover 自绘项）：显示顺序、图标与 setMode 的取值一一对应 */
const MODES: Array<{ value: PanelMode; label: string; icon: Component }> = [
  { value: 'float', label: '浮动', icon: Rank },
  { value: 'dock', label: '右侧停靠', icon: Menu },
  { value: 'fullscreen', label: '全屏', icon: FullScreen },
]
/** 模式弹出层实例：选中后手动收起（trigger=click 的 popover 点外部才关，点菜单项不会自动关） */
const modePopRef = ref<{ hide: () => void } | null>(null)

/** 停靠模式被调过的宽度要记住，切浮动再切回来不丢 */
let lastDockW = DEFAULT_DOCK_W

/** 用 clientWidth 而不是 innerWidth：后者含纵向滚动条宽度，停靠面板会被塞到滚动条后面 */
const viewport = () => ({
  w: document.documentElement.clientWidth || window.innerWidth,
  h: document.documentElement.clientHeight || window.innerHeight,
})

/** 统一收敛到视口内，避免面板被拖/拖出屏幕 */
function clampGeom() {
  const { w, h } = viewport()
  geom.width = Math.min(Math.max(geom.width, MIN_W), Math.max(MIN_W, w - 16))
  geom.height = Math.min(Math.max(geom.height, MIN_H), Math.max(MIN_H, h))
  geom.left = Math.min(geom.left, w - KEEP_X)
  geom.left = Math.max(geom.left, KEEP_X - geom.width)
  geom.top = Math.min(geom.top, h - KEEP_Y)
  geom.top = Math.max(geom.top, 0)
  if (geom.top + geom.height > h) geom.height = Math.max(MIN_H, h - geom.top)
}

/** 模式菜单项点击：先收起弹出层再切模式 */
function pickMode(m: PanelMode) {
  const pop = modePopRef.value as { hide?: () => void } | null
  if (pop && typeof pop.hide === 'function') pop.hide()
  setMode(m)
}

/** 模式唯一写入点（下拉菜单 command / 打开面板复位） */
function setMode(m: PanelMode) {
  const { w, h } = viewport()
  mode.value = m
  if (m === 'dock') {
    geom.width = Math.min(lastDockW, Math.max(MIN_W, w - 16))
    geom.left = w - geom.width
    geom.top = 0
    geom.height = h
  } else if (m === 'fullscreen') {
    geom.left = 0
    geom.top = 0
    geom.width = w
    geom.height = h
  } else {
    // float：保持当前宽度，位置默认摆到视口正中（拖动后的位置由拖动逻辑接管）
    geom.width = Math.min(Math.max(geom.width, MIN_W), w - 16)
    geom.height = Math.min(FLOAT_H, Math.max(MIN_H, h - 96))
    geom.left = Math.max(Math.round((w - geom.width) / 2), 16)
    geom.top = Math.max(Math.round((h - geom.height) / 2), 16)
  }
}

const panelStyle = computed(() => ({
  left: `${geom.left}px`,
  top: `${geom.top}px`,
  width: `${geom.width}px`,
  height: `${geom.height}px`,
}))

// --- 拖动标题栏（仅浮动模式可移动；停靠/全屏模式下不响应，防止"拖一下就换模式"） ---
let dragFrom: { x: number; y: number; left: number; top: number } | null = null

function onDragStart(e: PointerEvent) {
  if (e.button !== 0 || mode.value !== 'float') return
  // 头部按钮/弹层触发器不参与拖动
  if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
  dragFrom = { x: e.clientX, y: e.clientY, left: geom.left, top: geom.top }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  e.preventDefault()
}
function onDragMove(e: PointerEvent) {
  if (!dragFrom) return
  geom.left = dragFrom.left + (e.clientX - dragFrom.x)
  geom.top = dragFrom.top + (e.clientY - dragFrom.y)
  clampGeom()
}
function onDragEnd() {
  dragFrom = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

// --- 缩放手柄 ---
// dock → 'l'（左边缘拖宽度，右边缘贴边不动）；float → 'br'（右下角斜向调宽高，左上角不动）
type ResizeMode = 'l' | 'br'
let resizeFrom:
  | { x: number; y: number; left: number; top: number; width: number; height: number; handle: ResizeMode }
  | null = null

function onResizeStart(e: PointerEvent, handle: ResizeMode) {
  if (e.button !== 0) return
  // 手柄只在对应模式下渲染，这里再兜一层，防止模式切换竞态
  if (handle === 'l' && mode.value !== 'dock') return
  if (handle === 'br' && mode.value !== 'float') return
  resizeFrom = {
    x: e.clientX,
    y: e.clientY,
    left: geom.left,
    top: geom.top,
    width: geom.width,
    height: geom.height,
    handle,
  }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
  e.preventDefault()
}
function onResizeMove(e: PointerEvent) {
  if (!resizeFrom) return
  const dx = e.clientX - resizeFrom.x
  const dy = e.clientY - resizeFrom.y
  if (resizeFrom.handle === 'l') {
    // 左边缘：左边界跟着走、宽度反向变化，右边缘保持贴边；宽度过小后停止跟随
    const width = Math.min(Math.max(resizeFrom.width - dx, MIN_W), viewport().w - 16)
    geom.width = width
    geom.left = resizeFrom.left + (resizeFrom.width - width)
    lastDockW = width
  } else {
    // 右下角斜向：只动宽高，左上角（left/top）锁定
    geom.width = Math.max(resizeFrom.width + dx, MIN_W)
    geom.height = Math.max(resizeFrom.height + dy, MIN_H)
  }
  clampGeom()
}
function onResizeEnd() {
  resizeFrom = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
}

function onViewportResize() {
  if (visible.value) setMode(mode.value)
}
onMounted(() => window.addEventListener('resize', onViewportResize))
onBeforeUnmount(() => {
  onDragEnd()
  onResizeEnd()
  window.removeEventListener('resize', onViewportResize)
})

// ===== 面板开关 =====
function openPanel() {
  // 每次打开都复位成右侧停靠（虎哥要求：打开必贴边，不留上次的浮动态）
  setMode('dock')
  visible.value = true
  scrollToBottom()
}
function closePanel() {
  if (streaming.value) stop()
  persistCurrent()
  visible.value = false
}

// ===== 流式输出 =====
function flushTokens() {
  flushTimer = null
  if (activeItem && pendingText) {
    activeItem.content += pendingText
    pendingText = ''
  }
}
function scheduleFlush() {
  if (flushTimer == null) flushTimer = window.setTimeout(flushTokens, 60)
}

function scrollToBottom() {
  requestAnimationFrame(() => listRef.value?.scrollToBottom?.(true))
}

function stop() {
  controller?.abort()
  controller = null
}

async function send(text: string) {
  const content = text.trim()
  if (!content || streaming.value) return
  if (!activeId.value) activeId.value = uid()

  messages.value.push({ id: uid(), role: 'user', placement: 'end', content })

  const ai = reactive<ChatItem>({
    id: uid(),
    role: 'assistant',
    placement: 'start',
    content: '',
    loading: true,
  }) as ChatItem
  messages.value.push(ai)
  activeItem = ai
  pendingText = ''
  draftReceived = false
  streaming.value = true
  controller = new AbortController()
  scrollToBottom()

  try {
    await streamChat(
      content,
      {
        onToken: (t) => {
          ai.loading = false
          // 首个有效 token 剥掉前导空白，避免气泡首行被空出一行
          pendingText += ai.content === '' && pendingText === '' ? t.replace(/^\s+/, '') : t
          scheduleFlush()
        },
        onReasoning: (t) => {
          ai.reasoning = (ai.reasoning ?? '') + t
          ai.reasoningStatus = 'thinking'
        },
        onMeta: (id) => {
          remoteConvId.value = id
        },
        onDraft: (payload) => {
          draftReceived = true
          pushDraft(payload.resultJson)
        },
        onDone: () => {
          finishStream(ai, 'end')
          // Coze 模式：SSE 流不经过草稿结果，按会话补拉一次
          if (!draftReceived && remoteConvId.value != null) {
            fetchLatestDraft(remoteConvId.value)
              .then((rj) => {
                if (rj) pushDraft(rj)
              })
              .catch(() => {
                /* 忽略拉取失败 */
              })
          }
        },
        onStopped: () => {
          if (flushTimer != null) window.clearTimeout(flushTimer)
          flushTimer = null
          flushTokens()
          ai.loading = false
          if (ai.reasoning) ai.reasoningStatus = 'cancel'
          if (!ai.content.trim()) ai.content = '（已停止生成）'
          streaming.value = false
          activeItem = null
          persistCurrent()
        },
        onError: (msg) => {
          finishStream(ai, 'error')
          ai.content = msg || '对话出错，请稍后重试。'
          ElMessage.error(msg || '对话出错')
        },
        onFallback: (mode, reason) => {
          finishStream(ai, 'error')
          ai.fallback = true
          ai.content =
            mode === 'search'
              ? 'AI 服务暂时不可用，已切换到普通搜索模式：可在对应业务页用筛选与关键字查询。'
              : `AI 服务暂时不可用（${reason || '未知原因'}），请稍后重试。`
        },
      },
      { signal: controller.signal },
    )
  } catch (e: any) {
    finishStream(ai, 'error')
    ai.content = e?.message || '对话出错，请稍后重试。'
  } finally {
    controller = null
  }
}

function finishStream(ai: ChatItem, status: ReasoningStatus) {
  if (flushTimer != null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  flushTokens()
  ai.loading = false
  if (ai.reasoning) ai.reasoningStatus = status
  streaming.value = false
  activeItem = null
  scrollToBottom()
  persistCurrent()
}

// ===== 输入框 =====
function onSubmit() {
  const mv = senderRef.value?.getModelValue?.()
  const text = (mv?.text ?? '').trim()
  if (!text || streaming.value) return
  senderRef.value?.clear?.()
  void send(text)
}

function insertCtx(text: string) {
  const cur = senderRef.value?.getModelValue?.()?.text ?? ''
  const sep = cur && !cur.endsWith(' ') ? ' ' : ''
  senderRef.value?.setText?.(`${cur}${sep}${text}`)
}

// ===== 草稿卡（#item 插槽渲染，挂在时间线对应位置，回放历史也正确） =====
function pushDraft(resultJson: string) {
  let data: DraftPreview | null = null
  try {
    data = JSON.parse(resultJson) as DraftPreview
  } catch {
    data = null
  }
  if (!data) return
  // 同一会话重复推送时只保留最新一张未确认的卡
  const exists = messages.value.find((m) => m.itemType === 'draft' && !m.draftCreated)
  if (exists) exists.draft = data
  else
    messages.value.push({
      id: uid(),
      role: 'assistant',
      placement: 'start',
      content: '',
      itemType: 'draft',
      draft: data,
    })
  scrollToBottom()
}

async function confirmDraft(item: ChatItem) {
  const d = item.draft
  if (!d || item.draftCreating || item.draftCreated) return
  item.draftCreating = true
  try {
    const res = await request.post('/shipment', {
      projectId: d.projectId,
      lines: (d.lines || []).map((l) => ({ itemId: l.itemId, shipmentQty: l.shipmentQty })),
    })
    const id = res?.data?.data
    item.draftCreated = true
    ElMessage.success(`已生成发货单草稿（ID ${id}），请到发货管理页提交审批`)
    persistCurrent()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败，请检查权限或数据')
  } finally {
    item.draftCreating = false
  }
}

const reasoningActive = computed(() => messages.value.some((m) => m.reasoningStatus === 'thinking'))
</script>

<template>
  <!-- 吸边入口：默认贴右边缘只露图标触发区，鼠标划过滑出；面板打开时隐藏 -->
  <Transition name="ai-fab">
    <div v-if="!visible" class="ai-dock" title="AI 助手" @click="openPanel">
      <el-icon :size="22" class="ai-dock__icon"><ChatDotRound /></el-icon>
      <span class="ai-dock__label">AI 助手</span>
    </div>
  </Transition>

  <Teleport to="body">
    <Transition name="ai-pop">
      <section
        v-if="visible"
        class="ai-panel"
        :class="`is-${mode}`"
        :style="panelStyle"
        role="dialog"
        aria-label="AI 助手"
      >
        <!-- 头部：标题 + 新建 / 显示模式 / 最近会话 / 关闭（云效式按钮组） -->
        <header
          class="ai-hd"
          :class="{ 'is-draggable': mode === 'float' }"
          @pointerdown="onDragStart"
        >
          <div class="ai-hd__brand">
            <span class="ai-hd__logo">AI</span>
            <span class="ai-hd__title">火星 AI 助手</span>
            <span v-if="streaming && reasoningActive" class="ai-hd__badge">思考中</span>
          </div>
          <div class="ai-hd__tools">
            <el-tooltip content="新建会话" placement="bottom" :show-after="400">
              <button class="ai-icon-btn" type="button" @click="newConversation">
                <el-icon :size="17"><Plus /></el-icon>
              </button>
            </el-tooltip>
            <el-popover placement="bottom-end" :width="320" trigger="click" popper-class="ai-hist-pop">
              <template #reference>
                <button class="ai-icon-btn" type="button" title="最近会话">
                  <el-icon :size="17"><Clock /></el-icon>
                </button>
              </template>
              <div class="ai-hist">
                <div class="ai-hist__hd">最近会话</div>
                <div v-if="!conversations.length" class="ai-hist__empty">暂无历史会话</div>
                <button
                  v-for="c in conversations"
                  :key="c.id"
                  type="button"
                  class="ai-hist__item"
                  :class="{ 'is-active': c.id === activeId }"
                  @click="switchTo(c.id)"
                >
                  <span class="ai-hist__label">{{ c.title }}</span>
                  <span class="ai-hist__time">{{ dayLabel(c.time) }}</span>
                </button>
              </div>
            </el-popover>
            <!-- 显示模式：历史图标右侧的弹出菜单（云效同位置），是切换浮动/停靠/全屏的唯一入口。
                 用 el-popover 而非 el-dropdown：dropdown 的 popper 链路在本面板（Teleport+Transition）
                 里点击无响应（样式/渲染正常但菜单不弹，实测），popover 与历史会话同款、同链路实测可用；
                 且 el-dropdown 不存在 #reference 插槽，菜单写默认插槽会绕过 roving provider 直接炸。 -->
            <el-popover
              ref="modePopRef"
              placement="bottom-end"
              :width="150"
              trigger="click"
              popper-class="ai-mode-pop"
            >
              <template #reference>
                <button class="ai-icon-btn" type="button" title="显示模式">
                  <el-icon :size="17"><Menu /></el-icon>
                </button>
              </template>
              <div class="ai-mode-menu">
                <button
                  v-for="m in MODES"
                  :key="m.value"
                  type="button"
                  class="ai-mode-item"
                  :class="{ 'is-current': mode === m.value }"
                  @click="pickMode(m.value)"
                >
                  <el-icon :size="15"><component :is="m.icon" /></el-icon>
                  <span>{{ m.label }}</span>
                  <el-icon v-if="mode === m.value" class="ai-mode-check" :size="14"><Check /></el-icon>
                </button>
              </div>
            </el-popover>
            <el-tooltip content="关闭" placement="bottom" :show-after="400">
              <button class="ai-icon-btn" type="button" @click="closePanel">
                <el-icon :size="17"><Close /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </header>

        <!-- 主体：空态欢迎区 / 消息气泡列表 -->
        <div class="ai-body">
          <div v-if="!messages.length" class="ai-empty">
            <Welcome
              variant="borderless"
              title="嗨，我是火星 AI 助手"
              description="关于项目、出库、退货、应收与财务口径，随时问我。回答基于你的账号权限读取数据，敏感字段已脱敏。"
            />
          </div>

          <BubbleList
            v-else
            ref="listRef"
            :list="messages"
            :virtual="false"
            max-height="100%"
            :show-back-button="true"
            item-type="itemType"
            class="ai-list"
          >
            <template #content="{ item }">
              <div v-if="asItem(item).role === 'user'" class="ai-user-text">{{ asItem(item).content }}</div>
              <AiMarkdown v-else :content="asItem(item).content" />
            </template>

            <template #header="{ item }">
              <Thinking
                v-if="asItem(item).reasoning"
                :content="asItem(item).reasoning"
                :status="asItem(item).reasoningStatus || 'end'"
                auto-collapse
                max-width="100%"
                class="ai-think"
              />
            </template>

            <template #loading>
              <span class="ai-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
                正在思考…
              </span>
            </template>

            <template #item="{ item }">
              <div v-if="asItem(item).itemType === 'draft' && asItem(item).draft" class="ai-draft">
                <div class="ai-draft__hd">
                  <span class="ai-draft__title">发货单草稿（待确认）</span>
                  <el-tag v-if="asItem(item).draftCreated" size="small" type="success">已创建</el-tag>
                </div>
                <div class="ai-draft__proj">
                  {{ asItem(item).draft!.projectName || '—' }}
                  <span class="ai-draft__sub">（{{ asItem(item).draft!.projectNo || '—' }}）</span>
                  <span class="ai-draft__sub"> · 客户：{{ asItem(item).draft!.customerName || '—' }}</span>
                </div>
                <table v-if="asItem(item).draft!.lines?.length" class="ai-draft__table">
                  <thead>
                    <tr>
                      <th>货物</th>
                      <th>规格</th>
                      <th>数量</th>
                      <th>单价</th>
                      <th>金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(l, li) in asItem(item).draft!.lines" :key="li">
                      <td>{{ l.itemName }}</td>
                      <td>{{ l.specModel || '—' }}</td>
                      <td>{{ l.shipmentQty }} {{ l.unit || '' }}</td>
                      <td>{{ l.unitPrice != null ? l.unitPrice : '—' }}</td>
                      <td>{{ l.lineAmount != null ? l.lineAmount : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
                <div class="ai-draft__total">
                  合计：{{ asItem(item).draft!.totalAmount != null ? asItem(item).draft!.totalAmount : '—' }}
                </div>
                <div v-if="asItem(item).draft!.errors?.length" class="ai-draft__err">
                  <div v-for="(e, ei) in asItem(item).draft!.errors" :key="'e' + ei">{{ e }}</div>
                </div>
                <div v-if="asItem(item).draft!.warnings?.length" class="ai-draft__warn">
                  <div v-for="(w, wi) in asItem(item).draft!.warnings" :key="'w' + wi">{{ w }}</div>
                </div>
                <div class="ai-draft__actions">
                  <el-button
                    type="primary"
                    size="small"
                    :loading="!!asItem(item).draftCreating"
                    :disabled="!!asItem(item).draftCreated || !!asItem(item).draft!.errors?.length"
                    @click="confirmDraft(asItem(item))"
                  >
                    确认创建（存草稿）
                  </el-button>
                </div>
              </div>
            </template>
          </BubbleList>
        </div>

        <!-- 底部：停止生成 + 输入框 -->
        <footer class="ai-ft">
          <div v-if="streaming" class="ai-stop">
            <el-button text size="small" @click="stop">停止生成</el-button>
          </div>
          <XSender
            ref="senderRef"
            placeholder="输入你的问题或分析诉求，可输入 @ 添加上下文"
            :loading="streaming"
            :max-length="4000"
            @submit="onSubmit"
          >
            <template #prefix>
              <el-popover placement="top-start" :width="220" trigger="click" popper-class="ai-ctx-pop">
                <template #reference>
                  <button class="ai-at" type="button" title="添加上下文">@</button>
                </template>
                <div class="ai-ctx">
                  <div class="ai-ctx__hd">添加上下文</div>
                  <button
                    v-for="c in ctxItems"
                    :key="c.text"
                    type="button"
                    class="ai-ctx__item"
                    @click="insertCtx(c.text)"
                  >
                    {{ c.label }}
                  </button>
                </div>
              </el-popover>
            </template>
          </XSender>
          <div class="ai-note">回答由 AI 生成，仅供参考；数据读取已按你的权限过滤。</div>
        </footer>

        <!-- 缩放手柄：停靠模式拖左边缘改宽度；浮动模式拖右下角斜向改宽高（都不切换模式） -->
        <div v-if="mode === 'dock'" class="ai-rs ai-rs--l" @pointerdown="onResizeStart($event, 'l')" />
        <div v-if="mode === 'float'" class="ai-rs ai-rs--br" @pointerdown="onResizeStart($event, 'br')" />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ===== 吸边入口（沿用原交互：贴右边缘只露图标，划过滑出；面板打开时隐藏） ===== */
.ai-dock {
  position: fixed;
  right: 0;
  bottom: 32px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border: none;
  border-radius: 999px 0 0 999px;
  background: linear-gradient(135deg, #409eff, #6a5acd);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: -4px 4px 16px rgba(64, 158, 255, 0.35);
  transform: translateX(calc(100% - 40px));
  transition: transform 0.22s ease;
}
.ai-dock:hover {
  transform: translateX(0);
}
.ai-dock__icon {
  display: inline-flex;
  flex: none;
}
.ai-dock__label {
  line-height: 1;
}

/* ===== 面板：三种显示模式，几何全部来自 inline style ===== */
.ai-panel {
  position: fixed;
  z-index: 2100;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}
.ai-panel.is-dock {
  border-left: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 0;
  box-shadow: -10px 0 34px rgba(0, 0, 0, 0.1);
}
.ai-panel.is-float {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
}
.ai-panel.is-full {
  border-radius: 0;
  box-shadow: none;
}

/* 缩放手柄：透明热区，hover 时给出可拉拽提示 */
.ai-rs {
  position: absolute;
  z-index: 2;
  touch-action: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.ai-rs:hover {
  opacity: 1;
}
/* 停靠模式：左边缘拖宽度（右边缘贴边锁定） */
.ai-rs--l {
  top: 0;
  left: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.55), transparent);
}
/* 浮动模式：右下角斜向调宽高 */
.ai-rs--br {
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  border-bottom-right-radius: 14px;
  background: rgba(64, 158, 255, 0.6);
}

.ai-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  height: 52px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  touch-action: none;
  user-select: none;
}
/* 只有浮动模式的标题栏才可拖动移动 */
.ai-hd.is-draggable {
  cursor: move;
}
.ai-hd__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ai-hd__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: linear-gradient(135deg, #409eff, #6a5acd);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.ai-hd__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.ai-hd__badge {
  padding: 1px 7px;
  border-radius: 999px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 11px;
}
.ai-hd__tools {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #606266;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.ai-icon-btn:hover {
  background: #f2f3f5;
  color: #409eff;
}

.ai-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  overflow: hidden;
}
.ai-list {
  flex: 1;
  min-height: 0;
  /* 第一条消息不贴顶：这个 padding 在 BubbleList 滚动容器之外，滚到哪里都保持间距 */
  padding-top: 12px;
}

/* ===== 空态欢迎区（云效式：纯文字居中，无背景色/无卡片/无快捷提问） ===== */
.ai-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 28px 36px;
}
/* Welcome 组件的 borderless 变体自带 #e6f4ff 底色与横向 flex，这里全部拉平。
   选择器刻意带上 .elx-welcome--borderless 提高优先级（库样式与组件样式同为 3 级时
   只靠加载顺序取胜，换个构建分块就可能翻车），不依赖 CSS 注入次序。 */
.ai-empty :deep(.elx-welcome.elx-welcome--borderless),
.ai-empty :deep(.elx-welcome) {
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: center;
}
.ai-empty :deep(.elx-welcome__content) {
  flex: none;
  align-items: center;
  gap: 12px;
}
.ai-empty :deep(.elx-welcome__header) {
  justify-content: center;
}
.ai-empty :deep(.elx-welcome__title),
.ai-empty :deep(.x-welcome__title) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: #303133;
}
.ai-empty :deep(.elx-welcome__description),
.ai-empty :deep(.x-welcome__description) {
  max-width: 360px;
  margin: 0 auto;
  font-size: 13px;
  line-height: 1.8;
  color: #909399;
}

/* ===== 消息 ===== */
.ai-user-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.7;
}
.ai-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 13px;
}
.ai-think {
  margin-bottom: 6px;
}

/* ===== 草稿卡（#item 插槽） ===== */
.ai-draft {
  margin: 6px 0 12px;
  padding: 12px;
  border: 1px solid #b3d8ff;
  border-radius: 10px;
  background: #f5f9ff;
  font-size: 13px;
  color: #303133;
}
.ai-draft__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.ai-draft__title {
  font-weight: 600;
  color: #409eff;
}
.ai-draft__proj {
  margin-bottom: 8px;
  line-height: 1.6;
}
.ai-draft__sub {
  color: #909399;
}
.ai-draft__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ai-draft__table th,
.ai-draft__table td {
  border: 1px solid #ebeef5;
  padding: 4px 6px;
  text-align: left;
}
.ai-draft__table th {
  background: #ecf5ff;
  color: #606266;
}
.ai-draft__total {
  margin-top: 8px;
  text-align: right;
  font-weight: 600;
}
.ai-draft__err,
.ai-draft__warn {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  line-height: 1.6;
}
.ai-draft__err {
  background: #fef0f0;
  color: #f56c6c;
}
.ai-draft__warn {
  background: #fdf6ec;
  color: #e6a23c;
}
.ai-draft__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

/* ===== 底部 ===== */
.ai-ft {
  flex: none;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.ai-stop {
  display: flex;
  justify-content: center;
  padding-bottom: 4px;
}
.ai-at {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #606266;
  font-size: 15px;
  cursor: pointer;
}
.ai-at:hover {
  background: #f2f3f5;
  color: #409eff;
}
.ai-note {
  margin-top: 6px;
  font-size: 11px;
  color: #c0c4cc;
  text-align: center;
}

/* ===== 展开/收起动画 ===== */
.ai-pop-enter-active,
.ai-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.ai-pop-enter-from,
.ai-pop-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
}
/* 入口按钮随面板开合淡出/淡入 */
.ai-fab-enter-active,
.ai-fab-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.ai-fab-enter-from,
.ai-fab-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>

<style>
/* 非 scoped：el-popover 的内容挂在 body 下，scoped 选择器命中不到 */
.ai-hist {
  max-height: 340px;
  overflow: auto;
}
.ai-hist__hd {
  padding: 2px 4px 8px;
  color: #909399;
  font-size: 12px;
}
.ai-hist__empty {
  padding: 16px 4px;
  color: #c0c4cc;
  font-size: 12px;
  text-align: center;
}
.ai-hist__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #303133;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ai-hist__item:hover {
  background: #f5f7fa;
}
.ai-hist__item.is-active {
  background: #ecf5ff;
  color: #409eff;
}
.ai-hist__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-hist__time {
  flex: none;
  color: #c0c4cc;
  font-size: 12px;
}
.ai-ctx__hd {
  padding: 2px 4px 6px;
  color: #909399;
  font-size: 12px;
}
.ai-ctx__item {
  display: block;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #303133;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ai-ctx__item:hover {
  background: #f5f7fa;
  color: #409eff;
}

/* 弹层（挂在 body 下）：面板 z-index=2100，而 EP popper 的 z-index 从 2000 起自增，
   默认会被压在面板底下 → 菜单「弹开了但看不见」，表现为点击没反应。
   样式表 !important 可以覆盖 EP 写在 popper 上的内联 z-index，拉到面板之上。
   注意 popper 内容不在组件作用域内，规则必须放非 scoped 块 */
.ai-mode-pop,
.ai-hist-pop {
  z-index: 2200 !important;
}

/* 模式切换弹出菜单：当前模式高亮 + 右侧勾，对齐云效菜单样式 */
.ai-mode-pop {
  padding: 6px !important; /* 覆盖 popover 默认 12px，让菜单项更紧凑 */
}
.ai-mode-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-mode-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #606266;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ai-mode-item:hover {
  background: #f5f7fa;
  color: #409eff;
}
.ai-mode-item span {
  flex: 1;
  text-align: left;
}
.ai-mode-item.is-current {
  background: #ecf5ff;
  color: #409eff;
}
.ai-mode-item .ai-mode-check {
  margin-left: auto;
  color: #409eff;
}
</style>
