<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { createInvoice, invoiceDetail, updateInvoice } from '@/api/invoice'
import { projectPage } from '@/api/project'
import { receivablePage } from '@/api/receivable'
import { listFiles, uploadFile } from '@/api/file'
import type { AllocationItem, InvoiceRequest, InvoiceVO } from '@/types/invoice'
import type { ProjectVO } from '@/types/project'
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
const projectOptions = ref<ProjectVO[]>([])
const loadingProjects = ref(false)
const saving = ref(false)
/** 已选附件（编辑态从文件表按 bizType+bizId 回填） */
const attachments = ref<FileVO[]>([])
const uploading = ref(false)

/**
 * 挂靠主体 = 项目（2026-10-28 交互优化）。
 * 原表头「应收单」与下方「核销分配行」表达的是同一条关联，且提交时被 allocations[0]
 * 静默覆盖（前端 payload / 后端 InvoiceServiceImpl 同口径），属冗余死字段。
 * 改为与回款单一致的「项目」后：项目由用户显式选，应收单关联统一由核销分配行表达。
 */
const form = reactive<{
  projectId: number | null
  invoiceNo: string
  invoiceCode: string
  invoiceType: string
  invoiceAmount: number | null
  taxRate: number | null
  taxAmount: number | null
  invoiceDate: string | null
}>({
  projectId: null,
  invoiceNo: '',
  invoiceCode: '',
  invoiceType: 'NORMAL',
  invoiceAmount: null,
  taxRate: null,
  taxAmount: null,
  invoiceDate: null,
})

const loadProjects = async () => {
  loadingProjects.value = true
  try {
    // 只列已审批项目：与回款单同口径，未审批/草稿项目不可发起开票
    const page = await projectPage(1, 500, { approvalStatus: 'APPROVED' })
    projectOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingProjects.value = false
  }
}

const selectedProject = () => projectOptions.value.find((p) => p.id === form.projectId) ?? null

/** 按项目载应收单：应收单属于项目维度，切换项目即作废已填分配（与回款单同口径） */
const loadReceivables = async (projectId: number) => {
  loadingReceivables.value = true
  try {
    // 应收单由发货「客户已收货」自动生成；只列本项目下的（前端不分页）
    const page = await receivablePage(1, 500, { projectId })
    receivableOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingReceivables.value = false
  }
}

// ===== 核销分配（V65 双向拆分，虎哥 2026-10-25 拍板 B）=====
// 一张发票可拆多张应收单（合并开）；填了分配行则以第一行为主应收单（payload.receivableId
// 取它，与后端 create 的解析口径一致）。空列表 = 主应收单独享（原交互）。
/**
 * 分配行 + 自动填充标记。
 *
 * - `autoBal` 最近一次由系统回填的余额（展示/调试用）；
 * - `userEdited` 金额是否被**用户手动**改过（el-input-number 的 @change 只由用户操作触发，
 *   程序化改 v-model 不会触发），为 true 时换应收单不再覆盖手填值。
 *
 * ⚠️ 2026-10-28 二次修复：此前用「金额是否等于 autoBal」反推用户有没有手改，在编辑态
 *    恒不成立 —— 后端 uninvoicedAmount 是**已扣掉本单占用**的余额（WriteOffServiceImpl
 *    核销时 subtract(amount)），本行已存 600 时该单余额只剩 400，金额 ≠ 余额 → 被判成
 *    "手改过" → 换应收单金额永远不刷新。改用显式布尔标记，新增/编辑两态判据统一。
 */
type AllocationRow = AllocationItem & { autoBal?: number | null; userEdited?: boolean }
const allocations = ref<AllocationRow[]>([])

/**
 * 编辑态打开时该单**本来就没有分配行**（V65 之前「主应收单独享」的历史单，后端
 * allocationVOs 查不到 write_off 返回空数组）。此时不能因为分配行是空的就把金额清零，
 * 否则打开编辑再保存 = 把历史单金额改成 0。用户一旦自己增删过分配行就置 false，
 * 之后删光才按新增口径清零。
 */
const allocLoadedEmpty = ref(false)

const allocatedTotal = computed(() =>
  allocations.value.reduce((s, a) => s + (a.amount == null ? 0 : Number(a.amount)), 0),
)
/** 差额 = 开票金额 - 已分配；null = 未填开票金额 */
const remaining = computed(() => {
  if (form.invoiceAmount == null) return null
  return Number(form.invoiceAmount) - allocatedTotal.value
})

const addAllocation = () => {
  allocations.value.push({
    receivableId: null as unknown as number,
    amount: null as unknown as number,
    autoBal: null,
    userEdited: false,
  })
  // 用户主动加行 → 解除「历史单无分配行」保护，之后删光按新增口径清零
  allocLoadedEmpty.value = false
}

