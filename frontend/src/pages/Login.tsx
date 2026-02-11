import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Checkbox, message, Typography, theme, ConfigProvider } from 'antd'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  UserOutlined,
  LockOutlined,
  ArrowRightOutlined,
  AimOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import TunnelIcon from '@/components/icons/TunnelIcon'

const { Title, Text } = Typography

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError, token } = useAuthStore()
  const [form] = Form.useForm()
  const { token: { colorPrimary } } = theme.useToken();

  const titleStyle: React.CSSProperties = {
    marginBottom: 8,
    fontWeight: 700,
  }

  const iconStyle: React.CSSProperties = {
    color: '#94a3b8',
  }

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
            <TunnelIcon size={22} className="brand-mark-icon" />
          </div>
          <span className="brand-text">Tunnel AI</span>
        </div>

        {/* Main Content Container */}
        <div className="login-content">
          
          {/* Left Side: Slogan (Hidden on mobile) */}
          <div className="login-slogan">
             <h1 className="slogan-title">
               Looking Deep into <br/>
               <span className="login-highlight" style={{ color: colorPrimary }}>Tunnel Vision</span>
             </h1>
             <p className="slogan-desc">
               下一代智能隧道掌子面分析平台。<br/>
               基于 YOLOv11 + SAM2 的实时病害检测与超欠挖分析。
             </p>
             
             <div className="feature-tags">
                <div className="feature-tag">
                  <AimOutlined className="feature-tag-icon" />
                  <span>高质量识别</span>
                </div>
                <div className="feature-tag">
                  <ThunderboltOutlined className="feature-tag-icon" />
                  <span>实时分析</span>
                </div>
                <div className="feature-tag">
                  <SafetyCertificateOutlined className="feature-tag-icon" />
                  <span>工业级安全</span>
                </div>
             </div>
          </div>

          {/* Right Side: Login Card */}
          <div className="login-card">
            <div className="login-header">
              <Title level={3} style={titleStyle}>欢迎回来</Title>
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
                  prefix={<UserOutlined style={iconStyle} />} 
                  placeholder="用户名 / 邮箱" 
                  className="login-input"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password 
                  prefix={<LockOutlined style={iconStyle} />} 
                  placeholder="密码" 
                  className="login-input"
                />
              </Form.Item>

              <div className="login-options-row">
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
              <span className="login-footer-text">还没有账号?</span>
              <a href="#" className="login-footer-link">申请试用</a>
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
