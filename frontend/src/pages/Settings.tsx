import React, { useEffect } from 'react'
import { Card, Typography, Descriptions, Tag, Divider, Form, InputNumber, Button, Space, message } from 'antd'
import { useAppSettingsStore } from '@/stores/useAppSettingsStore'

const { Title, Text, Paragraph } = Typography

const fullWidthInputStyle: React.CSSProperties = { width: '100%' }

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const { analysisDefaults, setAnalysisDefaults, resetAnalysisDefaults } = useAppSettingsStore()

  useEffect(() => {
    form.setFieldsValue({
      designArea: analysisDefaults.designArea,
      scale: analysisDefaults.scale,
    })
  }, [analysisDefaults.designArea, analysisDefaults.scale, form])

  const handleSave = async () => {
    const values = await form.validateFields()
    setAnalysisDefaults({
      designArea: values.designArea,
      scale: values.scale,
    })
    message.success('已保存默认参数')
  }

  const handleReset = () => {
    resetAnalysisDefaults()
    message.success('已恢复系统默认参数')
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <Title level={4} className="page-title">
          系统设置
        </Title>
      </div>

      <Card title="系统信息" variant="borderless" className="card-surface settings-card-spacing">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="系统版本">
            <Tag color="blue">v1.1.0</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="模型版本">
            <Text>YOLOv11 + SAM2（掌子面分割） + YOLOv11（裂缝检测/分割）</Text>
          </Descriptions.Item>
          <Descriptions.Item label="后端框架">
            <Text>Go</Text>
          </Descriptions.Item>
          <Descriptions.Item label="前端框架">
            <Text>React 18 + Ant Design 5</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="分析默认参数"
        variant="borderless"
        className="card-surface"
        extra={
          <Space className="settings-card-actions" wrap>
            <Text type="secondary" className="settings-card-tip">默认值会同步到上传页</Text>
            <Button onClick={handleReset}>恢复默认</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="designArea"
            label="默认设计面积 (m²)"
            tooltip="用于上传分析页面的默认填充值，可在每次分析时单独修改"
            rules={[
              { required: true, message: '请输入设计面积' },
              { type: 'number', min: 0.01, message: '设计面积必须大于 0' },
            ]}
          >
            <InputNumber style={fullWidthInputStyle} min={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            name="scale"
            label="默认比例尺 (mm/pixel)"
            tooltip="用于上传分析页面的默认填充值，可在每次分析时单独修改"
            rules={[
              { required: true, message: '请输入比例尺' },
              { type: 'number', min: 0.01, message: '比例尺必须大于 0' },
            ]}
          >
            <InputNumber style={fullWidthInputStyle} min={0.01} precision={2} />
          </Form.Item>
          <Text type="secondary" className="settings-tolerance-note">
            容差范围当前为 ±2%（判定逻辑在后端配置中固定）。
          </Text>
        </Form>
      </Card>

      <Divider />

      <Card title="使用说明" variant="borderless" className="card-surface">
        <Paragraph>
          <Text strong>1. 上传分析</Text>
          <br />
          上传隧道掌子面图片，系统将自动进行掌子面分割、裂缝检测/分割，并完成超欠挖分析。支持 JPG、PNG 等常见图片格式。
        </Paragraph>
        <Paragraph>
          <Text strong>2. 查看结果</Text>
          <br />
          分析完成后，可以查看原图、分割掩膜和叠加图，以及详细的超欠挖分析数据。
        </Paragraph>
        <Paragraph>
          <Text strong>3. 历史记录</Text>
          <br />
          所有分析记录都会保存在历史记录中，可以随时查看和导出。
        </Paragraph>
        <Paragraph>
          <Text strong>4. 批量分析</Text>
          <br />
          支持同时上传多张图片进行批量分析，提高工作效率。
        </Paragraph>
      </Card>
    </div>
  )
}

export default Settings
