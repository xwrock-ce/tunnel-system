import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb', // Blue 600 - More vivid industrial blue
          borderRadius: 12,
          fontFamily:
            "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f8fafc', // Slate 50
          colorTextHeading: '#0f172a', // Slate 900
          colorText: '#334155', // Slate 700
          colorTextSecondary: '#64748b', // Slate 500
          controlHeight: 40,
        },
        components: {
          Card: {
            boxShadowTertiary: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', // Tailwind shadow-sm
            colorBgContainer: '#ffffff',
            headerFontSize: 16,
          },
          Layout: {
            siderBg: '#0f172a', // Slate 900
            headerBg: '#ffffff',
            bodyBg: '#f8fafc',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkItemColor: '#94a3b8', // Slate 400
            darkItemHoverBg: '#1e293b', // Slate 800
            darkItemHoverColor: '#ffffff',
            darkItemSelectedBg: 'rgba(37, 99, 235, 0.1)', // Blue 600 with opacity
            darkItemSelectedColor: '#60a5fa', // Blue 400
            itemBorderRadius: 8,
            itemMarginInline: 12,
          },
          Button: {
            fontWeight: 500,
          },
          Table: {
            headerBg: '#f8fafc', // Slate 50
            headerColor: '#64748b', // Slate 500
            headerSplitColor: 'transparent',
          }
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
