import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Checkbox, message, Typography, theme, ConfigProvider, Alert } from 'antd'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  UserOutlined,
  LockOutlined,
  ArrowRightOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  FileTextOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import LoginPortalIcon from '@/components/icons/LoginPortalIcon'
import { API_BASE_URL } from '@/api/client'

const { Title, Text } = Typography

const keyStats = [
  { value: '96.8%', label: '识别准确率' },
  { value: '5.6s', label: '平均分析耗时' },
  { value: '320+', label: '日均处理任务' },
]

const workflowItems = [
  {
    icon: DatabaseOutlined,
    title: '数据采集入库',
    desc: '现场照片与断面数据统一归档，自动关联工程台账。',
  },
  {
    icon: LineChartOutlined,
    title: '智能识别分析',
    desc: '超欠挖、裂缝风险分钟级反馈，辅助快速处置。',
  },
  {
    icon: FileTextOutlined,
    title: '报告自动输出',
    desc: '一键生成可追溯报告，复核留档与交付更高效。',
  },
]

const securityNotes = ['TLS 全链路加密传输', '登录行为实时审计', '细粒度角色权限控制']

const getRgbValue = (hexColor: string): string => {
  const sanitized = hexColor.trim().replace('#', '')

  if (!/^[0-9a-fA-F]{3,6}$/.test(sanitized)) {
    return '37, 99, 235'
  }

  const fullHex =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map(char => `${char}${char}`)
          .join('')
      : sanitized.slice(0, 6)

  const parts = fullHex.match(/.{2}/g)

  if (!parts) {
    return '37, 99, 235'
  }

  return parts.map(part => Number.parseInt(part, 16)).join(', ')
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError, token } = useAuthStore()
  const [form] = Form.useForm()
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'ok' | 'down'>('unknown')
  const apiBaseLabel = API_BASE_URL || 'http://localhost:8000'
  const {
    token: { colorPrimary },
  } = theme.useToken()

  const authStyle = {
    '--auth-primary': colorPrimary,
    '--auth-primary-rgb': getRgbValue(colorPrimary),
  } as React.CSSProperties

  useEffect(() => {
    if (token) {
      navigate('/dashboard')
    }
  }, [token, navigate])

  useEffect(() => {
    if (error) {
      message.open({
        type: 'error',
        content: error,
        key: 'login-error',
      })
      clearError()
    }
  }, [error, clearError])

  useEffect(() => {
    let active = true

    const checkBackend = async () => {
      try {
        const base = API_BASE_URL || ''
        const response = await fetch(`${base}/api/v1/health`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('healthcheck failed')
        }
        if (active) {
          setBackendStatus('ok')
        }
      } catch {
        if (active) {
          setBackendStatus('down')
        }
      }
    }

    checkBackend()
    const timer = window.setInterval(checkBackend, 10000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const onFinish = async (values: { username: string; password: string }) => {
    if (backendStatus === 'down') {
      message.open({
        type: 'warning',
        content: `后端服务未连接，请先启动后端（当前 ${apiBaseLabel}）`,
        key: 'backend-down',
      })
      return
    }

    const success = await login(values)
    if (success) {
      message.success('登录成功')
      navigate('/dashboard')
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 14,
          controlHeight: 42,
        },
      }}
    >
      <div className="login-v4" style={authStyle}>
        <div className="login-v4__bg" aria-hidden="true">
          <span className="login-v4__bg-orb login-v4__bg-orb--one" />
          <span className="login-v4__bg-orb login-v4__bg-orb--two" />
          <span className="login-v4__bg-grid" />
        </div>

        <main className="login-v4__shell">
          <section className="login-v4__hero" aria-label="产品价值说明">
            <div className="login-v4__hero-top">
              <div className="login-v4__brand" aria-label="Tunnel AI 品牌">
                <span className="login-v4__brand-icon" aria-hidden="true">
                  <LoginPortalIcon size={22} className="login-v4__brand-mark" />
                </span>
                <span className="login-v4__brand-copy">
                  <span className="login-v4__brand-name">Tunnel AI Platform</span>
                  <span className="login-v4__brand-sub">智能隧道掌子面分析平台</span>
                </span>
              </div>

              <span className="login-v4__version">v1.0.2</span>
            </div>

            <p className="login-v4__eyebrow">Tunnel Intelligence Workspace</p>
            <h1 className="login-v4__title">
              将现场数据转化为
              <span>可执行的工程判断</span>
            </h1>
            <p className="login-v4__desc">
              以“采集-识别-报告”一体化流程连接现场与管理端，让每一次掘进判读都有数据依据、处置建议与审计留痕。
            </p>

            <div className="login-v4__stats" aria-label="平台关键指标">
              {keyStats.map(item => (
                <article className="login-v4__stat" key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>

            <div className="login-v4__timeline" aria-label="平台工作流程">
              {workflowItems.map(item => {
                const IconComponent = item.icon

                return (
                  <article className="login-v4__timeline-item" key={item.title}>
                    <span className="login-v4__timeline-icon" aria-hidden="true">
                      <IconComponent />
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.desc}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="login-v4__panel-wrap" aria-label="登录区域">
            <div className="login-v4__panel">
              <div className="login-v4__panel-head">
                <span className="login-v4__badge">Secure Access</span>
                <Title level={3} className="login-v4__panel-title">
                  登录工作台
                </Title>
                <Text className="login-v4__panel-subtitle">使用组织账号继续访问 Tunnel AI</Text>
              </div>

              <Form
                form={form}
                name="login"
                onFinish={onFinish}
                layout="vertical"
                size="large"
                initialValues={{ remember: false }}
                autoComplete="off"
                requiredMark={false}
                className="login-v4__form"
              >
                {backendStatus === 'down' && (
                  <Alert
                    type="warning"
                    showIcon
                    className="login-v4__backend-alert"
                    message="后端服务未连接"
                    description={`请先启动后端服务（当前 ${apiBaseLabel}）`}
                  />
                )}

                <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入用户名' }]}>
                  <Input
                    prefix={<UserOutlined className="login-v4__input-icon" />}
                    placeholder="用户名 / 邮箱"
                    className="login-v4__input"
                    autoComplete="off"
                  />
                </Form.Item>

                <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                  <Input.Password
                    prefix={<LockOutlined className="login-v4__input-icon" />}
                    placeholder="请输入密码"
                    className="login-v4__input"
                    autoComplete="new-password"
                  />
                </Form.Item>

                <div className="login-v4__options-row">
                  <Form.Item name="remember" valuePropName="checked" noStyle>
                    <Checkbox>记住我</Checkbox>
                  </Form.Item>
                  <a href="#" className="login-v4__link" onClick={event => event.preventDefault()}>
                    忘记密码?
                  </a>
                </div>

                <Form.Item className="login-v4__submit-item">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={isLoading}
                    disabled={isLoading || backendStatus === 'down'}
                    block
                    size="large"
                    className="login-v4__submit"
                  >
                    进入工作台
                    <ArrowRightOutlined />
                  </Button>
                </Form.Item>
              </Form>

              <div className="login-v4__security" aria-label="安全说明">
                {securityNotes.map(note => (
                  <span key={note}>
                    <CheckCircleFilled />
                    {note}
                  </span>
                ))}
              </div>

              <div className="login-v4__panel-footer">
                <span>没有账号？</span>
                <a href="#" className="login-v4__link" onClick={event => event.preventDefault()}>
                  联系管理员开通
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer className="login-v4__footer">© {currentYear} TunnelAI Systems · All rights reserved · 企业内部使用</footer>
      </div>
    </ConfigProvider>
  )
}

export default Login
