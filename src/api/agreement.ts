import request from './request'
import type {
  AgreementVO,
  AgreementVersion,
  ConsentRequest,
  WithdrawRequest,
  PublishVersionRequest,
} from '../types/agreement'

/** 登录后展示用的全部生效协议（含正文） */
export function listActive() {
  return request.get('/system/agreement/active').then((r) => r.data.data as AgreementVO[])
}

/** 当前用户待强制确认的协议（首次确认 / 协议已更新） */
export function listPending() {
  return request.get('/system/agreement/pending').then((r) => r.data.data as AgreementVO[])
}

/** 个人中心：当前用户对各协议的同意记录 */
export function listConsents() {
  return request.get('/system/agreement/consents').then((r) => r.data.data as AgreementVO[])
}

/** 同意某协议生效版本 */
export function consent(agreementId: number, payload: ConsentRequest) {
  return request.post(`/system/agreement/${agreementId}/consent`, payload).then((r) => r.data.data)
}

/** 撤回对某协议生效版本的同意 */
export function withdraw(agreementId: number, payload: WithdrawRequest) {
  return request.post(`/system/agreement/${agreementId}/withdraw`, payload).then((r) => r.data.data)
}

/** [运营] 版本历史 */
export function listVersions(agreementId: number) {
  return request
    .get(`/system/agreement/versions/${agreementId}`)
    .then((r) => r.data.data as AgreementVersion[])
}

/** [运营] 发布新版本（自动递增 vN） */
export function publishVersion(payload: PublishVersionRequest) {
  return request.post('/system/agreement/version', payload).then((r) => r.data.data as number)
}
