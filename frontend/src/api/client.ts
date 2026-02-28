import axios, { AxiosError } from 'axios'
import { clearStoredToken, getStoredToken } from '@/utils/authToken'

export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const getWebSocketUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = API_BASE_URL ? new URL(API_BASE_URL) : new URL(window.location.origin)
  const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${base.host}${normalizedPath}`
}

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || ''
      const isLoginRequest = requestUrl.includes('/api/v1/auth/login') || requestUrl.includes('/api/v1/auth/token')

      if (!isLoginRequest) {
        clearStoredToken()
        localStorage.removeItem('auth-storage')

        if (window.location.pathname !== '/login') {
          window.location.assign('/login')
        }
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient

// API types
export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface User {
  id: number
  username: string
  is_active: boolean
  created_at: string
}

export interface ExcavationResult {
  pixel_count: number
  actual_area_m2: number
  design_area_m2: number
  difference_m2: number
  difference_percent: number
  status: 'over_excavation' | 'under_excavation' | 'within_tolerance'
}

export interface SegmentationMetrics {
  confidence: number
  mask_quality: string
  crack_confidence?: number
  crack_count?: number
  crack_pixel_count?: number
}

export interface AnalysisResponse {
  id: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  analysis_type?: AnalysisType
  design_area_m2?: number
  scale_mm_per_pixel?: number
  original_image_url?: string
  mask_image_url?: string
  overlay_image_url?: string
  crack_mask_image_url?: string
  crack_overlay_image_url?: string
  combined_overlay_image_url?: string
  excavation?: ExcavationResult
  metrics?: SegmentationMetrics
  error_message?: string
  created_at: string
  completed_at?: string
}

export interface AnalysisListItem {
  id: number
  status: string
  excavation_status?: string
  actual_area_m2?: number
  difference_percent?: number
  created_at: string
}

export interface AnalysisList {
  items: AnalysisListItem[]
  total: number
  page: number
  pages: number
}

export interface DashboardStats {
  total_analyses: number
  today_analyses: number
  yesterday_analyses: number
  today_vs_yesterday_percent: number | null
  over_excavation_count: number
  under_excavation_count: number
  normal_count: number
  avg_difference_percent: number
}

export interface TrendDataPoint {
  id: number
  label: string
  over_excavation_area: number
  under_excavation_area: number
  difference_percent: number | null
  created_at: string
}

export interface TrendResponse {
  labels: string[]
  over_excavation_data: number[]
  under_excavation_data: number[]
  data_points: TrendDataPoint[]
}

export interface DeviationDistribution {
  severe_over_count: number
  minor_over_count: number
  normal_count: number
  minor_under_count: number
  severe_under_count: number
}

export interface SystemResourceStatus {
  cpu_percent: number
  memory_percent: number
  memory_used_gb: number
  memory_total_gb: number
  gpu_percent: number | null
  gpu_memory_used_gb: number | null
  gpu_memory_total_gb: number | null
  gpu_available: boolean
}

export interface ModelStatusItem {
  name: string
  version: string
  status: 'online' | 'standby' | 'offline'
  speed: string | null
  loaded: boolean
}

export interface SystemStatusResponse {
  resources: SystemResourceStatus
  models: ModelStatusItem[]
  uptime_seconds: number | null
}

// API functions
export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<TokenResponse>('/api/v1/auth/login', data),

  getMe: () =>
    apiClient.get<User>('/api/v1/auth/me'),
}

export type AnalysisType = 'face_segmentation' | 'crack_detection' | 'full'

export const analysisApi = {
  create: (file: File, designArea?: number, scale?: number, analysisType: AnalysisType = 'full') => {
    const formData = new FormData()
    formData.append('image', file)
    if (designArea !== undefined) formData.append('design_area', designArea.toString())
    if (scale !== undefined) formData.append('scale', scale.toString())
    formData.append('analysis_type', analysisType)

    return apiClient.post<{ id: number; status: string; message: string }>(
      '/api/v1/analysis',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },

  createBatch: (files: File[], designArea?: number, scale?: number, analysisType: AnalysisType = 'full') => {
    const formData = new FormData()
    files.forEach(file => formData.append('images', file))
    if (designArea !== undefined) formData.append('design_area', designArea.toString())
    if (scale !== undefined) formData.append('scale', scale.toString())
    formData.append('analysis_type', analysisType)

    return apiClient.post<{ batch_id: string; task_ids: number[]; total: number }>(
      '/api/v1/analysis/batch',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },

  get: (id: number) =>
    apiClient.get<AnalysisResponse>(`/api/v1/analysis/${id}`),

  list: (page = 1, limit = 20, status?: string, search?: string) =>
    apiClient.get<AnalysisList>('/api/v1/analysis', { params: { page, limit, status, search } }),

  delete: (id: number) =>
    apiClient.delete(`/api/v1/analysis/${id}`),

  getStats: () =>
    apiClient.get<DashboardStats>('/api/v1/analysis/stats/dashboard'),

  getTrend: (limit = 20) =>
    apiClient.get<TrendResponse>('/api/v1/analysis/stats/trend', { params: { limit } }),

  getDistribution: () =>
    apiClient.get<DeviationDistribution>('/api/v1/analysis/stats/distribution'),

  getImageUrl: (
    analysisId: number,
    type: 'original' | 'mask' | 'overlay' | 'crack_mask' | 'crack_overlay' | 'combined_overlay'
  ) =>
    `${API_BASE_URL}/api/v1/analysis/${analysisId}/image/${type}`,
}

export const systemApi = {
  getStatus: () =>
    apiClient.get<SystemStatusResponse>('/api/v1/system/status'),
}
