import request from './request'

// ===== AI 模型配置（【模型配置】页，sys:modelConfig:*） =====
// 注意：request 的 baseURL 已含 /api（见 request.ts），故此处路径不要再带 /api 前缀，
// 否则会变成 /api/api/... 双重前缀导致 404。后端路由本身不带 /api（SecurityConfig 注释）。

export interface ModelConfigMasked {
  id: number
  modelType: string
  provider: string
  active: number
  baseUrl?: string | null
  model?: string | null
  botIdSet: boolean
  apiKeySet: boolean
  extraSet: boolean
  /** extra_json 的明文内容（配置参数，非密钥）：TTS 的 voice/format/sample_rate、embedding 的 dims 等 */
  extraJson?: string | null
  /** 列表排序号（V215）：升序展示，上移/下移后由后端整表重排回写 */
  sortNo: number
}

/** 提交体：敏感字段留空 = 保留库内已有密文，不覆盖 */
export interface ModelConfigPayload {
  id?: number
  modelType?: string
  provider: string
  baseUrl?: string
  model?: string
  botId?: string
  apiKey?: string
  extraJson?: string
  active?: number
  /** 列表排序号（升序，1..N 连续）；不传 = 新增排到末尾 / 编辑保持原值 */
  sortNo?: number
}

export function listModelConfigs() {
  return request.get('/ai/model-config').then((r) => r.data.data as ModelConfigMasked[])
}

export function createModelConfig(payload: ModelConfigPayload) {
  return request.post('/ai/model-config', payload).then((r) => r.data.data as number)
}

export function updateModelConfig(payload: ModelConfigPayload) {
  return request.put('/ai/model-config', payload).then((r) => r.data.data)
}

export function deleteModelConfig(id: number) {
  return request.delete(`/ai/model-config/${id}`).then((r) => r.data.data)
}

export function reloadModelConfig() {
  return request.post('/ai/model-config/reload').then((r) => r.data.data)
}

/**
 * 整表重排：提交页面当前展示的完整 id 顺序（从上到下）。
 * 后端按 (index+1) 回写 sort_no（1..N 连续）；ids 必须与库内行集合一致，否则报错要求刷新。
 */
export function reorderModelConfigs(ids: number[]) {
  return request.put('/ai/model-config/sort', { ids }).then((r) => r.data.data)
}

// ===== AI 语音合成 TTS（V214，sys:modelConfig:view） =====
export function ttsAvailable() {
  return request.post('/ai/tts/available').then((r) => r.data.data as boolean)
}

export interface TtsPayload {
  text: string
  voice?: string
  format?: string
  sampleRate?: number
}
export interface TtsResult {
  audioBase64: string
  contentType: string
  format: string
  sampleRate: number
  bytes: number
}
export function synthesizeTts(payload: TtsPayload) {
  return request.post('/ai/tts/synthesize', payload).then((r) => r.data.data as TtsResult)
}

// ===== AI 对话流式（fetch + ReadableStream 消费 SSE，设计 §10） =====
// 不用 EventSource：它带不了 Authorization 请求头，而本端点走 JWT 鉴权。
// 事件名：token(文本增量) / done(结束) / error(错误) / fallback(降级兜底)。

export interface ChatStreamHandlers {
  onToken: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  /** 降级兜底：mode=error|search，reason 为原因说明 */
  onFallback?: (mode: string, reason: string) => void
  /** 流起始元数据帧：携带 conversationId（Coze 模式事后按会话拉草稿用） */
  onMeta?: (conversationId: number) => void
  /** 草稿预览帧：payload={toolName,argsJson,resultJson}，前端据此渲染「待确认表单」卡片 */
  onDraft?: (payload: { toolName: string; argsJson: string; resultJson: string }) => void
}

interface SseEvent {
  event: string
  data: string
}

function parseSseBlock(block: string): SseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    } else if (line.startsWith(':')) {
      // 注释行，忽略
    }
  }
  // 空 data 块（含后端误发的空 token）直接忽略，避免前端收到空串顶出气泡首行空白
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}

/** 从错误响应体提取 message；非 JSON（如 nginx 错误页）或 message 为空时用兜底文案 */
function extractMsg(text: string, fallback: string): string {
  try {
    const o = JSON.parse(text)
    if (o && typeof o.message === 'string' && o.message) return o.message
  } catch {
    /* 非 JSON → 用兜底文案 */
  }
  return fallback
}

