// 历史数据导入模块前后端类型（与后端 ImportBatch / ImportHandler 对齐）

/** 批次状态 */
export type ImportBatchStatus =
  | 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ARCHIVED'

/** 流水线阶段 */
export type ImportPhase =
  | 'QUEUED' | 'PARSING' | 'VALIDATING' | 'WRITING' | 'RECONCILING' | 'DONE'

/** 导入批次（对应后端 sys_import_batch） */
export interface ImportBatch {
  id: number
  batchNo: string
  importKey: string
  operatorId: number | null
  fileName: string | null
  fileSha256: string | null
  fileStorageId: number | null
  phase: ImportPhase
  status: ImportBatchStatus
  activeFlag: number
  totalRows: number
  successRows: number
  failRows: number
  processedRows: number
  progressPct: number
  parentBatchNo: string | null
  startedAt: string | null
  finishedAt: string | null
  notifySent: number
  ext: Record<string, unknown> | null
  remark: string | null
  createdAt: string
}

/** 导入类型（GET /import/keys） */
export interface ImportKeyOption {
  key: string
  displayName: string
}

/** 提交响应 */
export interface ImportSubmitResult {
  batchNo: string
}
