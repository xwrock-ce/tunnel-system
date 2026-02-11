import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout, Menu, Button, Dropdown, type MenuProps, Breadcrumb, Input, Badge,
  Avatar, Modal, List, Descriptions, Popover, Tabs, Tooltip
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
  LineChartOutlined,
  DownOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  ProjectOutlined,
  InfoCircleOutlined,
  ReadOutlined
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProjectStore } from '@/stores/useProjectStore'
import TunnelIcon from '@/components/icons/TunnelIcon'

const { Header, Sider, Content } = Layout
const { TabPane } = Tabs

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { currentProject } = useProjectStore()

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

  const notificationErrorCount = notifications.filter((n) => n.type === 'error').length
  const sectionShortName = currentProject.section.split(' ')[0]

  const notificationContent = (
    <List
      className="notification-list"
      itemLayout="horizontal"
      dataSource={notifications}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            avatar={
              item.type === 'error' ? <ThunderboltOutlined className="notification-icon notification-icon--error" /> :
              item.type === 'success' ? <ProjectOutlined className="notification-icon notification-icon--success" /> :
              <InfoCircleOutlined className="notification-icon notification-icon--info" />
            }
            title={<span>{item.title} <span className="notification-time">{item.time}</span></span>}
            description={item.desc}
          />
        </List.Item>
      )}
    />
  )

  const projectContent = (
    <Descriptions className="project-detail-descriptions" column={1} size="small" bordered>
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
          icon: <LineChartOutlined />,
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
            <TunnelIcon size={20} className="brand-mark-icon" />
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
                 <Avatar size="small" icon={<UserOutlined />} className="sidebar-user-avatar" />
                 {!collapsed && (
                   <div className="user-info">
                      <span className="username">{user?.username || 'Admin User'}</span>
                      <span className="role">系统管理员</span>
                   </div>
                 )}
                 {!collapsed && <DownOutlined className="sidebar-user-caret" />}
              </div>
           </Dropdown>
        </div>
      </Sider>
      
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="sidebar-toggle-btn"
            />
            <Breadcrumb items={getBreadcrumbs()} />
          </div>

          <div className="header-right">
             <Popover content={projectContent} title="项目详情" trigger="hover" placement="bottomRight">
               <button type="button" className="project-selector-btn" aria-label="查看当前项目详情">
                  <span className="project-selector-main">
                    <ProjectOutlined className="project-selector-icon" />
                    <span className="project-selector-text">
                      {currentProject.name}
                      <span className="project-selector-section">| {sectionShortName}</span>
                    </span>
                  </span>
                  <DownOutlined className="project-selector-caret" />
               </button>
             </Popover>

             <div className="header-divider"></div>

             <div className="header-actions">
                <Tooltip title="输入分析 ID (如: 10) 或关键词按回车搜索" placement="bottom">
                  <Input.Search 
                     placeholder="全局搜索分析记录..." 
                     allowClear
                     onSearch={handleSearch}
                     bordered={false}
                     className="header-search-input header-search-input--wide"
                     enterButton={false}
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
                  <Badge count={notificationErrorCount} dot offset={[-4, 4]}>
                    <Button type="text" icon={<BellOutlined />} className="action-btn" />
                  </Badge>
                </Popover>
             </div>
          </div>
        </Header>
        
        <Content className="app-content">
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
