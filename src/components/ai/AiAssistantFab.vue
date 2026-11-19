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
 *   - 思考过程折叠：AiThinking（自研，DeepSeek R1 式流光标签 + 用时 + 自动折叠）
 *   - 输入框（@ 提及 / 附件入口 / 发送态）：XSender
 *   - 业务渲染（发货单草稿卡、日期分隔等）：BubbleList 的 #item 插槽
 *
 * 自研的部分只剩「壳」——面板布局、历史会话下拉（服务端分页 + 接口不可达时降级本地快照）、
 * 「新建会话」与多轮续聊（请求体带 conversationId，后端回灌最近 20 条 user/assistant 历史）。
 *
 * 与旧版的兼容点：
 *   - 入口仍受 AdminLayout 的 v-has-perm="'ai:assistant:use'" 控制，父级不用改；
 *   - SSE 客户端继续复用 @/api/ai.ts#streamChat（它处理了 200+JSON 拒绝体、非 event-stream 等边界）；
 *   - 草稿确认仍走原 POST /shipment（原权限 + 原审批流），语义不变。
 *
 * 旧组件已备份为同目录 AiAssistantFab.vue.bak。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from 'vue'
import { BubbleList, Welcome, XSender } from 'vue-element-plus-x'
import AiThinking from './AiThinking.vue'
import 'vue-element-plus-x/styles/index.css'
import { ChatDotRound, Check, Clock, Close, CopyDocument, Download, FullScreen, Loading, Menu, Plus, Rank, Tickets } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { streamChat, fetchLatestDraft, listConversations, getConversationMessages, deleteConversation, rateMessage, type ConversationSummary } from '@/api/ai'
import request from '@/api/request'
import AiMarkdown from './AiMarkdown.vue'
import AiDraftCard from './AiDraftCard.vue'
import type { DraftPreview } from './AiDraftCard.vue'
import { cleanAiMarkdown } from '@/utils/aiMarkdown'

// ===== 数据结构 =====

type ReasoningStatus = 'start' | 'thinking' | 'end' | 'error' | 'cancel'

/** 列表项：在 BubbleList 的 item 结构上挂业务字段（多余字段会被原样透传） */
interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  placement: 'start' | 'end'
  content: string
  loading?: boolean
  fallback?: boolean
  /** 思考过程（后端 reasoning 帧独立通道下发，Thinking 组件展示） */
  reasoning?: string
  reasoningStatus?: ReasoningStatus
  /** 非气泡节点：draft = 发货单草稿卡（AiDraftCard，业务自定义渲染注册项之一） */
  itemType?: 'draft'
  draft?: DraftPreview
  draftCreated?: boolean
  draftCreating?: boolean
  /** 历史回放：业务卡只读（禁确认按钮，防重复创建） */
  history?: boolean
  /** 传给 Bubble 的 noStyle：assistant 回复无气泡背景/padding（云效式平铺，用户消息保留气泡） */
  noStyle?: boolean
  /** 服务端消息 id：流式回答由 message_id 帧带回，历史回放由详情带回；赞踩接口要用 */
  messageId?: number
  /** 本次请求 ID（meta 帧 / 历史详情），供「复制请求ID」排障 */
  requestId?: string | null
  /** 当前用户对该回答的反馈：LIKE / DISLIKE / null（回放时回显按钮态） */
  myFeedback?: 'LIKE' | 'DISLIKE' | null
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
/** 当前打开的服务端会话 id：非空时发送请求带 conversationId（续聊 / 多轮上下文） */
const activeConvId = ref<number | null>(null)
let draftReceived = false
/** 本轮流是否新开会话：只有新会话的流结束后才按会话补拉草稿（续聊补拉会把旧草稿再插一张卡） */
let streamIsNewConv = false

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

// ===== 历史会话（服务端持久化优先，接口不可达时降级本地快照） =====
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

const HIST_PAGE_SIZE = 20
/** 服务端历史（histFailed=false 时展示这份） */
const serverConvs = ref<ConversationSummary[]>([])
const serverTotal = ref(0)
const histPage = ref(1)
const histLoading = ref(false)
/** 服务端历史接口不可达 → 降级本地快照（同一浏览器内可回放） */
const histFailed = ref(false)

