<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listHelpArticles } from '@/api/help'
import type { HelpArticle } from '@/types/feedback'
import RichView from '@/components/RichView.vue'
import { useUserStore } from '@/stores/user'
import { useDictLabels } from '@/composables/useDict'

/**
 * 帮助中心阅读页（隐藏菜单 /help，header 头像下拉入口，登录即可）。
 * 交互参考成熟系统 FAQ（折叠手风琴）：左侧分类锚点 + 右侧 el-collapse，
 * 移动端/窄屏由外层 AdminLayout 自适应，本页用两栏栅格在窄屏自动堆叠。
 */
const router = useRouter()
const userStore = useUserStore()
const articles = ref<HelpArticle[]>([])
const loading = ref(false)
const activeNames = ref<string[]>([])

// 维护入口：仅 system:help 权限可见（后端 @RequirePerm 同步校验，前端只控显示）
const canManage = computed(() => userStore.hasPermission('system:help'))
// 分类字典反查：库中存字典 value（V35），这里转中文展示
const { label: categoryLabel } = useDictLabels('help_category')

/** 新增帮助条目 → 跳维护页（虎哥 2026-10-21：阅读页不再内嵌弹窗，落页也不自动弹） */
function goManage() {
  router.push('/system/help-manage')
}
// 空态：无数据时隐藏左侧分类栏，占位图居中
const isEmpty = computed(() => !loading.value && articles.value.length === 0)

/** 分类保序去重（sort_no 已在后端排好） */
const categories = computed(() => {
  const seen: string[] = []
  for (const a of articles.value) {
    if (!seen.includes(a.category)) seen.push(a.category)
  }
  return seen
})

const grouped = computed(() => {
  const map = new Map<string, HelpArticle[]>()
  for (const a of articles.value) {
    const list = map.get(a.category) || []
    list.push(a)
    map.set(a.category, list)
  }
  return map
})

onMounted(async () => {
  loading.value = true
  try {
    articles.value = await listHelpArticles()
    // 默认展开第一条（空态不报错）
    if (articles.value.length > 0) activeNames.value = [String(articles.value[0].id)]
  } finally {
    loading.value = false
  }
})

function scrollToCategory(cat: string) {
  document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="help-page">
    <div class="help-head">
      <h2 class="help-title">帮助中心</h2>
      <p class="help-sub">常见问题与使用指引，没有找到答案？可通过「问题反馈」联系我们</p>
      <div v-if="canManage" class="help-manage-entry">
        <el-button type="primary" size="small" @click="goManage">新增帮助条目</el-button>
      </div>
    </div>

    <div v-loading="loading" class="help-body" :class="{ empty: isEmpty }">
      <!-- 空态：无数据不渲染左栏，占位图居中（虎哥 2026-10-21） -->
      <aside v-if="!isEmpty" class="help-nav">
        <div
          v-for="cat in categories"
          :key="cat"
          class="help-nav-item"
          @click="scrollToCategory(cat)"
        >
          {{ categoryLabel(cat) }}
        </div>
      </aside>

      <main class="help-main">
        <!-- 空态占位：整块居中（左栏已隐藏） -->
        <el-empty v-if="isEmpty" description="暂无帮助内容，点击「新增帮助条目」开始维护" />
        <section
          v-for="cat in categories"
          :id="`cat-${cat}`"
          :key="cat"
          class="help-section"
        >
          <h3 class="section-title">{{ categoryLabel(cat) }}</h3>
          <el-collapse v-model="activeNames" class="help-collapse">
            <el-collapse-item
              v-for="a in grouped.get(cat) || []"
              :id="`article-${a.id}`"
              :key="a.id"
              :name="String(a.id)"
            >
              <template #title>
                <span class="q-title">{{ a.title }}</span>
              </template>
              <RichView :html="a.content" class="a-content" />
            </el-collapse-item>
          </el-collapse>
        </section>
      </main>
    </div>

    <div class="help-footer">
      <el-button text type="primary" @click="router.push('/system/feedback')">
        没有解决？去提交问题反馈 →
      </el-button>
    </div>

  </div>
</template>

<style scoped>
.help-page {
  padding: 24px;
  margin: 0 auto;
  /* 整页白色底卡片（虎哥 2026-10-21：帮助中心内容包白卡） */
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  min-height: calc(100vh - var(--fs-header-height, 56px) - 68px);
}
.help-head {
  text-align: center;
  margin-bottom: 24px;
}
.help-title {
  margin: 0 0 6px;
  font-size: 22px;
  color: #303133;
}
.help-sub {
  margin: 0;
  font-size: 13px;
  color: #909399;
}
.help-manage-entry {
  margin-top: 12px;
}
/* 空态：主区占满整行，占位图居中 */
.help-body.empty .help-main {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
.help-body {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  min-height: 200px;
}
.help-nav {
  width: 160px;
  flex-shrink: 0;
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.help-nav-item {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.help-nav-item:hover {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--fs-primary);
}
.help-main {
  flex: 1;
  min-width: 0;
}
.help-section {
  margin-bottom: 22px;
  scroll-margin-top: 70px; /* 吸顶 header 高度预留，锚点不被盖 */
}
.section-title {
  margin: 0 0 10px;
  font-size: 15px;
  color: #303133;
}
.help-collapse :deep(.el-collapse-item__header) {
  font-size: 14px;
}
.q-title {
  font-weight: 500;
}
.a-content {
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
}
.help-footer {
  text-align: center;
  margin-top: 10px;
}
@media (max-width: 768px) {
  .help-body {
    flex-direction: column;
  }
  .help-nav {
    position: static;
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
