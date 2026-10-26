<script setup lang="ts">
import { computed, ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { projectDetail, projectTimeline, withdrawProject } from '@/api/project'
import type { ProjectVO } from '@/types/project'
import type { TimelineNodeVO } from '@/types/project'
import type { TaskInfoVO } from '@/types/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import ApprovalActionForm from '@/components/ApprovalActionForm.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTaskApproval } from '@/composables/useTaskApproval'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'

// 立项详情弹窗（2026-10-23 虎哥：业务操作收进详情，列表操作列只留「编辑 + 详情」）。
//
// 【布局口径 2026-10-24 虎哥拍板】与发货详情对齐：**不用 Tab**，自上而下按标题分区
// （基本信息 → 货物明细 → 审批进度）。原因：详情内容一屏能读完，Tab 反而逼用户点三下
// 才能看全，且两处模块两套做法本身就是不一致。分区标题沿用发货详情的 .block-title。
//
// 【readonly 模式】审批中心复用本弹窗查看别人发起的立项时传 true：隐藏底部动作区
// （提交审批/签约/撤回都是发起人自己的动作，审批人不该看到，点了也是越权报错）。
//
// 设计纪律：业务动作一律 emit 给列表页执行（提交审批/签约的弹窗与校验逻辑在列表侧已有，
// 详情弹窗不复制第二份，避免两处逻辑漂移）；撤回是本弹窗自持（纯确认动作，无额外表单）。
// 【审批模式 approvalTask】（2026-10-24 虎哥）：审批中心「待我审批」点「审批」时传入当前
// 待办任务，本弹窗从「查看」切换为「工作台」——内容照旧是详情，底部动作区换成审批表单。
// 这样审批人一边看单据一边决定通过与驳回，不用在「详情窗 / 审批窗」之间来回切，
// 也消灭了第二个审批 UI（原 480px 独立审批弹窗已删）。
const props = defineProps<{
  projectId: number | null
  readonly?: boolean
  /** 传入即进入审批模式（详情 + 底部审批表单） */
  approvalTask?: TaskInfoVO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{
  updated: []
  submit: [projectId: number]
  sign: [row: ProjectVO]
  /** 审批已处理：带回 ok，父级成功才清空审批态（失败保留可重试） */
  approved: [ok: boolean]
}>()

/** 审批模式标题：带上业务名，与原来独立审批弹窗的口径一致 */
const dialogTitle = () =>
  props.approvalTask
    ? `审批 - ${props.approvalTask.bizTitle || props.approvalTask.taskName || '立项'}`
    : '立项详情'

/** 审批表单回报：成功才关窗；无论成功失败都通知列表刷新（详见 ApprovalActionForm 注释） */
const handleApprovalSettled = (ok: boolean) => {
  if (ok) visible.value = false
  emit('approved', ok)
}

// 审批状态/提交与内容区表单面板共享（useTaskApproval 模块级单例）
const { action, saving, submit } = useTaskApproval()

/** footer 审批提交：校验与 API 分发在 useTaskApproval，结果走 handleApprovalSettled */
const handleApprovalConfirm = async () => {
  if (!props.approvalTask) return
  const ok = await submit(props.approvalTask)
  handleApprovalSettled(ok)
}

const loading = ref(false)
const detail = ref<ProjectVO | null>(null)
const timeline = ref<TimelineNodeVO[]>([])
const acting = ref(false)

const { label: statusLabel, style: statusStyle } = useDictLabels('approval_status')
const { label: contractStatusLabel } = useDictLabels('project_contract_status')

const load = async (id: number) => {
  loading.value = true
  try {
    const [d, tl] = await Promise.all([projectDetail(id), projectTimeline(id)])
    detail.value = d
    timeline.value = tl
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.projectId] as const,
  ([open, id]) => {
    if (open && id != null) load(id)
  },
)

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ===== 底部动作区判定（与列表 canSign 同口径，避免两处判定漂移） =====
const canSubmit = () =>
  detail.value?.approvalStatus === 'DRAFT' || detail.value?.approvalStatus === 'REJECTED'
const canSign = () =>
  detail.value?.approvalStatus === 'APPROVED' && detail.value?.contractStatus === 'UNSIGNED'
// 撤回：审批流程仍在运行（方案 B）。后端引擎再做「发起人身份 + 流程运行中」两道闸，
// 这里只做前端可见性判断，越权/已结束由后端兜底报错
const canWithdraw = () =>
  detail.value?.approvalStatus === 'APPROVING' || detail.value?.approvalStatus === 'PENDING_APPROVAL'

const handleWithdraw = async () => {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `撤回后本次立项审批将终止，状态置为「已撤销」（终态，需重新立项）。确认撤回「${detail.value.projectName}」？`,
      '撤回确认',
      { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await withdrawProject(detail.value.id)
    ElMessage.success('已撤回，审批流程已终止')
    // 撤回是终态动作（单据变「已撤销」），停留在本窗无后续可做 → 关窗并把列表刷新交给父级
    // （2026-10-24 虎哥：提交完就该关窗）
    visible.value = false
    emit('updated')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}

const items = computed(() => detail.value?.items || [])
const itemsTotal = computed(() =>
  items.value.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0),
)
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle()" width="1000px" top="7vh">
    <div v-loading="loading" class="detail-scroll">
      <el-empty v-if="!detail" description="暂无数据" :image-size="60" />
      <template v-else>
        <el-descriptions :column="3" border size="small" class="head-desc kv-desc">
          <el-descriptions-item label="项目名称">{{ detail.projectName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目编号">{{ detail.projectNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detail.customerName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="销售经理">{{ detail.salesManagerName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="审批状态">
            <el-tag :type="statusStyle(detail.approvalStatus) || 'info'" size="small">
              {{ statusLabel(detail.approvalStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="签约状态">
            {{ contractStatusLabel(detail.contractStatus) || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="合同金额">{{ formatAmount(detail.contractAmount) }}</el-descriptions-item>
          <el-descriptions-item label="累计发货">{{ formatAmount(detail.shippedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="累计已收">{{ formatAmount(detail.collectedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="累计开票">{{ formatAmount(detail.invoicedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="应收合计">{{ formatAmount(detail.receivableAmount) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.contractSignedAt" label="签约时间">
            {{ formatDateTime(detail.contractSignedAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.contractSignedByName" label="签约人">
            {{ detail.contractSignedByName }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.contractDesc" label="签约描述" :span="3">
            {{ detail.contractDesc }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 货物明细（分区标题与发货详情 .block-title 同款，2026-10-24 统一布局口径）。
             合计放标题行右对齐（虎哥 2026-10-24）：原来挂在表格下方单独占一行，视觉上和明细脱节 -->
        <h4 class="block-title">
          <span>货物明细</span>
          <span v-if="items.length" class="items-total">合计：{{ formatAmount(itemsTotal) }}</span>
        </h4>
        <el-table :data="items" border size="small">
          <el-table-column prop="itemName" label="货物" min-width="150" show-overflow-tooltip />
          <el-table-column prop="specModel" label="规格" min-width="120" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column prop="quantity" label="合同量" width="90" align="right" />
          <el-table-column prop="shippedQty" label="已发量" width="90" align="right" />
          <el-table-column prop="unitPrice" label="单价" width="110" align="right">
            <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column prop="totalAmount" label="行金额" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState />
          </template>
        </el-table>

        <!-- 审批进度（内联 ApprovalTimeline，不弹中弹）。
             超过 3 条默认折叠（2026-10-24 虎哥）：反复驳回重提的单子会堆成十几条，
             铺开会把上面的基本信息和货物明细顶到看不见 -->
        <h4 class="block-title">审批进度</h4>
        <ApprovalTimeline
          :timeline="timeline"
          :collapse-after="3"
          empty-text="暂无审批记录（未提交审批或流程未开始）"
        />

        <!-- 当前审批（2026-10-24 虎哥：从 footer 横条改为内容区标题分区，带卡片面板，
             审批人一边看单据/进度一边处理，不用在详情窗与审批窗之间来回切；
             提交/取消按钮在 footer，表单面板只放输入控件） -->
        <h4 v-if="approvalTask" class="block-title">当前审批</h4>
        <ApprovalActionForm v-if="approvalTask" :task="approvalTask" />
      </template>
    </div>

    <template #footer>
      <!-- 审批模式：表单在内容区「当前审批」，提交/取消按钮归 footer（虎哥 2026-10-24） -->
      <template v-if="approvalTask">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          :type="action === 'reject' ? 'danger' : 'primary'"
          :loading="saving"
          @click="handleApprovalConfirm"
        >{{ action === 'reject' ? '确定驳回' : '确认通过' }}</el-button>
      </template>
      <template v-else>
        <!-- readonly（审批中心查看他人单据）：业务动作全部隐藏 —— 提交审批/签约/撤回
             都是发起人自己的动作，给审批人看到点了也是后端越权报错，不如不给入口 -->
        <template v-if="detail && !readonly">
          <el-button
            v-if="canWithdraw()"
            type="danger"
            plain
            :loading="acting"
            @click="handleWithdraw"
          >撤回申请</el-button>
          <el-button
            v-if="canSubmit()"
            type="primary"
            @click="emit('submit', detail.id)"
          >提交审批</el-button>
          <el-button
            v-if="canSign()"
            type="primary"
            @click="emit('sign', detail)"
          >签约</el-button>
        </template>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
/* .head-desc / .block-title / .items-total 已上提到 styles/pages.css 全局（2026-10-25），
   发货详情与退货详情同吃一份，避免三份 scoped 副本漂移——老注释里的「两处同步」作废。 */
/* 迷你滚动条（虎哥 2026-10-24：默认滚动条太宽，视觉差）——
   与 ShipmentDetailDialog 的 .detail-scroll 保持同款，改必须两处同步 */
.detail-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.detail-scroll::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}
.detail-scroll::-webkit-scrollbar-thumb:hover {
  background: #909399;
}
.detail-scroll::-webkit-scrollbar-track {
  background: transparent;
}
/* 同发货详情弹窗：限高 + 内部滚动（top 7vh + header/footer/padding/margin 余量 ≈ 280px），
   避免 dialog 总高超视口把页面顶出滚动条（2026-10-23 实测坑） */
.detail-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
</style>
