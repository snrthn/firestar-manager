import request from './request'
import type { ApiResult } from '@/types/auth'
import type { GoodsOptionVO } from '@/types/goods'

// 货物接口（后端 /goods/**，V71 一期只开放下拉，无增删改）

/** 货物下拉选项（ENABLED 且未删除，名称升序；keyword 模糊匹配，limit 上限由后端夹逼） */
export function goodsOptions(keyword?: string, limit = 200) {
  return request
    .get<ApiResult<GoodsOptionVO[]>>('/goods/options', { params: { keyword, limit } })
    .then((r) => r.data.data!)
}
