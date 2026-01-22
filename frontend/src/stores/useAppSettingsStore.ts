import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AnalysisDefaults {
  designArea: number
  scale: number
}

interface AppSettingsState {
  analysisDefaults: AnalysisDefaults
  setAnalysisDefaults: (partial: Partial<AnalysisDefaults>) => void
  resetAnalysisDefaults: () => void
}

const DEFAULT_ANALYSIS_DEFAULTS: AnalysisDefaults = {
  designArea: 78.5,
  scale: 7.6,
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      analysisDefaults: DEFAULT_ANALYSIS_DEFAULTS,
      setAnalysisDefaults: (partial) =>
        set((state) => ({
          analysisDefaults: { ...state.analysisDefaults, ...partial },
        })),
      resetAnalysisDefaults: () => set({ analysisDefaults: DEFAULT_ANALYSIS_DEFAULTS }),
    }),
    {
      name: 'app-settings',
      partialize: (state) => ({ analysisDefaults: state.analysisDefaults }),
    },
  ),
)

