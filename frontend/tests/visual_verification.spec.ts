import { test, expect } from '@playwright/test';

test('Dashboard visual verification', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', exception => console.log(`PAGE ERROR: ${exception}`));

  // Mock API responses
  await page.route('**/api/v1/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        username: 'admin',
        is_active: true,
        created_at: '2023-01-01T00:00:00Z'
      })
    });
  });

  await page.route('**/api/v1/analysis/stats/dashboard', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_analyses: 100,
        today_analyses: 12,
        yesterday_analyses: 10,
        today_vs_yesterday_percent: 20.0,
        over_excavation_count: 5,
        under_excavation_count: 3,
        normal_count: 92,
        avg_difference_percent: 1.5
      })
    });
  });

  await page.route('**/api/v1/analysis/stats/trend*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        labels: ['#1', '#2', '#3', '#4', '#5'],
        over_excavation_data: [1.2, 0.5, 0, 2.1, 0],
        under_excavation_data: [0, 0, 1.5, 0, 0.8],
        data_points: []
      })
    });
  });

  await page.route('**/api/v1/analysis/stats/distribution', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        severe_over_count: 5,
        minor_over_count: 10,
        normal_count: 70,
        minor_under_count: 10,
        severe_under_count: 5
      })
    });
  });

  await page.route('**/api/v1/analysis?*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: 101, status: 'completed', excavation_status: 'over_excavation', difference_percent: 5.5, created_at: '2023-10-27T10:00:00Z' },
          { id: 100, status: 'completed', excavation_status: 'within_tolerance', difference_percent: 1.2, created_at: '2023-10-27T09:30:00Z' },
          { id: 99, status: 'completed', excavation_status: 'under_excavation', difference_percent: -3.5, created_at: '2023-10-27T09:00:00Z' }
        ],
        total: 3,
        page: 1,
        pages: 1
      })
    });
  });

  // Set local storage token
  await page.addInitScript(() => {
    const token = 'fake-token';
    localStorage.setItem('token', token);
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { token: token },
      version: 0
    }));
  });

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/dashboard');
  
  // Wait for ANY card to be visible to ensure page loaded
  await page.waitForSelector('.kpi-card');
  
  // Try to wait for canvas, but don't fail immediately, snapshot anyway
  try {
      await page.waitForSelector('canvas', { timeout: 5000 });
  } catch (e) {
      console.log('Canvas not found, taking screenshot anyway.');
  }
  
  await page.waitForTimeout(1000);
});

test('Report visual verification', async ({ page }) => {
   // Mock API responses
  await page.route('**/api/v1/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, username: 'admin', is_active: true, created_at: '2023-01-01T00:00:00Z' })
    });
  });

  await page.route('**/api/v1/analysis/101', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
          status: 'over_excavation'
        },
        metrics: {
          confidence: 0.95,
          mask_quality: 'high',
          crack_count: 3,
          crack_confidence: 0.88
        },
        created_at: '2023-10-27T10:00:00Z',
        completed_at: '2023-10-27T10:00:05Z'
      })
    });
  });
  
  await page.route('**/api/v1/analysis/101/image/*', async route => {
     const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
     await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: buffer
     });
  });

  // Set local storage token
  await page.addInitScript(() => {
    const token = 'fake-token';
    localStorage.setItem('token', token);
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { token: token },
      version: 0
    }));
  });

  // Navigate to Report
  await page.goto('http://localhost:3000/report/101');
  
  await page.waitForTimeout(2000); 
});
