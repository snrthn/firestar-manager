<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { createInvoice, invoiceDetail, updateInvoice } from '@/api/invoice'
import { receivablePage } from '@/api/receivable'
import { listFiles, uploadFile } from '@/api/file'
import type { AllocationItem, InvoiceRequest, InvoiceVO } from '@/types/invoice'
import type { ReceivableVO } from '@/types/receivable'
import type { FileVO } from '@/types/file'
import DictSelect from '@/components/DictSelect.vue'
// 已选附件支持就地预览（2026-10-25 虎哥要求）：与详情弹窗同一套，复用文件管理模块的预览组件。
// 预览走 preview 接口（inline、不计数），与 download 接口分家 —— 详见 FilePreviewDialog 注释。
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'

// 发票单 新建 / 编辑弹窗。
// 契约要点（对齐 InvoiceServiceImpl）：
//  1) receivableId 必填且后端校验存在 —— 发票必须挂在应收单上，故项目由所选应收单带出，
//     不让用户选两遍（InvoiceRequest.projectId 直接取 receivable.projectId）。
//  2) 创建出来的是「草稿态 PENDING」，不拉审批流；必须回列表点「提交审批」才拉起
//     invoice_approval。故按钮文案是「创建」不是「提交开票申请」。
//  3) fin_invoice 无 remark 列、后端未消费 → 本表单不提供备注输入位（避免「填了不存」）。
//
// 附件（2026-10-25 V62 真上传）：原 invoice_file_path「只存路径」是死输入位，改为走
// sys_file_storage 软关联，与发货签收证据（V54 shipment_receive_proof）严格同构。
// 新建时单据尚无 id → 上传不带 bizId，保存后由后端统一挂载。
const visible = defineModel<boolean>('visible', { required: true })
// originalInvoiceId：红冲模式入参（2026-10-25 红冲入口，虎哥拍板「正数+RED、走完整审批」）。
// 从详情弹窗「红冲」按钮传入被冲销的蓝字发票 ID；非空 = 本弹窗以红冲单模式打开。
const props = defineProps<{ invoiceId?: number | null; originalInvoiceId?: number | null }>()
const emit = defineEmits<{ saved: [] }>()

/**
 * 附件业务类型字面量。必须与下列三处严格一致，否则文件在文件管理页不可见、不可筛：
 *   ① 后端 InvoiceServiceImpl.INVOICE_ATTACH_BIZ_TYPE
 *   ② file_biz_type 字典的 dict_value（V20 已种 invoice）
 *   ③ 本常量
 */
const ATTACH_BIZ_TYPE = 'invoice'
const MAX_ATTACH_MB = 10

const isEdit = () => props.invoiceId != null
/** 红冲模式：传了 originalInvoiceId 即红字单（与编辑态互斥，红冲永远新建） */
const isRedFlush = () => props.originalInvoiceId != null
// 编辑对象本身的单据方向（loadForEdit 回填）：红冲单（RED）做减法，编辑时不得套用蓝字超开拦截
const editDocDirection = ref<string | null>(null)
/** 红冲原单数据（预填来源 + 金额上限提示） */
const redOriginal = ref<InvoiceVO | null>(null)

const receivableOptions = ref<ReceivableVO[]>([])
const loadingReceivables = ref(false)
const saving = ref(false)
/** 已选附件（编辑态从文件表按 bizType+bizId 回填） */
const attachments = ref<FileVO[]>([])
const uploading = ref(false)

const form = reactive<{
  receivableId: number | null
  invoiceNo: string
  invoiceCode: string
  invoiceType: string
  invoiceAmount: number | null
  taxRate: number | null
  taxAmount: number | null
  invoiceDate: string | null
}>({
  receivableId: null,
  invoiceNo: '',
  invoiceCode: '',
  invoiceType: 'NORMAL',
  invoiceAmount: null,
  taxRate: null,
  taxAmount: null,
  invoiceDate: null,
})

const loadReceivables = async () => {
  loadingReceivables.value = true
  try {
    // 应收单由发货「客户已收货」自动生成；这里拉一页够选的候选（前端不分页）
    const page = await receivablePage(1, 500)
    receivableOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingReceivables.value = false
  }
}

