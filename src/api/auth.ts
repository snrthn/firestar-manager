import request from './request'
import type {
  ApiResult,
  LoginRequest,
  LoginResponse,
  ProfileVO,
  MenuVO,
  ChangePasswordRequest,
  ProfileUpdateRequest,
} from '@/types/auth'

export function login(data: LoginRequest) {
  return request.post<ApiResult<LoginResponse>>('/auth/login', data).then((r) => r.data.data!)
}

export function logout() {
  return request.post<ApiResult<null>>('/auth/logout').then((r) => r.data)
}

export function getProfile() {
  return request.get<ApiResult<ProfileVO>>('/auth/profile').then((r) => r.data.data!)
}

export function changePassword(data: ChangePasswordRequest) {
  return request.put<ApiResult<null>>('/auth/password', data).then((r) => r.data)
}

export function updateProfile(data: ProfileUpdateRequest) {
  return request.put<ApiResult<null>>('/auth/profile', data).then((r) => r.data)
}

export function getMenus() {
  return request.get<ApiResult<MenuVO[]>>('/auth/menus').then((r) => r.data.data!)
}
