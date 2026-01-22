import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProjectInfo {
  name: string
  section: string
  currentMileage: string
  contractor: string
  manager: string
  weather: string
}

interface ProjectState {
  currentProject: ProjectInfo
  setProjectInfo: (partial: Partial<ProjectInfo>) => void
}

const DEFAULT_PROJECT: ProjectInfo = {
  name: '秦岭隧道工程',
  section: '标段-A (K12+000 ~ K15+000)',
  currentMileage: 'K12+450',
  contractor: '中铁某局集团',
  manager: '张总工',
  weather: '晴 12°C',
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: DEFAULT_PROJECT,
      setProjectInfo: (partial) =>
        set((state) => ({
          currentProject: { ...state.currentProject, ...partial },
        })),
    }),
    {
      name: 'project-storage',
    },
  ),
)
