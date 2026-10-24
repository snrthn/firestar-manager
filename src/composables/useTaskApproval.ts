// 审批动作（通过 / 驳回）共享逻辑。
//
// 背景 2026-10-24 虎哥：审批中心「待我审批」的操作列合并为一个「审批」入口，
// 点开是「详情 + 底部审批表单」的合一弹窗 —— 表单同时挂在 ProjectDetailDialog 与
// ShipmentDetailDialog 的 footer。两条流程的 API 不同（立项走 /project/*，发货走
// /shipment/*），但**校验口径必须完全一致**（驳回必填理由、多节点必选退回目标、
// 留言空串后端不落评论），所以抽到这里，避免两个弹窗各写一份然后漂移。
//
// ⚠️ 之前这份逻辑只存在于 approval/list.vue 的独立审批弹窗里；抽出来后两个详情弹窗
// 直接复用，审批中心那份 UI 已删，别再复制回页面里。

import { ref } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { completeTask, rejectTask } from '@/api/approval'
import { completeShipmentTask, rejectShipmentTask } from '@/api/shipment'
import { completeReceiptTask, rejectReceiptTask } from '@/api/receipt'
import { completeInvoiceTask, rejectInvoiceTask } from '@/api/invoice'
import type { ApprovalHistoryVO, TaskInfoVO } from '@/types/approval'

/** 各业务审批流程 key（后端 process_code；待办 enrich 与前端审批动作都按此分发） */
export const SHIPMENT_PROCESS_CODE = 'shipment_approval'
export const RECEIPT_PROCESS_CODE = 'receipt_approval'
export const INVOICE_PROCESS_CODE = 'invoice_approval'

export type ApprovalModule = 'project' | 'shipment' | 'receipt' | 'invoice'

/** 按流程定义 key 分发到对应业务模块（决定走哪套 API） */
export function approvalModuleOf(
  row: TaskInfoVO | ApprovalHistoryVO | null | undefined,
): ApprovalModule {
  switch (row?.processDefinitionKey) {
    case SHIPMENT_PROCESS_CODE:
      return 'shipment'
    case RECEIPT_PROCESS_CODE:
      return 'receipt'
    case INVOICE_PROCESS_CODE:
      return 'invoice'
    default:
      return 'project'
  }
}

/** 是否发货审批任务（立项 / 发货两套 API 的判别依据） */
export const isShipmentTask = (row: TaskInfoVO | ApprovalHistoryVO | null | undefined) =>
  row?.processDefinitionKey === SHIPMENT_PROCESS_CODE

/** 是否回款审批任务（ROLE_CASHIER 单节点） */
export const isReceiptTask = (row: TaskInfoVO | ApprovalHistoryVO | null | undefined) =>
  row?.processDefinitionKey === RECEIPT_PROCESS_CODE

/** 是否发票审批任务（ROLE_INVOICER 单节点） */
export const isInvoiceTask = (row: TaskInfoVO | ApprovalHistoryVO | null | undefined) =>
  row?.processDefinitionKey === INVOICE_PROCESS_CODE

/** 单节点（ROLE）流程：驳回只需填理由，无退回目标节点选择（与立项多节点区分） */
export const isSingleNodeTask = (row: TaskInfoVO | ApprovalHistoryVO | null | undefined) =>
  isShipmentTask(row) || isReceiptTask(row) || isInvoiceTask(row)

// ===== 模块级单例状态（2026-10-24 虎哥：取消/提交按钮上移弹窗 footer 后，footer 按钮
// 与内容区表单面板必须读到同一份 action/saving/submit）——同一时刻只有一个审批弹窗
// 处于活动状态，单例安全；若将来出现多弹窗并存的审批场景，再改 provide/inject 按弹窗隔离 =====
/** 审批结果：默认通过（虎哥 2026-10-22 拍板：一个面板办两种事，默认通过） */
const action = ref<'approve' | 'reject'>('approve')
const comment = ref('')
/** 驳回目标节点（仅立项多节点流程需要；发货单节点无退回目标） */
const rejectTarget = ref('')
const saving = ref(false)

export function useTaskApproval() {
  /** 开窗/切换任务时重置，防上一单的留言串到下一单 */
  const reset = () => {
    action.value = 'approve'
    comment.value = ''
    rejectTarget.value = ''
  }

  /** 当前任务所属业务模块（决定走哪套 API、是否需要选退回节点） */
  const moduleOf = (task: TaskInfoVO) => approvalModuleOf(task)

  /**
   * 提交审批结果。返回 true = 成功（调用方据此关窗并刷新列表）。
   * 失败时错误已在内部 toast，但**调用方仍应刷新列表**——旧任务被「重新提交」终结后
   * 继续点审批必然 400，替用户刷新才能看到新 taskId（2026-10-22 虎哥实测场景）。
   */
  const submit = async (task: TaskInfoVO | null): Promise<boolean> => {
    if (!task) return false
    const mod = moduleOf(task)
    if (action.value === 'reject') {
      // 单节点（ROLE）流程无退回目标（rejectTargets 恒空），仅校验理由；
      // 立项多节点流程需选退回节点（rejectTarget）。
      if (!isSingleNodeTask(task) && !rejectTarget.value) {
        ElMessage.warning('请选择退回节点')
        return false
      }
      if (!comment.value.trim()) {
        ElMessage.warning('请填写驳回理由')
        return false
      }
    }
    saving.value = true
    try {
      const vars = { comment: comment.value.trim() }
      if (action.value === 'approve') {
        // 留言选填：空串后端不落评论（complete 内 comment 非 blank 才 addComment）
        if (mod === 'shipment') await completeShipmentTask(task.taskId, vars)
        else if (mod === 'receipt') await completeReceiptTask(task.taskId, vars)
        else if (mod === 'invoice') await completeInvoiceTask(task.taskId, vars)
        else await completeTask(task.taskId, vars)
        ElMessage.success('已通过')
      } else {
        if (mod === 'shipment') await rejectShipmentTask(task.taskId, comment.value.trim())
        else if (mod === 'receipt') await rejectReceiptTask(task.taskId, comment.value.trim())
        else if (mod === 'invoice') await rejectInvoiceTask(task.taskId, comment.value.trim())
        else await rejectTask(task.taskId, rejectTarget.value, comment.value.trim())
        ElMessage.success('已驳回')
      }
      return true
    } catch (e) {
      ElMessage.error((e as Error).message)
      return false
    } finally {
      saving.value = false
    }
  }

  return { action, comment, rejectTarget, saving, reset, submit, moduleOf }
}
