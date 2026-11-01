// 前端测试基建 setup（P0/P1 测试前置，2026-11-02 补）
// 作用：补齐 happy-dom 缺失的浏览器 API，避免 Element Plus / 组件在测试里因
// ResizeObserver / matchMedia 不存在而崩溃；同时把 axios 默认指向可控的 mock 层。
import { vi } from 'vitest'

// jsdom/happy-dom 没有 ResizeObserver，Element Plus 组件（表格、弹窗、下拉）依赖它
if (!('ResizeObserver' in window)) {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Element Plus 部分组件读取 matchMedia（响应式断点）
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// IntersectionObserver 同样缺失，补一个 no-op 实现
if (!('IntersectionObserver' in window)) {
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}

// 默认把 axios 的 adapter 设成可注入的 mock（api 层测试各自用 vi.mock 覆盖，这里只兜底）
vi.stubGlobal('__FS_TEST__', true)
