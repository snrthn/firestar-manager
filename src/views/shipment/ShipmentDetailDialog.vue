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
} from '@/api/shipment'
import { listFiles, uploadFile, downloadFileUrl, fetchFileBlob } from '@/api/file'
import type { ShipmentVO, ShipmentConfirmForm, ShipmentLineReceiveForm } from '@/types/shipment'
import type { TimelineNodeVO } from '@/types/project'
import type { FileVO } from '@/types/file'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'

// 发货详情弹窗（卡片化：信息 + 明细行 + 关联应收单 + 签收证据 + 审批时间线 + 状态推进）。
// 状态推进（2026-10-23 虎哥：审批动作收归审批中心，本弹窗只做业务推进）：
//  - 状态 PENDING（待发货，审批通过后）→ 标记已发货（决策#2，发货人=操作人自身）
//  - 状态 SHIPPED → 标记客户收货（决策#6 必传证据，联动生成应收单）
// 审批通过/驳回请到「审批中心 → 待我审批」处理。
const props = defineProps<{ shipmentId: number | null }>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ updated: [] }>()

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

// ===== 时间线节点样式（复用 ApprovalProgressDialog 的判定逻辑，内联渲染） =====
const endedPassed = (n: TimelineNodeVO) => n.handlerNames?.[0] === '审批通过'
const nodeType = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'primary'
  if (n.result === 'ENDED') return endedPassed(n) ? 'success' : 'danger'
  if (n.result === 'REJECTED') return 'danger'
  return 'success'
}
const cardTone = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'active'
  if (n.result === 'REJECTED') return 'rejected'
  if (n.result === 'ENDED') return endedPassed(n) ? 'done' : 'rejected'
  return 'done'
}

// 操作区展示判定（2026-10-23 虎哥：审批动作收归审批中心，本弹窗只做业务推进）
const canMarkShipped = () => detail.value?.shipmentStatus === 'PENDING'
const canReceive = () => detail.value?.shipmentStatus === 'SHIPPED'
</script>

<template>
  <!-- 限高方案：top 用 EP 官方 prop；滚动做到内层包裹 div（scoped 可控）——
       不用 style/custom-class：EP 2.14 dialog 是多根 Fragment，style attr 会被丢弃，
       全局样式块在 CSS 变量体系下注入顺序不稳（2026-10-23 实测滚动条未生效） -->
  <el-dialog v-model="visible" title="发货详情" width="980px" top="7vh">
    <div v-loading="loading" class="detail-scroll">
      <el-empty v-if="!detail" description="暂无数据" :image-size="60" />
      <template v-else>
        <!-- 头部信息 -->
        <el-descriptions :column="3" border size="small" class="head-desc">
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
          <el-descriptions-item label="已收金额">{{ formatAmount(detail.receivedAmount) }}</el-descriptions-item>
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
          <h4 class="block-title">关联应收单（客户已收货生成，决策#2）</h4>
          <el-card shadow="never" class="recv-card">
            <el-descriptions :column="3" border size="small">
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
          <h4 class="block-title">签收证据（决策#6 留痕）</h4>
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

        <!-- 审批时间线 -->
        <h4 class="block-title">审批时间线</h4>
        <div class="timeline-wrap">
          <el-timeline v-if="timeline.length">
            <el-timeline-item
              v-for="(n, i) in timeline"
              :key="`${n.nodeId}-${n.startTime}-${i}`"
              :type="nodeType(n)"
              :hollow="n.result === 'ACTIVE'"
              :timestamp="formatDateTime(n.endTime || n.startTime)"
              placement="top"
            >
              <div class="tl-card" :class="`tl-card--${cardTone(n)}`">
                <div class="tl-card-head">
                  <span class="tl-node-name">{{ n.nodeName }}</span>
                  <el-tag v-if="n.result === 'ACTIVE'" type="primary" size="small" effect="dark">待审批</el-tag>
                  <el-tag v-else-if="n.result === 'ENDED'" :type="endedPassed(n) ? 'success' : 'danger'" size="small">
                    {{ endedPassed(n) ? '已结束' : '已驳回' }}
                  </el-tag>
                  <el-tag v-else-if="n.result === 'REJECTED'" type="danger" size="small">已驳回</el-tag>
                  <el-tag v-else type="success" size="small">已通过</el-tag>
                </div>
                <div v-if="n.result !== 'ENDED'" class="tl-meta">
                  处理人：
                  <template v-if="n.handlerNames && n.handlerNames.length">
                    <el-tag v-for="(h, hi) in n.handlerNames" :key="hi" size="small" class="tl-tag">{{ h }}</el-tag>
                  </template>
                  <span v-else>—</span>
                </div>
                <div v-if="n.comment" class="tl-comment">
                  <template v-if="n.result === 'ENDED'">{{ n.comment }}</template>
                  <template v-else>审批意见：{{ n.comment }}</template>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无审批记录" :image-size="48" />
        </div>
      </template>
    </div>

    <!-- 操作区（状态推进） -->
    <template #footer>
      <template v-if="detail">
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
      </template>
      <el-button @click="visible = false">关闭</el-button>
    </template>

    <!-- 标记客户收货子弹窗 -->
    <el-dialog v-model="recvVisible" title="标记客户收货" width="860px" append-to-body>
      <!-- 必传提示 + 上传入口（2026-10-23 虎哥：上传按钮并入橙色提示区右对齐） -->
      <el-alert type="warning" :closable="false" class="recv-alert">
        <template #default>
          <div class="recv-alert-row">
            <span class="recv-alert-text">必传签收证据（决策#6：内部销售代确认，须上传证据留痕）；支持按行部分收货。</span>
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
.block-title {
  margin: 18px 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
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
.timeline-wrap {
  max-height: 320px;
  overflow-y: auto;
  padding: 10px 8px 4px;
}
:deep(.el-timeline) {
  padding-left: 0;
}
:deep(.el-timeline-item) {
  padding-bottom: 16px;
}
:deep(.el-timeline-item__timestamp.is-top) {
  margin-bottom: 10px;
  padding-top: 2px;
}
.tl-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  padding: 14px 16px;
}
.tl-card--active {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}
.tl-card--rejected {
  border-color: var(--el-color-danger-light-8);
  background: var(--el-color-danger-light-9);
}
.tl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tl-node-name {
  font-size: 14px;
  font-weight: 600;
}
.tl-meta {
  margin-top: 6px;
  font-size: 13px;
  color: #606266;
}
.tl-tag {
  margin: 2px;
}
.tl-comment {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #ebeef5;
  font-size: 13px;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-all;
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