const removeAllocation = (idx: number) => {
  allocations.value.splice(idx, 1)
  allocLoadedEmpty.value = false
}

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ===== 核销分配交互增强（2026-10-27 Q1/Q2；2026-10-28 禁用+标记改造）=====
// 下拉不再「剔除」已选应收单，改为：已选的禁用 + 标记，其余按开票态标记。
// 红冲(RED)模式：已开票 的应收单仍可选（红字发票要冲原单），仅防本单内重复选。
const isRedMode = () => isRedFlush() || editDocDirection.value === 'RED'
// 该应收单是否被「其他分配行」已选（防同一应收单在多个分配行重复选）
const isChosenByOtherRow = (idx: number, rvId: number) =>
  allocations.value.some((a, i) => i !== idx && a.receivableId === rvId)
// 开票场景：未开票余额 ≤ 0 = 已开票
const isInvoiceCleared = (rv: ReceivableVO) => Number(rv.uninvoicedAmount ?? 0) <= 0
// 下拉项是否禁用：其他行已选（禁止重复）→ 禁用；非红冲且已开票 → 禁用
const isOptionDisabled = (idx: number, rv: ReceivableVO) =>
  isChosenByOtherRow(idx, rv.id) || (!isRedMode() && isInvoiceCleared(rv))
// 下拉项后缀标签：其他行已选 → 「已选」；已开票 → 「已开票」（红冲态标注「可红冲」）；否则空
const optionTag = (idx: number, rv: ReceivableVO): string => {
  if (isChosenByOtherRow(idx, rv.id)) return '已选'
  if (isInvoiceCleared(rv)) return isRedMode() ? '已开票·可红冲' : '已开票'
  return ''
}
// Q2：选中应收单后默认回填其「未开票余额」；已手填金额（>0）不覆盖。
const onAllocationReceivableChange = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  if (!rv) return
  const bal = Number((rv.uninvoicedAmount == null ? 0 : Number(rv.uninvoicedAmount)).toFixed(2))
  // 换单即刷新（新增/编辑同口径，2026-10-28 二次修复）：
  // - 用户没手改过金额（空 / 0 / 上次由系统填的）→ 跟随新应收单的未开票余额刷新；
  // - 用户手改过（userEdited）→ 尊重手填值，并解除自动回填标记。
  // 用显式布尔标记而非「金额 == 余额」反推：编辑态余额已被本单占用扣减，反推恒判为手改。
  const untouched = !a.userEdited || a.amount == null || Number(a.amount) === 0
  if (untouched) {
    a.amount = bal
    a.autoBal = bal
    a.userEdited = false
  } else {
    a.autoBal = null
  }
  allocLoadedEmpty.value = false
}

