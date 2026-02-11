import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import './styles/nature-theme.css'
import './styles/ui-unified.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2b6298',
          colorInfo: '#2b6298',
          colorSuccess: '#3f9b71',
          colorWarning: '#d8881f',
          colorError: '#d75a5f',
          borderRadius: 12,
          borderRadiusLG: 16,
          fontFamily:
            "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f5f6f8',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#d9e2ec',
          colorTextHeading: '#1f2a37',
          colorText: '#3b4754',
          colorTextSecondary: '#6b7581',
          controlHeight: 40,
          boxShadowSecondary: '0 16px 30px -26px rgba(17, 24, 39, 0.35)',
        },
        components: {
          Card: {
            boxShadowTertiary: '0 16px 30px -26px rgba(17, 24, 39, 0.3)',
            colorBgContainer: '#ffffff',
            headerFontSize: 16,
            headerHeight: 56,
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
            controlHeight: 38,
            borderRadius: 10,
          },
          Input: {
            activeBorderColor: '#2b6298',
            hoverBorderColor: '#98aec6',
          },
          InputNumber: {
            activeBorderColor: '#2b6298',
            hoverBorderColor: '#98aec6',
          },
          Select: {
            optionSelectedBg: '#edf3fb',
            optionActiveBg: '#f3f7fc',
          },
          Tabs: {
            itemColor: '#586577',
            itemHoverColor: '#2b6298',
            itemSelectedColor: '#2b6298',
          },
          Table: {
            headerBg: '#f7f9fc',
            headerColor: '#5f6c7b',
            headerSplitColor: 'transparent',
            rowHoverBg: '#f3f7fc',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
