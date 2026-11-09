/**
 * 知识库节点 / 文档接口契约（V208 树形结构，方案 A）
 *
 * ⚠️ 后端 KbNodeController 属于步骤 4.5，本轮**尚未实现**，页面当前使用本地骨架数据
 *    （见 views/system/knowledge.vue 的 MOCK_NODES）。这里先把契约钉死：
 *    前端只依赖本文件的类型与函数签名，后端实现照此对齐，接真实接口时
 *    把页面的 loadNodes() 从 mock 换成 listKbNodes() 即可，不用改组件。
 *
 * 路径沿用 AI 中心其它接口的前缀（/ai/prompt-config、/ai/model-config）：
 *    GET    /ai/kb/nodes                 节点骨架（轻量元数据，不含正文）
 *    GET    /ai/kb/docs/{id}            文档正文
 *    POST   /ai/kb/nodes                新建文档 / 文件夹
 *    PUT    /ai/kb/docs/{id}            保存正文与标题
 *    PUT    /ai/kb/nodes/{id}/move      移动节点（后端防环 + 重算 path）
 *    DELETE /ai/kb/nodes/{id}           删除节点（文件夹含子节点时后端拒绝或级联）
 *    POST   /ai/kb/docs/{id}/publish    发布
 *
 * 权限：类级 ai:kb:view；写操作 ai:kb:edit；发布 ai:kb:publish（V207 已落库）。
 *
 * 加载策略（对齐飞书 wiki node list 官方契约）：
 *    节点列表只返回元数据，content_md 永远单独拉；parentId 为空 = 一次返回全量可见骨架；
 *    传 parentId = 只取直接子节点，pageSize 上限 50、pageToken 游标翻页；
 *    节点数 > KB_LAZY_THRESHOLD 时后端置 lazyRequired，前端 el-tree 切 lazy + load。
 *    ⚠️ 飞书官方明确：权限过滤可能造成「items 为空但 hasMore=true」，
 *       前端不能把空列表当作「没有子节点」，必须继续翻页。
 */
import request from './request'

export type KbNodeType = 'DOC' | 'FOLDER'
export type KbDocStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED'

/** 节点骨架：树接口只返回这些轻量字段，绝不含 content_md */
export interface KbNode {
  id: number
  /** 父节点 ID，0 = 根 */
  parentId: number
  title: string
  nodeType: KbNodeType
  /** 同级排序号，小在前 */
  sortNo: number
  /** 物化路径 /1/3/7/，面包屑 / 子树查询 / 权限继承 / 防环共用 */
  path: string
  status: KbDocStatus
  version: number
  /** 是否有子节点；供 el-tree 判断 isLeaf，避免展开时空白闪烁 */
  hasChild: boolean
  aclRoles?: string | null
  updatedAt?: string
}

export interface KbNodePage {
  items: KbNode[]
  hasMore: boolean
  nextPageToken?: string | null
  /** 节点规模超阈值，前端应切为按 parentId 懒加载 */
  lazyRequired?: boolean
}

/** 文档详情：点开节点才拉，content_md 是唯一的大字段 */
export interface KbDocDetail {
  id: number
  title: string
  summary: string
  contentMd: string
  status: KbDocStatus
  version: number
  aclRoles?: string | null
  egressAllowed?: boolean
  updatedAt?: string
}

export interface KbNodeQuery {
  /** 不传 = 一次返回全量可见骨架；传值 = 只取该父节点的直接子节点 */
  parentId?: number
  pageSize?: number
  pageToken?: string
  keyword?: string
}

export interface KbNodeCreate {
  parentId: number
  title: string
  nodeType: KbNodeType
  sortNo?: number
}

export interface KbDocUpdate {
  title: string
  summary?: string
  contentMd: string
  /** 正文引用到的 file:<id>，后端据此建 sys_kb_attachment.INLINE 关系 */
  fileRefs?: number[]
}

export function listKbNodes(params: KbNodeQuery = {}) {
  return request.get('/ai/kb/nodes', { params }).then((r) => r.data.data as KbNodePage)
}

export function getKbDoc(id: number) {
  return request.get(`/ai/kb/docs/${id}`).then((r) => r.data.data as KbDocDetail)
}

export function createKbNode(payload: KbNodeCreate) {
  return request.post('/ai/kb/nodes', payload).then((r) => r.data.data as number)
}

export function updateKbDoc(id: number, payload: KbDocUpdate) {
  return request.put(`/ai/kb/docs/${id}`, payload).then((r) => r.data.data)
}

export function moveKbNode(id: number, payload: { parentId: number; sortNo?: number }) {
  return request.put(`/ai/kb/nodes/${id}/move`, payload).then((r) => r.data.data)
}

export function deleteKbNode(id: number) {
  return request.delete(`/ai/kb/nodes/${id}`).then((r) => r.data.data)
}

export function publishKbDoc(id: number) {
  return request.post(`/ai/kb/docs/${id}/publish`).then((r) => r.data.data)
}
