import axios from 'axios'
import { create } from 'zustand'
import { authApi, User, LoginRequest } from '@/api/client'
import { clearStoredToken, getStoredToken, setStoredToken } from '@/utils/authToken'

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  error: string | null

  login: (data: LoginRequest & { remember?: boolean }) => Promise<boolean>
  logout: () => void
  fetchUser: () => Promise<boolean>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  user: null,
  isLoading: false,
  error: null,

  login: async (data: LoginRequest & { remember?: boolean }) => {
    set({ isLoading: true, error: null })
    try {
      const { remember = true, ...payload } = data
      const response = await authApi.login(payload)
      const { access_token } = response.data

      setStoredToken(access_token, remember)
      localStorage.removeItem('auth-storage')
      set({ token: access_token, isLoading: false })

      const userLoaded = await get().fetchUser()
      if (!userLoaded) {
        set({ error: '登录状态校验失败，请重试', isLoading: false })
        return false
      }

      return true
    } catch (err: unknown) {
      let message = '登录失败'
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail
        if (detail) {
          message = detail
        } else if (err.code === 'ERR_NETWORK') {
          message = '无法连接后端服务，请确认后端已启动（默认 http://localhost:8000）'
        } else if (err.response?.status === 401) {
          message = '用户名或密码错误'
        }
      }
      set({ error: message, isLoading: false })
      return false
    }
  },

  logout: () => {
    clearStoredToken()
    localStorage.removeItem('auth-storage')
    set({ token: null, user: null })
  },

  fetchUser: async () => {
    try {
      const response = await authApi.getMe()
      set({ user: response.data })
      return true
    } catch {
      get().logout()
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
