import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as apiLogin, logout as apiLogout, getProfile, getMenus } from '@/api/auth'
import type { LoginRequest, ProfileVO, MenuVO } from '@/types/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref<ProfileVO | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const menus = ref<MenuVO[]>([])

  async function login(data: LoginRequest) {
    const resp = await apiLogin(data)
    token.value = resp.token
    localStorage.setItem('token', resp.token)
    await fetchProfile()
    await fetchMenus()
    return resp
  }

  async function fetchProfile() {
    const p = await getProfile()
    userInfo.value = p
    roles.value = (p.roles || []).map((r) => r.roleCode)
    permissions.value = p.permissions || []
    return p
  }

  async function fetchMenus() {
    menus.value = await getMenus()
    return menus.value
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {
      // 即使后端登出失败（如 token 已失效），前端本地也清空
    }
    logoutLocal()
  }

  function logoutLocal() {
    token.value = ''
    userInfo.value = null
    roles.value = []
    permissions.value = []
    menus.value = []
    localStorage.removeItem('token')
  }

  function hasPermission(perm: string) {
    return permissions.value.includes(perm)
  }

  return {
    token,
    userInfo,
    roles,
    permissions,
    menus,
    login,
    fetchProfile,
    fetchMenus,
    logout,
    logoutLocal,
    hasPermission,
  }
})
