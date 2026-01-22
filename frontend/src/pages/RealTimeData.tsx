import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Table, Progress, Tag, Button, Space, Tooltip, Divider, Typography, Spin, Empty } from 'antd'
import { ReloadOutlined, SyncOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { analysisApi, AnalysisListItem, getWebSocketUrl, systemApi, SystemStatusResponse } from '@/api/client'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Title } = Typography

// Types
interface ActiveAnalysis extends AnalysisListItem {
  progress: number
  progressMessage: string
  wsConnected: boolean
}

interface ManagedConnection {
  ws: WebSocket
  keepAliveInterval: number | null
}


const RealTimeData: React.FC = () => {
  const navigate = useNavigate()
  const [activeAnalyses, setActiveAnalyses] = useState<ActiveAnalysis[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null)
  const [isLoadingSystem, setIsLoadingSystem] = useState(false)

  // WebSocket connections managed via ref to avoid re-renders
  const wsConnectionsRef = useRef<Map<number, ManagedConnection>>(new Map())
  const [wsStatus, setWsStatus] = useState<Map<number, boolean>>(new Map())

  // Cleanup all WebSocket connections
  const cleanupAllConnections = useCallback(() => {
    wsConnectionsRef.current.forEach((conn, id) => {
      if (conn.keepAliveInterval) {
        clearInterval(conn.keepAliveInterval)
      }
      if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close()
      }
    })
    wsConnectionsRef.current.clear()
    setWsStatus(new Map())
  }, [])

  // Connect WebSocket for a specific analysis
  const connectWebSocket = useCallback((analysisId: number) => {
    // Don't connect if already connected
    if (wsConnectionsRef.current.has(analysisId)) {
      return
    }

    // Limit concurrent connections
    if (wsConnectionsRef.current.size >= 10) {
      return
    }

    const wsUrl = getWebSocketUrl(`/api/v1/analysis/ws/${analysisId}`)
    const ws = new WebSocket(wsUrl)

    const keepAliveInterval = window.setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
        }
      } catch {
        // ignore
      }
    }, 25000)

    ws.onopen = () => {
      setWsStatus(prev => new Map(prev).set(analysisId, true))
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'progress') {
          setActiveAnalyses(prev => prev.map(a =>
            a.id === analysisId
              ? { ...a, progress: payload.progress, progressMessage: payload.message, wsConnected: true }
              : a
          ))
        }
        if (payload?.type === 'result' || payload?.type === 'error') {
          // Task completed, remove from list and close connection
          disconnectWebSocket(analysisId)
          setActiveAnalyses(prev => prev.filter(a => a.id !== analysisId))
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      setWsStatus(prev => new Map(prev).set(analysisId, false))
    }

    ws.onclose = () => {
      setWsStatus(prev => {
        const newMap = new Map(prev)
        newMap.delete(analysisId)
        return newMap
      })
      if (wsConnectionsRef.current.has(analysisId)) {
        const conn = wsConnectionsRef.current.get(analysisId)!
        if (conn.keepAliveInterval) {
          clearInterval(conn.keepAliveInterval)
        }
        wsConnectionsRef.current.delete(analysisId)
      }
    }

    wsConnectionsRef.current.set(analysisId, { ws, keepAliveInterval })
  }, [])

  // Disconnect WebSocket for a specific analysis
  const disconnectWebSocket = useCallback((analysisId: number) => {
    const conn = wsConnectionsRef.current.get(analysisId)
    if (conn) {
      if (conn.keepAliveInterval) {
        clearInterval(conn.keepAliveInterval)
      }
      conn.ws.close()
      wsConnectionsRef.current.delete(analysisId)
    }
  }, [])

  // Fetch active analyses
  const fetchActiveTasks = useCallback(async () => {
    setIsLoadingList(true)
    try {
      // Fetch both pending and processing in parallel
      const [pendingRes, processingRes] = await Promise.all([
        analysisApi.list(1, 50, 'pending'),
        analysisApi.list(1, 50, 'processing'),
      ])

      const allActive: ActiveAnalysis[] = [
        ...processingRes.data.items.map(item => ({
          ...item,
          progress: 0,
          progressMessage: '处理中...',
          wsConnected: wsStatus.get(item.id) || false,
        })),
        ...pendingRes.data.items.map(item => ({
          ...item,
          progress: 0,
          progressMessage: '等待中...',
          wsConnected: false,
        })),
      ]

      setActiveAnalyses(allActive)
      setLastRefreshTime(new Date())

      // Connect WebSocket for processing tasks
      processingRes.data.items.forEach(item => {
        if (!wsConnectionsRef.current.has(item.id)) {
          connectWebSocket(item.id)
        }
      })

      // Disconnect WebSocket for tasks no longer processing
      const processingIds = new Set(processingRes.data.items.map(i => i.id))
      wsConnectionsRef.current.forEach((_, id) => {
        if (!processingIds.has(id)) {
          disconnectWebSocket(id)
        }
      })
    } catch (error) {
      console.error('Failed to fetch active tasks:', error)
    } finally {
      setIsLoadingList(false)
    }
  }, [connectWebSocket, disconnectWebSocket, wsStatus])

  // Fetch system status
  const fetchSystemStatus = useCallback(async () => {
    setIsLoadingSystem(true)
    try {
      const res = await systemApi.getStatus()
      setSystemStatus(res.data)
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    } finally {
      setIsLoadingSystem(false)
    }
  }, [])

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchActiveTasks()
    fetchSystemStatus()
    const taskIntervalId = setInterval(fetchActiveTasks, 5000)
    const systemIntervalId = setInterval(fetchSystemStatus, 10000) // Refresh system status every 10s
    return () => {
      clearInterval(taskIntervalId)
      clearInterval(systemIntervalId)
      cleanupAllConnections()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // KPI counts
  const processingCount = activeAnalyses.filter(a => a.status === 'processing').length
  const pendingCount = activeAnalyses.filter(a => a.status === 'pending').length
  const totalActive = activeAnalyses.length

  // Table columns
  const columns: ColumnsType<ActiveAnalysis> = [
    {
      title: '序列 ID',
      dataIndex: 'id',
      width: 100,
      render: (id) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#0f172a' }}>#{id}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status) => {
        if (status === 'processing') {
          return <Tag icon={<SyncOutlined spin />} color="processing">分析中</Tag>
        }
        return <Tag icon={<ClockCircleOutlined />} color="default">等待中</Tag>
      },
    },
    {
      title: '进度',
      key: 'progress',
      render: (_, record) => (
        <div style={{ minWidth: 200 }}>
          <Progress
            percent={record.progress}
            size="small"
            status={record.status === 'processing' ? 'active' : 'normal'}
            strokeColor={record.status === 'processing' ? '#2563eb' : '#94a3b8'}
          />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {record.progressMessage}
          </div>
        </div>
      ),
    },
    {
      title: '连接',
      key: 'connection',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Tooltip title={record.wsConnected ? '实时连接中' : (record.status === 'processing' ? '轮询模式' : '等待处理')}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: record.wsConnected ? '#22c55e' : (record.status === 'processing' ? '#fbbf24' : '#cbd5e1'),
              boxShadow: record.wsConnected ? '0 0 0 2px rgba(34, 197, 94, 0.2)' : 'none',
            }}
          />
        </Tooltip>
      ),
    },
    {
      title: '类型',
      dataIndex: 'analysis_type',
      width: 120,
      render: (type) => {
        const typeMap: Record<string, string> = {
          'face_segmentation': '掌子面分割',
          'crack_detection': '裂缝检测',
          'full': '完整分析',
        }
        return <span style={{ color: '#64748b' }}>{typeMap[type] || type}</span>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 120,
      render: (d) => (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {dayjs(d).fromNow()}
        </span>
      ),
    },
  ]

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} className="page-title" style={{ margin: 0 }}>实时数据</Title>
        <Space>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>
            最后刷新: {lastRefreshTime ? dayjs(lastRefreshTime).format('HH:mm:ss') : '-'}
          </span>
          <Button
            icon={<ReloadOutlined spin={isLoadingList} />}
            onClick={fetchActiveTasks}
            disabled={isLoadingList}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card">
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              活跃任务
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{totalActive}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>个</span>
            </div>
            <div style={{ marginTop: 12, fontSize: '12px', color: '#64748b' }}>
              实时监控中
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              处理中
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{processingCount}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>个</span>
            </div>
            <div style={{ marginTop: 12, fontSize: '12px', color: '#64748b' }}>
              正在分析
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card">
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              等待队列
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{pendingCount}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>个</span>
            </div>
            <div style={{ marginTop: 12, fontSize: '12px', color: '#64748b' }}>
              排队等待
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Content */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {/* Active Analyses List */}
        <Col xs={24} lg={16}>
          <Card
            bordered={false}
            className="kpi-card"
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>活跃分析任务</h3>
              <span className="status-badge neutral" style={{ fontSize: 11 }}>
                每 5 秒自动刷新
              </span>
            </div>
            {isLoadingList && activeAnalyses.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin />
              </div>
            ) : activeAnalyses.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前没有活跃的分析任务"
                style={{ padding: '48px 0' }}
              />
            ) : (
              <Table<ActiveAnalysis>
                rowKey="id"
                dataSource={activeAnalyses}
                columns={columns}
                pagination={false}
                size="middle"
                onRow={(record) => ({
                  onClick: () => {
                    if (record.status === 'completed') {
                      navigate(`/report/${record.id}`)
                    }
                  },
                  style: { cursor: record.status === 'completed' ? 'pointer' : 'default' }
                })}
              />
            )}
          </Card>
        </Col>

        {/* Device Status Panel */}
        <Col xs={24} lg={8}>
          <Card bordered={false} className="kpi-card" style={{ height: '100%' }} bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>设备状态监控</h3>
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={isLoadingSystem} />}
                onClick={fetchSystemStatus}
                disabled={isLoadingSystem}
              />
            </div>
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isLoadingSystem && !systemStatus ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                  <Spin />
                </div>
              ) : systemStatus ? (
                <>
                  {/* Model Status List - using real data */}
                  {systemStatus.models.map((model, index) => (
                    <div key={index} style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: model.status === 'online' ? '#22c55e' : model.status === 'standby' ? '#fbbf24' : '#ef4444',
                              boxShadow: model.status === 'online' ? '0 0 0 2px rgba(34, 197, 94, 0.2)' : 'none',
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>{model.name}</span>
                        </div>
                        <Tag color={model.status === 'online' ? 'success' : model.status === 'standby' ? 'warning' : 'error'} style={{ margin: 0 }}>
                          {model.status === 'online' ? '运行中' : model.status === 'standby' ? '待机' : '离线'}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                        <span>{model.version}</span>
                        <span>{model.speed || '-'}</span>
                      </div>
                    </div>
                  ))}

                  {/* System Resources - using real data */}
                  <Divider style={{ margin: '8px 0' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 500 }}>系统资源</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#64748b' }}>CPU</span>
                          <span style={{ color: '#334155', fontFamily: 'monospace' }}>{systemStatus.resources.cpu_percent}%</span>
                        </div>
                        <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99 }}>
                          <div style={{ width: `${systemStatus.resources.cpu_percent}%`, height: '100%', background: '#2563eb', borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#64748b' }}>内存</span>
                          <span style={{ color: '#334155', fontFamily: 'monospace' }}>
                            {systemStatus.resources.memory_percent}% ({systemStatus.resources.memory_used_gb}/{systemStatus.resources.memory_total_gb} GB)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99 }}>
                          <div style={{ width: `${systemStatus.resources.memory_percent}%`, height: '100%', background: '#8b5cf6', borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                      {systemStatus.resources.gpu_available ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#64748b' }}>GPU</span>
                            <span style={{ color: '#334155', fontFamily: 'monospace' }}>
                              {systemStatus.resources.gpu_percent ?? 0}%
                              {systemStatus.resources.gpu_memory_used_gb !== null && (
                                <> ({systemStatus.resources.gpu_memory_used_gb}/{systemStatus.resources.gpu_memory_total_gb} GB)</>
                              )}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99 }}>
                            <div style={{ width: `${systemStatus.resources.gpu_percent ?? 0}%`, height: '100%', background: '#10b981', borderRadius: 99, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#94a3b8' }}>GPU</span>
                            <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>未检测到</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99 }}>
                            <div style={{ width: '0%', height: '100%', background: '#94a3b8', borderRadius: 99 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Uptime info */}
                  {systemStatus.uptime_seconds !== null && (
                    <div style={{ marginTop: 'auto', padding: '12px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #dcfce7' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <CheckCircleOutlined style={{ color: '#16a34a', marginTop: 2 }} />
                        <span style={{ fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
                          系统已运行 {Math.floor(systemStatus.uptime_seconds / 3600)} 小时 {Math.floor((systemStatus.uptime_seconds % 3600) / 60)} 分钟
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无法获取系统状态" />
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default RealTimeData
