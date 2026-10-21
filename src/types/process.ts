// 流程定义模块前后端共享类型（与后端 com.firestar.dto.* 对齐）

export type NodeType = 'USER' | 'ROLE' | 'LEVEL'

/** 流程节点配置（sys_process_def.node_list 数组元素） */
export interface NodeCfg {
  /** 顺序，从 1 递增 */
  seq: number
  /** 节点唯一 ID（BPMN userTask id），如 node_1 */
  nodeId: string
  /** 节点显示名 */
  name: string
  /** USER 指定人 / ROLE 角色候选 / LEVEL 职级解析 */
  type: NodeType
  /** USER: sys_user.id 字符串；ROLE: sys_role.role_code；LEVEL: 职级编码 */
  assignee: string
  /** 是否允许被驳回 */
  rejectable: boolean
}

/** 流程定义 */
export interface ProcessDef {
  id?: number
  processCode: string
  processName: string
  flowableDeploymentId?: string
  defVersion?: number
  status?: string
  nodeList?: NodeCfg[]
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface ProcessDefPageVO {
  records: ProcessDef[]
  total: number
  size: number
  current: number
  pages: number
}

/** 部署结果 */
export interface DeployResult {
  deploymentId: string
  processDefinitionId: string
  version: number
}

/** 历史版本 */
export interface ProcessDefVersionVO {
  version: number
  processDefinitionId: string
  deploymentId: string
  name: string
  suspended: boolean
  deploymentTime?: string
}
