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

/** 货物档案分页列表（V218 管理抽屉） */
export function goodsList(pageNum = 1, pageSize = 10, keyword?: string) {
  return request
    .get<ApiResult<{ records: GoodsVO[]; total: number }>>('/goods/list', {
      params: { pageNum, pageSize, keyword },
    })
    .then((r) => r.data.data!)
}

/** 货物档案新增 / 编辑 */
export function saveGoods(data: Partial<GoodsVO>) {
  return request.post<ApiResult<GoodsVO>>('/goods/save', data).then((r) => r.data.data!)
}

/** 完整货物档案 VO（与后端 com.firestar.entity.Goods 对齐） */
export interface GoodsVO {
  id: number
  goodsNo: string | null
  goodsName: string
  status: string
  remark: string | null
  createdAt: string
}
