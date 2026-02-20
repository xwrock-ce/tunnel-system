import React from 'react'

interface LoginPortalIconProps {
  size?: number
  className?: string
}

const LoginPortalIcon: React.FC<LoginPortalIconProps> = ({ size = 24, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M3.5 19.5V11.5C3.5 6.95 7.2 3.25 11.75 3.25H12.25C16.8 3.25 20.5 6.95 20.5 11.5V19.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.6 19.5V12.85C6.6 9.89 9 7.5 11.95 7.5H12.05C15 7.5 17.4 9.89 17.4 12.85V19.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.82"
    />
    <path
      d="M9.55 19.5V14.8C9.55 13.44 10.65 12.35 12 12.35C13.35 12.35 14.45 13.44 14.45 14.8V19.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.56"
    />
    <path d="M8.5 20H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M11.95 9.45V10.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export default LoginPortalIcon
