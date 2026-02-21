import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, User, LoginRequest } from '@/api/client'

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  error: string | null

  login: (data: LoginRequest) => Promise<boolean>
  logout: () => void
  fetchUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      login: async (data: LoginRequest) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login(data)
          const { access_token } = response.data

          localStorage.setItem('token', access_token)
          set({ token: access_token, isLoading: false })

          // Fetch user info
          await get().fetchUser()
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
        localStorage.removeItem('token')
        set({ token: null, user: null })
      },

      fetchUser: async () => {
        try {
          const response = await authApi.getMe()
          set({ user: response.data })
        } catch {
          // Token might be invalid
          get().logout()
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
