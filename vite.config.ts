import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 前端开发端口 9090（避开后端 firestar-service 的 2025）
// 后端地址通过 .env 的 VITE_API_BASE 配置；开发期用相对路径 /api 经下方 proxy 转发。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9090,
    open: true, // 开发服务器启动后自动打开浏览器
    // 开发期代理：前端 9090 同源请求 /api/* 转发到后端 2025，规避浏览器跨域(CORS)
    // 注意：Vite 5 的改写选项是 rewrite（函数），不是旧版 http-proxy 的 pathRewrite（对象），
    // 用错键名会导致 /api 前缀不被剥离，请求原样发成 /api/ping 而 404。
    proxy: {
      '/api': {
        target: 'http://localhost:2025',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
