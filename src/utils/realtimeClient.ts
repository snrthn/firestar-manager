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
// 必须带 /api 前缀：开发期经 vite proxy 转发到后端 2025（proxy 剥离 /api），
// 与 api/*.ts 的请求同一条链路；直连 /auth/stream 会打到前端 dev server 404
const ENDPOINT = '/api/auth/stream'
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
          // 握手即被拒（被顶号后旧会话重连）：直接走会话失效流程
          import('@/api/sessionGuard').then((m) => m.handleSessionExpired('会话已失效，请重新登录'))
        }
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
