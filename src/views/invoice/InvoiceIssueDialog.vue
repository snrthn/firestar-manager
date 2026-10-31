<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { UploadFilled } from '@element-plus/icons-vue'
import { issueInvoice } from '@/api/invoice'
import { listFiles, uploadFile } from '@/api/file'
import type { FileVO } from '@/types/file'
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'

// 发票「开票」弹窗（V95 发票流程重构）。
// 契约要点（对齐 InvoiceServiceImpl.issue）：
//  1) 仅 SUBMITTED（审批通过、待开票）态的发票可在此开票；列表操作列已按此门禁显隐。
//  2) 回填字段严格属于「开票节点」：税务发票号 / 发票代码 / 开票日期 / 电子发票附件。
//     购方六要素、金额、核销分配等已在申请阶段确定并快照，此处只读确认、不可改。
//  3) invoiceNo 必填且为真实票号（后端查重，绝不随机生成）；invoiceCode 选填；
//     attachmentFileIds 必填至少一张（电子票是开票产物）。
const props = defineProps<{
  invoiceId: number | null
  /** 业务申请单号（只读展示，便于开票员核对是哪张单） */
  applyNo?: string | null
  /** 购方名称（只读展示，确认开票抬头） */
  buyerName?: string | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ issued: [] }>()

/**
 * 附件业务类型字面量（三方一致：后端 InvoiceServiceImpl / file_biz_type 字典 / 本常量）。
 * 与申请阶段的发票附件共用 'invoice'（同一张单的不同阶段，bizId=本单 id）。
 */
const ATTACH_BIZ_TYPE = 'invoice'
const MAX_ATTACH_MB = 10

const saving = ref(false)
const attachments = ref<FileVO[]>([])
const uploading = ref(false)

const form = reactive<{
  invoiceNo: string
  invoiceCode: string
  invoiceDate: string | null
}>({
  invoiceNo: '',
  invoiceCode: '',
  invoiceDate: null,
})

const resetForm = () => {
  form.invoiceNo = ''
  form.invoiceCode = ''
  form.invoiceDate = null
  attachments.value = []
  uploading.value = false
}

// 打开即重置（一张单只开一次票，避免上一张的残留）
watch(
  () => [visible.value, props.invoiceId] as const,
  ([open, id]) => {
    if (open && id != null) {
      resetForm()
      loadAttachments(id)
    }
  },
)

// ===== 附件（电子发票） =====
const beforeUpload = (file: File) => {
  if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
    ElMessage.warning(`单个附件不能超过 ${MAX_ATTACH_MB}MB`)
    return false
  }
  return true
}

/** el-upload 自定义上传：复用 FileController.upload（file:manage，V62 已授给开票员） */
const customUpload = async (options: { file: File }) => {
  if (props.invoiceId == null) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', options.file)
    fd.append('bizType', ATTACH_BIZ_TYPE)
    fd.append('bizId', String(props.invoiceId))
    const vo = await uploadFile(fd)
    attachments.value.push(vo)
  } catch (e) {
    ElMessage.error('附件上传失败：' + (e as Error).message)
  } finally {
    uploading.value = false
  }
}

// 移除只是从列表摘掉；提交时按 attachments 重新收集 id 传给后端 bindAttachments
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
const previewVisible = ref(false)
const previewRow = ref<FileVO | null>(null)
const handlePreview = (f: FileVO) => {
  previewRow.value = f
  previewVisible.value = true
}

const handleSubmit = async () => {
  if (props.invoiceId == null) return
  if (!form.invoiceNo.trim()) {
    ElMessage.warning('请填写税务发票号码')
    return
  }
  if (!form.invoiceDate) {
    ElMessage.warning('请选择开票日期')
    return
  }
  if (attachments.value.length === 0) {
    ElMessage.warning('请至少上传一张电子发票')
    return
  }
  saving.value = true
  try {
    await issueInvoice(props.invoiceId, {
      invoiceNo: form.invoiceNo.trim(),
      invoiceCode: form.invoiceCode.trim() || null,
      invoiceDate: form.invoiceDate,
      attachmentFileIds: attachments.value.map((f) => f.id),
    })
    ElMessage.success('开票完成，单据已进入「已开票」')
    visible.value = false
    emit('issued')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="发票开票" width="640px" top="8vh">
    <div v-loading="uploading" class="issue-form">
      <!-- 只读确认区：业务单号 + 购方抬头，开票员核对用 -->
      <el-alert
        v-if="applyNo || buyerName"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          <span v-if="applyNo">业务单号：<b>{{ applyNo }}</b></span>
          <span v-if="buyerName" style="margin-left: 16px">购方：<b>{{ buyerName }}</b></span>
        </template>
      </el-alert>

      <el-form label-width="92px">
        <el-form-item label="发票号码" required>
          <el-input v-model="form.invoiceNo" placeholder="真实税务发票号" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发票代码">
          <el-input v-model="form.invoiceCode" placeholder="选填（纸质票有）" style="width: 100%" />
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
        <el-form-item label="电子发票">
          <div class="attach-box">
            <el-upload
              v-has-perm="'file:upload'"
              :show-file-list="false"
              :http-request="customUpload"
              :before-upload="beforeUpload"
              :disabled="uploading"
              accept="image/*,.pdf"
              multiple
            >
              <el-button :icon="UploadFilled" :loading="uploading">上传电子发票</el-button>
            </el-upload>
            <span class="muted">支持图片/PDF，单个 ≤ {{ MAX_ATTACH_MB }}MB（至少一张）</span>
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
      <el-button type="primary" :loading="saving" v-has-perm="'invoice:issue'" @click="handleSubmit">
        确认开票
      </el-button>
    </template>
  </el-dialog>

  <!-- 附件预览：复用文件管理模块的预览组件 -->
  <FilePreviewDialog v-model="previewVisible" :file="previewRow" />
</template>

<style scoped>
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
.muted {
  color: #909399;
  font-size: 12px;
}
</style>