/** 当前选中应收单（项目 ID 与可开票金额都从它来） */
const selectedReceivable = computed(
  () => receivableOptions.value.find((r) => r.id === form.receivableId) ?? null,
)

// ===== 核销分配（V65 双向拆分，虎哥 2026-10-25 拍板 B）=====
// 一张发票可拆多张应收单（合并开）；填了分配行则以第一行为主应收单（payload.receivableId
// 取它，与后端 create 的解析口径一致）。空列表 = 主应收单独享（原交互）。
const allocations = ref<AllocationItem[]>([])

const allocatedTotal = computed(() =>
  allocations.value.reduce((s, a) => s + (a.amount == null ? 0 : Number(a.amount)), 0),
)
/** 差额 = 开票金额 - 已分配；null = 未填开票金额 */
const remaining = computed(() => {
  if (form.invoiceAmount == null) return null
  return Number(form.invoiceAmount) - allocatedTotal.value
})

const addAllocation = () => {
  allocations.value.push({ receivableId: null as unknown as number, amount: null as unknown as number })
}

const removeAllocation = (idx: number) => {
  allocations.value.splice(idx, 1)
}

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ===== 核销分配交互增强（2026-10-27 Q1/Q2）=====
// Q1：已选应收单禁止在其他分配行重复选择 —— 当前行已选的保留可见，其余行已选的剔除出候选。
const allocOptionsFor = (idx: number) =>
  receivableOptions.value.filter(
    (rv) => !allocations.value.some((a, i) => i !== idx && a.receivableId === rv.id),
  )
// Q2：选中应收单后默认回填其「未开票余额」；已手填金额（>0）不覆盖。
const onAllocationReceivableChange = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  if (!rv) return
  const bal = rv.uninvoicedAmount == null ? 0 : Number(rv.uninvoicedAmount)
  if (a.amount == null || a.amount === 0) a.amount = Number(bal.toFixed(2))
}
// 单行分配金额上限 = 该应收单未开票余额（物理封顶，防止超过）；未选应收单时无限。
const allocMaxAmount = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return undefined
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  return rv?.uninvoicedAmount == null ? undefined : Number(rv.uninvoicedAmount)
}

// ===== 附件 =====

const beforeUpload = (file: File) => {
  if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
    ElMessage.warning(`单个附件不能超过 ${MAX_ATTACH_MB}MB`)
    return false
  }
  return true
}

/** el-upload 自定义上传：复用 FileController.upload（file:manage，V62 已授给开票员） */
const customUpload = async (options: { file: File }) => {
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', options.file)
    fd.append('bizType', ATTACH_BIZ_TYPE)
    // 新建时单据 id 尚未生成 → 不传 bizId，落库后由后端 bindAttachments 统一挂载
    if (props.invoiceId != null) {
      fd.append('bizId', String(props.invoiceId))
    }
    const vo = await uploadFile(fd)
    attachments.value.push(vo)
  } catch (e) {
    ElMessage.error('附件上传失败：' + (e as Error).message)
  } finally {
    uploading.value = false
  }
}

// 移除只是从表单列表里摘掉：文件本身保留，后端 rebindAttachments 做差分解绑（bizId 置 NULL）
const removeAttachment = (idx: number) => {
  attachments.value.splice(idx, 1)
}

