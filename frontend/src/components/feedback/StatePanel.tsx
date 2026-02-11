import React from 'react'
import { Empty, Spin } from 'antd'
import { CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'

type StatePanelMode = 'loading' | 'empty' | 'error' | 'info'
type StatePanelVariant = 'page' | 'card' | 'table'

interface StatePanelProps {
  mode: StatePanelMode
  title: string
  description?: string
  variant?: StatePanelVariant
  compact?: boolean
  action?: React.ReactNode
  className?: string
}

const StatePanel: React.FC<StatePanelProps> = ({
  mode,
  title,
  description,
  variant = 'card',
  compact = false,
  action,
  className,
}) => {
  const panelClassName = [
    'state-panel',
    `state-panel--${mode}`,
    `state-panel--variant-${variant}`,
    compact ? 'state-panel--compact' : '',
    className || '',
  ].filter(Boolean).join(' ')

  const visual =
    mode === 'loading'
      ? <Spin size={compact ? 'default' : 'large'} />
      : mode === 'empty'
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />
        : mode === 'error'
          ? <CloseCircleOutlined className="state-panel-icon" />
          : <InfoCircleOutlined className="state-panel-icon" />

  return (
    <div className={panelClassName}>
      <div className="state-panel-visual">{visual}</div>
      <div className="state-panel-content">
        <h3 className="state-panel-title">{title}</h3>
        {description && <p className="state-panel-desc">{description}</p>}
        {action && <div className="state-panel-action">{action}</div>}
      </div>
    </div>
  )
}

export default StatePanel
