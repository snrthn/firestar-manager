import { dispatchRealtime } from './realtimeDispatch'

/**
 * 实时推送客户端（SSE over fetch）。
 * 为什么不用原生 EventSource：它不能带自定义 Header，JWT 无法放 Authorization，
 * 只能塞 URL query（token 会进 nginx 访问日志）。这里用 fetch + ReadableStream 手写，
 * 带 Authorization 头，且自带重连（EventSource 才有原生重连，fetch 需自己实现）。
 *
 * 连接建立即代表会话有效；被顶号后后端主动推 FORCE_LOGOUT，前端弹模态框并断开。
 * 重连策略：指数退避，但 token 已被清（被踢流程会清）则立即停止，避免空转。
 */
// SSE 统一前缀（2026-10-19 调整）：纳入全站 /api 体系。
// 生产由 nginx 的 location /api/sse/ 转发（proxy_pass 带尾 URI .../sse/，把 /api 剥掉，
// 后端收到 /sse/realtime）；开发期由 vite proxy 的 '/api/sse' 规则（rewrite 剥 /api）
// 转发到后端 2025，见 vite.config.ts。
//
// 为什么带 /api：此前 ENDPOINT 是 /sse/realtime（裸前缀例外），每次新增 SSE 流 nginx
// 要复制一段 location。现在统一走 /api，nginx 只需 location /api/sse/ 一条，后续
// /api/sse/xxx 全部自动继承，本常量也不用再动。
const ENDPOINT = '/api/sse/realtime'
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 30000

let abortCtrl: AbortController | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = RETRY_BASE_MS
let running = false

function scheduleReconnect() {
  if (!running || retryTimer) return
  const token = localStorage.getItem('token')
  if (!token) {
    running = false
    return
  }
  retryTimer = setTimeout(() => {
    retryTimer = null
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    connect()
  }, retryDelay)
}

function connect() {
  const token = localStorage.getItem('token')
  if (!token) {
    running = false
    return
  }
  abortCtrl = new AbortController()
  fetch(ENDPOINT, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: abortCtrl.signal,
  })
    .then((res) => {
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          // 握手即被拒（被顶号后旧会话重连）：优先展示后端 message
          //（stream 端点已区分「已在其他设备登录」与「登录已过期」两种语义），
          // 读不到再回落统一兜底文案，保证与 FORCE_LOGOUT 推送路径展示一致。
          // 动态 import 避开 sessionGuard→router→realtimeClient 的循环依赖
          import('@/api/sessionGuard').then((m) => {
            res
              .json()
              .then((body: { message?: string }) => {
                m.handleSessionExpired(body?.message || '您的账号已在其他设备登录，原会话已失效，请重新登录')
              })
              .catch(() => {
                m.handleSessionExpired('您的账号已在其他设备登录，原会话已失效，请重新登录')
              })
          })
        }
        scheduleReconnect()
        return
      }
      // 防御：拿到 200 但不是 SSE 流（如错误壳/网关页）时按连接失败处理。
      // 2026-10-16 线上事故：后端 401 曾被吞成 HTTP 200 + {"code":500} 壳，
      // 前端把 200 当流读、壳里没有 event: 行被静默忽略 → 流关闭 → 重连死循环。
      // 根因已在后端修（ResponseStatusException 保留 401），这里兜底防再发。
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('text/event-stream')) {
        scheduleReconnect()
        return
      }
      retryDelay = RETRY_BASE_MS
      void readStream(res.body)
    })
    .catch(() => {
      // 网络错误（后端重启等）：退避重连
      scheduleReconnect()
    })
}

async function readStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        handleBlock(raw)
      }
    }
  } catch {
    // 流中断：退避重连（token 还在则重连）
  }
  scheduleReconnect()
}

function handleBlock(raw: string) {
  let event = ''
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
    // 以 ':' 开头的注释行（心跳）忽略
  }
  if (!event) return
  let parsed: unknown = data
  if (data) {
    try {
      parsed = JSON.parse(data)
    } catch {
      // 非 JSON 原样透传
    }
  }
  if (event === 'FORCE_LOGOUT') {
    dispatchRealtime(event, parsed)
    stopRealtime() // 被踢，立即断开当前流，不再重连（token 已被清）
    return
  }
  dispatchRealtime(event, parsed)
}

export function startRealtime() {
  if (running) return
  running = true
  retryDelay = RETRY_BASE_MS
  connect()
}

export function stopRealtime() {
  running = false
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (abortCtrl) {
    abortCtrl.abort()
    abortCtrl = null
  }
}
