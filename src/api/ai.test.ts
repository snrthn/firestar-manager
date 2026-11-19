/**
 * SSE 契约测试：验证后端 V217 新增的 meta.requestId / message_id 帧能被前端正确解析。
 * 这两个字段是「复制请求ID」与「回答赞踩」的命脉——解析失败时按钮会永远提示"暂无"，
 * 而组件层用 mock streamChat 测不出来，所以必须在 API 层用真实文本流取证。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamChat } from './ai'

/** 构造一个一次性吐出完整 SSE 文本的 Response（happy-dom 无需真实网络） */
function sseResponse(raw: string): any {
  const encoded = new TextEncoder().encode(raw)
  return {
    ok: true,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader() {
        let sent = false
        return {
          async read() {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: encoded }
          },
        }
      },
    },
  }
}

describe('streamChat SSE 帧解析', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('解析 meta 帧的 conversationId / requestId 与落库后的 message_id 帧', async () => {
    const raw = [
      'event: meta',
      'data: {"conversationId":7,"requestId":"req-v217-1"}',
      '',
      'event: message_id',
      'data: 101',
      '',
      'event: token',
      'data: "回答正文"',
      '',
      'event: done',
      'data: ',
      '',
    ].join('\n')
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(raw)))

    const onMeta = vi.fn()
    const onRequestId = vi.fn()
    const onMessageId = vi.fn()
    const onToken = vi.fn()
    const onDone = vi.fn()
    await streamChat('问题', { onMeta, onRequestId, onMessageId, onToken, onDone, onError: vi.fn() })

    expect(onMeta).toHaveBeenCalledWith(7)
    expect(onRequestId).toHaveBeenCalledWith('req-v217-1')
    expect(onMessageId).toHaveBeenCalledWith(101)
    expect(onToken).toHaveBeenCalledWith('回答正文')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('旧后端 meta 帧只有 conversationId 时不误报 requestId', async () => {
    const raw = ['event: meta', 'data: {"conversationId":9}', '', 'event: done', 'data: ', ''].join('\n')
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(raw)))

    const onMeta = vi.fn()
    const onRequestId = vi.fn()
    const onMessageId = vi.fn()
    await streamChat('问题', { onMeta, onRequestId, onMessageId, onDone: vi.fn(), onToken: vi.fn(), onError: vi.fn() })

    expect(onMeta).toHaveBeenCalledWith(9)
    expect(onRequestId).not.toHaveBeenCalled()
    expect(onMessageId).not.toHaveBeenCalled()
  })
})
