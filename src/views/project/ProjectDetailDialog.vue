<script setup lang="ts">
import { computed, ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { projectDetail, projectTimeline, withdrawProject } from '@/api/project'
import { getFileDetail, downloadFileUrl } from '@/api/file'
import type { ProjectVO } from '@/types/project'
import type { TimelineNodeVO } from '@/types/project'
import type { TaskInfoVO } from '@/types/approval'
import type { FileVO } from '@/types/file'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import ApprovalActionForm from '@/components/ApprovalActionForm.vue'
import EmptyState from '@/components/EmptyState.vue'
// 合同附件预览复用文件管理模块的预览弹窗（与发票详情同口径，2026-10-25 虎哥要求）：
// 图片/PDF/音视频判定、blob 取字节与 objectURL 回收全在组件内，本窗不自己拼 URL
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'
import { downloadViaBackend } from '@/utils/fileDownload'
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

// 超收标记（虎哥 2026-10-27 采纳）：累计已收 > 合同金额时，详情/列表打红色「⚠ 超收」标记，
// 让历史脏数据（如录入整份合同额的收款单）可见、可审计，而非藏在水下。前端同源判断，
// 用页面已展示的 collectedAmount 与 contractAmount 比较，避免引入新口径。
const isOverCollected = computed(() => {
  const d = detail.value
  if (!d || d.collectedAmount == null || d.contractAmount == null) return false
  return Number(d.collectedAmount) > Number(d.contractAmount)
})
const overAmount = computed(() => {
  const d = detail.value
  if (!d || d.collectedAmount == null || d.contractAmount == null) return 0
  return Math.max(0, Number(d.collectedAmount) - Number(d.contractAmount))
})

// ===== 成熟业财口径：毛/净分离 + 红字行 + 钩稽链（2026-10-28 重构） =====
// 净发货 = 累计发货(毛) - 累计退货；
// 未开票余额 = 净发货 - 累计开票(净额)；
// 未收余额 = 有效应收(净额) - 累计已收(净额)。
// 这些才是真正能和合同额对上账的钩稽数（原详情只挂孤立毛/净，对不上合同额）。
const netShipment = computed(() => {
  const d = detail.value
  if (!d) return 0
  return (Number(d.shippedAmount) || 0) - (Number(d.returnedAmount) || 0)
})
const uninvoicedBalance = computed(() => {
  const d = detail.value
  if (!d) return 0
  return netShipment.value - (Number(d.invoicedAmount) || 0)
})
const unreceivedBalance = computed(() => {
  const d = detail.value
  if (!d) return 0
  return (Number(d.receivableAmount) || 0) - (Number(d.collectedAmount) || 0)
})
// 红字行的「未收余额为负」即超收（已收 > 有效应收），与上方合同额超收标记同源互补
const isUnreceivedNegative = computed(() => unreceivedBalance.value < 0)

const { label: statusLabel, style: statusStyle } = useDictLabels('approval_status')
const { label: contractStatusLabel } = useDictLabels('project_contract_status')

const load = async (id: number) => {
  loading.value = true
  try {
    const [d, tl] = await Promise.all([projectDetail(id), projectTimeline(id)])
    detail.value = d
    timeline.value = tl
    await loadContractFiles(d)
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

// ===== 合同附件（V84：签约必传，详情只读展示 + 预览/下载） =====
const contractFiles = ref<FileVO[]>([])

/**
 * 合同附件只走详情返回的 contractFileIds 逐个取文件元信息（列表接口不返回该字段，避 N+1）。
 * 合同文件通常 1~3 份，逐个取比「拉一整页文件再筛 bizId」更省也更准（后者依赖分页上限）。
 */
const loadContractFiles = async (d: ProjectVO) => {
  const ids = d.contractFileIds || []
  if (ids.length === 0) {
    contractFiles.value = []
    return
  }
  try {
    const files = await Promise.all(ids.map((fid) => getFileDetail(fid)))
    contractFiles.value = files.filter((f): f is FileVO => !!f)
  } catch (e) {
    ElMessage.error((e as Error).message)
    contractFiles.value = []
  }
}

const previewVisible = ref(false)
const previewRow = ref<FileVO | null>(null)
const handlePreview = (f: FileVO) => {
  previewRow.value = f
  previewVisible.value = true
}

/** 下载走 downloadViaBackend（OSS 直连 / 本地带 token 取 blob 落地，不起新页签） */
const handleDownload = async (f: FileVO) => {
  try {
    const url = await downloadFileUrl(f.id)
    await downloadViaBackend(url, f.originalName || f.fileName || `文件#${f.id}`)
  } catch (e) {
    ElMessage.error((e as Error).message)
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
/**
 * 撤回：仅审批已发出（APPROVING）才有意义 —— 2026-10-30 虎哥：草稿态不给撤回入口。
 *
 * 原判定额外放行 PENDING_APPROVAL（立项旧版「待审批」字面量），实测是坑：库里 144 条
 * PENDING_APPROVAL 的 process_instance_id 全为空（压根没提交过审批 = 纯草稿），
 * 撤回必然撞 engine.withdraw(null) 报错。故只认 APPROVING（其 3 条均有流程实例）。
 * 后端引擎仍有「发起人身份 + 流程运行中」两道闸，这里只做前端可见性。
 */
const canWithdraw = () => detail.value?.approvalStatus === 'APPROVING'

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
      <el-empty v-if="!detail" description="暂无项目数据" :image-size="60" />
      <template v-else>
        <!-- 基本信息（不含金额，金额统一收进下方「业财口径」分区，毛/净分离 + 红字行） -->
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
          <el-descriptions-item v-if="detail.contractSignedAt" label="签约时间">
            {{ formatDateTime(detail.contractSignedAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.contractSignedByName" label="签约人">
            {{ detail.contractSignedByName }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.contractDesc" label="签约描述" :span="3">
            {{ detail.contractDesc }}
          </el-descriptions-item>
          <!-- 合同附件（V84）：签约必传，故签约后必有；未签约时整行不显示（没东西可看） -->
          <el-descriptions-item v-if="detail.contractStatus === 'SIGNED'" label="合同附件" :span="3">
            <span v-if="!contractFiles.length" class="muted">—</span>
            <div v-else class="attach-list">
              <div v-for="f in contractFiles" :key="f.id" class="attach-item">
                <el-button
                  link
                  type="primary"
                  size="small"
                  class="attach-name"
                  :title="f.originalName || f.fileName || `文件#${f.id}`"
                  @click="handlePreview(f)"
                >
                  <span class="attach-name-text">{{ f.originalName || f.fileName || `文件#${f.id}` }}</span>
                </el-button>
                <el-button link type="primary" size="small" @click="handleDownload(f)">下载</el-button>
              </div>
            </div>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 业财口径（2026-10-28 重构）：成熟 ERP 的毛/净分离 + 红字行 + 钩稽链。
             红字行（退货/红冲）用红字独立展示，钩稽行让金额能对到合同额上。
             布局用固定列宽网格 132px 1fr 132px 1fr：因每个区块等宽，中间标签列(L2)
             左边缘恒定 = 面板宽度/2（即面板中线），三个区块严格对齐
             （之前的 el-descriptions 自动列宽会因数值内容不同错位，已弃用）。 -->
        <h4 class="block-title">合同与发货</h4>
        <div class="fin-grid">
          <div class="fin-cell label">合同金额（签约）</div>
          <div class="fin-cell value">{{ formatAmount(detail.contractAmount) }}</div>
          <div class="fin-cell label">累计发货（毛）</div>
          <div class="fin-cell value">{{ formatAmount(detail.shippedAmount) }}</div>
          <div class="fin-cell label">累计退货</div>
          <div class="fin-cell value"><span class="red-amount">{{ formatAmount(detail.returnedAmount) }}</span></div>
          <div class="fin-cell label">净发货（钩稽）</div>
          <div class="fin-cell value"><strong>{{ formatAmount(netShipment) }}</strong></div>
        </div>

        <h4 class="block-title">应收与回款</h4>
        <div class="fin-grid">
          <div class="fin-cell label">有效应收（净额）</div>
          <div class="fin-cell value">{{ formatAmount(detail.receivableAmount) }}</div>
          <div class="fin-cell label">红冲应收</div>
          <div class="fin-cell value"><span class="red-amount">{{ formatAmount(detail.redReceivableAmount) }}</span></div>
          <div class="fin-cell label">累计已收（净额）</div>
          <div class="fin-cell value">
            <span :class="isOverCollected ? 'over-amount' : ''">{{ formatAmount(detail.collectedAmount) }}</span>
            <el-tooltip v-if="isOverCollected" :content="`⚠ 超收 ${formatAmount(overAmount)}，累计已收已超过合同金额`" placement="top">
              <span style="color:#e6a23c;margin-left:6px;font-size:13px;line-height:1;cursor:pointer">⚠</span>
            </el-tooltip>
          </div>
          <div class="fin-cell label">红冲回款</div>
          <div class="fin-cell value"><span class="red-amount">{{ formatAmount(detail.redReceivedAmount) }}</span></div>
          <div class="fin-cell label">未收余额（钩稽）</div>
          <div class="fin-cell value"><strong :style="isUnreceivedNegative ? 'color:#f56c6c' : ''">{{ formatAmount(unreceivedBalance) }}</strong></div>
          <div class="fin-cell label">回款前开票</div>
          <div class="fin-cell value">{{ detail.allowInvoiceBeforeReceipt === false ? '不允许（强制票款勾稽）' : '允许' }}</div>
        </div>

        <h4 class="block-title">开票</h4>
        <div class="fin-grid">
          <div class="fin-cell label">累计开票（净额）</div>
          <div class="fin-cell value">{{ formatAmount(detail.invoicedAmount) }}</div>
          <div class="fin-cell label">红字发票</div>
          <div class="fin-cell value"><span class="red-amount">{{ formatAmount(detail.redInvoicedAmount) }}</span></div>
          <div class="fin-cell label">未开票余额（钩稽）</div>
          <div class="fin-cell value"><strong :style="uninvoicedBalance < 0 ? 'color:#e6a23c' : ''">{{ formatAmount(uninvoicedBalance) }}</strong></div>
          <div class="fin-cell label">—</div>
          <div class="fin-cell value">—</div>
        </div>

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
          <el-table-column prop="quantity" label="合同量" width="90" align="right" header-align="center" />
          <el-table-column prop="shippedQty" label="已发量" width="90" align="right" header-align="center" />
          <el-table-column prop="unitPrice" label="单价" width="110" align="right" header-align="center">
            <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column prop="totalAmount" label="行金额" width="120" align="right" header-align="center">
            <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState description="暂无货物明细" />
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
            v-has-perm="'project:sign'"
            type="primary"
            @click="emit('sign', detail)"
          >签约</el-button>
        </template>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>

  <!-- 合同附件预览：复用文件管理模块的预览弹窗（与发票详情同款） -->
  <FilePreviewDialog v-model="previewVisible" :file="previewRow" />
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
/* 业财口径：红字行（退货/红冲）走红字 */
.red-amount {
  color: #f56c6c;
  font-weight: 600;
}
.over-amount {
  color: #f56c6c;
  font-weight: 600;
}
/* 业财口径：固定列宽网格（132px 1fr 132px 1fr）。
   关键：每个区块等宽 → 中间标签列(L2)左边缘恒定 = 面板宽度/2（即面板中线），
   三个区块严格对齐，不再因数值内容不同错位。
   金额按自然左对齐（虎哥 2026-10-28：不要右对齐）。 */
.fin-grid {
  display: grid;
  grid-template-columns: 132px 1fr 132px 1fr;
  border: 1px solid var(--el-border-color-lighter);
  border-bottom: none;
  margin-bottom: 8px;
}
.fin-grid > .fin-cell {
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 7px 12px;
  font-size: 13px;
  line-height: 20px;
  min-width: 0;
}
.fin-grid > .fin-cell:nth-child(4n) {
  border-right: none;
}
.fin-grid > .fin-cell.label {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.fin-grid > .fin-cell.value {
  text-align: left;
  overflow-wrap: break-word;
}

/* ===== 合同附件（V84）：与发票详情弹窗 .attach-list/.attach-item 同款命名与样式 ===== */
.attach-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.attach-item {
  display: flex;
  align-items: center;
  gap: 12px;
  line-height: 22px;
}
/* line-height 必须显式给 1.5（与 InvoiceDetailDialog / InvoiceIssueDialog / project-list /
   ReceiptCreateDialog 四处同款，2026-10-25 定稿成例）：
   `.el-button{ line-height:1 }` 是 Element Plus 自带、**直接命中 button 元素**的样式 ——
   CSS 里「直接指定永远赢过继承」，父容器 .attach-item 的 line-height:22px 根本传不进去。
   于是 12px 文字落进 12px 行盒，g/j/p/q/y 的下半截被 overflow:hidden 切掉。
   ⚠️ 不要试图用 vertical-align:bottom 补救：inline-block + bottom 会把下降部进一步推向盒底，切得更狠。 */
.attach-name {
  line-height: 1.5;
}
.attach-name-text {
  display: block;
  min-width: 0;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}
.muted {
  color: #909399;
  font-size: 13px;
}
</style>
