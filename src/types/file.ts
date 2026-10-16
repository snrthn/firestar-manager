// 文件管理模块前后端共享类型（与后端 com.firestar.dto.FileVO / FileDownloadLogVO 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface FilePageVO {
  records: FileVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface FileVO {
  id: number
  /** 落盘名（服务端生成，展示用 originalName） */
  fileName: string | null
  /** 原始文件名（展示用） */
  originalName: string | null
  /** 文件别名（文件管理处维护，展示/审计用；为空回退 originalName） */
  alias: string | null
  /** 文件类型（字典 file_type） */
  fileType: string | null
  /** 关联业务类型（invoice/receipt 等，为空归到 common） */
  bizType: string | null
  /** 文件大小（字节） */
  fileSize: number | null
  mimeType: string | null
  /** 存储类型：LOCAL 本地磁盘 / OSS 阿里云对象存储 */
  storageType: string | null
  /** 状态：NORMAL 正常 / ARCHIVED 已归档 / DELETED 已删除（列表只含 NORMAL） */
  status: string | null
  /** 下载次数 */
  downloadCount: number | null
  uploaderId: number | null
  uploaderName: string | null
  createdAt: string | null
}

/** 下载记录分页结果 */
export interface FileDownloadLogPageVO {
  records: FileDownloadLogVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface FileDownloadLogVO {
  id: number
  fileId: number | null
  /** 文件名（冗余，便于列表直接展示；文件被删后仍能看出下载过什么） */
  fileName: string | null
  /** 文件别名（V23 随 fileName 一起按 fileId 回查带出；为空回退 fileName） */
  alias: string | null
  bizType: string | null
  bizId: number | null
  downloaderId: number | null
  downloaderName: string | null
  downloadedAt: string | null
  downloadIp: string | null
}
