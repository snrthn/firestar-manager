<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { createReceipt, receiptDetail, updateReceipt } from '@/api/receipt'
import { projectPage } from '@/api/project'
import { receivablePage } from '@/api/receivable'
import { loadDictOptions, type DictOption } from '@/composables/useDict'
import { listFiles, uploadFile } from '@/api/file'
import type { AllocationItem, ReceiptRequest, ReceiptVO } from '@/types/receipt'
import type { ProjectVO } from '@/types/project'
import type { ReceivableVO } from '@/types/receivable'
import type { FileVO } from '@/types/file'
import DictSelect from '@/components/DictSelect.vue'
// 已选附件支持就地预览（2026-10-25 虎哥要求）：与详情弹窗同一套，复用文件管理模块的预览组件。
// 预览走 preview 接口（inline、不计数），与 download 接口分家 —— 详见 FilePreviewDialog 注释。
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'

// 回款单 新建 / 编辑弹窗。
// 契约要点（对齐 ReceiptServiceImpl）：创建出来的是「草稿态 PENDING_APPROVAL」，
// 不拉审批流；必须回列表点「提交审批」才拉起 receipt_approval。故按钮文案是「创建」不是「提交申请」。
// 仅允许从「已审批」项目发起；编辑态后端仅接受 PENDING_APPROVAL 的单据。
//
// 备注：fin_receipt 无 remark 列、后端未消费 remark → 本表单不提供备注输入位（避免「填了不存」）。
//
// 附件（2026-10-25 V62 真上传）：原 bank_receipt_path「只存路径」是死输入位，改为走
// sys_file_storage 软关联，与发货签收证据（V54 shipment_receive_proof）严格同构。
// 新建时单据尚无 id → 上传不带 bizId，保存后由后端统一挂载。
const visible = defineModel<boolean>('visible', { required: true })
// originalReceiptId：红冲模式入参（2026-10-25 红冲入口，虎哥拍板「正数+RED、走完整审批」）。
// 从详情弹窗「红冲」按钮传入被冲销的蓝字单 ID；非空 = 本弹窗以红冲单模式打开。
const props = defineProps<{ receiptId?: number | null; originalReceiptId?: number | null }>()
const emit = defineEmits<{ saved: [] }>()

/**
 * 附件业务类型字面量。必须与下列三处严格一致，否则文件在文件管理页不可见、不可筛：
 *   ① 后端 ReceiptServiceImpl.RECEIPT_ATTACH_BIZ_TYPE
 *   ② file_biz_type 字典的 dict_value（V20 已种 receipt）
 *   ③ 本常量
 */
const ATTACH_BIZ_TYPE = 'receipt'
const MAX_ATTACH_MB = 10

const isEdit = () => props.receiptId != null
/** 红冲模式：传了 originalReceiptId 即红字单（与编辑态互斥，红冲永远新建） */
const isRedFlush = () => props.originalReceiptId != null
/** 预收款模式：款项类型选 PREPAY 时隐藏应收单分配、总额改为手填 */
const isPrepay = () => form.receiptType === 'PREPAY'
// 编辑对象本身的单据方向（loadForEdit 回填）：红冲单（RED）做减法，编辑时不得套用蓝字超收拦截
const editDocDirection = ref<string | null>(null)
/** 红冲原单数据（预填来源 + 金额上限提示） */
const redOriginal = ref<ReceiptVO | null>(null)

const projectOptions = ref<ProjectVO[]>([])
const loadingProjects = ref(false)
const saving = ref(false)
/** 已选附件（编辑态从文件表按 bizType+bizId 回填） */
const attachments = ref<FileVO[]>([])
const uploading = ref(false)

