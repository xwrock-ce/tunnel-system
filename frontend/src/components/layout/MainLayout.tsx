import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout, Menu, Button, Dropdown, type MenuProps, Breadcrumb, Input, Badge,
  Avatar, theme, Modal, List, Descriptions, Popover, Tabs, Tooltip
} from 'antd'
import {
  DashboardOutlined,
  UploadOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  DownOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  ProjectOutlined,
  InfoCircleOutlined,
  ReadOutlined
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProjectStore } from '@/stores/useProjectStore'
import '@/styles/layout.css'

const { Header, Sider, Content } = Layout
const { TabPane } = Tabs

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { currentProject } = useProjectStore()
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const handleSearch = (value: string) => {
    if (!value.trim()) return
    // Navigate to history page with search parameter logic (would typically use URL params)
    // For now, we simulate this by passing state via navigation or just navigating
    // In a real app, History page should read ?search=... from URL
    // Here we'll just navigate to history and let the user know they can search there,
    // OR ideally, we'd modify History to accept location state.
    // For this prototype, let's assume we want to guide them to History.
    navigate('/history', { state: { search: value } })
  }

  // Mock Notifications
  const notifications = [
    { id: 1, title: '分析完成', desc: '任务 #1024 已完成，结果正常。', type: 'success', time: '10分钟前' },
    { id: 2, title: '系统警告', desc: '检测到严重超挖 (ID: #1023)', type: 'error', time: '1小时前' },
    { id: 3, title: '系统维护', desc: '预计今晚 02:00 进行例行维护。', type: 'info', time: '2小时前' },
  ]

  const notificationContent = (
    <List
      itemLayout="horizontal"
      dataSource={notifications}
      style={{ width: 300 }}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            avatar={
              item.type === 'error' ? <ThunderboltOutlined style={{ color: 'red' }} /> :
              item.type === 'success' ? <ProjectOutlined style={{ color: 'green' }} /> :
              <InfoCircleOutlined style={{ color: 'blue' }} />
            }
            title={<span>{item.title} <span style={{ fontSize: 10, color: '#999', float: 'right' }}>{item.time}</span></span>}
            description={item.desc}
          />
        </List.Item>
      )}
    />
  )

  const projectContent = (
    <Descriptions column={1} size="small" style={{ width: 300 }} bordered>
      <Descriptions.Item label="工程名称">{currentProject.name}</Descriptions.Item>
      <Descriptions.Item label="当前标段">{currentProject.section}</Descriptions.Item>
      <Descriptions.Item label="施工单位">{currentProject.contractor}</Descriptions.Item>
      <Descriptions.Item label="项目经理">{currentProject.manager}</Descriptions.Item>
      <Descriptions.Item label="当前掌子面">{currentProject.currentMileage}</Descriptions.Item>
      <Descriptions.Item label="现场环境">{currentProject.weather}</Descriptions.Item>
    </Descriptions>
  )

  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '概览仪表盘',
    },
    {
      key: 'work',
      type: 'group',
      label: '检测作业',
      children: [
        {
          key: '/upload',
          icon: <UploadOutlined />,
          label: '上传分析',
          children: [
            {
              key: '/upload/face',
              icon: <PictureOutlined />,
              label: '掌子面分割',
            },
            {
              key: '/upload/crack',
              icon: <ThunderboltOutlined />,
              label: '裂缝检测',
            },
          ],
        },
        {
          key: '/realtime',
          icon: <span role="img" aria-label="realtime" className="anticon"><svg width="1em" height="1em" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></span>,
          label: '实时监控',
        }
      ]
    },
    {
      key: 'manage',
      type: 'group',
      label: '管理',
      children: [
        {
          key: '/history',
          icon: <HistoryOutlined />,
          label: '历史记录',
        },
        {
          key: '/settings',
          icon: <SettingOutlined />,
          label: '系统设置',
        },
      ]
    }
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout()
      navigate('/login')
    }
  }

  // Generate breadcrumbs based on path
  const getBreadcrumbs = () => {
    const pathSnippets = location.pathname.split('/').filter(i => i)
    const extraBreadcrumbItems = pathSnippets.map((_) => {
      // Simple mapping
      const nameMap: Record<string, string> = {
        'dashboard': '仪表盘',
        'upload': '上传分析',
        'face': '掌子面',
        'crack': '裂缝',
        'history': '历史记录',
        'settings': '设置',
        'report': '分析报告',
        'realtime': '实时数据'
      }
      return {
        title: nameMap[_] || _
      }
    })
    return [
      { title: '首页' },
      ...extraBreadcrumbItems,
    ]
  }

  return (
    <Layout className="app-layout">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        className="app-sider"
        theme="dark"
      >
        <div className="sidebar-logo-container">
          <div className="logo-box">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          {!collapsed && (
            <div className="logo-text">
              <h1>Tunnel AI</h1>
              <span>Intelligent System</span>
            </div>
          )}
        </div>
        
        <div className="menu-container">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            defaultOpenKeys={['/upload', 'work']}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            className="app-menu"
          />
        </div>

        {/* Bottom User Section */}
        <div className="sidebar-user-section">
           <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="topRight" trigger={['click']}>
              <div className={`user-card ${collapsed ? 'collapsed' : ''}`}>
                 <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#3b82f6' }} />
                 {!collapsed && (
                   <div className="user-info">
                      <span className="username">{user?.username || 'Admin User'}</span>
                      <span className="role">系统管理员</span>
                   </div>
                 )}
                 {!collapsed && <DownOutlined style={{ fontSize: 10, color: '#64748b' }} />}
              </div>
           </Dropdown>
        </div>
      </Sider>
      
      <Layout>
        <Header className="app-header" style={{ background: colorBgContainer }}>
          <div className="header-left">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: '16px',
                width: 48,
                height: 48,
                marginRight: 16
              }}
            />
            <Breadcrumb items={getBreadcrumbs()} />
          </div>

          <div className="header-right">
             {/* Project Selector */}
             <Popover content={projectContent} title="项目详情" trigger="hover" placement="bottomRight">
               <div 
                  className="project-selector-btn"  /* 样式引用 */
                  style={{ 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: 8, 
                    padding: '6px 16px', 
                    borderRadius: 6, 
                    transition: 'all 0.3s',
                    background: '#f1f5f9',
                    minWidth: 200, // Fixed width for stability
                    border: '1px solid transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
               >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProjectOutlined style={{ color: '#1677ff' }} />
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>
                      {currentProject.name} <span style={{ color: '#64748b', fontSize: 12 }}>| {currentProject.section.split(' ')[0]}</span>
                    </span>
                  </div>
                  <DownOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
               </div>
             </Popover>

             <div className="header-divider"></div>

             <div className="header-actions">
                <Tooltip title="输入分析 ID (如: 10) 或关键词按回车搜索" placement="bottom">
                  <Input.Search 
                     placeholder="全局搜索分析记录..." 
                     allowClear
                     onSearch={handleSearch}
                     style={{ width: 280 }} // Increased width
                     bordered={false}
                     className="header-search-input"
                     enterButton={false} // Clean look
                  />
                </Tooltip>
                
                <Tooltip title="帮助与支持">
                  <Button 
                    type="text" 
                    icon={<QuestionCircleOutlined />} 
                    className="action-btn"
                    onClick={() => setIsHelpModalOpen(true)}
                  />
                </Tooltip>
                
                <Popover content={notificationContent} title="系统通知" trigger="click" placement="bottomRight">
                  <Badge count={notifications.filter(n => n.type === 'error').length} dot offset={[-4, 4]}>
                    <Button type="text" icon={<BellOutlined />} className="action-btn" />
                  </Badge>
                </Popover>
             </div>
          </div>
        </Header>
        
        <Content style={{ 
           margin: '24px 24px 0', 
           padding: 24, 
           minHeight: 280, 
           background: colorBgContainer, 
           borderRadius: borderRadiusLG,
           overflowY: 'auto'
        }}>
          <Outlet />
        </Content>
        
        <Modal
          title="帮助中心"
          open={isHelpModalOpen}
          onCancel={() => setIsHelpModalOpen(false)}
          footer={[
            <Button key="close" onClick={() => setIsHelpModalOpen(false)}>
              关闭
            </Button>
          ]}
          width={700}
        >
          <Tabs defaultActiveKey="1">
            <TabPane tab={<span><ReadOutlined />操作指南</span>} key="1">
              <List
                size="small"
                dataSource={[
                  '1. 上传图像：点击侧边栏“上传分析”，选择掌子面或裂缝检测。',
                  '2. 参数设置：上传前可调整设计面积和比例尺参数。',
                  '3. 查看结果：分析完成后，在“历史记录”中查看详细报告。',
                  '4. 导出报告：在报告详情页支持导出 PDF 或 CSV 数据。',
                  '5. 搜索功能：使用顶部搜索栏输入 ID 可快速定位记录。'
                ]}
                renderItem={item => <List.Item>{item}</List.Item>}
              />
            </TabPane>
            <TabPane tab={<span><InfoCircleOutlined />系统说明</span>} key="2">
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="系统版本">v1.2.0 (Beta)</Descriptions.Item>
                <Descriptions.Item label="AI模型">YOLOv11 + SAM2 (Segment Anything Model 2)</Descriptions.Item>
                <Descriptions.Item label="适用场景">钻爆法隧道施工、TBM 辅助检测</Descriptions.Item>
                <Descriptions.Item label="技术支持">support@tunnel-ai.com</Descriptions.Item>
              </Descriptions>
            </TabPane>
          </Tabs>
        </Modal>
      </Layout>
    </Layout>
  )
}

export default MainLayout