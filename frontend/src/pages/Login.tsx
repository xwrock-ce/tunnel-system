import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Checkbox, message, Typography, theme, ConfigProvider } from 'antd'
import { useAuthStore } from '@/stores/useAuthStore'
import { UserOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError, token } = useAuthStore()
  const [form] = Form.useForm()
  const { token: { colorPrimary } } = theme.useToken();

  useEffect(() => {
    if (token) {
      navigate('/dashboard')
    }
  }, [token, navigate])

  useEffect(() => {
    if (error) {
      message.error(error)
      clearError()
    }
  }, [error, clearError])

  const onFinish = async (values: { username: string; password: string }) => {
    const success = await login(values)
    if (success) {
      message.success('登录成功')
      navigate('/dashboard')
    }
  }

  return (
    <ConfigProvider theme={{
      token: {
        borderRadius: 8,
        controlHeight: 44,
      }
    }}>
      <div className="login-page">
        {/* Background Image & Overlay */}
        <div className="login-background"></div>
        <div className="login-overlay"></div>

        {/* Brand Area (Top Left) */}
        <div className="login-brand">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <span className="brand-text">Tunnel AI</span>
        </div>

        {/* Main Content Container */}
        <div className="login-content">
          
          {/* Left Side: Slogan (Hidden on mobile) */}
          <div className="login-slogan">
             <h1 className="slogan-title">
               Looking Deep into <br/>
               <span style={{ color: colorPrimary }}>Tunnel Vision</span>
             </h1>
             <p className="slogan-desc">
               下一代智能隧道掌子面分析平台。<br/>
               基于 YOLOv11 + SAM2 的实时病害检测与超欠挖分析。
             </p>
             
             <div className="feature-tags">
                <div className="feature-tag">🎯 高质量识别</div>
                <div className="feature-tag">⚡ 实时分析</div>
                <div className="feature-tag">🛡️ 工业级安全</div>
             </div>
          </div>

          {/* Right Side: Login Card */}
          <div className="login-card">
            <div className="login-header">
              <Title level={3} style={{ marginBottom: 8, fontWeight: 700 }}>欢迎回来</Title>
              <Text type="secondary">登录以访问您的工程仪表盘</Text>
            </div>

            <Form
              form={form}
              name="login"
              onFinish={onFinish}
              layout="vertical"
              size="large"
              initialValues={{ username: 'admin', password: 'admin123', remember: true }}
              requiredMark={false}
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input 
                  prefix={<UserOutlined style={{ color: '#94a3b8' }} />} 
                  placeholder="用户名 / 邮箱" 
                  className="login-input"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password 
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />} 
                  placeholder="密码" 
                  className="login-input"
                />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>记住我</Checkbox>
                </Form.Item>
                <a className="login-forgot" href="#" onClick={e => e.preventDefault()}>忘记密码?</a>
              </div>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={isLoading} block size="large" className="login-btn">
                  登 录 <ArrowRightOutlined />
                </Button>
              </Form.Item>
            </Form>

            <div className="login-footer">
              <span style={{ color: '#64748b' }}>还没有账号?</span>
              <a href="#" style={{ marginLeft: 8, fontWeight: 600 }}>申请试用</a>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="login-page-footer">
           © 2025 TunnelAI Systems Inc. All rights reserved. v1.0.2
        </div>
      </div>
    </ConfigProvider>
  )
}

export default Login