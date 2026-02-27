import { create } from 'zustand'
import {
  analysisApi,
  AnalysisResponse,
  AnalysisListItem,
  DashboardStats,
  getWebSocketUrl,
  AnalysisType,
} from '@/api/client'

interface AnalysisState {
  // Current analysis
  currentAnalysis: AnalysisResponse | null
  currentAnalysisType: AnalysisType | null
  isAnalyzing: boolean
  progress: number
  progressMessage: string
  progressSource: 'ws' | 'poll' | null

  runToken: number
  activeWebSocket: WebSocket | null
  webSocketKeepAliveTimer: number | null

  // History
  analyses: AnalysisListItem[]
  totalCount: number
  currentPage: number
  isLoadingList: boolean

  // Stats
  stats: DashboardStats | null

  // Actions
  uploadAndAnalyze: (file: File, designArea?: number, scale?: number, analysisType?: AnalysisType) => Promise<number | null>
  uploadBatch: (files: File[], designArea?: number, scale?: number, analysisType?: AnalysisType) => Promise<number[] | null>
  fetchAnalyses: (page?: number, status?: string, search?: string) => Promise<void>
  fetchStats: () => Promise<void>
  deleteAnalysis: (id: number) => Promise<boolean>
  setProgress: (progress: number, message: string) => void
  clearCurrent: () => void
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  currentAnalysis: null,
  currentAnalysisType: null,
  isAnalyzing: false,
  progress: 0,
  progressMessage: '',
  progressSource: null,
  runToken: 0,
  activeWebSocket: null,
  webSocketKeepAliveTimer: null,
  analyses: [],
  totalCount: 0,
  currentPage: 1,
  isLoadingList: false,
  stats: null,

