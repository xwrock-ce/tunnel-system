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
import './styles/visual-refresh.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1f6aa5',
          colorInfo: '#1f6aa5',
          colorSuccess: '#2c9d77',
          colorWarning: '#c8842f',
          colorError: '#c85a59',
          borderRadius: 12,
          borderRadiusLG: 16,
          fontFamily:
            "'IBM Plex Sans', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          colorBgLayout: '#eaf0f6',
          colorBgContainer: '#fbfdff',
          colorBgElevated: '#ffffff',
          colorBorder: '#cfdae7',
          colorTextHeading: '#10273f',
          colorText: '#31465c',
          colorTextSecondary: '#5f748c',
          controlHeight: 40,
          boxShadowSecondary: '0 20px 36px -28px rgba(15, 36, 58, 0.35)',
        },
        components: {
          Card: {
            boxShadowTertiary: '0 18px 30px -28px rgba(15, 36, 58, 0.28)',
            colorBgContainer: '#fbfdff',
            headerFontSize: 16,
            headerHeight: 56,
          },
          Layout: {
            siderBg: '#10253f',
            headerBg: 'rgba(246, 251, 255, 0.9)',
            bodyBg: '#eaf0f6',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkItemColor: '#a8bdd7',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.12)',
            darkItemHoverColor: '#f8fbff',
            darkItemSelectedBg: 'rgba(49, 131, 198, 0.36)',
            darkItemSelectedColor: '#e8f3ff',
            itemBorderRadius: 12,
            itemMarginInline: 10,
          },
          Button: {
            fontWeight: 600,
            controlHeight: 40,
            borderRadius: 12,
          },
          Input: {
            activeBorderColor: '#1f6aa5',
            hoverBorderColor: '#7ea6cb',
          },
          InputNumber: {
            activeBorderColor: '#1f6aa5',
            hoverBorderColor: '#7ea6cb',
          },
          Select: {
            optionSelectedBg: '#e7f2fb',
            optionActiveBg: '#f1f7fd',
          },
          Tabs: {
            itemColor: '#587089',
            itemHoverColor: '#1f6aa5',
            itemSelectedColor: '#1f6aa5',
          },
          Table: {
            headerBg: '#f4f8fc',
            headerColor: '#576d84',
            headerSplitColor: 'transparent',
            rowHoverBg: '#edf4fb',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
