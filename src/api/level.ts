import request from './request'
import type { ApiResult } from '@/types/auth'
import type { LevelPageVO, LevelFormData, LevelOptionVO } from '@/types/level'

// 职级管理接口（后端 /system/level/**）。

/** 分页职级列表（levelName/levelCode 模糊、status 精确；默认每页 10 条） */
export function listLevels(
  pageNum = 1,
  pageSize = 10,
  params: { levelName?: string; levelCode?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<LevelPageVO>>('/system/level/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 职级下拉选项（用户表单职级选择、流程节点 LEVEL 配置等场景；全量、轻量） */
export function listLevelOptions() {
  return request.get<ApiResult<LevelOptionVO[]>>('/system/level/options').then((r) => r.data.data!)
}

export function createLevel(data: LevelFormData) {
  // 同 api/post.ts：请求体直接传 form（后端 DTO 无 id 字段，Jackson 忽略未知属性）
  return request.post<ApiResult<number>>('/system/level', data).then((r) => r.data.data!)
}

export function updateLevel(id: number, data: LevelFormData) {
  return request.put<ApiResult<null>>(`/system/level/${id}`, data).then((r) => r.data)
}

export function deleteLevel(id: number) {
  return request.delete<ApiResult<null>>(`/system/level/${id}`).then((r) => r.data)
}
