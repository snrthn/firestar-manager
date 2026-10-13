import request from './request'
import type { ApiResult, DictTypeVO, DictTypePageVO, DictTypeFormData, DictDataPageVO, DictDataFormData } from '@/types/dict'

// 字典管理接口（后端 /system/dict/type/** 与 /system/dict/data/**，全量不过滤，
// 与 auth.ts 的字典读取语义区分：这里是管理端维护入口）

// ===== 字典类型 =====

/** 分页类型列表（管理页用，默认每页 10 条，与 dict.vue 分页器一致） */
export function listDictTypes(pageNum = 1, pageSize = 10) {
  return request
    .get<ApiResult<DictTypePageVO>>('/system/dict/type/list', { params: { pageNum, pageSize } })
    .then((r) => r.data.data!)
}

/** 全量类型列表（不分页，供隐藏二级页 dict-data.vue 按 typeCode 反查类型名称） */
export function listAllDictTypes() {
  return request.get<ApiResult<DictTypeVO[]>>('/system/dict/type/all').then((r) => r.data.data!)
}

export function createDictType(data: DictTypeFormData) {
  return request.post<ApiResult<number>>('/system/dict/type', data).then((r) => r.data.data!)
}

export function updateDictType(id: number, data: DictTypeFormData) {
  return request.put<ApiResult<null>>(`/system/dict/type/${id}`, data).then((r) => r.data)
}

export function deleteDictType(id: number) {
  return request.delete<ApiResult<null>>(`/system/dict/type/${id}`).then((r) => r.data)
}

// ===== 字典数据（按类型编码，分页；默认每页 10 条，与后端 /dict-data.vue 分页器一致）=====

export function listDictData(typeCode: string, pageNum = 1, pageSize = 10) {
  return request
    .get<ApiResult<DictDataPageVO>>('/system/dict/data/list', { params: { typeCode, pageNum, pageSize } })
    .then((r) => r.data.data!)
}

export function createDictData(data: DictDataFormData) {
  return request.post<ApiResult<number>>('/system/dict/data', data).then((r) => r.data.data!)
}

export function updateDictData(id: number, data: DictDataFormData) {
  return request.put<ApiResult<null>>(`/system/dict/data/${id}`, data).then((r) => r.data)
}

export function deleteDictData(id: number) {
  return request.delete<ApiResult<null>>(`/system/dict/data/${id}`).then((r) => r.data)
}
