import { describe, it, expect, vi, beforeEach } from 'vitest'

// 财务 api 层「创建成功路径」：验证各 create 函数确实向正确端点发请求并透传请求体。
// mock 掉 '@/api/request'（axios 实例），不真正发网络请求。
const post = vi.fn(() => Promise.resolve({ data: { code: 0, data: null, message: 'ok' } }))
const get = vi.fn(() => Promise.resolve({ data: { code: 0, data: null } }))
const put = vi.fn(() => Promise.resolve({ data: { code: 0, data: null } }))
const del = vi.fn(() => Promise.resolve({ data: { code: 0, data: null } }))

vi.mock('./request', () => ({
  default: { post, get, put, delete: del },
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
