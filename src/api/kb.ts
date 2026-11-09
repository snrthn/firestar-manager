/**
 * 知识库节点 / 文档接口契约（V208 树形结构 + 步骤 4.5 后端 CRUD）
 *
 * ✅ 后端 KbNodeController 已于 2026-11-09 落码（8 个端点），页面已接真接口，
 *    不再使用本地 MOCK_NODES。需目标库已执行 V206~V209 且后端服务在运行。
 *
 * 路径沿用 AI 中心其它接口的前缀（/ai/prompt-config、/ai/model-config）：
 *    GET    /ai/kb/nodes                 节点骨架（轻量元数据，不含正文）
 *    GET    /ai/kb/docs/{id}            文档正文
 *    POST   /ai/kb/nodes                新建文档 / 文件夹
 *    PUT    /ai/kb/nodes/{id}           重命名节点（§13.4 契约表漏项，步骤 4.5 补齐）
 *    PUT    /ai/kb/docs/{id}            保存正文与标题
 *    PUT    /ai/kb/nodes/{id}/move      相对位置移动（BEFORE/AFTER/APPEND + targetId，
 *                                      服务端防环 + 重算 path + 整组重排 sort_no，见 §21）
 *    DELETE /ai/kb/nodes/{id}           删除节点（有子节点时后端拒绝）
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
  /** 仅作提示：后端一律从 contentMd 重新提取，不信前端传参（防伪造 fileId） */
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

/** 重命名：树内 inline 编辑提交时调用，DOC / FOLDER 通用 */
export function renameKbNode(id: number, title: string) {
  return request.put(`/ai/kb/nodes/${id}`, { title }).then((r) => r.data.data)
}

export function updateKbDoc(id: number, payload: KbDocUpdate) {
  return request.put(`/ai/kb/docs/${id}`, payload).then((r) => r.data.data)
}

/**
 * 相对位置契约（步骤 4.6，设计文档 §21）：
 * 对齐飞书「前端不碰排序号」+ Confluence before/after/append —— 前端只描述
 * 「相对谁、放在哪」，由服务端在同一事务内整组重排同父 sort_no。
 *
 *   BEFORE / AFTER : targetId = 目标兄弟节点 id，移动后成为它的同级并排在它前 / 后
 *   APPEND         : targetId = 目标父节点 id（0 = 根目录），追加到该父末尾
 *
 * ⚠️ 不要再传 parentId + sortNo：前端算绝对排序号正是拖拽顺序漂移的根因。
 *    后端仍兼容旧 payload 仅为存量客户端兜底，本端类型已不再暴露。
 */
export type KbMovePosition = 'BEFORE' | 'AFTER' | 'APPEND'

export interface KbNodeMove {
  position: KbMovePosition
  targetId: number
}

export function moveKbNode(id: number, payload: KbNodeMove) {
  return request.put(`/ai/kb/nodes/${id}/move`, payload).then((r) => r.data.data)
}

export function deleteKbNode(id: number) {
  return request.delete(`/ai/kb/nodes/${id}`).then((r) => r.data.data)
}

export function publishKbDoc(id: number) {
  return request.post(`/ai/kb/docs/${id}/publish`).then((r) => r.data.data)
}

/**
 * REFERENCE 附件（补充材料）接口（步骤 5 扩展）。
 * 附件只登记关系 + 原文件走通用上传（bizType=kb_doc），发布时后端解析文本切片纳入检索。
 * 权限：列表 ai:kb:view；增删 / 切检索开关 ai:kb:edit。
 */
export interface KbAttachment {
  id: number
  docId: number
  /** sys_file_storage.id，拼下载/预览链接用 */
  fileId: number
  /** 原文件名（展示 + 下载命名） */
  originalName: string | null
  /** 1=纳入检索（下次发布切片）；0=仅挂接不检索 */
  indexable: number
  egressAllowed: number
  sortNo: number
  createdAt?: string
}

export function listKbAttachments(docId: number) {
  return request.get(`/ai/kb/docs/${docId}/attachments`).then((r) => r.data.data as KbAttachment[])
}

export function addKbAttachment(docId: number, fileId: number) {
  return request
    .post(`/ai/kb/docs/${docId}/attachments`, { fileId })
    .then((r) => r.data.data as number)
}

export function removeKbAttachment(attId: number) {
  return request.delete(`/ai/kb/attachments/${attId}`).then((r) => r.data.data)
}

export function setKbAttachmentIndexable(attId: number, indexable: number) {
  return request
    .put(`/ai/kb/attachments/${attId}/indexable`, { indexable })
    .then((r) => r.data.data)
}