// ===== 核销分配（V65 双向拆分，虎哥 2026-10-25 拍板 B）=====
// 预收/未指定 = 空列表；非空时强制 Σ = 收款金额（前端提示 + 后端强制），
// 每行 ≤ 该应收单未回款余额（后端强制，前端只展示余额供参考）。
const receivableOptions = ref<ReceivableVO[]>([])
const loadingReceivables = ref(false)
/**
 * 分配行 + 自动填充标记。
 *
 * - `autoBal` 最近一次由系统回填的余额（展示/调试用）；
 * - `userEdited` 金额是否被**用户手动**改过（el-input-number 的 @change 只由用户操作触发，
 *   程序化改 v-model 不会触发），为 true 时换应收单不再覆盖手填值。
 *
 * ⚠️ 2026-10-28 二次修复：此前用「金额是否等于 autoBal」反推用户有没有手改，在编辑态
 *    恒不成立 —— 后端 unreceivedAmount 是**已扣掉本单占用**的余额（ReceiptServiceImpl
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
/** 差额 = 收款金额 - 已分配；null = 未填收款金额 */
const remaining = computed(() => {
  if (form.receiptAmount == null) return null
  return Number(form.receiptAmount) - allocatedTotal.value
})

const loadReceivables = async (projectId: number) => {
  loadingReceivables.value = true
  try {
    // 只列本项目下的应收单（后端 ReceivableServiceImpl 生成时 1:1 挂发货批次）
    const page = await receivablePage(1, 500, { projectId })
    receivableOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingReceivables.value = false
  }
}

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

const form = reactive<{
  projectId: number | null
  receiptAmount: number | null
  receiptType: string | null
  receiptDate: string | null
}>({
  projectId: null,
  receiptAmount: null,
  receiptType: null,
  receiptDate: null,
})

const loadProjects = async () => {
  loadingProjects.value = true
  try {
    // 只列已审批项目：未审批/草稿项目不可发起回款（业务口径，前端把关 + 后端可强制）
    const page = await projectPage(1, 500, { approvalStatus: 'APPROVED' })
    projectOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingProjects.value = false
  }
}

