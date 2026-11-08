import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// ⚠️ 必须继承主 vite 配置：此前本文件独立 defineConfig，丢了 resolve.alias 的 '@'
//    与 @vitejs/plugin-vue，导致 3 个测试套件（sessionGuard / hasPerm / realtimeClient）
//    报 Failed to resolve import "@/..."，vitest 一个用例都收集不到。
//    用 mergeConfig 而非复制一份 alias，避免两处维护漂移。
export default mergeConfig(viteConfig, defineConfig({
  test: {
    // 组件/业务流程测试需要 DOM。devDependencies 只装了 happy-dom，
    // 此处曾误写 'jsdom' → vitest 报 Cannot find package 'jsdom'、一个用例都收集不到。
    // 与 src/test/setup.ts（明确为 happy-dom 补齐浏览器 API）保持同一环境。
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // 覆盖率（2026-10-27）：此前无任何覆盖率工具，业务代码覆盖度无法度量。
    // provider 用 v8（@vitest/coverage-v8@2.1.9，与 vitest 2.1.8 同主版本，勿升 5.x）。
    // 报告产物：coverage/index.html + coverage/coverage-summary.json（npm run coverage 生成）。
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // 业务代码口径：types 是纯类型声明、main/api 多为胶水层，先不计入分母（避免虚高）
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/types/**',
        'src/**/*.test.ts',
      ],
    },
  },
}))
