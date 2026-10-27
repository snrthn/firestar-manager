import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ReceivablePageVO, ReceivableVO } from '@/types/receivable'

// 应收单接口（后端 /receivable/**，权限点 receivable:view）。
// 应收单由发货「客户已收货」时点自动生成，后端不暴露写接口，前端仅列表 + 详情只读。
// 本文件同时收敛了原先散落在 api/shipment.ts 里的 receivableDetail，避免两份实现。

/**
 * 分页应收单列表。
 *
 * 2026-10-28 补齐查询条件（口径对齐核销台账）：projectId/status/sourceType 精确、
 * receivableNo / projectName 模糊、dateFrom~dateTo 按应收日期闭区间。
 * 后端 ReceivableController.page 已声明全部参数，未声明的键会被忽略——按需传即可。
 */
export function receivablePage(
  pageNum = 1,
  pageSize = 10,
  params: {
    projectId?: number
    status?: string
    receivableNo?: string
    projectName?: string
    sourceType?: string
    dateFrom?: string
    dateTo?: string
  } = {},
) {
  return request
    .get<ApiResult<ReceivablePageVO>>('/receivable/page', {
      params: { pageNum, pageSize, ...params },
    })
    .then((r) => r.data.data!)
}

/** 应收单详情（含字典翻译） */
export function receivableDetail(id: number) {
  return request.get<ApiResult<ReceivableVO>>(`/receivable/${id}`).then((r) => r.data.data!)
}
