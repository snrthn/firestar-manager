<template>
  <div class="prompt-config">
    <el-card shadow="never">
      <template #header>
        <div class="pc-header">
          <span class="pc-title">AI 提示词管理</span>
          <div class="pc-actions">
            <el-button
              v-has-perm="['ai:prompt:edit']"
              type="primary"
              :icon="Plus"
              @click="openCreate"
            >新增提示词</el-button>
            <el-button
              :icon="Refresh"
              :loading="loading"
              @click="load"
            >刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon class="pc-tip">
        <template #title>
          系统提示词（工具调用纪律）集中管理，启用哪一套哪套在对话中实时生效（全局唯一生效）。
          无生效方案时回退代码内置默认提示词。变更即时生效，无需重启。
        </template>
      </el-alert>

      <el-table :data="list" v-loading="loading" border stripe class="pc-table">
        <el-table-column prop="name" label="提示词名称" min-width="160" />
        <el-table-column label="提示词预览" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ preview(row.content) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.active === 1" type="success">生效</el-tag>
            <el-tag v-else type="info">未生效</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-has-perm="['ai:prompt:edit']"
              link type="primary" :icon="Edit" @click="openEdit(row)"
            >编辑</el-button>
            <el-button
              v-has-perm="['ai:prompt:use']"
              link type="success" :icon="Refresh" :disabled="row.active === 1"
              @click="activate(row)"
            >启用</el-button>
            <el-button
              v-has-perm="['ai:prompt:edit']"
              link type="danger" :icon="Delete" @click="remove(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑提示词' : '新增提示词'"
      width="720px"
      append-to-body
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="提示词名称" prop="name">
          <el-input v-model="form.name" placeholder="如：默认助手 / 财务专家 / 客服模式" />
        </el-form-item>
        <el-form-item label="提示词正文" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="12"
            placeholder="在此编写系统提示词，将作为每条对话首条 system 消息注入……"
          />
        </el-form-item>
        <el-form-item label="设为启用">
          <el-switch v-model="form.activeBool" />
          <span class="pc-hint">启用后该方案成为运行期生效配置（全局唯一，其它方案自动停用）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Plus, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  activatePrompt,
  type AiPromptConfig,
} from '@/api/ai'

const loading = ref(false)
const saving = ref(false)
const list = ref<AiPromptConfig[]>([])

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Partial<AiPromptConfig> & { activeBool: boolean }>({
  id: undefined,
  name: '',
  content: '',
  active: 0,
  activeBool: false,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入提示词名称', trigger: 'blur' }],
  content: [{ required: true, message: '请输入提示词正文', trigger: 'blur' }],
}

function preview(c?: string) {
  if (!c) return '—'
  const t = c.replace(/\s+/g, ' ').trim()
  return t.length > 80 ? t.slice(0, 80) + '…' : t
}

async function load() {
  loading.value = true
  try {
    list.value = await listPrompts()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.id = undefined
  form.name = ''
  form.content = ''
  form.active = 0
  form.activeBool = false
  formRef.value?.clearValidate()
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: AiPromptConfig) {
  resetForm()
  form.id = row.id
  form.name = row.name || ''
  form.content = row.content || ''
  form.activeBool = row.active === 1
  form.active = row.active
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (ok) => {
    if (!ok) return
    saving.value = true
    const payload: AiPromptConfig = {
      id: form.id,
      name: form.name || '',
      content: form.content,
      active: form.activeBool ? 1 : 0,
    }
    try {
      if (form.id) {
        await updatePrompt(payload)
        ElMessage.success('已更新')
      } else {
        await createPrompt(payload)
        ElMessage.success('已新增')
      }
      dialogVisible.value = false
      await load()
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      saving.value = false
    }
  })
}

async function remove(row: AiPromptConfig) {
  try {
    await ElMessageBox.confirm(`确认删除提示词方案「${row.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deletePrompt(row.id!)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function activate(row: AiPromptConfig) {
  try {
    await activatePrompt(row.id!)
    ElMessage.success(`已启用「${row.name}」`)
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '启用失败')
  }
}

onMounted(load)
</script>

<style scoped>
.pc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pc-title {
  font-size: 16px;
  font-weight: 600;
}
.pc-tip {
  margin-bottom: 12px;
}
.pc-table {
  margin-top: 4px;
}
.pc-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