/**
 * 发起一次 AI 对话（流式）。返回 Promise 在流结束时 resolve；
 * 中途异常或收到 error/fallback 事件时通过 handlers 回调通知，Promise 仍会 resolve。
 */
export async function streamChat(message: string, handlers: ChatStreamHandlers): Promise<void> {
  const baseURL = request.defaults.baseURL || ''
  const token = localStorage.getItem('token')
  // 复用全站 SSE 前缀：/api/sse/ai/chat/stream →（vite/nginx 剥离 /api/sse）→ 后端 /sse/ai/chat/stream
  const resp = await fetch(`${baseURL}/sse/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  })

  if (!resp.ok || !resp.body) {
    const text = await safeText(resp)
    handlers.onError(extractMsg(text, `请求失败（HTTP ${resp.status}）`))
    return
  }

  // 鉴权/业务拒绝可能返回 HTTP 200 + application/json 错误体（非 SSE），
  // 例如 {"code":403,"message":"无访问权限","data":null}（PermissionInterceptor 约定）。
  // 必须按 JSON 解析并提示，否则前端会把整段 JSON 当 SSE 解析（无 event/data 行）→ 气泡空白。
  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    const text = await safeText(resp)
    handlers.onError(extractMsg(text, '请求失败，请稍后重试'))
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const finish = (fn: () => void) => {
    if (finished) return
    finished = true
    fn()
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      // SSE 事件以空行(\n\n)分隔
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const ev = parseSseBlock(raw)
        if (!ev) continue
        switch (ev.event) {
          case 'token':
            handlers.onToken(ev.data)
            break
          case 'done':
            finish(() => handlers.onDone())
            break
          case 'error':
            finish(() => handlers.onError(ev.data))
            break
          case 'fallback':
            try {
              const o = JSON.parse(ev.data)
              handlers.onFallback?.(o.mode ?? 'error', o.reason ?? ev.data)
            } catch {
              handlers.onFallback?.('error', ev.data)
            }
            break
          case 'meta':
            try {
              const o = JSON.parse(ev.data)
              if (o?.conversationId != null) handlers.onMeta?.(Number(o.conversationId))
            } catch {
              /* ignore */
            }
            break
          case 'draft':
            try {
              const o = JSON.parse(ev.data)
              handlers.onDraft?.(o)
            } catch {
              /* ignore */
            }
            break
          default:
            break
        }
      }
    }
  } catch (e: any) {
    finish(() => handlers.onError(e?.message || '流式读取中断'))
  } finally {
    if (!finished) {
      // 连接正常结束但没收到 done（如服务端异常关闭）：按完成处理
      finished = true
      handlers.onDone()
    }
  }
}

/**
 * 按会话拉取最新草稿预览 JSON（Coze 模式 SSE 流不经过草稿结果，流结束后调用）。
 * 返回 resultJson 字符串（可能为 null）。
 */
export function fetchLatestDraft(convId: number): Promise<string | null> {
  return request.get(`/ai/conversation/${convId}/latest-draft`).then((r) => (r.data.data as string) ?? null)
}

// ===== AI 提示词管理（【提示词管理】页，ai:prompt:*） =====
// 与模型配置同构：全局唯一生效（is_active=1），启用哪套哪套在对话中实时生效。
export interface AiPromptConfig {
  id?: number
  name: string
  content?: string
  active?: number
}

export function listPrompts() {
  return request.get('/ai/prompt-config').then((r) => r.data.data as AiPromptConfig[])
}

export function createPrompt(payload: AiPromptConfig) {
  return request.post('/ai/prompt-config', payload).then((r) => r.data.data as number)
}

export function updatePrompt(payload: AiPromptConfig) {
  return request.put('/ai/prompt-config', payload).then((r) => r.data.data)
}

export function deletePrompt(id: number) {
  return request.delete(`/ai/prompt-config/${id}`).then((r) => r.data.data)
}

export function activatePrompt(id: number) {
  return request.post(`/ai/prompt-config/${id}/activate`).then((r) => r.data.data)
}

export function reloadPrompt() {
  return request.post('/ai/prompt-config/reload').then((r) => r.data.data)
}