const loadAttachments = async (id: number) => {
  try {
    const fp = await listFiles(1, 200, { bizType: ATTACH_BIZ_TYPE })
    attachments.value = (fp.records || []).filter((f) => f.bizId === id)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// ===== 附件就地预览 =====
// 刚上传成功的文件已有 id 且在库里，preview 接口开箱可用；不支持预览的格式
// （xlsx/zip 等）由 FilePreviewDialog 给「请下载后查看」引导，本窗不做格式判定。
const previewVisible = ref(false)
const previewRow = ref<FileVO | null>(null)
const handlePreview = (f: FileVO) => {
  previewRow.value = f
  previewVisible.value = true
}

const resetForm = () => {
  form.receivableId = null
  form.invoiceNo = ''
  editDocDirection.value = null
  form.invoiceCode = ''
  form.invoiceType = 'NORMAL'
  form.invoiceAmount = null
  form.taxRate = null
  form.taxAmount = null
  form.invoiceDate = null
  attachments.value = []
  allocations.value = []
  redOriginal.value = null
}

const handleSubmit = async () => {
  // 核销分配（V65）：过滤未填完整的行；空列表 = 主应收单独享（原交互）
  const allocs: AllocationItem[] = allocations.value
    .filter((a) => a.receivableId != null && a.amount != null && Number(a.amount) > 0)
    .map((a) => ({ receivableId: a.receivableId, amount: Number(a.amount) }))
  // 填了分配行 → 主应收单取第一行（与后端 create 解析口径一致）；未填 → 必须选主应收单
  // 方案A（2026-10-27）：强制核销分配，总额=Σ分配（只读）；无分配则拦截
  if (allocs.length === 0) {
    ElMessage.warning('请至少添加一条核销分配明细（第一行即主应收单）')
    return
  }
  const mainReceivableId = allocs[0].receivableId
  const projectId = receivableOptions.value.find((r) => r.id === mainReceivableId)?.projectId
  if (projectId == null) {
    ElMessage.warning('所选应收单缺少项目信息，请更换')
    return
  }
  // 开票日期必填（财务凭证关键字段；2026-10-27 实锤空日期曾可提交）
  if (!form.invoiceDate) {
    ElMessage.warning('请选择开票日期')
    return
  }
  // 超开拦截（双保险·前端关口）：蓝字开票不得使应收单未开票余额转负；
  // 红冲单（RED）审批通过后是加回额度，不拦；编辑中的红冲草稿同放行。后端 saveAllocations/审批回写兜底。
  // 注：前端拿不到"在途占用"（审批中其他发票），此处是第一道粗滤，最终以审批时后端校验为准。
  if (!(isRedFlush() || editDocDirection.value === 'RED')) {
    const overLimit = (rid: number, amt: number): boolean => {
      const rv = receivableOptions.value.find((r) => r.id === rid)
      return rv?.uninvoicedAmount != null && amt > Number(rv.uninvoicedAmount)
    }
    if (allocs.length) {
      const bad = allocs.find((a) => overLimit(a.receivableId, a.amount))
      if (bad) {
        const rv = receivableOptions.value.find((r) => r.id === bad.receivableId)
        ElMessage.warning(`分配金额超出应收单未开票余额：${rv?.receivableNo ?? ''}（未开票 ${formatAmount(rv?.uninvoicedAmount)}），请调整`)
        return
      }
    } else if (overLimit(mainReceivableId, allocatedTotal.value)) {
      const rv = receivableOptions.value.find((r) => r.id === mainReceivableId)
      ElMessage.warning(`开票金额超出应收单未开票余额：${rv?.receivableNo ?? ''}（未开票 ${formatAmount(rv?.uninvoicedAmount)}），请核实金额`)
      return
    }
  }
  // 红冲口径（2026-10-25）：金额 ≤ 原单金额（支持部分红冲），后端同校验
  if (isRedFlush() && redOriginal.value) {
    const max = Number(redOriginal.value.invoiceAmount)
    if (allocatedTotal.value > max) {
      ElMessage.warning(`红冲金额不能超过原单金额 ${max}`)
      return
    }
  }
  if (!form.invoiceType) {
    ElMessage.warning('请选择发票类型')
    return
  }
  // 总额=Σ分配（只读自动算），Σ=金额的一致性由前端分配与后端 saveAllocations 双重保证，无需再校验
  if (attachments.value.length === 0) {
    ElMessage.warning('请上传发票文件')
    return
  }
  const payload: InvoiceRequest = {
    projectId,
    receivableId: mainReceivableId,
    invoiceAmount: allocatedTotal.value,
    taxRate: form.taxRate == null ? null : Number(form.taxRate),
    taxAmount: form.taxAmount == null ? null : Number(form.taxAmount),
    invoiceNo: form.invoiceNo || null,
    invoiceCode: form.invoiceCode || null,
    invoiceType: form.invoiceType || null,
    // 日期控件返回 'YYYY-MM-DD'；清空时传 null（后端 LocalDate）
    invoiceDate: form.invoiceDate || null,
    attachmentFileIds: attachments.value.map((f) => f.id),
    allocations: allocs,
    // 红冲单（2026-10-25）：方向 RED + 原单 ID；审批通过后对应收单/项目汇总做减法
    docDirection: isRedFlush() ? 'RED' : undefined,
    originalInvoiceId: isRedFlush() ? props.originalInvoiceId! : undefined,
  }
  saving.value = true
  try {
    if (isEdit()) {
      await updateInvoice(props.invoiceId!, payload)
      ElMessage.success('发票单已更新')
    } else if (isRedFlush()) {
      await createInvoice(payload)
      ElMessage.success('红冲单已创建（草稿），请在列表点「提交审批」发起审批')
    } else {
      await createInvoice(payload)
      ElMessage.success('发票单已创建（草稿），请在列表点「提交审批」发起审批')
    }
    visible.value = false
    emit('saved')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

/**
 * 回填单据数据（编辑态 / 红冲预填共用）。
 *
 * @param asRedFlush 红冲模式：true 时票号留空（红字发票是新票号，用户自填）、金额留空，
 *                   应收单/类型/日期同编辑回填；redOriginal 记原单供金额上限提示
 */
const loadForEdit = async (id: number, asRedFlush = false) => {
  try {
    const d = await invoiceDetail(id)
    if (asRedFlush) redOriginal.value = d
    // 仅编辑态记录本单方向；红冲态 d 是原单（蓝字），不可拿来当"本单方向"用
    editDocDirection.value = asRedFlush ? null : (d.docDirection ?? null)
    form.receivableId = d.receivableId ?? null
    form.invoiceNo = asRedFlush ? '' : (d.invoiceNo ?? '')
    form.invoiceCode = asRedFlush ? '' : (d.invoiceCode ?? '')
    form.invoiceType = d.invoiceType ?? 'NORMAL'
    form.invoiceAmount = asRedFlush ? null : (d.invoiceAmount ?? null)
    form.taxRate = d.taxRate ?? null
    // 税额只读、由税率×金额自动算（2026-10-27）：编辑回填后以 amount×rate 重算，不沿用旧值
    form.taxAmount = (form.invoiceAmount != null && form.taxRate != null)
      ? Number((Number(form.invoiceAmount) * Number(form.taxRate)).toFixed(2)) : null
    form.invoiceDate = d.invoiceDate ?? null
    attachments.value = []
    await loadAttachments(id)
    // 分配明细回填（V65）：detail.allocations 为空 = V65 前的主应收单独享历史单
    await nextTick()
    allocations.value = (d.allocations || []).map((a) => ({
      receivableId: a.receivableId,
      amount: a.amount,
    }))
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

watch(
  () => visible.value,
  (v) => {
    if (!v) return
    loadReceivables()
    if (isEdit()) {
      loadForEdit(props.invoiceId!)
    } else if (isRedFlush()) {
      // 红冲模式：复用编辑回填拉原单数据预填（应收单/类型/日期/分配镜像），票号与金额留空
      loadForEdit(props.originalInvoiceId!, true)
    } else {
      resetForm()
    }
  },
)

// 税额只读 + 税率自动算（2026-10-27）：金额或税率变化即重算 taxAmount = amount × rate
watch(
  () => [form.invoiceAmount, form.taxRate],
  () => {
    const amt = Number(form.invoiceAmount)
    const rate = Number(form.taxRate)
    if (form.invoiceAmount == null || form.taxRate == null || Number.isNaN(amt) || Number.isNaN(rate)) {
      form.taxAmount = null
    } else {
      form.taxAmount = Number((amt * rate).toFixed(2))
    }
  },
)

// 方案A（2026-10-27）：总额强制 = Σ分配（只读）。创建/红冲态分配变化即同步开票金额；
// 编辑态发票金额法定锁定，保留后端原值，不被分配联动覆盖
watch(
  allocatedTotal,
  (v) => {
    if (isEdit()) return
    form.invoiceAmount = v == null ? null : Number(v.toFixed(2))
  },
  { immediate: false },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isRedFlush() ? '红冲发票单' : isEdit() ? '编辑发票单' : '新建发票单'"
    width="640px"
    top="7vh"
  >
    <div class="detail-scroll">
      <!-- 红冲提示条（2026-10-25 红冲入口）：说明口径 + 原单信息 -->
      <el-alert
        v-if="isRedFlush()"
        type="warning"
        :closable="false"
        show-icon
        class="red-flush-tip"
      >
        <template #title>
          正在冲销原单
          <b>{{ redOriginal?.invoiceNo || `#${props.originalInvoiceId}` }}</b>
          （原单金额 {{ formatAmount(redOriginal?.invoiceAmount) }}），支持部分红冲，金额不可超过原单；
          红字票号请在下方填写。
        </template>
      </el-alert>
      <el-form label-width="110px" @submit.prevent>
        <!-- 应收单是发票的挂靠主体，带提示行 -->
        <el-form-item label="应收单" required>
          <el-select
            v-model="form.receivableId"
            filterable
            :disabled="isEdit() || isRedFlush()"
            :placeholder="isEdit() || isRedFlush() ? '与原单同应收单，不可更换' : '选择应收单（发票须挂应收）'"
            style="width: 100%"
            :loading="loadingReceivables"
          >
            <el-option
              v-for="r in receivableOptions"
              :key="r.id"
              :label="`${r.receivableNo || '—'}（应收 ${formatAmount(r.receivableAmount)}）`"
              :value="r.id"
            />
          </el-select>
          <div v-if="selectedReceivable" class="recv-meta">
            未开票金额：<b>{{ formatAmount(selectedReceivable.uninvoicedAmount) }}</b>
            <span class="muted">（项目随应收单带入，不可手改）</span>
          </div>
        </el-form-item>

        <!-- 核销分配（V65 双向拆分）：选填，一张发票可拆多张应收单（合并开）；
             填了分配行则以第一行为主应收单（无需再选上面的应收单）。
             Σ 必须 = 开票金额（前端提示，后端强制）。 -->
        <el-form-item label="核销分配">
          <div class="alloc-box">
            <div class="alloc-hint muted">
              选填：一张发票可拆到多张应收单（合并开）；填了分配行则以第一行为主应收单。同一应收单不可重复选；选完自动回填未开票余额，金额不得超出该余额。
            </div>
            <div v-for="(a, idx) in allocations" :key="idx" class="alloc-row">
              <el-select
                v-model="a.receivableId"
                filterable
                placeholder="选择应收单"
                style="flex: 1 1 0; min-width: 0"
                :loading="loadingReceivables"
                @change="onAllocationReceivableChange(idx)"
              >
                <el-option
                  v-for="rv in allocOptionsFor(idx)"
                  :key="rv.id"
                  :label="`${rv.receivableNo}（未开票 ${formatAmount(rv.uninvoicedAmount)}）`"
                  :value="rv.id"
                />
              </el-select>
              <el-input-number
                v-model="a.amount"
                :min="0"
                :max="allocMaxAmount(idx)"
                :precision="2"
                controls-position="right"
                placeholder="金额"
                style="width: 150px"
              />
              <el-button link type="danger" size="small" @click="removeAllocation(idx)">
                删除
              </el-button>
            </div>
            <div class="alloc-foot">
              <el-button size="small" @click="addAllocation">+ 添加分配行</el-button>
              <span v-if="allocations.length" class="alloc-sum">
                已分配 <b>{{ formatAmount(allocatedTotal) }}</b>
                <span v-if="remaining != null" :class="remaining === 0 ? 'alloc-ok' : 'alloc-warn'">
                  {{ remaining === 0 ? '，已分配完' : `，差额 ${formatAmount(remaining)}` }}
                </span>
              </span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="发票类型" required>
          <DictSelect
            v-model="form.invoiceType"
            type-code="invoice_type"
            placeholder="请选择"
            class="w-full"
          />
        </el-form-item>

        <el-form-item label="开票金额" required>
          <el-input-number
            v-model="form.invoiceAmount"
            :disabled="true"
            :min="0"
            :precision="2"
            controls-position="right"
            class="amount-left"
            style="width: 100%"
          />
          <div class="muted" style="margin-top: 4px">本金额 = 各核销分配行合计（强制拆分、只读自动算）</div>
        </el-form-item>

        <el-form-item label="发票号码">
          <el-input v-model="form.invoiceNo" placeholder="留空自动生成单号；填纸质发票票号" style="width: 100%" />
        </el-form-item>

        <el-form-item label="发票代码">
          <el-input v-model="form.invoiceCode" placeholder="选填" style="width: 100%" />
        </el-form-item>

        <el-form-item label="税率">
          <el-input-number
            v-model="form.taxRate"
            placeholder="如 0.13 = 13%"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="4"
            controls-position="right"
            class="amount-left"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="税额">
          <el-input-number
            v-model="form.taxAmount"
            :disabled="true"
            :min="0"
            :precision="2"
            controls-position="right"
            class="amount-left"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="开票日期" required>
          <el-date-picker
            v-model="form.invoiceDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择开票日期"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="发票文件" required>
          <div class="attach-box">
            <el-upload
              :show-file-list="false"
              :http-request="customUpload"
              :before-upload="beforeUpload"
              :disabled="uploading"
              accept="image/*,.pdf"
              multiple
            >
              <el-button :icon="UploadFilled" :loading="uploading">上传发票</el-button>
            </el-upload>
            <span class="muted">支持图片/PDF，单个 ≤ {{ MAX_ATTACH_MB }}MB（选填）</span>
          </div>
          <ul v-if="attachments.length" class="attach-list">
            <li v-for="(f, idx) in attachments" :key="f.id">
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
              <el-button link type="danger" size="small" @click="removeAttachment(idx)">
                移除
              </el-button>
            </li>
          </ul>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">
        {{ isEdit() ? '保存修改' : isRedFlush() ? '创建红冲单' : '创建发票单' }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 附件预览：与详情弹窗同套，复用文件管理模块的预览组件 -->
  <FilePreviewDialog v-model="previewVisible" :file="previewRow" />
</template>

<style scoped>
.red-flush-tip {
  margin-bottom: 12px;
}
.recv-meta {
  margin-top: 6px;
  font-size: 13px;
  color: #303133;
}
/* 核销分配区（V65） */
.alloc-box {
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 10px;
  background: #fafcff;
}
.alloc-hint {
  margin-bottom: 6px;
}
.alloc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.alloc-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
}
.alloc-sum {
  font-size: 12px;
  color: #606266;
}
.alloc-ok {
  color: #67c23a;
}
.alloc-warn {
  color: #e6a23c;
}
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
.attach-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}
.attach-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  width: 100%;
}
.attach-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f5f7fa;
  margin-bottom: 4px;
}
/* 文件名 = 列表操作列同款「el-button link primary small」（2026-10-25 虎哥定稿）：
   点文件名即预览，其余操作（移除）各归各按钮。
   ⚠️ 溢出省略为什么要在里面再包一层 <span>：`.el-button` 实测是 display:inline-flex
      （dist/index.css 实证），裸文本会被包成**匿名 flex item**，text-overflow 对它无效——
      写在根按钮上的 ellipsis 根本不出省略号。正解：文本放进真实子节点，作为 flex item
      并给它 min-width:0 + display:block，让它能收缩到 max-width 以内再由 ellipsis 收尾。
   ⚠️ line-height 必须显式写（2026-10-25 虎哥实测：字母 g/j/p/q/y 下半截被裁）：
      `.el-button{ line-height:1 }` 是 EP 自带样式，**直接命中 button 元素**——而 CSS 里
      「直接指定永远赢过继承」，父容器 li 的 line-height 根本传不进按钮。
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
</style>
