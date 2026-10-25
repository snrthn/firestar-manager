<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { createReceipt, receiptDetail, updateReceipt } from '@/api/receipt'
import { projectPage } from '@/api/project'
import { receivablePage } from '@/api/receivable'
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
const allocations = ref<AllocationItem[]>([])

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
  allocations.value.push({ receivableId: null as unknown as number, amount: null as unknown as number })
}

const removeAllocation = (idx: number) => {
  allocations.value.splice(idx, 1)
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

const selectedProject = () => projectOptions.value.find((p) => p.id === form.projectId) ?? null

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  form.receiptType = null
  form.receiptDate = null
  attachments.value = []
  allocations.value = []
  receivableOptions.value = []
  redOriginal.value = null
}

const handleSubmit = async () => {
  if (!form.projectId) {
    ElMessage.warning('请选择项目')
    return
  }
  if (form.receiptAmount == null || Number(form.receiptAmount) <= 0) {
    ElMessage.warning('请填写大于 0 的收款金额')
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
  // 核销分配（V65）：过滤未填完整的行；空列表 = 预收未指定
  const allocs: AllocationItem[] = allocations.value
    .filter((a) => a.receivableId != null && a.amount != null && Number(a.amount) > 0)
    .map((a) => ({ receivableId: a.receivableId, amount: Number(a.amount) }))
  // 前端口径提示（后端 saveAllocations 同样强制）：Σ 必须 = 收款金额
  if (allocs.length) {
    const sum = allocs.reduce((s, a) => s + a.amount, 0)
    const total = Number(form.receiptAmount)
    if (Number(sum.toFixed(2)) !== Number(total.toFixed(2))) {
      ElMessage.warning(`分配总额 ${sum.toFixed(2)} 与收款金额 ${total.toFixed(2)} 不一致，请调整`)
      return
    }
  }
  // 日期控件返回 'YYYY-MM-DD'，后端 LocalDate 可直接解析；清空时传 null
  const payload: ReceiptRequest = {
    projectId: form.projectId,
    receiptAmount: Number(form.receiptAmount),
    receiptType: form.receiptType || null,
    receiptDate: form.receiptDate || null,
    attachmentFileIds: attachments.value.map((f) => f.id),
    allocations: allocs,
    // 红冲单（2026-10-25）：方向 RED + 原单 ID；审批通过后对应收单/项目汇总做减法
    docDirection: isRedFlush() ? 'RED' : undefined,
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
    form.projectId = d.projectId ?? null
    form.receiptAmount = asRedFlush ? null : (d.receiptAmount ?? null)
    form.receiptType = d.receiptType ?? null
    form.receiptDate = d.receiptDate ?? null
    attachments.value = []
    await loadAttachments(id)
    // 等 projectId 的 watch 先跑（会清空 allocations 并加载应收单），再回填，
    // 否则回填值会被 watch 的清空动作覆盖
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
    loadProjects()
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
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isRedFlush() ? '红冲收款单' : isEdit() ? '编辑回款单' : '新建回款单'"
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

        <el-form-item label="收款金额" required>
          <el-input-number
            v-model="form.receiptAmount"
            :min="0"
            :precision="2"
            controls-position="right"
            class="amount-left"
            style="width: 100%"
          />
        </el-form-item>

        <!-- 核销分配（V65 双向拆分）：选填，把收款金额拆到具体应收单（可拆多张）；
             不填 = 预收，系统只记项目已收。Σ 必须 = 收款金额（前端提示，后端强制）。 -->
        <el-form-item label="核销分配">
          <div class="alloc-box">
            <div class="alloc-hint muted">
              选填：一笔收款可拆到多张应收单（分期核销）；不填 = 预收，之后再核销。
            </div>
            <div v-for="(a, idx) in allocations" :key="idx" class="alloc-row">
              <el-select
                v-model="a.receivableId"
                filterable
                placeholder="选择应收单"
                style="flex: 1 1 0; min-width: 0"
                :loading="loadingReceivables"
              >
                <el-option
                  v-for="rv in receivableOptions"
                  :key="rv.id"
                  :label="`${rv.receivableNo}（未回款 ${formatAmount(rv.unreceivedAmount)}）`"
                  :value="rv.id"
                />
              </el-select>
              <el-input-number
                v-model="a.amount"
                :min="0"
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

        <el-form-item label="款项类型">
          <DictSelect
            v-model="form.receiptType"
            type-code="receipt_type"
            placeholder="选择款项类型"
            class="w-full"
          />
        </el-form-item>

        <el-form-item label="收款日期">
          <el-date-picker
            v-model="form.receiptDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择收款日期"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="银行回单">
          <div class="attach-box">
            <el-upload
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
      <el-button type="primary" :loading="saving" @click="handleSubmit">
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
