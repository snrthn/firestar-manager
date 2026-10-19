import request from './request'
import type { ConfigItemVO, AboutVO } from '../types/agreement'

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

/** 关于我们弹窗聚合数据（登录即可访问） */
export function getAbout() {
  return request.get('/system/config/about').then((r) => r.data.data as AboutVO)
}
