import React from 'react'
import { Tag } from 'antd'
import { UI_COPY } from '@/constants/uiCopy'

type ExcavationStatus = 'over_excavation' | 'under_excavation' | 'within_tolerance' | string | undefined
type Variant = 'default' | 'report' | 'history'

type Props = {
  status?: ExcavationStatus
  variant?: Variant
  className?: string
}

const getVariantLabels = (variant: Variant) => {
  if (variant === 'report') {
    return {
      over: '超挖异常',
      under: '欠挖异常',
      normal: '合格',
    }
  }

  if (variant === 'history') {
    return {
      over: UI_COPY.history.filters.over,
      under: UI_COPY.history.filters.under,
      normal: UI_COPY.history.filters.normal,
    }
  }

  return {
    over: '超挖',
    under: '欠挖',
    normal: '合格',
  }
}

const getVariantColors = (variant: Variant) => {
  if (variant === 'report') {
    return {
      over: 'error',
      under: 'warning',
      normal: 'success',
    } as const
  }

  return {
    over: 'red',
    under: 'orange',
    normal: 'green',
  } as const
}

const ExcavationStatusTag: React.FC<Props> = ({ status, variant = 'default', className }) => {
  const labels = getVariantLabels(variant)
  const colors = getVariantColors(variant)

  switch (status) {
    case 'over_excavation':
      return <Tag color={colors.over} className={className}>{labels.over}</Tag>
    case 'under_excavation':
      return <Tag color={colors.under} className={className}>{labels.under}</Tag>
    case 'within_tolerance':
      return <Tag color={colors.normal} className={className}>{labels.normal}</Tag>
    default:
      if (variant === 'history') {
        return <Tag color="default" className={className}>-</Tag>
      }
      return <Tag className={className}>{status}</Tag>
  }
}

export default ExcavationStatusTag
