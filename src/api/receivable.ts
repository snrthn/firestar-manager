import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ReceivablePageVO, ReceivableVO } from '@/types/receivable'

// 应收单接口（后端 /receivable/**，权限点 receivable:view）。
// 应收单由发货「客户已收货」时点自动生成，后端不暴露写接口，前端仅列表 + 详情只读。
// 本文件同时收敛了原先散落在 api/shipment.ts 里的 receivableDetail，避免两份实现。

/** 分页应收单列表（后端只声明 pageNum/pageSize/projectId/status，其余键被忽略） */
export function receivablePage(
  pageNum = 1,
  pageSize = 10,
  params: { projectId?: number; status?: string } = {},
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