// 款项类型合并下拉（2026-10-28 虎哥要求：正常新建单也能选「红冲」）：
// receipt_type（蓝字 NORMAL/PREPAY）+ receipt_red_type（红字 REFUND/RED）合并，
// 选中红字类即进入红冲态。DictSelect 仅支持单 typeCode，故此处自定义合并 el-select，
// 复用 useDict.loadDictOptions 取同口径 ENABLED 选项。
type ReceiptTypeOpt = DictOption & { grp: 'blue' | 'red' }
const receiptTypeOptions = ref<ReceiptTypeOpt[]>([])
const loadReceiptTypeOptions = async () => {
  try {
    const [blue, red] = await Promise.all([
      loadDictOptions('receipt_type'),
      loadDictOptions('receipt_red_type'),
    ])
    receiptTypeOptions.value = [
      ...blue.map((o) => ({ ...o, grp: 'blue' as const })),
      ...red.map((o) => ({ ...o, grp: 'red' as const })),
    ]
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}
// 蓝字 / 红字两组拆开，供模板按「分组标题 + 红字项打标签」渲染（2026-10-28 虎哥：
// 仅靠颜色区分太眼花，要明确文字标签）。`:label` 仍用字典原名 → 折叠态显示干净；
// 展开态红字项额外加「红冲」标签，区分落到文字而非颜色。
const blueTypeOpts = computed(() => receiptTypeOptions.value.filter((o) => o.grp === 'blue'))
const redTypeOpts = computed(() => receiptTypeOptions.value.filter((o) => o.grp === 'red'))

const selectedProject = () => projectOptions.value.find((p) => p.id === form.projectId) ?? null

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ===== 核销分配交互增强（2026-10-27 Q1/Q2；2026-10-28 禁用+标记改造）=====
// 下拉不再「剔除」已选应收单（避免用户误以为数据丢失），改为：已选的禁用 + 标记，其余按结清态标记。
// 红冲(RED)模式：已结清/已开票 的应收单仍可选（反向核销/退款要冲原单），仅防本单内重复选。
// 手动选「红冲」款项类型（REFUND/RED）→ 进入红冲态（与详情红冲按钮、编辑红字单同口径）
const isRedType = () =>
  form.receiptType === 'REFUND' || form.receiptType === 'RED'
// 红冲态：① 详情红冲按钮（originalReceiptId 非空，冲原蓝字应收、镜像锁定）；
//         ② 手动选红冲款项类型（originalReceiptId 空，冲红字应收、消耗贷项）；
//         ③ 编辑既有红字单。三种皆 docDirection=RED，下拉走红冲口径。
const isRedMode = () => isRedFlush() || editDocDirection.value === 'RED' || isRedType()
// 红字应收是否已冲销（消耗贷项完成）：writtenOffAmount ≥ receivableAmount 即视为已结清，
// 用于手动红冲下拉排除（防双冲）。零字典/零迁移，纯数值判定（2026-10-28 虎哥拍板）。
const isReceivableConsumed = (rv: ReceivableVO): boolean =>
  Number(rv.writtenOffAmount ?? 0) >= Number(rv.receivableAmount ?? 0)
// 该应收单是否被「其他分配行」已选（防同一应收单在多个分配行重复选）
const isChosenByOtherRow = (idx: number, rvId: number) =>
  allocations.value.some((a, i) => i !== idx && a.receivableId === rvId)
// 收款场景：未回款余额 ≤ 0 = 已结清
const isReceiptCleared = (rv: ReceivableVO) => Number(rv.unreceivedAmount ?? 0) <= 0
// 下拉项是否禁用：其他行已选（禁止重复）→ 禁用；非红冲且已结清 → 禁用
const isOptionDisabled = (idx: number, rv: ReceivableVO) =>
  isChosenByOtherRow(idx, rv.id) || (!isRedMode() && isReceiptCleared(rv))
// 下拉项后缀标签：其他行已选 → 「已选」；已结清 → 「已结清」（红冲态标注「可红冲」）；否则空
const optionTag = (idx: number, rv: ReceivableVO): string => {
  if (isChosenByOtherRow(idx, rv.id)) return '已选'
  if (isReceiptCleared(rv)) return isRedMode() ? '已结清·可红冲' : '已结清'
  return ''
}
// 下拉可见应收单：按模式过滤（2026-10-28 红冲改造）
// - 正常收款态：剔除红字应收（docDirection=RED），避免误选退货贷项；
// - 手动红冲态（选红冲款项类型、非详情红冲）：只留红字应收且排除已冲销（防双冲）；
// - 详情红冲态（冲原蓝字应收）：显示全部（下拉只读锁定，无需过滤方向）。
const visibleReceivableOptions = computed<ReceivableVO[]>(() => {
  if (isRedType() && !isRedFlush()) {
    return receivableOptions.value.filter(
      (rv) => rv.docDirection === 'RED' && !isReceivableConsumed(rv),
    )
  }
  if (!isRedMode()) {
    return receivableOptions.value.filter((rv) => rv.docDirection !== 'RED')
  }
  return receivableOptions.value
})
// Q2：选中应收单后默认回填其「未回款余额」；已手填金额（>0）不覆盖。
const onAllocationReceivableChange = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  if (!rv) return
  const bal = Number((rv.unreceivedAmount == null ? 0 : Number(rv.unreceivedAmount)).toFixed(2))
  // 换单即刷新（新增/编辑同口径，2026-10-28 二次修复）：
  // - 用户没手改过金额（空 / 0 / 上次由系统填的）→ 跟随新应收单的未回款余额刷新；
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
// 单行分配金额上限 = 该应收单未回款余额（物理封顶，防止超过）；未选应收单时无限。
// ⚠️ 编辑态兜底：余额已扣掉本单占用，直接拿它当上限会把本行已存金额压掉（EP input-number
//    对超限的 modelValue 会钳住显示值，出现「显示 400 / 提交 600」）。故上限取
//    max(余额, 当前值)，保证已存金额永远放得下；新增态当前值恒 ≤ 余额，等价原逻辑。
const allocMaxAmount = (idx: number) => {
  const a = allocations.value[idx]
  if (!a || a.receivableId == null) return undefined
  const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
  if (rv?.unreceivedAmount == null) return undefined
  const bal = Number(rv.unreceivedAmount)
  const cur = a.amount == null ? 0 : Number(a.amount)
  return Math.max(bal, cur)
}
/** 某应收单的未回款余额（编辑回填时给分配行打 autoBal 标记用；查不到返回 null） */
const balanceOfReceivable = (receivableId: number | null | undefined): number | null => {
  if (receivableId == null) return null
  const rv = receivableOptions.value.find((r) => r.id === receivableId)
  return rv?.unreceivedAmount == null ? null : Number(Number(rv.unreceivedAmount).toFixed(2))
}

// ===== 附件 =====

const beforeUpload = (file: File) => {
  if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
    ElMessage.warning(`单个附件不能超过 ${MAX_ATTACH_MB}MB`)
    return false
  }
  return true
}