/** 用户手动改金额：el-input-number 的 change 只在用户交互时 emit（程序改 v-model 不触发） */
const onAllocationAmountChange = (idx: number) => {
  const a = allocations.value[idx]
  if (!a) return
  a.userEdited = true
  a.autoBal = null
}
// 单行分配金额上限 = 该应收单未开票余额（物理封顶，防止超过）；未选应收单时无限。
// ⚠️ 编辑态兜底：余额已扣掉本单占用，直接拿它当上限会把本行已存金额压掉（EP input-number
//    对超限的 modelValue 会钳住显示值，出现「显示 400 / 提交 600」）。故上限取
//    max(余额, 当前值)，保证已存金额永远放得下；新增态当前值恒 ≤ 余额，等价原逻辑。
const allocMaxAmount = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return undefined
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  if (rv?.uninvoicedAmount == null) return undefined
  const bal = Number(rv.uninvoicedAmount)
  const cur = a.amount == null ? 0 : Number(a.amount)
  return Math.max(bal, cur)
}
/** 某应收单的未开票余额（编辑回填时给分配行打 autoBal 标记用；查不到返回 null） */
const balanceOfReceivable = (receivableId: number | null | undefined): number | null => {
  if (receivableId == null) return null
  const rv = receivableOptions.value.find((r) => r.id === receivableId)
  return rv?.uninvoicedAmount == null ? null : Number(Number(rv.uninvoicedAmount).toFixed(2))
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
  form.projectId = null
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
  allocLoadedEmpty.value = false
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
  // 项目由表头显式选择（不再从应收单反推）；应收单候选已按项目过滤，天然同项目，
  // 后端 InvoiceServiceImpl 仍会校验「应收单属于该项目」兜底
  if (form.projectId == null) {
    ElMessage.warning('请选择项目')
    return
  }
  const projectId = form.projectId
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
    form.projectId = d.projectId ?? null
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
    // ⚠️ 2026-10-28 修复：projectId 的 watch 里 loadReceivables 是异步的，await nextTick()
    // 只等一个微任务、等不到 HTTP 返回 → 下拉此时还是空的，autoBal 算不出来（恒为 undefined），
    // 「金额是否仍等于系统回填值」的判据在编辑态永远不成立 → 换应收单金额不刷新。
    // 这里显式 await 一次再回填，并按当前应收单余额给每行打上 autoBal 标记。
    await nextTick()
    if (d.projectId != null) await loadReceivables(d.projectId)
    const loaded = d.allocations || []
    // 编辑态打开即视为「系统填的」，用户没手改过 → 之后换应收单会跟随余额刷新（与新增一致）
    allocations.value = loaded.map((a) => ({
      receivableId: a.receivableId,
      amount: a.amount,
      autoBal: balanceOfReceivable(a.receivableId),
      userEdited: false,
    }))
    // V65 之前的历史单本来就没有分配行：置保护位，避免金额联动把它清零
    allocLoadedEmpty.value = loaded.length === 0
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

watch(
  () => visible.value,
  (v) => {
    if (!v) return
    // 应收单不再全量预载：由 form.projectId 的 watch 按项目加载（与回款单同口径）
    loadProjects()
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

// 切换项目：分配明细作废（应收单属于项目维度），并按新项目重载应收单下拉
watch(
  () => form.projectId,
  (pid) => {
    allocations.value = []
    if (pid != null) {
      loadReceivables(pid)
    } else {
      receivableOptions.value = []
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

// 方案A（2026-10-27）：总额强制 = Σ分配（只读，模板 :disabled="true"，用户改不了）。
// 2026-10-28 修复两处：
// ① 删光分配行时总额必须清零（原实现只同步 Σ，空列表时金额停在旧值）；
// ② 编辑态此前直接 return，改/删分配行时开票金额纹丝不动（虎哥实测）。
//    放开拦截是安全的：金额控件恒只读，且提交时 handleSubmit 本就以 allocatedTotal
//    为准覆盖 invoiceAmount——联动只会让「显示值 = 提交值」，不再出现看到 A 却提交 B。
watch(
  () => [allocatedTotal.value, allocations.value.length],
  ([v, n]) => {
    // 编辑态打开时本就没有分配行的历史单：不清零，保住后端原金额（见 allocLoadedEmpty 注释）
    if (n === 0 && allocLoadedEmpty.value) return
    form.invoiceAmount = n === 0 ? 0 : Number(Number(v ?? 0).toFixed(2))
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
        <!-- 项目是发票的挂靠主体（2026-10-28 交互优化）：原表头「应收单」与核销分配行表达的是
             同一条关联，且提交时被 allocations[0] 静默覆盖，属冗余死字段。改为与回款单一致的
             「项目」后，应收单关联统一由核销分配行表达，不再有「选了不算」的歧义。 -->
        <el-form-item label="项目" required>
          <el-select
            v-model="form.projectId"
            filterable
            :disabled="isEdit() || isRedFlush()"
            :placeholder="isEdit() || isRedFlush() ? '与原单同项目，不可更换' : '选择已审批项目'"
            style="width: 100%"
            :loading="loadingProjects"
          >
            <el-option
              v-for="p in projectOptions"
              :key="p.id"
              :label="`${p.projectNo || '—'} ${p.projectName}`"
              :value="p.id"
            />
          </el-select>
          <div v-if="selectedProject()" class="proj-meta">
            合同金额：<b>{{ formatAmount(selectedProject()?.contractAmount) }}</b>
            <span class="muted">（仅展示已审批项目）</span>
          </div>
        </el-form-item>

        <!-- 核销分配（V65 双向拆分）：应收单关联的唯一入口（2026-10-28 起）。
             一张发票可拆多张应收单（合并开），首行即主表 receivable_id 的来源；
             开票金额 = Σ分配（只读，前端同步 + 后端强制）。 -->
        <el-form-item label="核销分配" required>
          <div class="alloc-box">
            <div class="alloc-hint muted">
              必填：发票开给哪些应收单由这里决定（可拆多张合并开），首行即主应收单。同一应收单不可重复选；选完自动回填未开票余额，金额不得超出该余额。
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
                  v-for="rv in receivableOptions"
                  :key="rv.id"
                  :label="`${rv.receivableNo}（未开票 ${formatAmount(rv.uninvoicedAmount)}）${optionTag(idx, rv) ? ' · ' + optionTag(idx, rv) : ''}`"
                  :value="rv.id"
                  :disabled="isOptionDisabled(idx, rv)"
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
                @change="onAllocationAmountChange(idx)"
              />
              <el-button link type="danger" size="small" @click="removeAllocation(idx)">
                删除
              </el-button>
            </div>
            <div class="alloc-foot">
              <el-button size="small" :disabled="!form.projectId" @click="addAllocation">
                + 添加分配行
              </el-button>
              <span v-if="allocations.length" class="alloc-sum">
                已分配 <b>{{ formatAmount(allocatedTotal) }}</b>
                <span v-if="remaining != null" :class="remaining === 0 ? 'alloc-ok' : 'alloc-warn'">
                  {{ remaining === 0 ? '，已分配完' : `，差额 ${formatAmount(remaining)}` }}
                </span>
              </span>
            </div>
          </div>
        </el-form-item>

        <!-- 开票金额紧跟核销分配（2026-10-28）：金额是 Σ分配的只读派生值，
             放在来源之后符合「先拆分配 → 再看合计」的填单顺序 -->
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

        <el-form-item label="发票类型" required>
          <DictSelect
            v-model="form.invoiceType"
            type-code="invoice_type"
            placeholder="请选择"
            class="w-full"
          />
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
              v-has-perm="'invoice:upload'"
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
      <el-button type="primary" :loading="saving" v-has-perm="'invoice:create'" @click="handleSubmit">
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
/* 项目提示行（2026-10-28）：原 .recv-meta 服务于已下线的表头「应收单」，改名复用 */
.proj-meta {
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