async function fetchHistoryPage(page: number) {
  histLoading.value = true
  try {
    const p = await listConversations(page, HIST_PAGE_SIZE)
    if (page === 1) serverConvs.value = p.records
    else serverConvs.value = serverConvs.value.concat(p.records)
    serverTotal.value = p.total
    histPage.value = page
    histFailed.value = false
  } catch {
    // 接口不可达 / 未登录旧版本等：降级本地快照
    histFailed.value = true
    loadConversations()
  } finally {
    histLoading.value = false
  }
}
/** popover 打开时拉第一页（每次打开都刷新，保证新会话及时出现） */
function onHistShow() {
  serverConvs.value = []
  serverTotal.value = 0
  histPage.value = 1
  void fetchHistoryPage(1)
}
const histHasMore = computed(() => !histFailed.value && serverConvs.value.length < serverTotal.value)

/** 点开服务端历史会话：拉消息 → 构造回放时间线 */
async function switchToServer(conv: ConversationSummary) {
  if (streaming.value) stop()
  histLoading.value = true
  let msgs: Awaited<ReturnType<typeof getConversationMessages>> = []
  try {
    msgs = await getConversationMessages(conv.id)
  } catch {
    ElMessage.error('历史会话拉取失败，请稍后重试')
    histLoading.value = false
    return
  }
  histLoading.value = false
  persistCurrent()
  const items: ChatItem[] = []
  for (const m of msgs) {
    if (m.role === 'user' && m.content) {
      items.push({ id: `srv${m.id}`, role: 'user', placement: 'end', content: m.content })
    } else if (m.role === 'assistant' && m.content) {
      items.push({
        id: `srv${m.id}`,
        role: 'assistant',
        placement: 'start',
        content: m.content,
        noStyle: true,
        // 思考过程回放（V216 落库）：AiThinking 直接折叠展示（end 状态不显示用时）
        reasoning: m.reasoningText || undefined,
        reasoningStatus: 'end',
        // V217：请求 ID / 赞踩状态随历史一起回放，操作栏在历史会话里同样可用
        messageId: m.id,
        requestId: m.requestId ?? null,
        myFeedback: m.myFeedback === 'LIKE' || m.myFeedback === 'DISLIKE' ? m.myFeedback : null,
      })
    } else if (m.role === 'tool' && m.toolName && m.content) {
      // 业务自定义渲染回放：draft_* 工具结果 JSON → 对应业务卡（历史卡只读，防重复创建）
      if (m.toolName === 'draft_shipment_create') {
        try {
          items.push({
            id: `srv${m.id}`,
            role: 'assistant',
            placement: 'start',
            content: '',
            itemType: 'draft',
            draft: JSON.parse(m.content) as DraftPreview,
            history: true,
            noStyle: true,
          })
        } catch {
          /* 脏数据跳过，不阻断回放 */
        }
      }
    }
  }
  activeId.value = `srv-${conv.id}`
  // 续聊两件套：下次发送带 conversationId（多轮上下文）；流结束补拉草稿也定位到本会话
  activeConvId.value = conv.id
  remoteConvId.value = conv.id
  messages.value = items
  scrollToBottom()
}

async function removeServerConv(conv: ConversationSummary) {
  try {
    await deleteConversation(conv.id)
  } catch {
    ElMessage.error('删除失败，请稍后重试')
    return
  }
  serverConvs.value = serverConvs.value.filter((c) => c.id !== conv.id)
  serverTotal.value = Math.max(0, serverTotal.value - 1)
  if (activeConvId.value === conv.id) {
    activeConvId.value = null
    remoteConvId.value = null
    activeId.value = null
    messages.value = []
  }
  ElMessage.success('会话已删除')
}

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
  activeConvId.value = null
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
    noStyle: true,
  }) as ChatItem
  messages.value.push(ai)
  activeItem = ai
  pendingText = ''
  draftReceived = false
  // 本轮是否新开会话：决定了流结束后要不要按会话补拉草稿（续聊补拉会把旧草稿重复插卡）
  streamIsNewConv = activeConvId.value == null
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
          // 新会话首轮拿到服务端 id 后，本轮后续发送自动变为续聊（多轮上下文）
          if (activeConvId.value == null) activeConvId.value = id
        },
        onRequestId: (rid) => {
          if (rid) ai.requestId = rid
        },
        onMessageId: (id) => {
          ai.messageId = id
        },
        onDraft: (payload) => {
          draftReceived = true
          pushDraft(payload.resultJson)
        },
        onDone: () => {
          finishStream(ai, 'end')
          // Coze 模式：SSE 流不经过草稿结果，且仅新开会话的流结束后补拉一次
          if (!draftReceived && streamIsNewConv && remoteConvId.value != null) {
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
      { signal: controller.signal, conversationId: activeConvId.value ?? undefined },
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
      noStyle: true,
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

// ===== 回答操作栏（云效式：赞 / 踩 / 复制请求ID / 复制回答 / 下载 .md）=====
/** 只对「已落库的正经回答」显示操作栏；用户气泡 / 加载中 / 草稿卡 / 空回答都不显示 */
function showActions(item: ChatItem): boolean {
  return item.role === 'assistant' && !item.loading && !item.itemType && !!item.content.trim()
}

/** BubbleList 槽可能传副本，统一回 messages.value 里找原对象再改，保证持久化与回显一致 */
function messageOf(item: ChatItem): ChatItem | undefined {
  return messages.value.find((m) => m.id === item.id)
}

async function copyText(text: string, label: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // 非 HTTPS / 老浏览器兜底：临时 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand?.('copy') ?? false
      ta.remove()
      if (!ok) throw new Error('execCommand copy failed')
    }
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error(`${label}复制失败，请手动选择文本`)
  }
}

