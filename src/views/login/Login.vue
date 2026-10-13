<template>
  <div class="login-container">
    <el-form :model="form" class="login-form" @submit.prevent="onSubmit">
      <h2 class="title">火星财务 · 登录</h2>
      <!-- 研发阶段临时展示：正式上线前移除 -->
      <div class="dev-hint">
        <span>默认账号：<code>admin</code> / 密码：<code>admin123</code></span>
      </div>
      <el-form-item>
        <el-input v-model="form.username" placeholder="用户名" size="large" clearable>
          <template #prepend>账号</template>
        </el-input>
      </el-form-item>
      <el-form-item>
        <el-input
          v-model="form.password"
          type="password"
          placeholder="密码"
          size="large"
          show-password
          @keyup.enter="onSubmit"
        >
          <template #prepend>密码</template>
        </el-input>
      </el-form-item>
      <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="onSubmit">
        登录
      </el-button>
      <p v-if="error" class="err">{{ error }}</p>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
// 深层路径 import：绕开 element-plus 顶层入口（顶层入口会拖全量组件进宫，详见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  if (!form.username || !form.password) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const resp = await userStore.login({ username: form.username, password: form.password })
    ElMessage.success('登录成功')
    if (resp.forceChangePassword) {
      ElMessage.warning('首次登录，请尽快修改密码')
    }
    // 登录成功 → 工作台（/dashboard）
    router.push('/dashboard')
  } catch (e: any) {
    error.value = e?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f0f2f5;
}
.login-form {
  width: 400px;
  /* 小屏保护：视口窄于 448px 时收缩留白，防止溢出 */
  max-width: calc(100vw - 48px);
  padding: 36px 32px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
}
.title {
  text-align: center;
  margin: 0 0 24px;
  font-size: 20px;
  color: #1f2937;
}
.dev-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 18px;
  padding: 8px 12px;
  font-size: 12px;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
.dev-hint code {
  padding: 0 4px;
  font-family: monospace;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
}
.err {
  color: #f56c6c;
  font-size: 13px;
  margin: 12px 0 0;
  text-align: center;
}
</style>
