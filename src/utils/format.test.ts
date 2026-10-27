import { describe, it, expect } from 'vitest'
import { formatMoney, formatPercent, formatWan } from './format'

// 这里不追求覆盖率，只先给「金额/比率/大数」三类纯格式化函数立一道不变量护栏，
// 对应评估报告 P1-2「前端测试为 0」的整改起点。后续组件/表单校验测试在此脚手架上加。

describe('formatMoney', () => {
  it('null / undefined / NaN → 破折号（避免 NaN 渲染成 "NaN" 污染报表）', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(NaN)).toBe('—')
  })

  it('正常金额：千分位 + 固定小数位（Node 全 ICU 下 zh-CN 逗号稳定）', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50')
    expect(formatMoney(1000, 0)).toBe('1,000')
    expect(formatMoney(0)).toBe('0.00')
  })
})

describe('formatPercent', () => {
  it('比率(0~1)转百分比', () => {
    expect(formatPercent(0.1234)).toBe('12.34%')
    expect(formatPercent(1)).toBe('100.00%')
  })
  it('非法输入 → 破折号', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(NaN)).toBe('—')
  })
})

describe('formatWan', () => {
  it('>=1万 缩写，<1万 原样', () => {
    expect(formatWan(15000)).toBe('1.5万')
    expect(formatWan(9999)).toBe('9999')
  })
  it('非有限数 → 空串', () => {
    expect(formatWan(NaN)).toBe('')
    expect(formatWan(Infinity)).toBe('')
  })
})
