import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'

// Layout
import MainLayout from '@/components/layout/MainLayout'

// Pages
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import FaceSegmentationUpload from '@/pages/FaceSegmentationUpload'
import CrackDetectionUpload from '@/pages/CrackDetectionUpload'
import History from '@/pages/History'
import Report from '@/pages/Report'
import Settings from '@/pages/Settings'
import RealTimeData from '@/pages/RealTimeData'

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, fetchUser, user } = useAuthStore()

  useEffect(() => {
    if (token && !user) {
      fetchUser()
    }
  }, [token, user, fetchUser])

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="app-root">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="upload" element={<Navigate to="/upload/face" replace />} />
            <Route path="upload/face" element={<FaceSegmentationUpload />} />
            <Route path="upload/crack" element={<CrackDetectionUpload />} />
            <Route path="history" element={<History />} />
            <Route path="report/:id" element={<Report />} />
            <Route path="settings" element={<Settings />} />
            <Route path="realtime" element={<RealTimeData />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
