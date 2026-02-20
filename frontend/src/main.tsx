import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import './styles/nature-theme.css'
import './styles/ui-unified.css'
import './styles/app-harmony.css'
import './styles/auth-login.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorInfo: '#2563eb',
          colorSuccess: '#0f9f78',
          colorWarning: '#c97b16',
          colorError: '#cc4f59',
          borderRadius: 12,
          borderRadiusLG: 18,
          fontFamily:
            "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f4f7fb',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#d9e3ef',
          colorTextHeading: '#0f172a',
          colorText: '#334155',
          colorTextSecondary: '#64748b',
          controlHeight: 40,
          boxShadowSecondary: '0 18px 34px -24px rgba(15, 23, 42, 0.34)',
        },
        components: {
          Card: {
            boxShadowTertiary: '0 14px 28px -24px rgba(15, 23, 42, 0.28)',
            colorBgContainer: '#ffffff',
            headerFontSize: 16,
            headerHeight: 58,
          },
          Layout: {
            siderBg: '#0f172a',
            headerBg: 'rgba(255, 255, 255, 0.9)',
            bodyBg: '#f4f7fb',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkItemColor: '#a6b5c7',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
            darkItemHoverColor: '#f8fbff',
            darkItemSelectedBg: 'rgba(37, 99, 235, 0.26)',
            darkItemSelectedColor: '#dbeafe',
            itemBorderRadius: 12,
            itemMarginInline: 10,
          },
          Button: {
            fontWeight: 600,
            controlHeight: 40,
            borderRadius: 12,
          },
          Input: {
            activeBorderColor: '#2563eb',
            hoverBorderColor: '#8eb2e0',
          },
          InputNumber: {
            activeBorderColor: '#2563eb',
            hoverBorderColor: '#8eb2e0',
          },
          Select: {
            optionSelectedBg: '#eaf2ff',
            optionActiveBg: '#f3f8ff',
          },
          Tabs: {
            itemColor: '#5a6b80',
            itemHoverColor: '#2563eb',
            itemSelectedColor: '#2563eb',
          },
          Table: {
            headerBg: '#f6f9fe',
            headerColor: '#5e6f83',
            headerSplitColor: 'transparent',
            rowHoverBg: '#f5f9ff',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
