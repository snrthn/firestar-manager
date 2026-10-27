import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 纯函数/工具类单测无需 DOM，用 node 环境即可；后续如需组件测试再切 jsdom 并加 @vue/test-utils
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
