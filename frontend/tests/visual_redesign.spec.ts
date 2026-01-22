import { test, expect } from '@playwright/test';

test('Login Page Visual Verification', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Wait for animations
  await page.screenshot({ path: 'login_redesign.png', fullPage: true });
});

test('Dashboard Layout Visual Verification', async ({ page }) => {
  // Mock API for Dashboard
  await page.route('**/api/v1/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, username: 'admin', is_active: true, created_at: '2023-01-01T00:00:00Z' })
    });
  });
  
  await page.route('**/api/v1/analysis/stats/dashboard', async route => {
     await route.fulfill({ status: 200, body: JSON.stringify({
        total_analyses: 100, today_analyses: 12, yesterday_analyses: 10, today_vs_yesterday_percent: 20.0,
        over_excavation_count: 5, under_excavation_count: 3, normal_count: 92, avg_difference_percent: 1.5
     })});
  });

  await page.route('**/api/v1/analysis/stats/trend*', async route => {
     await route.fulfill({ status: 200, body: JSON.stringify({
        labels: ['#1', '#2', '#3'], over_excavation_data: [1, 2, 1], under_excavation_data: [0, 0, 1], data_points: []
     })});
  });

  await page.route('**/api/v1/analysis/stats/distribution', async route => {
     await route.fulfill({ status: 200, body: JSON.stringify({
        severe_over_count: 1, minor_over_count: 2, normal_count: 10, minor_under_count: 1, severe_under_count: 0
     })});
  });

  await page.route('**/api/v1/analysis?*', async route => {
     await route.fulfill({ status: 200, body: JSON.stringify({ items: [], total: 0, page: 1, pages: 1 })});
  });

  // Set Auth
  await page.addInitScript(() => {
    const token = 'fake-token';
    localStorage.setItem('token', token);
    localStorage.setItem('auth-storage', JSON.stringify({ state: { token: token }, version: 0 }));
  });

  await page.goto('http://localhost:3000/dashboard');
  await page.waitForSelector('.app-sider'); // Wait for new sidebar class
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'dashboard_redesign.png', fullPage: true });
});