  uploadAndAnalyze: async (file, designArea, scale, analysisType = 'full') => {
    const forceCloseActiveWebSocket = () => {
      const ws = get().activeWebSocket
      const timer = get().webSocketKeepAliveTimer
      if (timer) {
        clearInterval(timer)
      }
      if (ws) {
        try {
          ws.close()
        } catch {
          // ignore
        }
      }
      set({ activeWebSocket: null, webSocketKeepAliveTimer: null })
    }

    const nextRunToken = get().runToken + 1
    forceCloseActiveWebSocket()
    set({
      runToken: nextRunToken,
      currentAnalysis: null,
      currentAnalysisType: analysisType,
      isAnalyzing: true,
      progress: 0,
      progressMessage: '正在上传并创建任务…',
      progressSource: null,
    })

    const safeSet = (partial: Partial<AnalysisState>) => {
      if (get().runToken !== nextRunToken) return
      set(partial)
    }

    const closeRunWebSocket = () => {
      if (get().runToken !== nextRunToken) return
      forceCloseActiveWebSocket()
    }

    try {
      const response = await analysisApi.create(file, designArea, scale, analysisType)
      const { id } = response.data

      safeSet({ progress: 8, progressMessage: '任务已创建，准备开始分析…' })

      // Start polling for result
      const pollResult = async () => {
        let attempts = 0
        const maxAttempts = 180 // 3 minutes

        while (attempts < maxAttempts) {
          if (get().runToken !== nextRunToken) return
          await new Promise(resolve => setTimeout(resolve, 1000))
          if (get().runToken !== nextRunToken) return
          attempts++

          try {
            const result = await analysisApi.get(id)
            const analysis = result.data

            if (analysis.status === 'completed') {
              closeRunWebSocket()
              safeSet({
                currentAnalysis: analysis,
                isAnalyzing: false,
                progress: 100,
                progressMessage: '分析完成',
                progressSource: null,
              })
              return
            } else if (analysis.status === 'failed') {
              closeRunWebSocket()
              safeSet({
                currentAnalysis: analysis,
                isAnalyzing: false,
                progress: 0,
                progressMessage: analysis.error_message || '分析失败',
                progressSource: null,
              })
              return
            }

            // Update progress based on attempts
            if (get().progressSource !== 'ws') {
              const estimatedProgress = Math.min(8 + (attempts * 0.8), 92)
              safeSet({
                progress: estimatedProgress,
                progressMessage: '处理中…',
                progressSource: 'poll',
              })
            }
          } catch {
            // Continue polling on error
          }
        }

        closeRunWebSocket()
        safeSet({
          isAnalyzing: false,
          progress: 0,
          progressMessage: '处理超时，请在历史记录中查看任务状态',
          progressSource: null,
        })
      }

      // Try WebSocket for real-time progress updates (falls back to polling)
      try {
        const ws = new WebSocket(getWebSocketUrl(`/api/v1/analysis/ws/${id}`))
        if (get().runToken !== nextRunToken) {
          try {
            ws.close()
          } catch {
            // ignore
          }
        } else {
          set({ activeWebSocket: ws })

          const keepAlive = window.setInterval(() => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send('ping')
              }
            } catch {
              // ignore
            }
          }, 25000)
          set({ webSocketKeepAliveTimer: keepAlive })

          ws.onopen = () => {
            safeSet({ progressMessage: '已连接实时进度…' })
          }

          ws.onmessage = async (event) => {
            if (get().runToken !== nextRunToken) return
            try {
              const payload = JSON.parse(event.data)
              if (payload?.type === 'progress') {
                safeSet({
                  progress: typeof payload.progress === 'number' ? payload.progress : get().progress,
                  progressMessage: payload.message || '处理中…',
                  progressSource: 'ws',
                })
                return
              }

              if (payload?.type === 'result' || payload?.type === 'error') {
                try {
                  const result = await analysisApi.get(id)
                  const analysis = result.data
                  closeRunWebSocket()
                  safeSet({
                    currentAnalysis: analysis,
                    isAnalyzing: false,
                    progress: analysis.status === 'completed' ? 100 : 0,
                    progressMessage: analysis.status === 'completed'
                      ? '分析完成'
                      : (analysis.error_message || payload.message || '分析失败'),
                    progressSource: null,
                  })
                } catch {
                  closeRunWebSocket()
                  safeSet({
                    isAnalyzing: false,
                    progress: 0,
                    progressMessage: payload.message || '分析失败',
                    progressSource: null,
                  })
                }
              }
            } catch {
              // ignore malformed messages
            }
          }

          ws.onclose = () => {
            // polling will continue as fallback
          }

          ws.onerror = () => {
            // polling will continue as fallback
          }
        }
      } catch {
        // polling will continue as fallback
      }

      pollResult()
      return id
    } catch (err: any) {
      closeRunWebSocket()
      safeSet({
        isAnalyzing: false,
        progress: 0,
        progressMessage: err.response?.data?.detail || '上传失败',
        progressSource: null,
      })
      return null
    }
  },

  uploadBatch: async (files, designArea, scale, analysisType = 'full') => {
    set({
      currentAnalysisType: analysisType,
      isAnalyzing: true,
      progress: 0,
      progressMessage: '正在上传批量任务…',
      progressSource: null,
    })
    try {
      const response = await analysisApi.createBatch(files, designArea, scale, analysisType)
      const { task_ids } = response.data

      set({
        isAnalyzing: false,
        progress: 100,
        progressMessage: `已启动 ${task_ids.length} 个分析任务`,
        progressSource: null,
      })

      return task_ids
    } catch (err: any) {
      set({
        isAnalyzing: false,
        progress: 0,
        progressMessage: err.response?.data?.detail || '批量上传失败',
        progressSource: null,
      })
      return null
    }
  },

  fetchAnalyses: async (page = 1, status, search) => {
    set({ isLoadingList: true })
    try {
      const response = await analysisApi.list(page, 20, status, search)
      set({
        analyses: response.data.items,
        totalCount: response.data.total,
        currentPage: page,
        isLoadingList: false
      })
    } catch (err) {
      console.error('Failed to fetch analyses:', err)
      set({ isLoadingList: false })
    }
  },

  fetchStats: async () => {
    try {
      const response = await analysisApi.getStats()
      set({ stats: response.data })
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  },

  deleteAnalysis: async (id) => {
    try {
      await analysisApi.delete(id)
      return true
    } catch {
      return false
    }
  },

  setProgress: (progress, message) => {
    set({ progress, progressMessage: message })
  },

  clearCurrent: () => {
    const ws = get().activeWebSocket
    const timer = get().webSocketKeepAliveTimer
    if (timer) {
      clearInterval(timer)
    }
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    set({
      runToken: get().runToken + 1,
      activeWebSocket: null,
      webSocketKeepAliveTimer: null,
      currentAnalysis: null,
      currentAnalysisType: null,
      progress: 0,
      progressMessage: '',
      progressSource: null,
    })
  },
}))
