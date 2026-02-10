import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import './styles/nature-theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#245c91',
          borderRadius: 12,
          fontFamily:
            "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f5f6f8',
          colorTextHeading: '#1f2a37',
          colorText: '#3b4754',
          colorTextSecondary: '#6b7581',
          controlHeight: 40,
        },
        components: {
          Card: {
            boxShadowTertiary: '0 14px 30px -24px rgba(17, 24, 39, 0.26)',
            colorBgContainer: '#ffffff',
            headerFontSize: 16,
          },
          Layout: {
            siderBg: '#141b24',
            headerBg: 'rgba(255, 255, 255, 0.92)',
            bodyBg: '#f5f6f8',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkItemColor: '#a5b0bc',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
            darkItemHoverColor: '#ffffff',
            darkItemSelectedBg: 'rgba(36, 92, 145, 0.25)',
            darkItemSelectedColor: '#dbeafe',
            itemBorderRadius: 10,
            itemMarginInline: 10,
          },
          Button: {
            fontWeight: 600,
          },
          Table: {
            headerBg: '#f7f8fa',
            headerColor: '#5f6874',
            headerSplitColor: 'transparent',
          }
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
