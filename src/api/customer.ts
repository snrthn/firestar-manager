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
