import request from './request'
import type { ConfigItemVO, AboutVO, ConfigCreateRequest } from '../types/agreement'

/**
 * 参数设置分组（后端按 config_type 聚合成 map）。
 * key = config_type，value = 该组下的配置项列表。
 */
export function getGroup() {
  return request
    .get('/system/config/group')
    .then((r) => r.data.data as Record<string, ConfigItemVO[]>)
}

/** [运营] 批量更新配置项（key→value 扁平 map） */
export function updateValues(values: Record<string, string>) {
  return request.put('/system/config', values).then((r) => r.data.data)
}

/** [运营] 新建键值对（键值管理；供后期扩展业务状态开关） */
export function createConfig(data: ConfigCreateRequest) {
  return request.post('/system/config', data).then((r) => r.data.data)
}

/** [运营] 更新单个配置项（值 + 说明；键必须已存在） */
export function updateConfigItem(data: ConfigCreateRequest) {
  return request.put('/system/config/item', data).then((r) => r.data.data)
}

/** 关于我们弹窗聚合数据（登录即可访问） */
export function getAbout() {
  return request.get('/system/config/about').then((r) => r.data.data as AboutVO)
}

/** 特性开关（登录即可访问）：返回白名单内的布尔型功能开关，缺省 "false" */
export function getFlags() {
  return request
    .get('/system/config/flags')
    .then((r) => (r.data.data ?? {}) as Record<string, string>)
}
