import request from './request'
import type { ApiResult } from '@/types/auth'
import type { CustomerOptionVO } from '@/types/customer'

// 客户接口（后端 /customer/**，V68 一期只开放下拉，无增删改）

/** 客户下拉选项（ENABLED 且未删除，名称升序；keyword 模糊匹配，limit 上限由后端夹逼） */
export function customerOptions(keyword?: string, limit = 200) {
  return request
    .get<ApiResult<CustomerOptionVO[]>>('/customer/options', { params: { keyword, limit } })
    .then((r) => r.data.data!)
}

/** 客户档案分页列表（V218 管理抽屉） */
export function customerList(pageNum = 1, pageSize = 10, keyword?: string) {
  return request
    .get<ApiResult<{ records: CustomerVO[]; total: number }>>('/customer/list', {
      params: { pageNum, pageSize, keyword },
    })
    .then((r) => r.data.data!)
}

/** 客户档案新增 / 编辑 */
export function saveCustomer(data: Partial<CustomerVO>) {
  return request.post<ApiResult<CustomerVO>>('/customer/save', data).then((r) => r.data.data!)
}

/** 完整客户档案 VO（与后端 com.firestar.entity.Customer 对齐） */
export interface CustomerVO {
  id: number
  customerNo: string | null
  customerName: string
  contactPerson: string | null
  contactPhone: string | null
  address: string | null
  taxNo: string | null
  bankName: string | null
  bankAccount: string | null
  status: string
  remark: string | null
  buyerPhone: string | null
  createdAt: string
}
