import { ref } from 'vue'
import { loadDictOptions, type DictLabeler } from './useDict'

/**
 * 收款单款项类型标签：蓝字(receipt_type) + 红字(receipt_red_type) 双字典合并解析。
 *
 * 背景（V78 字典拆分）：原 receipt_type 拆成两个字典——
 *   - receipt_type：蓝字收款款项性质（NORMAL 正常收款 / PREPAY 预收款）
 *   - receipt_red_type：红字/退款类（REFUND 退货退款 / RED 红冲）
 * 一张收款单的 receiptType 可能来自任一词典，列表/详情展示需合并反查，
 * 否则红字单（REFUND/RED）会落空、显示成原始英文值。
 *
 * 兜底语义与 useDictLabels 一致：空值 → placeholder；未命中 → 返回原始值
 * （不硬编码枚举，遵守「字典已有但业务页未消费」纪律；历史 OVERPAY 残留亦按原始值展示）。
 */
export function useReceiptTypeLabels(): DictLabeler {
  const labelMap = ref<Record<string, string>>({})
  const styleMap = ref<Record<string, string | null>>({})
  const ready = ref(false)

  Promise.all([loadDictOptions('receipt_type'), loadDictOptions('receipt_red_type')]).then(
    ([blue, red]) => {
      const map: Record<string, string> = {}
      const styles: Record<string, string | null> = {}
      for (const o of [...blue, ...red]) {
        map[o.value] = o.label
        styles[o.value] = o.style
      }
      labelMap.value = map
      styleMap.value = styles
      ready.value = true
    },
  )

  function label(value?: string | null, placeholder = '—'): string {
    if (value == null || value === '') return placeholder
    return labelMap.value[value] || value
  }

  function style(value?: string | null): string | null {
    if (value == null || value === '') return null
    return styleMap.value[value] ?? null
  }

  return { ready, label, style }
}
