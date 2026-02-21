import { test } from '@playwright/test'
import { mockDashboardApi, setAuthStorage } from './helpers/mockApi'

test('Login Page Visual Verification', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000) // Wait for animations
  await page.screenshot({ path: testInfo.outputPath('login_redesign.png'), fullPage: true })
})

test('Dashboard Layout Visual Verification', async ({ page }, testInfo) => {
  await mockDashboardApi(page)
  await setAuthStorage(page)

  await page.goto('/dashboard')
  await page.waitForSelector('.app-sider') // Wait for new sidebar class
  await page.waitForTimeout(1000)
  await page.screenshot({ path: testInfo.outputPath('dashboard_redesign.png'), fullPage: true })
})
