// 审批中心类型（对齐后端 TaskInfo / NodeRef）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface TaskPageVO {
  records: TaskInfoVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 可驳回目标节点（驳回下拉用） */
export interface NodeRefVO {
  nodeId: string
  nodeName: string
}

/** 我的待办任务视图（GET /project/tasks/mine） */
export interface TaskInfoVO {
  /** Flowable 任务 ID（通过 / 驳回的入参） */
  taskId: string
  /** 节点名称 */
  taskName: string
  /** 节点 id（= Flowable taskDefinitionKey） */
  nodeId: string
  /** 流程实例 ID */
  processInstanceId: string
  /** 业务单据标识（如项目 ID） */
  bizKey: string | null
  /** 业务标题（如项目名称，由后端 enrich） */
  bizTitle: string | null
  /** 可驳回目标节点列表 */
  rejectTargets: NodeRefVO[]
  /** 当前处理人用户名（USER / LEVEL 会签节点有值） */
  assignee: string | null
  /** 候选组（ROLE 节点） */
  candidateGroups: string[] | null
  /** 候选人（LEVEL 会签节点一般空，走 assignee 逐人） */
  candidateUsers: string[] | null
  /** 处理人展示名集合（后端解析：用户名→昵称、角色 code→角色名，前端直接渲染标签） */
  handlerNames: string[] | null
  /** 任务创建时间 */
  createTime: string | null
}

/** 历史审批分页结果（与后端 IPage 序列化字段对齐） */
export interface ApprovalHistoryPageVO {
  records: ApprovalHistoryVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 我审批过的历史任务（GET /project/approvals/history/page，与后端 ApprovalHistoryVO 对齐） */
export interface ApprovalHistoryVO {
  /** 历史任务 ID（= 原任务 id） */
  taskId: string
  /** 节点名称 */
  taskName: string
  /** 节点 id */
  nodeId: string
  /** 流程实例 ID */
  processInstanceId: string
  /** 业务单据标识（项目 ID，前端据此调进度接口） */
  bizKey: string | null
  /** 业务标题（项目名称，后端 enrich） */
  bizTitle: string | null
  /** 实际操作人展示名 */
  handlerNames: string[] | null
  /** 审批留言（无则 null） */
  comment: string | null
  /** 我的审批结果：DONE = 通过 / REJECTED = 驳回 */
  result: 'DONE' | 'REJECTED'
  /** 处理时间 */
  endTime: string | null
}
