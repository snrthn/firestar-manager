<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="主数据档案"
    size="940px"
    :close-on-click-modal="false"
    @opened="onOpened"
  >
    <el-tabs v-model="activeTab" class="md-tabs">
      <!-- ========== 客户 ========== -->
      <el-tab-pane label="客户档案" name="customer">
        <div class="md-toolbar">
          <el-input v-model="customerKeyword" placeholder="搜索名称/编号/电话" clearable style="width: 240px"
            :prefix-icon="Search" @keyup.enter="loadCustomers" @clear="loadCustomers" />
          <el-button type="primary" :icon="Search" @click="loadCustomers">查询</el-button>
          <el-button type="success" :icon="Plus" v-has-perm="'customer:manage'" @click="openCustomerForm()">新增</el-button>
          <el-button type="warning" :icon="Upload" v-has-perm="'import:customer'" @click="openImport('customer', '客户档案')">导入</el-button>
          <div class="spacer" />
          <span class="muted">共 {{ customerTotal }} 条</span>
        </div>
        <el-table :data="customers" border v-loading="customerLoading" max-height="480">
          <el-table-column prop="customerNo" label="编号" width="160" show-overflow-tooltip />
          <el-table-column prop="customerName" label="客户名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="contactPerson" label="联系人" width="100" />
          <el-table-column prop="contactPhone" label="电话" width="130" />
          <el-table-column prop="taxNo" label="税号" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small">
                {{ row.status === 'ENABLED' ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" v-has-perm="'customer:manage'" @click="openCustomerForm(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="customerPage"
            v-model:page-size="customerPageSize"
            :total="customerTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadCustomers"
            @size-change="loadCustomers"
          />
        </div>
      </el-tab-pane>

      <!-- ========== 货物 ========== -->
      <el-tab-pane label="货物档案" name="goods">
        <div class="md-toolbar">
          <el-input v-model="goodsKeyword" placeholder="搜索名称/编号" clearable style="width: 240px"
            :prefix-icon="Search" @keyup.enter="loadGoods" @clear="loadGoods" />
          <el-button type="primary" :icon="Search" @click="loadGoods">查询</el-button>
          <el-button type="success" :icon="Plus" v-has-perm="'goods:manage'" @click="openGoodsForm()">新增</el-button>
          <el-button type="warning" :icon="Upload" v-has-perm="'import:goods'" @click="openImport('goods', '货物档案')">导入</el-button>
          <div class="spacer" />
          <span class="muted">共 {{ goodsTotal }} 条</span>
        </div>
        <el-table :data="goodsListData" border v-loading="goodsLoading" max-height="480">
          <el-table-column prop="goodsNo" label="编号" width="170" show-overflow-tooltip />
          <el-table-column prop="goodsName" label="货物名称" min-width="200" show-overflow-tooltip />
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small">
                {{ row.status === 'ENABLED' ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" v-has-perm="'goods:manage'" @click="openGoodsForm(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="goodsPage"
            v-model:page-size="goodsPageSize"
            :total="goodsTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadGoods"
            @size-change="loadGoods"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 客户新增/编辑弹窗：与立项表单同款 size / label-width / 一行两列 -->
    <el-dialog v-model="customerFormVisible" :title="customerForm.id ? '编辑客户' : '新增客户'" width="820px" append-to-body>
      <el-form :model="customerForm" label-width="110px" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="客户名称" required>
            <el-input v-model="customerForm.customerName" placeholder="必填" />
          </el-form-item>
          <el-form-item label="联系人"><el-input v-model="customerForm.contactPerson" /></el-form-item>
          <el-form-item label="电话"><el-input v-model="customerForm.contactPhone" /></el-form-item>
          <el-form-item label="地址"><el-input v-model="customerForm.address" /></el-form-item>
          <el-form-item label="税号"><el-input v-model="customerForm.taxNo" /></el-form-item>
          <el-form-item label="开户行"><el-input v-model="customerForm.bankName" /></el-form-item>
          <el-form-item label="银行账号"><el-input v-model="customerForm.bankAccount" /></el-form-item>
          <el-form-item label="购方电话"><el-input v-model="customerForm.buyerPhone" /></el-form-item>
          <el-form-item label="状态">
            <el-select v-model="customerForm.status" style="width: 100%">
              <el-option label="启用" value="ENABLED" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </el-form-item>
          <el-form-item label="备注" class="grid-full"><el-input v-model="customerForm.remark" type="textarea" :rows="2" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="customerFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSaveCustomer">保存</el-button>
      </template>
    </el-dialog>

    <!-- 货物新增/编辑弹窗：与立项表单同款 size / label-width / 一行两列 -->
    <el-dialog v-model="goodsFormVisible" :title="goodsForm.id ? '编辑货物' : '新增货物'" width="720px" append-to-body>
      <el-form :model="goodsForm" label-width="110px" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="货物名称" required><el-input v-model="goodsForm.goodsName" placeholder="必填" /></el-form-item>
          <el-form-item label="状态">
            <el-select v-model="goodsForm.status" style="width: 100%">
              <el-option label="启用" value="ENABLED" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </el-form-item>
          <el-form-item label="备注" class="grid-full"><el-input v-model="goodsForm.remark" type="textarea" :rows="2" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="goodsFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSaveGoods">保存</el-button>
      </template>
    </el-dialog>

    <!-- 内嵌导入抽屉 -->
    <ImportDrawer
      v-model:visible="importVisible"
      :fixed-key="importKey"
      :fixed-name="importName"
      @imported="onImported"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Search, Plus, Upload } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { customerList, saveCustomer, type CustomerVO } from '@/api/customer'
import { goodsList, saveGoods, type GoodsVO } from '@/api/goods'
import ImportDrawer from './ImportDrawer.vue'

const props = defineProps<{ visible: boolean; initialTab?: 'customer' | 'goods' }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'changed'): void
}>()

const activeTab = ref<'customer' | 'goods'>('customer')
// 每次抽屉从关闭→打开，按入口按钮同步初始 Tab（点货物档案就落在货物页）
watch(() => props.visible, (v) => {
  if (v) activeTab.value = props.initialTab ?? 'customer'
})

// 客户
const customers = ref<CustomerVO[]>([])
const customerKeyword = ref('')
const customerPage = ref(1)
const customerPageSize = ref(10)
const customerTotal = ref(0)
const customerLoading = ref(false)
const customerFormVisible = ref(false)
const customerForm = reactive<Partial<CustomerVO>>({})

// 货物
const goodsListData = ref<GoodsVO[]>([])
const goodsKeyword = ref('')
const goodsPage = ref(1)
const goodsPageSize = ref(10)
const goodsTotal = ref(0)
const goodsLoading = ref(false)
const goodsFormVisible = ref(false)
const goodsForm = reactive<Partial<GoodsVO>>({})

const saving = ref(false)
const importVisible = ref(false)
const importKey = ref('')
const importName = ref('')

function onOpened() {
  loadCustomers()
  loadGoods()
}

async function loadCustomers() {
  customerLoading.value = true
  try {
    const page = await customerList(customerPage.value, customerPageSize.value, customerKeyword.value || undefined)
    customers.value = page.records
    customerTotal.value = page.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载客户失败')
  } finally {
    customerLoading.value = false
  }
}

async function loadGoods() {
  goodsLoading.value = true
  try {
    const page = await goodsList(goodsPage.value, goodsPageSize.value, goodsKeyword.value || undefined)
    goodsListData.value = page.records
    goodsTotal.value = page.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载货物失败')
  } finally {
    goodsLoading.value = false
  }
}

function openCustomerForm(row?: CustomerVO) {
  Object.assign(customerForm, row ? { ...row } : {
    customerName: '', contactPerson: '', contactPhone: '', address: '', taxNo: '',
    bankName: '', bankAccount: '', buyerPhone: '', status: 'ENABLED', remark: '',
  })
  customerFormVisible.value = true
}

function openGoodsForm(row?: GoodsVO) {
  Object.assign(goodsForm, row ? { ...row } : { goodsName: '', status: 'ENABLED', remark: '' })
  goodsFormVisible.value = true
}

async function onSaveCustomer() {
  if (!customerForm.customerName?.trim()) { ElMessage.error('客户名称必填'); return }
  saving.value = true
  try {
    await saveCustomer(customerForm)
    ElMessage.success('已保存')
    customerFormVisible.value = false
    await loadCustomers()
    emit('changed')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onSaveGoods() {
  if (!goodsForm.goodsName?.trim()) { ElMessage.error('货物名称必填'); return }
  saving.value = true
  try {
    await saveGoods(goodsForm)
    ElMessage.success('已保存')
    goodsFormVisible.value = false
    await loadGoods()
    emit('changed')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function openImport(key: string, name: string) {
  importKey.value = key
  importName.value = name
  importVisible.value = true
}

/** 导入成功后：刷新当前 Tab 列表 + 通知项目页清下拉缓存 */
function onImported() {
  if (activeTab.value === 'customer') loadCustomers()
  else loadGoods()
  emit('changed')
}
</script>

<style scoped>
.md-tabs :deep(.el-tabs__content) { padding-top: 8px; }
.md-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.spacer { flex: 1; }
.muted { color: #909399; font-size: 12px; }
/* 与立项表单同款一行两列（form-grid / label-width 110px / 默认 size） */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
.form-grid :deep(.grid-full) { grid-column: 1 / -1; }
</style>