/** el-upload 自定义上传：复用 FileController.upload（file:manage，V62 已授给出纳） */
const customUpload = async (options: { file: File }) => {
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', options.file)
    fd.append('bizType', ATTACH_BIZ_TYPE)
    // 新建时单据 id 尚未生成 → 不传 bizId，落库后由后端 bindAttachments 统一挂载
    if (props.receiptId != null) {
      fd.append('bizId', String(props.receiptId))
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
  form.receiptAmount = null
  // 新建蓝字收款单默认「正常收款」（必须走应收单分配）；红冲/编辑走各自回填
  form.receiptType = 'NORMAL'
  form.receiptDate = null
  attachments.value = []
  allocations.value = []
  allocLoadedEmpty.value = false
  receivableOptions.value = []
  redOriginal.value = null
  editDocDirection.value = null
}

const handleSubmit = async () => {
  if (!form.projectId) {
    ElMessage.warning('请选择项目')
    return
  }
  // 方案A（2026-10-27）：有分配 → 总额=Σ分配（必>0 由分配保证）；无分配=预收 → 总额手填必>0
  const derivedReceiptAmount = allocations.value.length > 0
    ? allocatedTotal.value
    : (form.receiptAmount == null ? null : Number(form.receiptAmount))
  if (derivedReceiptAmount == null || derivedReceiptAmount <= 0) {
    ElMessage.warning(allocations.value.length > 0 ? '分配金额合计必须大于 0' : '请填写大于 0 的收款金额')
    return
  }
  if (!form.receiptType) {
    ElMessage.warning('请选择款项类型')
    return
  }
  // 正常收款必须至少分配一条应收单：总额=Σ分配，无分配则总额无来源；
  // 预收请改用「预收款」模式（PREPAY，不挂应收单、总额手填）。红冲(RED)不受此限。
  if (
    !isRedFlush() &&
    editDocDirection.value !== 'RED' &&
    form.receiptType === 'NORMAL' &&
    allocations.value.length === 0
  ) {
    ElMessage.warning('正常收款必须至少选择一条应收单进行核销分配')
    return
  }
  // 红冲态（详情红冲 / 手动红冲款项类型 / 编辑红字单）必须至少一条冲销目标
  if (isRedMode() && allocations.value.length === 0) {
    ElMessage.warning('红冲单必须至少选择一条应收单（红字应收或原单应收）进行冲销')
    return
  }
  if (!form.receiptDate) {
    ElMessage.warning('请选择收款日期')
    return
  }
  if (attachments.value.length === 0) {
    ElMessage.warning('请上传银行回单')
    return
  }
  // 红冲口径（2026-10-25）：金额 ≤ 原单金额（支持部分红冲），后端同校验
  if (isRedFlush() && redOriginal.value) {
    const max = Number(redOriginal.value.receiptAmount)
    if (Number(form.receiptAmount) > max) {
      ElMessage.warning(`红冲金额不能超过原单金额 ${max}`)
      return
    }
  }
  // 超收拦截（双保险·前端关口）：仅「蓝字收款」不得使累计已收超过合同金额；
  // 红冲态一律放行——详情红冲(isRedFlush) / 编辑红字单(editDocDirection=RED) / 手动选红冲款项类型(isRedType)
  // 审批通过都是做减法，只会让累计已收回落（2026-10-27 误拦实锤；2026-10-28 补上手动红冲类型，否则②路径建不出单）
  if (!isRedMode()) {
    const p = selectedProject()
    if (p && p.contractAmount != null && p.collectedAmount != null) {
      const c = Number(p.contractAmount)
      const cur = Number(p.collectedAmount)
      const inc = derivedReceiptAmount
      if (inc + cur > c) {
        ElMessage.warning(
          `收款金额将使累计已收（${formatAmount(cur)}）超过合同金额（${formatAmount(c)}），超出 ${formatAmount(inc + cur - c)}。请核实金额，或先红冲超收部分。`,
        )
        return
      }
    }
  }
  // 核销分配（V65）：过滤未填完整的行；空列表 = 预收未指定
  const allocs: AllocationItem[] = allocations.value
    .filter((a) => a.receivableId != null && a.amount != null && Number(a.amount) > 0)
    .map((a) => ({ receivableId: a.receivableId, amount: Number(a.amount) }))
  // 单行分配不得超出该应收单未回款余额（双保险·前端关口，后端 saveAllocations 强制）：
  // 红冲单（RED）审批通过是做减法，放行；编辑中的红冲草稿同放行。
  if (!isRedMode()) {
    const bad = allocs.find((a) => {
      const rv = receivableOptions.value.find((r) => r.id === a.receivableId)
      return rv?.unreceivedAmount != null && a.amount > Number(rv.unreceivedAmount)
    })
    if (bad) {
      const rv = receivableOptions.value.find((r) => r.id === bad.receivableId)
      ElMessage.warning(`分配金额超出应收单未回款余额：${rv?.receivableNo ?? ''}（未回款 ${formatAmount(rv?.unreceivedAmount)}），请调整`)
      return
    }
  }
  // 总额=Σ分配（有分配时只读自动算），Σ=金额一致性由前端分配与后端 saveAllocations 双重保证，无需再校验
  // 日期控件返回 'YYYY-MM-DD'，后端 LocalDate 可直接解析；清空时传 null
  const payload: ReceiptRequest = {
    projectId: form.projectId,
    receiptAmount: derivedReceiptAmount,
    receiptType: form.receiptType || null,
    receiptDate: form.receiptDate || null,
    attachmentFileIds: attachments.value.map((f) => f.id),
    allocations: allocs,
    // 红冲单（2026-10-25 / 2026-10-28 改造）：详情红冲或为「红冲」款项类型 → 方向 RED
    // + 原单 ID（仅详情红冲带 originalReceiptId，手动红冲单 originalReceiptId 留空）；
    // 审批通过后对应收单/项目汇总做减法（红字应收走消耗贷项语义）
    docDirection: isRedMode() ? 'RED' : undefined,
    originalReceiptId: isRedFlush() ? props.originalReceiptId! : undefined,
  }
  saving.value = true
  try {
    if (isEdit()) {
      await updateReceipt(props.receiptId!, payload)
      ElMessage.success('回款单已更新')
    } else if (isRedFlush()) {
      await createReceipt(payload)
      ElMessage.success('红冲单已创建（草稿），请在列表点「提交审批」发起审批')
    } else {
      await createReceipt(payload)
      ElMessage.success('回款单已创建（草稿），请在列表点「提交审批」发起审批')
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
 * @param asRedFlush 红冲模式：true 时不回填金额（用户自填，≤ 原单），其余同编辑回填；
 *                   redOriginal 记原单供金额上限提示
 */
const loadForEdit = async (id: number, asRedFlush = false) => {
  try {
    const d = await receiptDetail(id)
    if (asRedFlush) redOriginal.value = d
    // 仅编辑态记录本单方向；红冲态 d 是原单（蓝字），不可拿来当"本单方向"用
    editDocDirection.value = asRedFlush ? null : (d.docDirection ?? null)
    form.projectId = d.projectId ?? null
    form.receiptAmount = asRedFlush ? null : (d.receiptAmount ?? null)
    // 红冲模式：款项类型走 receipt_red_type 字典，默认退货退款，不继承原单蓝字类型
    // （否则红冲单会被标成"正常收款"，与 docDirection=RED 自相矛盾）
    // 编辑态红冲单若因历史脏数据把 receipt_type 错标成蓝字值（NORMAL 等），强制归位 RED，
    // 避免打开编辑再保存后款项类型回落为"正常收款"（防止再犯）。
    const legacyRedMislabel =
      (d.docDirection ?? null) === 'RED' && d.receiptType !== 'REFUND' && d.receiptType !== 'RED'
    form.receiptType = asRedFlush ? 'REFUND' : legacyRedMislabel ? 'RED' : (d.receiptType ?? null)
    form.receiptDate = d.receiptDate ?? null
    attachments.value = []
    await loadAttachments(id)
    // 等 projectId 的 watch 先跑（会清空 allocations 并加载应收单），再回填，
    // 否则回填值会被 watch 的清空动作覆盖
    // ⚠️ 2026-10-28 修复：watch 里的 loadReceivables 是异步的，await nextTick() 只等一个
    // 微任务、等不到 HTTP 返回 → 下拉此时还是空的，autoBal 恒为 undefined，
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
    loadProjects()
    loadReceiptTypeOptions()
    if (isEdit()) {
      loadForEdit(props.receiptId!)
    } else if (isRedFlush()) {
      // 红冲模式：复用编辑回填拉原单数据预填（项目/类型/日期/分配镜像），金额留空让用户填
      loadForEdit(props.originalReceiptId!, true)
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

// 款项类型 ↔ 分配状态强绑定（2026-10-27）：
// NORMAL(正常收款) ⇄ PREPAY(预收款) 互斥。切到任一类型时，分配明细作废并清空：
// - NORMAL：隐藏预收语义、总额=Σ分配(只读)，需重新选应收单；
// - PREPAY：放开总额手填，不挂应收单。
// 总额不清空（保留切换前的金额 / 编辑回填金额，交给 NORMAL 的只读Σ或 PREPAY 的手填接管），
// 避免「正常收款却带空分配=预收」或「预收款却填了分配=只读」的语义打架。
watch(
  () => form.receiptType,
  (t, prev) => {
    if (t === prev) return
    allocations.value = []
  },
)

// 方案A（2026-10-27）：有核销分配时，收款总额强制 = Σ分配（只读）；预收款保留手填。
// 2026-10-28 修复：删光分配行（length 变 0）时总额必须清零 —— 旧实现用 length>0 守卫，
// 空列表直接跳过赋值，导致删到最后一条时金额停在旧值。预收款态不参与联动（保住手填额）。
watch(
  () => [allocatedTotal.value, allocations.value.length],
  ([v, n]) => {
    if (isPrepay()) return
    // 编辑态打开时本就没有分配行的历史单：不清零，保住后端原金额（见 allocLoadedEmpty 注释）
    if (n === 0 && allocLoadedEmpty.value) return
    form.receiptAmount = n === 0 ? 0 : Number(Number(v ?? 0).toFixed(2))
  },
  { immediate: false },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isRedFlush() ? '红冲收款单' : isEdit() ? '编辑回款单' : '新建回款单'"
    width="700px"
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
          <b>{{ redOriginal?.receiptNo || `#${props.originalReceiptId}` }}</b>
          （原单金额 {{ formatAmount(redOriginal?.receiptAmount) }}），支持部分红冲，金额不可超过原单。
        </template>
      </el-alert>
      <el-form label-width="100px" @submit.prevent>
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

        <!-- 款项类型放在项目下方（2026-10-28 交互优化）：它决定下方「核销分配」的显隐，
             位置靠上可避免切换时下方整块跳动把上方字段顶走，阅读顺序也符合「先定性质再分钱」 -->
        <el-form-item label="款项类型" required>
          <!-- 新建蓝字单（非编辑、非详情红冲）：合并下拉，蓝字/红字同屏，选中红字类即进入红冲态 -->
          <el-select
            v-if="!isEdit() && !isRedFlush()"
            v-model="form.receiptType"
            class="w-full"
            placeholder="选择款项类型（含红冲）"
          >
            <el-option-group label="蓝字收款（正常 / 预收）">
              <el-option
                v-for="o in blueTypeOpts"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-option-group>
            <el-option-group label="红字 / 退款（红冲 · 减项）">
              <el-option
                v-for="o in redTypeOpts"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              >
                <span class="type-opt">
                  <el-tag size="small" type="danger" effect="plain">红冲</el-tag>
                  <span>{{ o.label }}</span>
                </span>
              </el-option>
            </el-option-group>
          </el-select>
          <!-- 编辑态 / 详情红冲：沿用原字典下拉（receipt_red_type），行为不变 -->
          <DictSelect
            v-else
            v-model="form.receiptType"
            :type-code="isRedFlush() || editDocDirection === 'RED' ? 'receipt_red_type' : 'receipt_type'"
            :placeholder="isRedFlush() || editDocDirection === 'RED' ? '选择红冲款项类型' : '选择款项类型'"
            class="w-full"
          />
        </el-form-item>

        <!-- 核销分配（V65 双向拆分）：仅「正常收款」显示；预收款(PREPAY)隐藏且不挂应收单。
             把收款金额拆到具体应收单（可拆多张），Σ 必须 = 收款金额（前端提示，后端强制）。 -->
        <el-form-item label="核销分配" v-if="!isPrepay()">
          <div class="alloc-box">
            <div class="alloc-hint muted">
              <template v-if="isRedFlush()">本单为红冲（冲销原单），以下为原单核销明细镜像：应收单不可更改、金额只能调减（≤原值），减至 0 即该行不参与冲销。</template>
              <template v-else-if="isRedType()">红冲收款单：请选择「红字应收单」（退货生成的贷项）进行冲销，金额即冲销额；已冲销的红字应收单不在下拉中（防双冲）。</template>
              <template v-else>正常收款需将金额分配到应收单（可拆多张）；同一应收单不可重复选；选完自动回填未回款余额，金额不得超出该余额。切到「预收款」将隐藏本区。</template>
            </div>
            <div v-for="(a, idx) in allocations" :key="idx" class="alloc-row">
              <el-select
                v-model="a.receivableId"
                filterable
                placeholder="选择应收单"
                style="flex: 1 1 0; min-width: 0"
                :loading="loadingReceivables"
                :disabled="isRedFlush()"
                @change="onAllocationReceivableChange(idx)"
              >
                <el-option
                  v-for="rv in visibleReceivableOptions"
                  :key="rv.id"
                  :label="`${rv.receivableNo}（未回款 ${formatAmount(rv.unreceivedAmount)}）${optionTag(idx, rv) ? ' · ' + optionTag(idx, rv) : ''}`"
                  :value="rv.id"
                  :disabled="isOptionDisabled(idx, rv)"
                />
              </el-select>
              <el-input-number
                v-model="a.amount"
                :min="0"
                :max="isRedFlush() ? (a.amount ?? 0) : (isRedType() ? undefined : allocMaxAmount(idx))"
                :precision="2"
                controls-position="right"
                placeholder="金额"
                style="width: 150px"
                :disabled="isRedFlush() && (a.amount ?? 0) <= 0"
                @change="onAllocationAmountChange(idx)"
              />
              <el-button v-if="!isRedFlush()" link type="danger" size="small" @click="removeAllocation(idx)">
                删除
              </el-button>
            </div>
            <div class="alloc-foot">
              <el-button size="small" :disabled="!form.projectId || isRedFlush()" @click="addAllocation">
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

        <!-- 收款金额移到核销分配下方（2026-10-28 交互优化）：它是「分配结果/手填入口」，
             紧跟其来源（分配区）视线不用来回跳；切预收款时分配区隐藏，金额就地变可填，位置稳定 -->
        <el-form-item label="收款金额" required>
          <el-input-number
            v-model="form.receiptAmount"
            :disabled="!isPrepay()"
            :min="0"
            :precision="2"
            controls-position="right"
            class="amount-left"
            style="width: 100%"
          />
          <div class="muted" style="margin-top: 4px">
            正常收款 / 红冲：金额按应收单分配自动合计（只读，改动请在上方分配行内调整）；仅「预收款」：隐藏分配、可手动填写金额。
          </div>
        </el-form-item>

        <el-form-item label="收款日期" required>
          <el-date-picker
            v-model="form.receiptDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择收款日期"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="银行回单" required>
          <div class="attach-box">
            <el-upload
              v-has-perm="'receipt:upload'"
              :show-file-list="false"
              :http-request="customUpload"
              :before-upload="beforeUpload"
              :disabled="uploading"
              accept="image/*,.pdf"
              multiple
            >
              <el-button :icon="UploadFilled" :loading="uploading">上传回单</el-button>
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
      <el-button type="primary" :loading="saving" v-has-perm="'receipt:create'" @click="handleSubmit">
        {{ isEdit() ? '保存修改' : '创建回款单' }}
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
.muted {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
/* 款项类型红字项：标签 + 文字同行对齐（2026-10-28 红冲标签改造） */
.type-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
