<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { UploadFilled, Close } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  shipmentDetail,
  shipmentTimeline,
  markShipped,
  confirmReceive,
  withdrawShipment,
} from '@/api/shipment'
import { listFiles, uploadFile, downloadFileUrl, fetchFileBlob } from '@/api/file'
import type { ShipmentVO, ShipmentConfirmForm, ShipmentLineReceiveForm } from '@/types/shipment'
import type { TimelineNodeVO } from '@/types/project'
import type { FileVO } from '@/types/file'
import type { TaskInfoVO } from '@/types/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import ApprovalActionForm from '@/components/ApprovalActionForm.vue'
import { useTaskApproval } from '@/composables/useTaskApproval'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'

// 发货详情弹窗（卡片化：信息 + 明细行 + 关联应收单 + 签收证据 + 审批时间线 + 状态推进）。
// 状态推进（2026-10-23 虎哥：审批动作收归审批中心，本弹窗只做业务推进）：
//  - 状态 PENDING（待发货，审批通过后）→ 标记已发货（决策#2，发货人=操作人自身）
//  - 状态 SHIPPED → 标记客户收货（决策#6 必传证据，联动生成应收单）
// 审批通过/驳回请到「审批中心 → 待我审批」处理。
//
// 【readonly 模式 2026-10-24】审批中心复用本弹窗查看别人发起的发货单时传 true：
// 隐藏底部全部业务动作（标记发货 / 标记收货 / 撤回都是申请人自己的动作）。
// 与 ProjectDetailDialog 的 readonly 同语义——两个详情弹窗保持同一套契约。
// 【审批模式 approvalTask】（2026-10-24 虎哥，与 ProjectDetailDialog 同契约）：审批中心
// 「待我审批」点「审批」时传入当前待办任务，底部动作区换成审批表单，实现「看详情 + 直接审批」。
const props = defineProps<{
  shipmentId: number | null
  readonly?: boolean
  /** 传入即进入审批模式（详情 + 底部审批表单） */
  approvalTask?: TaskInfoVO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{
  updated: []
  /** 审批已处理：带回 ok，父级成功才清空审批态（失败保留可重试） */
  approved: [ok: boolean]
}>()

const dialogTitle = () =>
  props.approvalTask
    ? `审批 - ${props.approvalTask.bizTitle || props.approvalTask.taskName || '发货申请'}`
    : '发货详情'

/** 审批表单回报：成功才关窗；无论成功失败都让列表刷新（详见 ApprovalActionForm 注释） */
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
const detail = ref<ShipmentVO | null>(null)
const timeline = ref<TimelineNodeVO[]>([])
const proofFiles = ref<FileVO[]>([])

// ===== 字典标签 / 颜色（集中消费，字典维护页改色即生效） =====
// 注：shipment_line_status 行状态字典不再展示（2026-10-23 虎哥：待发货/已发货阶段与单头状态重复、
// 且 markShipped 不同步行状态，展示价值不大）；底层 line_status 字段保留——客户收货时
// confirmReceive 仍写 FULL_RECEIVED/PARTIAL_RECEIVED，后续如需按行收货进度再恢复展示。
const { label: statusLabel, style: statusStyle } = useDictLabels('shipment_status')
const { label: recvStatusLabel, style: recvStatusStyle } = useDictLabels('receivable_status')
const { label: recvSourceLabel } = useDictLabels('receivable_source')
const { label: docDirLabel } = useDictLabels('doc_direction')

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ===== 加载 =====
const load = async (id: number) => {
  loading.value = true
  try {
    const [d, tl] = await Promise.all([shipmentDetail(id), shipmentTimeline(id)])
    detail.value = d
    timeline.value = tl
    // 签收证据：按 bizType+bizId 从文件表拉（决策#6 留痕；后端 toVO 也回填 proofFileIds）
    if (d.confirmedById != null) {
      const fp = await listFiles(1, 200, { bizType: 'shipment_receive_proof', keyword: undefined })
      proofFiles.value = (fp.records || []).filter((f) => f.bizId === id)
    } else {
      proofFiles.value = []
    }
    // 图片证据预取字节（带 token 的 blob URL，供 el-image 缩略图 + 内置查看器预览）
    await loadImageThumbs()
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.shipmentId] as const,
  ([open, id]) => {
    if (open && id != null) load(id)
  },
)

// ===== 状态推进：标记已发货 / 标记客户收货（业务动作；审批在审批中心）=====
const acting = ref(false)

// ===== 标记已发货 =====
const handleMarkShipped = async () => {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(`确认将发货单 ${detail.value.batchNo} 标记为已发货？`, '标记已发货', {
      type: 'warning',
      confirmButtonText: '确认发货',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  acting.value = true
  try {
    await markShipped(detail.value.id)
    ElMessage.success('已标记发货')
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}

// ===== 标记客户收货（子弹窗） =====
const recvVisible = ref(false)
const recvFiles = ref<FileVO[]>([])
const recvLines = ref<Record<number, number>>({})
const uploading = ref(false)
const recvSaving = ref(false)

// 收货证据图片：fileId → 本地 blob URL（2026-10-23 虎哥：收货弹窗上传的图片也要能点击预览，
// 与签收证据区一致：弹内置查看器、不跳新页、支持上下页翻页）
const isImageUpload = (file: File) =>
  file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)

const recvFileThumbs = ref<Record<number, string>>({})

/** 收货证据图片 URL 列表（el-image 查看器翻页用，按上传顺序；以实际生成缩略图的为准） */
const recvThumbList = computed(() =>
  recvFiles.value
    .filter((f) => !!recvFileThumbs.value[f.id])
    .map((f) => recvFileThumbs.value[f.id]),
)

/** 当前图片在翻页列表中的索引（el-image initial-index） */
const recvThumbIndexOf = (fileId: number) =>
  recvFiles.value.filter((f) => !!recvFileThumbs.value[f.id]).findIndex((f) => f.id === fileId)

/** 释放全部本地 blob URL（关窗/开窗前调用，防反复开关子弹窗泄漏） */
const releaseRecvThumbs = () => {
  for (const u of Object.values(recvFileThumbs.value)) {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u)
  }
  recvFileThumbs.value = {}
}

// 子弹窗关闭：释放本地 blob URL
watch(
  () => recvVisible.value,
  (v) => {
    if (!v) releaseRecvThumbs()
  },
)

const openReceive = () => {
  releaseRecvThumbs() // 防御：上次异常关窗可能残留
  recvFiles.value = []
  recvLines.value = {}
  for (const ln of detail.value?.lines || []) {
    recvLines.value[ln.id] = ln.remainingCanReceive // 默认收全部剩余
  }
  recvVisible.value = true
}

// el-upload 自定义上传：复用 FileController.upload（bizType=shipment_receive_proof, bizId=shipmentId）
const customUpload = async (options: { file: File }) => {
  if (!detail.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', options.file)
    fd.append('bizType', 'shipment_receive_proof')
    fd.append('bizId', String(detail.value.id))
    const vo = await uploadFile(fd)
    recvFiles.value.push(vo)
    // 图片：直接用刚上传的 File 建本地 blob 缩略图，免再走一次下载接口
    if (isImageUpload(options.file)) {
      recvFileThumbs.value[vo.id] = URL.createObjectURL(options.file)
    }
  } catch (e) {
    ElMessage.error('证据上传失败：' + (e as Error).message)
  } finally {
    uploading.value = false
  }
}

const removeRecvFile = (idx: number) => {
  const [removed] = recvFiles.value.splice(idx, 1)
  if (removed) {
    const u = recvFileThumbs.value[removed.id]
    if (u && u.startsWith('blob:')) URL.revokeObjectURL(u)
    delete recvFileThumbs.value[removed.id]
  }
}

const handleConfirmReceive = async () => {
  if (!detail.value) return
  if (recvFiles.value.length === 0) {
    ElMessage.warning('请至少上传一份签收证据（决策#6 必传）')
    return
  }
  const lines: ShipmentLineReceiveForm[] = (detail.value.lines || [])
    .filter((ln) => (recvLines.value[ln.id] ?? 0) > 0)
    .map((ln) => ({ itemId: ln.itemId, receivedQty: recvLines.value[ln.id] }))
  if (lines.length === 0) {
    ElMessage.warning('请至少填写一行收货数量')
    return
  }
  recvSaving.value = true
  try {
    const payload: ShipmentConfirmForm = {
      shipmentId: detail.value.id,
      proofFileIds: recvFiles.value.map((f) => f.id),
      lines,
    }
    await confirmReceive(payload)
    ElMessage.success('客户已收货，已联动生成应收单')
    recvVisible.value = false
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    recvSaving.value = false
  }
}

// ===== 文件打开（下载/预览）：OSS 绝对 URL 直开；本地相对路径走 fetch+blob =====
const openFile = async (f: FileVO) => {
  try {
    const url = await downloadFileUrl(f.id)
    if (url.startsWith('http')) {
      window.open(url, '_blank')
      return
    }
    const blob = await fetchFileBlob(url)
    const objUrl = URL.createObjectURL(blob)
    window.open(objUrl, '_blank')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// ===== 图片证据：缩略图 + 弹窗预览（2026-10-23 虎哥：点击预览不跳新页）=====
// 判定：mimeType image/* 或文件名图片后缀双通道（上传时 mimeType 可能为空）
const isImageFile = (f: FileVO) =>
  (f.mimeType || '').startsWith('image/') ||
  /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.originalName || f.alias || '')

/** fileId → 可直连 URL（OSS 签名绝对 URL 或本地 blob:）；供 el-image src / preview-src-list */
const imageThumbs = ref<Record<number, string>>({})

/** 全部图片证据 URL（查看器翻页用，按证据顺序） */
const imageThumbList = computed(() =>
  proofFiles.value
    .filter(isImageFile)
    .map((f) => imageThumbs.value[f.id])
    .filter((u): u is string => !!u),
)

/** 当前图片在翻页列表中的索引（el-image initial-index） */
const imageIndexOf = (fileId: number) =>
  proofFiles.value.filter(isImageFile).findIndex((f) => f.id === fileId)

const loadImageThumbs = async () => {
  // 先释放上一轮的 blob URL，防反复打开详情窗泄漏
  for (const u of Object.values(imageThumbs.value)) {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u)
  }
  imageThumbs.value = {}
  for (const f of proofFiles.value) {
    if (!isImageFile(f)) continue
    try {
      const url = await downloadFileUrl(f.id)
      // 本地模式后端只签发相对路径，img 直连带不上 Authorization 头 → fetch+blob 兜底
      imageThumbs.value[f.id] = url.startsWith('http')
        ? url
        : URL.createObjectURL(await fetchFileBlob(url))
    } catch {
      // 单张失败不阻塞其余证据（点击下载时还会再试一次）
    }
  }
}

// 弹窗关闭：释放全部 blob URL
watch(
  () => visible.value,
  (v) => {
    if (!v) {
      for (const u of Object.values(imageThumbs.value)) {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u)
      }
      imageThumbs.value = {}
    }
  },
)

const reload = async () => {
  if (props.shipmentId != null) {
    await load(props.shipmentId)
    emit('updated')
  }
}

// ===== 时间线渲染已统一交给 components/ApprovalTimeline.vue（2026-10-24 虎哥：
//       发货详情原手写了一份 el-timeline 副本，与立项详情重复且缺少折叠，现已替换复用，
//       节点样式判定全部收归组件内，本文件不再保留副本）=====

// 操作区展示判定（2026-10-23 虎哥：审批动作收归审批中心，本弹窗只做业务推进 + 撤回）
// 标记已发货必须审批通过（2026-10-24 虎哥补洞）：PENDING 同时覆盖审批中/已通过待发货，
// 只判状态会让「审批没批完就发货」的按钮亮着，与后端 approval_status 闸门对齐双保险
const canMarkShipped = () =>
  detail.value?.shipmentStatus === 'PENDING' && detail.value?.approvalStatus === 'APPROVED'
// 部分收货（PARTIAL_RECEIVED）也可续收剩余量（2026-10-24 虎哥：玻璃水收 0 后剩余的还要再收）
const canReceive = () =>
  detail.value?.shipmentStatus === 'SHIPPED' || detail.value?.shipmentStatus === 'PARTIAL_RECEIVED'
// 撤回（方案 B）：待发货且流程仍未走完。真正的「发起人身份 + 流程运行中」两道闸在后端引擎，
// 这里只做前端可见性，越权/已审完由后端报错兜底
const canWithdraw = () => detail.value?.shipmentStatus === 'PENDING'

const handleWithdraw = async () => {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `撤回后本次发货审批将终止，状态置为「已撤销」（终态，需重新发起）。确认撤回发货单 ${detail.value.batchNo}？`,
      '撤回确认',
      { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await withdrawShipment(detail.value.id)
    ElMessage.success('已撤回，审批流程已终止')
    // 终态动作（发货单变「已撤销」）→ 关窗并把列表刷新交给父级（2026-10-24 虎哥：提交完就该关窗）
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
  <!-- 限高方案：top 用 EP 官方 prop；滚动做到内层包裹 div（scoped 可控）——
       不用 style/custom-class：EP 2.14 dialog 是多根 Fragment，style attr 会被丢弃，
       全局样式块在 CSS 变量体系下注入顺序不稳（2026-10-23 实测滚动条未生效） -->
  <el-dialog v-model="visible" :title="dialogTitle()" width="1000px" top="7vh">
    <div v-loading="loading" class="detail-scroll">
      <el-empty v-if="!detail" description="暂无数据" :image-size="60" />
      <template v-else>
        <!-- 头部信息 -->
        <el-descriptions :column="3" border size="small" class="head-desc kv-desc">
          <el-descriptions-item label="批次号">{{ detail.batchNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目编号">{{ detail.projectNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目名称">{{ detail.projectName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detail.customerName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发货状态">
            <el-tag :type="statusStyle(detail.shipmentStatus) || 'info'" size="small">
              {{ statusLabel(detail.shipmentStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发货金额">{{ formatAmount(detail.shipmentAmount) }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicantName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发货人">{{ detail.shippedByName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="确认人">{{ detail.confirmedByName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发货时间">{{ formatDateTime(detail.shipmentDate) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="已回款金额">{{ formatAmount(detail.receivedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="退货金额">{{ formatAmount(detail.returnedAmount) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 明细行 -->
        <h4 class="block-title">发货明细</h4>
        <el-table :data="detail.lines" border size="small">
          <el-table-column prop="itemName" label="货物" min-width="160" show-overflow-tooltip />
          <el-table-column prop="specModel" label="规格" min-width="120" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column prop="shipmentQty" label="发货量" width="80" align="right" />
          <el-table-column prop="receivedQty" label="已收" width="80" align="right" />
          <el-table-column prop="returnedQty" label="退货" width="80" align="right" />
          <el-table-column prop="unitPrice" label="单价" width="110" align="right">
            <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column prop="lineAmount" label="行金额" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.lineAmount) }}</template>
          </el-table-column>
        </el-table>

        <!-- 关联应收单 -->
        <template v-if="detail.receivable">
          <h4 class="block-title">关联应收单</h4>
          <el-card shadow="never" class="recv-card">
            <el-descriptions :column="3" border size="small" class="kv-desc">
              <el-descriptions-item label="应收单号">{{ detail.receivable.receivableNo || '—' }}</el-descriptions-item>
              <el-descriptions-item label="单据方向">{{ docDirLabel(detail.receivable.docDirection) }}</el-descriptions-item>
              <el-descriptions-item label="来源">{{ recvSourceLabel(detail.receivable.sourceType) }}</el-descriptions-item>
              <el-descriptions-item label="应收金额">{{ formatAmount(detail.receivable.receivableAmount) }}</el-descriptions-item>
              <el-descriptions-item label="已核销">{{ formatAmount(detail.receivable.writtenOffAmount) }}</el-descriptions-item>
              <el-descriptions-item label="未核销">{{ formatAmount(detail.receivable.unwrittenOffAmount) }}</el-descriptions-item>
              <el-descriptions-item label="已开票">{{ formatAmount(detail.receivable.invoicedAmount) }}</el-descriptions-item>
              <el-descriptions-item label="未开票">{{ formatAmount(detail.receivable.uninvoicedAmount) }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="recvStatusStyle(detail.receivable.status) || 'info'" size="small">
                  {{ recvStatusLabel(detail.receivable.status) }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </template>

        <!-- 签收证据 -->
        <template v-if="detail.confirmedById != null">
          <h4 class="block-title">签收证据</h4>
          <div v-if="proofFiles.length" class="proof-list">
            <template v-for="f in proofFiles" :key="f.id">
              <!-- 图片：缩略图，点击弹内置查看器预览（支持上下页翻页；2026-10-23 虎哥） -->
              <el-image
                v-if="isImageFile(f) && imageThumbs[f.id]"
                :src="imageThumbs[f.id]"
                :preview-src-list="imageThumbList"
                :initial-index="imageIndexOf(f.id)"
                fit="cover"
                class="proof-thumb"
                :title="f.alias || f.originalName || ('文件#' + f.id)"
                preview-teleported
                hide-on-click-modal
              />
              <!-- 非图片：文件名标签，点击走带 token 的 blob 下载 -->
              <el-tag
                v-else
                class="proof-tag"
                type="info"
                effect="plain"
                @click="openFile(f)"
              >
                <el-icon><UploadFilled /></el-icon>
                {{ f.alias || f.originalName || ('文件#' + f.id) }}
              </el-tag>
            </template>
          </div>
          <el-empty v-else description="未找到签收证据文件" :image-size="48" />
        </template>

        <!-- 审批时间线（内联 ApprovalTimeline，与立项详情同款，不重复造轮子；
             超过 3 条默认折叠，2026-10-24 虎哥） -->
        <h4 class="block-title">审批时间线</h4>
        <ApprovalTimeline :timeline="timeline" :collapse-after="3" empty-text="暂无审批记录" />

        <!-- 当前审批（2026-10-24 虎哥：从 footer 横条改为内容区标题分区，带卡片面板；
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
        <!-- 状态推进（标记发货/标记收货/撤回都是申请人自己的动作）；readonly 只留关闭 -->
        <template v-if="detail && !readonly">
          <el-button
            v-if="canMarkShipped()"
            type="primary"
            :loading="acting"
            @click="handleMarkShipped"
          >标记已发货</el-button>
          <el-button
            v-if="canReceive()"
            type="warning"
            :loading="acting"
            @click="openReceive"
          >标记客户收货</el-button>
          <!-- 撤回（方案 B，2026-10-23）：申请人主动终结审批流程 -->
          <el-button
            v-if="canWithdraw()"
            type="danger"
            plain
            :loading="acting"
            @click="handleWithdraw"
          >撤回申请</el-button>
        </template>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>

    <!-- 标记客户收货子弹窗 -->
    <el-dialog v-model="recvVisible" title="标记客户收货" width="1000px" append-to-body>
      <!-- 必传提示 + 上传入口（2026-10-23 虎哥：上传按钮并入橙色提示区右对齐） -->
      <el-alert type="warning" :closable="false" class="recv-alert">
        <template #default>
          <div class="recv-alert-row">
            <span class="recv-alert-text">必传签收证据，支持按行部分收货。</span>
            <el-upload
              :show-file-list="false"
              :http-request="customUpload"
              :disabled="uploading"
            >
              <el-button :icon="UploadFilled" :loading="uploading">上传签收证据</el-button>
            </el-upload>
          </div>
        </template>
      </el-alert>
      <div v-if="recvFiles.length" class="recv-file-list">
          <template v-for="(f, idx) in recvFiles" :key="f.id">
            <!-- 图片：缩略图，点击弹内置查看器预览（支持上下页翻页；与签收证据区一致） -->
            <div v-if="recvFileThumbs[f.id]" class="recv-thumb-wrap">
              <el-image
                :src="recvFileThumbs[f.id]"
                :preview-src-list="recvThumbList"
                :initial-index="recvThumbIndexOf(f.id)"
                fit="cover"
                class="recv-thumb"
                :title="f.alias || f.originalName || ('文件#' + f.id)"
                preview-teleported
                hide-on-click-modal
              />
              <el-button
                class="recv-thumb-del"
                circle
                size="small"
                :icon="Close"
                title="移除该证据"
                @click.stop="removeRecvFile(idx)"
              />
            </div>
            <!-- 非图片：文件名标签，点击走带 token 的 blob 下载 -->
            <el-tag
              v-else
              class="recv-file-tag"
              type="success"
              closable
              @close="removeRecvFile(idx)"
              @click="openFile(f)"
            >{{ f.alias || f.originalName || ('文件#' + f.id) }}</el-tag>
          </template>
        </div>

      <el-table :data="detail?.lines || []" border size="small" style="margin-top: 12px">
        <el-table-column prop="itemName" label="货物" min-width="160" show-overflow-tooltip />
        <el-table-column prop="shipmentQty" label="发货量" width="80" align="right" />
        <el-table-column prop="receivedQty" label="已收" width="80" align="right" />
        <el-table-column prop="remainingCanReceive" label="剩余可收" width="90" align="right" />
        <el-table-column label="本次收货" width="160" align="center">
          <template #default="{ row }">
            <el-input-number
              v-model="recvLines[row.id]"
              :min="0"
              :max="row.remainingCanReceive"
              :precision="0"
              :controls-position="'right'"
              style="width: 130px"
            />
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="recvVisible = false">取消</el-button>
        <el-button type="primary" :loading="recvSaving" @click="handleConfirmReceive">确认收货</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.head-desc {
  margin-bottom: 8px;
}
/* 分区标题：与 ProjectDetailDialog 的 .block-title 完全一致（2026-10-24 统一布局口径，
   两处改样式必须同步改，否则立项/发货详情看起来像两个产品）。
   浅色渐变底 + 左侧强调竖条 = 区间分隔感（虎哥 2026-10-24）。
   这里也用 flex（与立项同款），后续某个分区标题要在右侧放汇总值时可直接复用。 */
.block-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 18px 0 12px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  background: linear-gradient(
    90deg,
    rgba(64, 158, 255, 0.16) 0%,
    rgba(64, 158, 255, 0.07) 45%,
    rgba(64, 158, 255, 0) 100%
  );
}
/* 迷你滚动条（2026-10-24 虎哥：默认滚动条太宽）——与 ProjectDetailDialog 保持同款，
   改必须两处同步 */
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
.recv-card {
  background: var(--el-fill-color-light);
}
.proof-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.proof-tag {
  cursor: pointer;
}
.proof-tag :deep(.el-icon) {
  margin-right: 2px;
  vertical-align: middle;
}
/* 图片证据缩略图（点击弹窗预览；hover 微放大提示可点） */
.proof-thumb {
  width: 96px;
  height: 96px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.proof-thumb:hover {
  transform: scale(1.04);
}
/* 收货提示区：文案 + 右对齐上传按钮（2026-10-23 虎哥：按钮并入橙色区域右对齐）。
   el-alert 根是 flex，内容区默认不撑满 → :deep 补 flex:1，内层 row 才能 space-between */
.recv-alert :deep(.el-alert__content) {
  flex: 1;
  min-width: 0;
}
.recv-alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.recv-alert-text {
  flex: 1;
  line-height: 1.6;
}
.recv-file-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  margin-top: 10px;
}
.recv-file-tag {
  cursor: pointer;
}
/* 收货证据图片缩略图（点击弹窗预览；hover 微放大提示可点；右上角圆形删除按钮） */
.recv-thumb-wrap {
  position: relative;
  flex-shrink: 0;
}
.recv-thumb {
  width: 96px;
  height: 96px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  cursor: pointer;
  display: block;
  transition: transform 0.15s ease;
}
.recv-thumb:hover {
  transform: scale(1.04);
}
.recv-thumb-del {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: var(--el-color-danger);
  color: #fff;
}
.recv-thumb-del:hover {
  background: var(--el-color-danger-light-3);
}
/* 弹窗内容滚动区：限高 + 内部滚。扣除量 = top 7vh(~75) + header ~54 + footer ~64
   + body padding ~40 + EP dialog margin-bottom 50 + 富余 ≈ 280px，确保 dialog 总高
   永不超视口（否则 fixed overlay 外的 body 会被挤出滚动条，2026-10-23 截图实锤） */
.detail-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
</style>
