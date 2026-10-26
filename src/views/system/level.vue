<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { listLevels, createLevel, updateLevel, deleteLevel } from '@/api/level'
import type { LevelFormData, LevelVO } from '@/types/level'
import DictSelect from '@/components/DictSelect.vue'

// ===== 查询条件 =====
const query = reactive({
  levelName: '',
  levelCode: '',
  status: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadLevels()
}

const resetQuery = () => {
  query.levelName = ''
  query.levelCode = ''
  query.status = ''
  pageNum.value = 1
  loadLevels()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const levelList = ref<LevelVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadLevels = async () => {
  loading.value = true
  try {
    const page = await listLevels(pageNum.value, pageSize.value, {
      levelName: query.levelName || undefined,
      levelCode: query.levelCode || undefined,
      status: query.status || undefined,
    })
    levelList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadLevels()
  if (levelList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadLevels()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadLevels()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增职级')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): LevelFormData => ({
  levelCode: '',
  levelName: '',
  levelNo: 0,
  sortNo: 0,
  status: 'ENABLED',
  remark: '',
})

const form = reactive<LevelFormData>(emptyForm())

const rules = {
  levelCode: [
    { required: true, message: '请输入职级编码', trigger: 'blur' },
    {
      pattern: /^[A-Za-z][A-Za-z0-9_]*$/,
      message: '必须以字母开头，只能包含字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  levelName: [{ required: true, message: '请输入职级名称', trigger: 'blur' }],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // 同 post.vue：显式清掉 empty 模板里没有的可选键，防止带着上次编辑的 id 走 update 分支
  form.id = undefined
  dialogTitle.value = '新增职级'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: LevelVO) => {
  form.id = row.id
  form.levelCode = row.levelCode
  form.levelName = row.levelName
  form.levelNo = row.levelNo
  form.sortNo = row.sortNo
  form.status = row.status
  form.remark = row.remark || ''
  dialogTitle.value = `修改职级 - ${row.levelName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：区分新增/修改分支，且不让 id 进请求体（后端从路径取）
    const { id, ...payload } = form
    if (id) {
      await updateLevel(id, payload)
      ElMessage.success('职级已保存')
    } else {
      await createLevel(payload)
      ElMessage.success('职级已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: LevelVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除职级「${row.levelName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteLevel(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    // 已关联用户 后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

onMounted(loadLevels)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="职级名称">
        <el-input v-model="query.levelName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="职级编码">
        <el-input v-model="query.levelCode" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增职级</el-button>
      <el-button :icon="Refresh" @click="loadLevels">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="levelList" border>
      <el-table-column prop="levelName" label="职级名称" min-width="140" />
      <el-table-column prop="levelCode" label="职级编码" min-width="140" />
      <el-table-column label="层级" width="90" align="center">
        <template #default="{ row }">
          <span class="sort-no">L{{ row.levelNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="排序" width="90" align="center">
        <template #default="{ row }">
          <span class="sort-no">{{ row.sortNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="200">
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>

    <!-- 标准分页器：默认每页 10 条，与后端默认值一致 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="loadLevels"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="职级编码" prop="levelCode">
        <el-input
          v-model="form.levelCode"
          placeholder="如 L1 / L2 / L3（创建后不可修改）"
          :disabled="!!form.id"
          maxlength="64"
        />
        <span v-if="form.id" class="form-tip">创建后不可修改，程序按编码引用职级</span>
      </el-form-item>
      <el-form-item label="职级名称" prop="levelName">
        <el-input v-model="form.levelName" placeholder="请输入职级名称，如 专员 / 主管 / 经理" maxlength="64" show-word-limit />
      </el-form-item>
      <el-form-item label="层级数值" prop="levelNo">
        <el-input-number v-model="form.levelNo" :min="0" :max="99" controls-position="right" />
        <span class="form-tip">1=最低，逐级+1；供「高一级」语义比较</span>
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="选填" maxlength="512" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
.sort-no {
  display: inline-block;
  min-width: 28px;
  color: #606266;
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