/** 同类型再点一次即取消（后端约定空串取消） */
async function rateAnswer(item: ChatItem, type: 'LIKE' | 'DISLIKE') {
  const m = messageOf(item) ?? item
  if (!m.messageId) {
    ElMessage.warning('该回答暂无反馈通道（历史旧数据）')
    return
  }
  const next = m.myFeedback === type ? '' : type
  try {
    await rateMessage(m.messageId, next)
    m.myFeedback = next || null
    if (item !== m) item.myFeedback = next || null
    ElMessage.success(next ? (type === 'LIKE' ? '已点赞' : '已点踩') : '已取消反馈')
  } catch (e: any) {
    ElMessage.error(e?.message || '反馈提交失败')
  }
}

function copyRequestId(item: ChatItem) {
  const rid = (messageOf(item) ?? item).requestId
  if (!rid) {
    ElMessage.warning('该回答暂无请求 ID（历史旧数据）')
    return
  }
  void copyText(rid, '请求 ID')
}

function copyAnswer(item: ChatItem) {
  const raw = (messageOf(item) ?? item).content ?? ''
  const text = cleanAiMarkdown(raw)
  if (!text.trim()) {
    ElMessage.warning('暂无可复制的回答')
    return
  }
  void copyText(text, '回答')
}

function downloadAnswer(item: ChatItem) {
  const m = messageOf(item) ?? item
  const text = cleanAiMarkdown(m.content ?? '')
  if (!text.trim()) {
    ElMessage.warning('暂无可下载的回答')
    return
  }
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-answer-${m.messageId ?? m.id}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
            <el-popover placement="bottom-end" :width="340" trigger="click" popper-class="ai-hist-pop" @show="onHistShow">
              <template #reference>
                <button class="ai-icon-btn" type="button" title="最近会话">
                  <el-icon :size="17"><Clock /></el-icon>
                </button>
              </template>
              <div class="ai-hist">
                <div class="ai-hist__hd">最近会话</div>
                <div v-if="histLoading && !serverConvs.length && !histFailed" class="ai-hist__empty">加载中…</div>
                <!-- 服务端历史（接口不可达时自动降级本地快照） -->
                <template v-if="!histFailed">
                  <div v-if="!histLoading && !serverConvs.length" class="ai-hist__empty">暂无历史会话</div>
                  <button
                    v-for="c in serverConvs"
                    :key="c.id"
                    type="button"
                    class="ai-hist__item"
                    :class="{ 'is-active': c.id === activeConvId }"
                    @click="switchToServer(c)"
                  >
                    <span class="ai-hist__label">{{ c.title || '新会话' }}</span>
                    <span class="ai-hist__time">{{ dayLabel(new Date(c.updatedAt || c.createdAt || Date.now()).getTime()) }}</span>
                    <span
                      class="ai-hist__del"
                      role="button"
                      title="删除会话"
                      @click.stop="removeServerConv(c)"
                    >×</span>
                  </button>
                  <button
                    v-if="histHasMore"
                    type="button"
                    class="ai-hist__more"
                    :disabled="histLoading"
                    @click="fetchHistoryPage(histPage + 1)"
                  >
                    {{ histLoading ? '加载中…' : '加载更多' }}
                  </button>
                </template>
                <!-- 降级：本地快照（服务端接口不可达时） -->
                <template v-else>
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
                </template>
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
              <div v-else class="ai-answer">
                <AiMarkdown :content="asItem(item).content" />
                <div v-if="showActions(asItem(item))" class="ai-acts">
                  <button
                    type="button"
                    class="ai-act"
                    :class="{ 'is-on': asItem(item).myFeedback === 'LIKE' }"
                    title="点赞"
                    @click="rateAnswer(asItem(item), 'LIKE')"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                    </svg>
                    <span>赞</span>
                  </button>
                  <button
                    type="button"
                    class="ai-act"
                    :class="{ 'is-bad': asItem(item).myFeedback === 'DISLIKE' }"
                    title="点踩"
                    @click="rateAnswer(asItem(item), 'DISLIKE')"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
                    </svg>
                    <span>踩</span>
                  </button>
                  <button type="button" class="ai-act" title="复制请求ID" @click="copyRequestId(asItem(item))">
                    <el-icon :size="14"><Tickets /></el-icon>
                    <span>请求ID</span>
                  </button>
                  <button type="button" class="ai-act" title="复制回答" @click="copyAnswer(asItem(item))">
                    <el-icon :size="14"><CopyDocument /></el-icon>
                    <span>复制</span>
                  </button>
                  <button type="button" class="ai-act" title="下载 Markdown" @click="downloadAnswer(asItem(item))">
                    <el-icon :size="14"><Download /></el-icon>
                    <span>下载</span>
                  </button>
                </div>
              </div>
            </template>

            <template #header="{ item }">
              <AiThinking
                v-if="asItem(item).reasoning"
                :content="asItem(item).reasoning ?? ''"
                :status="asItem(item).reasoningStatus || 'end'"
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
              <!-- 业务自定义渲染：itemType → 业务卡组件（draft = 发货单草稿，见 AiDraftCard.vue 注册说明） -->
              <AiDraftCard
                v-if="asItem(item).itemType === 'draft' && asItem(item).draft"
                :draft="asItem(item).draft!"
                :created="asItem(item).draftCreated"
                :creating="asItem(item).draftCreating"
                :history="asItem(item).history"
                @confirm="confirmDraft(asItem(item))"
              />
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
/* ===== 回答操作栏：赞 / 踩 / 复制请求ID / 复制回答 / 下载 .md ===== */
.ai-answer {
  min-width: 0;
}
.ai-acts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  /* 贴近正文：分隔线、margin、padding 全部去掉。
     正文末尾的换行空段落由 cleanAiMarkdown().trimEnd() 从源头消除（二者叠加才是完整修复）。 */
  margin-top: 0;
  padding-top: 0;
  opacity: 1;
}
.ai-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  /* 默认色从 #909399 加深到 #606266，且不再用 opacity 0.72 整体压淡 */
  color: #606266;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.ai-act:hover {
  color: #409eff;
  background: #f5f7fa;
}
.ai-act.is-on {
  color: #409eff;
  background: #ecf5ff;
}
.ai-act.is-bad {
  color: #f56c6c;
  background: #fef0f0;
}
.ai-act:focus-visible {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}
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
  /* 第一条消息不贴顶、最后一条不贴底：padding 在 BubbleList 滚动容器之外，滚到哪里都保持间距 */
  padding: 12px 0 16px;
}
/* assistant 回复走 noStyle（透明无 padding），去掉组件默认的 min-height 撑高 */
.ai-list :deep(.elx-bubble--no-style .elx-bubble__content) {
  min-height: 0;
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
/* 思考块的外距/样式由 AiThinking.vue 自带，这里不再覆写 */

/* ===== 草稿卡样式已迁至 AiDraftCard.vue（业务自定义渲染卡组件） ===== */

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
/* 服务端历史条目的删除按钮：hover 才露出，避免误触 */
.ai-hist__del {
  flex: none;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #c0c4cc;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.ai-hist__item:hover .ai-hist__del {
  opacity: 1;
}
.ai-hist__del:hover {
  background: #fef0f0;
  color: #f56c6c;
}
.ai-hist__more {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 7px 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #409eff;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.ai-hist__more:hover {
  background: #f5f7fa;
}
.ai-hist__more:disabled {
  color: #c0c4cc;
  cursor: default;
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
.ai-hist-pop,
.ai-ctx-pop {
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
