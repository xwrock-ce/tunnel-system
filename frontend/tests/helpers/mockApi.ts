import type { Page, Route } from '@playwright/test'

const defaultUser = {
  id: 1,
  username: 'admin',
  is_active: true,
  created_at: '2023-01-01T00:00:00Z',
}

const defaultDashboardStats = {
  total_analyses: 100,
  today_analyses: 12,
  yesterday_analyses: 10,
  today_vs_yesterday_percent: 20.0,
  over_excavation_count: 5,
  under_excavation_count: 3,
  normal_count: 92,
  avg_difference_percent: 1.5,
}

const defaultTrend = {
  labels: ['#1', '#2', '#3'],
  over_excavation_data: [1, 2, 1],
  under_excavation_data: [0, 0, 1],
  data_points: [],
}

const defaultDistribution = {
  severe_over_count: 1,
  minor_over_count: 2,
  normal_count: 10,
  minor_under_count: 1,
  severe_under_count: 0,
}

const defaultAnalysisList = {
  items: [],
  total: 0,
  page: 1,
  pages: 1,
}

const defaultAnalysisDetail = {
  id: 101,
  status: 'completed',
  analysis_type: 'full',
  design_area_m2: 50.0,
  scale_mm_per_pixel: 2.5,
  original_image_url: 'https://via.placeholder.com/800x600?text=Original',
  overlay_image_url: 'https://via.placeholder.com/800x600?text=Overlay',
  crack_overlay_image_url: 'https://via.placeholder.com/800x600?text=CrackOverlay',
  combined_overlay_image_url: 'https://via.placeholder.com/800x600?text=Combined',
  excavation: {
    pixel_count: 1000000,
    actual_area_m2: 52.75,
    design_area_m2: 50.0,
    difference_m2: 2.75,
    difference_percent: 5.5,
    status: 'over_excavation',
  },
  metrics: {
    confidence: 0.95,
    mask_quality: 'high',
    crack_count: 3,
    crack_confidence: 0.88,
  },
  created_at: '2023-10-27T10:00:00Z',
  completed_at: '2023-10-27T10:00:05Z',
}

type DashboardMocks = {
  user?: typeof defaultUser
  dashboardStats?: typeof defaultDashboardStats
  trend?: typeof defaultTrend
  distribution?: typeof defaultDistribution
  analysisList?: typeof defaultAnalysisList
}

type ReportMocks = {
  analysisId?: number
  analysisDetail?: typeof defaultAnalysisDetail
}

const respondJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

export const setAuthStorage = async (page: Page, token = 'fake-token') => {
  await page.addInitScript((authToken) => {
    localStorage.setItem('token', authToken)
    localStorage.setItem('auth-storage', JSON.stringify({ state: { token: authToken }, version: 0 }))
  }, token)
}

export const mockAuthMe = async (page: Page, user = defaultUser) => {
  await page.route('**/api/v1/auth/me', async route => {
    await respondJson(route, user)
  })
}

export const mockDashboardApi = async (page: Page, overrides: DashboardMocks = {}) => {
  const {
    user = defaultUser,
    dashboardStats = defaultDashboardStats,
    trend = defaultTrend,
    distribution = defaultDistribution,
    analysisList = defaultAnalysisList,
  } = overrides

  await mockAuthMe(page, user)

  await page.route('**/api/v1/analysis/stats/dashboard', async route => {
    await respondJson(route, dashboardStats)
  })

  await page.route('**/api/v1/analysis/stats/trend*', async route => {
    await respondJson(route, trend)
  })

  await page.route('**/api/v1/analysis/stats/distribution', async route => {
    await respondJson(route, distribution)
  })

  await page.route('**/api/v1/analysis?*', async route => {
    await respondJson(route, analysisList)
  })
}

export const mockReportApi = async (page: Page, overrides: ReportMocks = {}) => {
  const analysisId = overrides.analysisId ?? defaultAnalysisDetail.id
  const analysisDetail = overrides.analysisDetail ?? defaultAnalysisDetail

  await mockAuthMe(page)

  await page.route(`**/api/v1/analysis/${analysisId}`, async route => {
    await respondJson(route, analysisDetail)
  })
}

export const mockReportImages = async (page: Page, analysisId = defaultAnalysisDetail.id) => {
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )

  await page.route(`**/api/v1/analysis/${analysisId}/image/*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: buffer,
    })
  })
}
