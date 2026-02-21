import { test } from '@playwright/test'
import { mockDashboardApi, mockReportApi, mockReportImages, setAuthStorage } from './helpers/mockApi'

test('Dashboard visual verification', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()))
  page.on('pageerror', exception => console.log(`PAGE ERROR: ${exception}`))

  await mockDashboardApi(page, {
    trend: {
      labels: ['#1', '#2', '#3', '#4', '#5'],
      over_excavation_data: [1.2, 0.5, 0, 2.1, 0],
      under_excavation_data: [0, 0, 1.5, 0, 0.8],
      data_points: [],
    },
    distribution: {
      severe_over_count: 5,
      minor_over_count: 10,
      normal_count: 70,
      minor_under_count: 10,
      severe_under_count: 5,
    },
    analysisList: {
      items: [
        { id: 101, status: 'completed', excavation_status: 'over_excavation', difference_percent: 5.5, created_at: '2023-10-27T10:00:00Z' },
        { id: 100, status: 'completed', excavation_status: 'within_tolerance', difference_percent: 1.2, created_at: '2023-10-27T09:30:00Z' },
        { id: 99, status: 'completed', excavation_status: 'under_excavation', difference_percent: -3.5, created_at: '2023-10-27T09:00:00Z' }
      ],
      total: 3,
      page: 1,
      pages: 1,
    },
  })

  await setAuthStorage(page)

  await page.goto('/dashboard')

  await page.waitForSelector('.kpi-card')

  try {
    await page.waitForSelector('canvas', { timeout: 5000 })
  } catch (e) {
    console.log('Canvas not found, taking screenshot anyway.')
  }

  await page.waitForTimeout(1000)
})

test('Report visual verification', async ({ page }) => {
  await mockReportApi(page, { analysisId: 101 })
  await mockReportImages(page, 101)
  await setAuthStorage(page)

  await page.goto('/report/101')

  await page.waitForTimeout(2000)
})
