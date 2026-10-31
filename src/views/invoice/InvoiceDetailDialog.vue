<script setup lang="ts">
import { ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { Download } from '@element-plus/icons-vue'
import { invoiceDetail, invoiceTimeline, submitInvoice, withdrawInvoice } from '@/api/invoice'
import { listFiles, downloadFileUrl } from '@/api/file'
import type { InvoiceVO } from '@/types/invoice'
import type { FileVO } from '@/types/file'
import type { TimelineNodeVO } from '@/types/project'
import type { TaskInfoVO } from '@/types/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import ApprovalActionForm from '@/components/ApprovalActionForm.vue'
// 预览一律复用文件管理模块的 FilePreviewDialog（2026-10-25 虎哥要求）：
// 本窗不自己拼 URL，也不算 OSS/本地分流，图片/PDF/音视频判定、blob 取字节、
// objectURL 泄漏回收、全屏、复制链接、失败重试全在组件内，行为与文件管理页一致。
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'
import { useTaskApproval } from '@/composables/useTaskApproval'
import { useDictLabels } from '@/composables/useDict'
import { formatDate, formatDateTime } from '@/utils/datetime'
import { downloadViaBackend } from '@/utils/fileDownload'

// 发票详情弹窗（卡片化：信息 + 审批时间线 + 状态推进）。
// 状态推进（虎哥统一规划：审批动作收归审批中心，本弹窗只做业务推进）：
//  - PENDING / REJECTED → 提交审批（申请人自己的动作；驳回后可改后重提）
//  - DRAFT / APPROVING → 撤回（申请人自己的动作）
const props = defineProps<{
  invoiceId: number | null
  readonly?: boolean
  approvalTask?: TaskInfoVO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{
  updated: []
  approved: [ok: boolean]
  /** 红冲入口（2026-10-25）：父级打开新建弹窗（红冲模式），参数 = 被冲销的发票 ID */
  redFlush: [invoiceId: number]
}>()

const dialogTitle = () =>
  props.approvalTask
    ? `审批 - ${props.approvalTask.bizTitle || props.approvalTask.taskName || '发票单'}`
    : '发票详情'

const handleApprovalSettled = (ok: boolean) => {
  if (ok) visible.value = false
  emit('approved', ok)
}

const { action, saving, submit } = useTaskApproval()

const handleApprovalConfirm = async () => {
  if (!props.approvalTask) return
  const ok = await submit(props.approvalTask)
  handleApprovalSettled(ok)
}

const loading = ref(false)
const detail = ref<InvoiceVO | null>(null)
const timeline = ref<TimelineNodeVO[]>([])
/** 发票附件（软关联：sys_file_storage.bizType='invoice' + bizId=本单 id） */
const attachFiles = ref<FileVO[]>([])

/**
 * 附件业务类型字面量（三方一致：后端 InvoiceServiceImpl / file_biz_type 字典 / 本常量）。
 * 与发货签收证据（V54 shipment_receive_proof）同构。
 */
const ATTACH_BIZ_TYPE = 'invoice'

const { label: statusLabel, style: statusStyle } = useDictLabels('approval_status')
const { label: typeLabel, style: typeStyle } = useDictLabels('invoice_type')
const { label: docDirectionLabel, style: docDirectionStyle } = useDictLabels('doc_direction')

// ===== 附件（V62 软关联，只读展示 + 下载） =====

const loadAttachments = async (id: number) => {
  try {
    // 文件列表默认只含 NORMAL；按 bizType 拉一页再按 bizId 精筛（同发货签收证据的做法）
    const fp = await listFiles(1, 200, { bizType: ATTACH_BIZ_TYPE })
    attachFiles.value = (fp.records || []).filter((f) => f.bizId === id)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

/**
 * 预览：直接交给 FilePreviewDialog（与「文件管理」列表同一套）。
 * 2026-10-25 前版本的写法是「取下载 URL + window.open 新页签」，三个问题已在 FilePreviewDialog 内
 * 统一解决，本窗不再自己实现：
 *   1) 口径错：预览走 download 接口会累加下载数并写下载记录（预览≠下载）；
 *   2) 本地模式 objectURL 建完从不 revoke，关弹窗后整份文件仍挂在内存里；
 *   3) 不支持格式（如 xlsx）在新页签里是一屏乱码，没有「请下载后查看」的引导。
 */
const previewVisible = ref(false)
const previewRow = ref<FileVO | null>(null)
const handlePreview = (f: FileVO) => {
  previewRow.value = f
  previewVisible.value = true
}

/** 下载：与文件管理列表一致走 downloadViaBackend（OSS 直连 / 本地带 token 取 blob 落地，不起新页签） */
const handleDownload = async (f: FileVO) => {
  try {
    const url = await downloadFileUrl(f.id)
    await downloadViaBackend(url, f.originalName || f.fileName || `文件#${f.id}`)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const load = async (id: number) => {
  loading.value = true
  try {
    const [d, tl] = await Promise.all([invoiceDetail(id), invoiceTimeline(id)])
    detail.value = d
    timeline.value = tl
    await loadAttachments(id)
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.invoiceId] as const,
  ([open, id]) => {
    if (open && id != null) load(id)
  },
)

const acting = ref(false)

const reload = async () => {
  if (props.invoiceId != null) {
    await load(props.invoiceId)
    emit('updated')
  }
}

// 注意：状态字段真名是 approvalStatus（V75 由 InvoiceVO.invoiceStatus 改名，非 status）
// 草稿态 + 已驳回态可提交（2026-10-25 用友范式：驳回=回到编写中，改完可重提）
const canSubmit = () => detail.value?.approvalStatus === 'DRAFT' || detail.value?.approvalStatus === 'REJECTED'
/**
 * 撤回 = 申请已发出（审批中）才有的动作（2026-10-30 虎哥：草稿态不给撤回入口）。
 * 草稿单据压根没进流程，撤回无从谈起（后端 engine.withdraw 也只认运行中的流程实例）。
 */
const canWithdraw = () => detail.value?.approvalStatus === 'APPROVING'
// 红冲入口（V95 发票流程重构）：仅「已开票」ISSUED 的单据可冲（SUBMITTED 只是审批通过待开票，尚未产生票面，不可红冲）；红冲单本身不再套娃
const canRedFlush = () =>
  detail.value?.approvalStatus === 'ISSUED' && detail.value?.docDirection !== 'RED'

const handleSubmit = async () => {
  if (!detail.value) return
  acting.value = true
  try {
    await submitInvoice(detail.value.id)
    ElMessage.success('已提交审批，进入开票审批')
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}

const handleWithdraw = async () => {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `撤回后本次开票审批将终止，状态置为「已撤销」（终态，需重新发起）。确认撤回发票单 ${detail.value.invoiceNo || detail.value.id}？`,
      '撤回确认',
      { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await withdrawInvoice(detail.value.id)
    ElMessage.success('已撤回，审批流程已终止')
    visible.value = false
    emit('updated')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle()" width="1000px" top="7vh">
    <div v-loading="loading" class="detail-scroll">
      <el-empty v-if="!detail" description="暂无发票数据" :image-size="60" />
      <template v-else>
        <el-descriptions :column="3" border size="small" class="head-desc kv-desc">
          <el-descriptions-item label="业务单号">{{ detail.applyNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发票号码">{{ detail.invoiceNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发票类型">
            <el-tag :type="typeStyle(detail.invoiceType) || 'info'" size="small">
              {{ typeLabel(detail.invoiceType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发票代码">{{ detail.invoiceCode || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目名称">{{ detail.projectName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="关联应收单">{{ detail.receivableNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="开票金额">{{ formatAmount(detail.invoiceAmount) }}</el-descriptions-item>
          <el-descriptions-item label="税率">
            {{ detail.taxRate == null ? '—' : `${Number(detail.taxRate) * 100}%` }}
          </el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatAmount(detail.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="开票状态">
            <el-tag :type="statusStyle(detail.approvalStatus) || 'info'" size="small">
              {{ statusLabel(detail.approvalStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="单据方向">
            <el-tag :type="docDirectionStyle(detail.docDirection) || 'info'" size="small">
              {{ docDirectionLabel(detail.docDirection) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="开票日期">{{ formatDate(detail.invoiceDate) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.originalInvoiceId" label="原单">
            {{ detail.originalInvoiceNo || `发票#${detail.originalInvoiceId}` }}
          </el-descriptions-item>
          <el-descriptions-item label="核销分配" :span="1">
            <span v-if="!detail.allocations?.length" class="muted">—（主应收单独享）</span>
            <div v-else class="attach-list">
              <div v-for="a in detail.allocations" :key="a.receivableId" class="attach-item">
                <span class="attach-name-text">{{ a.receivableNo || `应收单#${a.receivableId}` }}</span>
                <span class="alloc-amt">{{ formatAmount(a.amount) }}</span>
              </div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="开票人">{{ detail.clerkName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicantName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="发票文件" :span="2">
            <span v-if="!attachFiles.length" class="muted">—</span>
            <div v-else class="attach-list">
              <div v-for="f in attachFiles" :key="f.id" class="attach-item">
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
                <el-button link type="primary" size="small" :icon="Download" v-has-perm="'file:download'" @click="handleDownload(f)">
                  下载
                </el-button>
              </div>
            </div>
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="block-title">购方信息（发票抬头）</h4>
        <el-descriptions :column="3" border size="small" class="kv-desc">
          <el-descriptions-item label="购方名称">{{ detail.buyerName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="纳税人识别号">{{ detail.buyerTaxNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="购方电话">{{ detail.buyerPhone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="开户银行">{{ detail.buyerBankName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="银行账号" :span="2">{{ detail.buyerBankAccount || '—' }}</el-descriptions-item>
          <el-descriptions-item label="购方地址" :span="3">{{ detail.buyerAddress || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="block-title">审批时间线</h4>
        <ApprovalTimeline :timeline="timeline" :collapse-after="3" empty-text="暂无审批记录" />

        <h4 v-if="approvalTask" class="block-title">当前审批</h4>
        <ApprovalActionForm v-if="approvalTask" :task="approvalTask" />
      </template>
    </div>

    <template #footer>
      <template v-if="approvalTask">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          :type="action === 'reject' ? 'danger' : 'primary'"
          :loading="saving"
          @click="handleApprovalConfirm"
        >{{ action === 'reject' ? '确定驳回' : '确认通过' }}</el-button>
      </template>
      <template v-else>
        <template v-if="detail && !readonly">
          <el-button
            v-if="canSubmit()"
            type="primary"
            :loading="acting"
            @click="handleSubmit"
          >提交审批</el-button>
          <el-button
            v-if="canWithdraw()"
            type="danger"
            plain
            :loading="acting"
            @click="handleWithdraw"
          >撤回申请</el-button>
          <el-button
            v-if="canRedFlush()"
            type="warning"
            plain
            :loading="acting"
            @click="emit('redFlush', detail.id)"
          >红冲</el-button>
        </template>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>

  <!-- 附件预览：复用文件管理模块的预览弹窗（图片 inline / PDF iframe / 音视频原生播放 /
       不支持格式引导下载），不再 window.open 新页签 -->
  <FilePreviewDialog v-model="previewVisible" :file="previewRow" />
</template>

<style scoped>
.attach-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
/* 文件名与操作按钮同排（每行最多两三个附件，纵向 stacking 会让「预览/下载」看不出属于哪个文件） */
.attach-item {
  display: flex;
  align-items: center;
  gap: 12px;
  line-height: 22px;
}
/* 核销分配金额（V65）：等宽数字右对齐，跟金融数据口径 */
.alloc-amt {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #303133;
}
.attach-item {
  display: flex;
  align-items: center;
  gap: 12px;
  line-height: 22px;
}
/* 文件名 = 列表操作列同款「el-button link primary small」（2026-10-25 虎哥定稿）：
   点文件名即预览，行内只再留一个「下载」。
   ⚠️ 溢出省略为什么要在里面再包一层 <span>：`.el-button` 实测是 display:inline-flex
      （dist/index.css 实证，且 .el-button>span 也是 inline-flex），裸文本会被包成
      **匿名 flex item**，text-overflow 对它无效 —— 写在根按钮上的 ellipsis 根本不出省略号。
      正解：文本放进真实子节点，作为 flex item 并给它 min-width:0 + display:block，
      让它能收缩到 max-width 以内再由 ellipsis 收尾。
   ⚠️ line-height 必须显式写（2026-10-25 虎哥实测：字母 g/j/p/q/y 下半截被裁）：
      `.el-button{ line-height:1 }` 是 EP 自带样式，**直接命中 button 元素**——而 CSS 里
      「直接指定永远赢过继承」，父容器 .attach-item 的 line-height:22px 根本传不进按钮。
      于是 12px 文字落进 12px 行盒，下行字母被 overflow:hidden 切掉。
      修复：在 button 与内部 span 上都显式给 1.5 行高（12px×1.5=18px，装 12px 字体有余）。
   cursor 不必写：.el-button 原生就是 pointer（只有 .is-disabled 才是 not-allowed）。 */
.attach-name {
  max-width: 320px;
  line-height: 1.5;
}
.attach-name-text {
  display: block;
  min-width: 0;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attach-link {
  font-size: 13px;
}
/* .head-desc 已上提到 styles/pages.css 全局（2026-10-25），本文件不再留本地副本 */
.muted {
  color: #909399;
}
/* .block-title 已上提到 styles/pages.css 全局（2026-10-25），本文件不再留本地副本 */
.detail-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
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
</style>
