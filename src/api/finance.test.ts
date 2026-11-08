import { describe, it, expect, vi, beforeEach } from 'vitest'

// 财务 api 层「创建成功路径」：验证各 create 函数确实向正确端点发请求并透传请求体。
// mock 掉 '@/api/request'（axios 实例），不真正发网络请求。
// ⚠️ 两个既有坑一起修：
//  ① vi.mock 工厂被提升到文件顶部，普通 const 此时尚未初始化 →
//     ReferenceError: Cannot access 'post' before initialization（套件收集失败）。
//     用 vi.hoisted 建同一批 mock，工厂与断言引用同一个实例。
//  ② vi.fn 的实现若不声明形参，TS 会把 mock.calls 推成空元组 []，
//     于是下面所有 c[0]/c[1] 都报 TS2493。显式声明 axios 风格签名，
//     四个 mock 的 calls 元组也保持一致，便于合并断言。
const mocks = vi.hoisted(() => {
  const ok = { data: { code: 0, data: null, message: 'ok' } }
  const reply = () => Promise.resolve(ok)
  return {
    post: vi.fn((_url: string, _data?: unknown, _config?: unknown) => reply()),
    get: vi.fn((_url: string, _data?: unknown, _config?: unknown) => reply()),
    put: vi.fn((_url: string, _data?: unknown, _config?: unknown) => reply()),
    del: vi.fn((_url: string, _data?: unknown, _config?: unknown) => reply()),
  }
})
const { post, get, put, del } = mocks

vi.mock('./request', () => ({
  default: { post: mocks.post, get: mocks.get, put: mocks.put, delete: mocks.del },
}))

import { createReceipt } from './receipt'
import { createInvoice } from './invoice'
import { createReturn } from './return'
import { createShipment } from './shipment'
import { autoMatch, reverseLedger } from './writeoff'

beforeEach(() => {
  post.mockClear()
  get.mockClear()
  put.mockClear()
  del.mockClear()
})

describe('财务 api 层创建成功路径（P1）', () => {
  it('createReceipt → POST /receipt 且透传请求体', async () => {
    const data: any = { amount: 100, projectId: 1 }
    await createReceipt(data)
    const call = post.mock.calls.find((c) => String(c[0]).includes('/receipt'))
    expect(call).toBeTruthy()
    expect(call![1]).toBe(data)
  })

  it('createInvoice → POST /invoice 且透传请求体', async () => {
    const data: any = { amount: 50, projectId: 2 }
    await createInvoice(data)
    const call = post.mock.calls.find((c) => String(c[0]).includes('/invoice'))
    expect(call).toBeTruthy()
    expect(call![1]).toBe(data)
  })

  it('createShipment → POST /shipment 且透传表单', async () => {
    const data: any = { trackingNo: 'SF123', carrier: 'SF' }
    await createShipment(data)
    const call = post.mock.calls.find((c) => String(c[0]).includes('/shipment'))
    expect(call).toBeTruthy()
    expect(call![1]).toBe(data)
  })

  it('createReturn(shipmentId, data) → 请求含 /return 与 shipmentId，并透传表单', async () => {
    const data: any = { reason: 'damaged' }
    await createReturn(9, data)
    const call = post.mock.calls.find((c) => String(c[0]).includes('/return'))
    expect(call).toBeTruthy()
    expect(String(call![0])).toContain('9')
    expect(call![1]).toBe(data)
  })

  it('writeoff.autoMatch(projectId) → 触发匹配请求', async () => {
    await autoMatch(7)
    const all = [...post.mock.calls, ...get.mock.calls, ...put.mock.calls, ...del.mock.calls]
    expect(all.length).toBeGreaterThan(0)
  })

  it('writeoff.reverseLedger(data) → 触发冲销请求且透传台账数据', async () => {
    const data: any = { ledgerId: 1 }
    await reverseLedger(data)
    const all = [...post.mock.calls, ...put.mock.calls, ...del.mock.calls]
    expect(all.length).toBeGreaterThan(0)
    const call = all.find((c) => c[1] && (c[1] as any).ledgerId === 1)
    expect(call).toBeTruthy()
  })
})
