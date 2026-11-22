import request from './request'
import type { InitStatusVO, InitRequest, ResetRequest, ResetResultVO, EnvCheckItem } from '@/types/system'

/**
 * 系统初始化与重置（安装向导）API。
 * 取数约定与 config.ts / auth.ts 一致：响应拦截器透出 Result 壳，
 * 带数据的接口用 `r.data.data` 取 payload，无数据的用 `r.data`。
 * 后端真实路径不含 /api（代理层剥离），这里写真实路径。
 */

/** 检查初始化状态（未初始化时公开，供安装向导跳转判断） */
export function getInitStatus() {
  return request.get('/system/init/status').then((r) => r.data.data as InitStatusVO)
}

/** 执行初始化安装向导（未初始化时公开，已初始化会被后端拒绝） */
export function doInit(data: InitRequest) {
  return request.post('/system/init', data).then((r) => r.data.data as InitStatusVO)
}

/**
 * 重置页专用状态（已登录可达，返回完整状态）。
 *
 * ⚠️ 不要用 getInitStatus() 渲染重置页：那是匿名端点，初始化完成后会被后端裁剪成
 * 只回 initialized:true，trialMode/canReset 全部为 false，会导致按钮永久 disabled。
 */
export function getResetStatus() {
  return request.get('/system/reset/status').then((r) => r.data.data as InitStatusVO)
}

/** 环境预检（安装向导展示，未初始化时公开，返回只读明细） */
export function getPrecheck() {
  return request.get('/system/init/precheck').then((r) => r.data.data as EnvCheckItem[])
}

/** 轻度重置：清业务表 + Flowable 运行/历史 + 上传文件，保留系统配置 */
export function resetLight(data: ResetRequest) {
  return request.post('/system/reset/light', data).then((r) => r.data.data as ResetResultVO)
}

/** 完整重置：Flyway 清库重建 + 重新播种（恢复出厂，需重新执行初始化向导） */
export function resetFull(data: ResetRequest) {
  return request.post('/system/reset/full', data).then((r) => r.data.data as ResetResultVO)
}
