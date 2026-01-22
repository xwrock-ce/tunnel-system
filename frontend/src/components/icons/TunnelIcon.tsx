import React from 'react'

interface TunnelIconProps {
  size?: number
  className?: string
}

export const TunnelIcon: React.FC<TunnelIconProps> = ({
  size = 24,
  className
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* 外层隧道轮廓 - 拱形 */}
    <path d="M3 20 L3 10 A9 9 0 0 1 21 10 L21 20" />
    {/* 内层透视 - 更深的隧道 */}
    <path d="M6 20 L6 12 A6 6 0 0 1 18 12 L18 20" opacity="0.5" />
    {/* 中心透视点 - 最深处 */}
    <path d="M9 20 L9 14 A3 3 0 0 1 15 14 L15 20" opacity="0.25" />
    {/* 底部路面 */}
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
)

export default TunnelIcon
