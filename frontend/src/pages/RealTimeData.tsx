import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Row, Col, Card, Table, Progress, Tag, Button, Space, Tooltip, Divider, Typography, Spin, Empty } from 'antd'
import { ReloadOutlined, SyncOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { analysisApi, AnalysisListItem, getWebSocketUrl, systemApi, SystemStatusResponse } from '@/api/client'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Title } = Typography

interface ActiveAnalysis extends AnalysisListItem {
  progress: number
  progressMessage: string
  wsConnected: boolean
}

interface ManagedConnection {
  ws: WebSocket
  keepAliveInterval: number | null
}

const analysisTypeLabelMap: Record<string, string> = {
  face_segmentation: '掌子面分割',
  crack_detection: '裂缝检测',
  full: '完整分析',
}

const getAnalysisTypeLabel = (analysisType: string) => analysisTypeLabelMap[analysisType] || analysisType

const getModelStatusText = (status: string) => {
  if (status === 'online') return '运行中'
  if (status === 'standby') return '待机'
  return '离线'
}

const getModelStatusColor = (status: string) => {
  if (status === 'online') return 'success'
  if (status === 'standby') return 'warning'
  return 'error'
}

const clampPercent = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

const formatUptime = (uptimeSeconds: number | null) => {
  if (uptimeSeconds === null) {
    return '-'
  }
  const hours = Math.floor(uptimeSeconds / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  return `${hours} 小时 ${minutes} 分钟`
}

const RealTimeData: React.FC = () => {
  const [activeAnalyses, setActiveAnalyses] = useState<ActiveAnalysis[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true)
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null)
  const [isLoadingSystem, setIsLoadingSystem] = useState(false)
  const [taskFetchError, setTaskFetchError] = useState<string | null>(null)
  const [systemFetchError, setSystemFetchError] = useState<string | null>(null)

  const wsConnectionsRef = useRef<Map<number, ManagedConnection>>(new Map())

  const updateAnalysisConnection = useCallback((analysisId: number, isConnected: boolean) => {
    setActiveAnalyses((prev) => prev.map((analysis) => (
      analysis.id === analysisId ? { ...analysis, wsConnected: isConnected } : analysis
    )))
  }, [])

  const cleanupAllConnections = useCallback(() => {
    wsConnectionsRef.current.forEach((conn) => {
      if (conn.keepAliveInterval) {
        clearInterval(conn.keepAliveInterval)
      }
      if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close()
      }
    })
    wsConnectionsRef.current.clear()
    setActiveAnalyses((prev) => prev.map((analysis) => (
      analysis.wsConnected ? { ...analysis, wsConnected: false } : analysis
    )))
  }, [])

  const disconnectWebSocket = useCallback((analysisId: number) => {
    const conn = wsConnectionsRef.current.get(analysisId)
    if (conn) {
      if (conn.keepAliveInterval) {
        clearInterval(conn.keepAliveInterval)
      }
      conn.ws.close()
      wsConnectionsRef.current.delete(analysisId)
    }
    updateAnalysisConnection(analysisId, false)
  }, [updateAnalysisConnection])

  const connectWebSocket = useCallback((analysisId: number) => {
    if (wsConnectionsRef.current.has(analysisId)) {
      return
    }

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
      updateAnalysisConnection(analysisId, true)
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'progress') {
          const progress = clampPercent(payload.progress)
          const message = typeof payload.message === 'string' && payload.message.trim()
            ? payload.message
            : '处理中...'
          setActiveAnalyses((prev) => prev.map((analysis) => (
            analysis.id === analysisId
              ? {
                ...analysis,
                progress,
                progressMessage: message,
                wsConnected: true,
              }
              : analysis
          )))
        }
        if (payload?.type === 'result' || payload?.type === 'error') {
          disconnectWebSocket(analysisId)
          setActiveAnalyses((prev) => prev.filter((analysis) => analysis.id !== analysisId))
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      updateAnalysisConnection(analysisId, false)
    }

    ws.onclose = () => {
      const conn = wsConnectionsRef.current.get(analysisId)
      if (conn?.keepAliveInterval) {
        clearInterval(conn.keepAliveInterval)
      }
      wsConnectionsRef.current.delete(analysisId)
      updateAnalysisConnection(analysisId, false)
    }

    wsConnectionsRef.current.set(analysisId, { ws, keepAliveInterval })
  }, [disconnectWebSocket, updateAnalysisConnection])

  const fetchActiveTasks = useCallback(async () => {
    setIsLoadingList(true)
    setTaskFetchError(null)
    try {
      const [pendingRes, processingRes] = await Promise.all([
        analysisApi.list(1, 50, 'pending'),
        analysisApi.list(1, 50, 'processing'),
      ])

      setActiveAnalyses((prev) => {
        const prevMap = new Map(prev.map((analysis) => [analysis.id, analysis]))

        const processingTasks: ActiveAnalysis[] = processingRes.data.items.map((item) => {
          const previous = prevMap.get(item.id)
          return {
            ...item,
            progress: previous?.progress ?? 0,
            progressMessage: previous?.progressMessage || '处理中...',
            wsConnected: previous?.wsConnected || wsConnectionsRef.current.has(item.id),
          }
        })

        const pendingTasks: ActiveAnalysis[] = pendingRes.data.items.map((item) => {
          const previous = prevMap.get(item.id)
          return {
            ...item,
            progress: previous?.progress ?? 0,
            progressMessage: previous?.progressMessage || '等待中...',
            wsConnected: false,
          }
        })

        return [...processingTasks, ...pendingTasks]
      })
      setLastRefreshTime(new Date())

      processingRes.data.items.forEach((item) => {
        if (!wsConnectionsRef.current.has(item.id)) {
          connectWebSocket(item.id)
        }
      })

      const processingIds = new Set(processingRes.data.items.map((item) => item.id))
      wsConnectionsRef.current.forEach((_, id) => {
        if (!processingIds.has(id)) {
          disconnectWebSocket(id)
        }
      })
    } catch (error) {
      console.error('Failed to fetch active tasks:', error)
      setTaskFetchError('获取任务列表失败，请检查后端连接')
    } finally {
      setIsLoadingList(false)
    }
  }, [connectWebSocket, disconnectWebSocket])

  const fetchSystemStatus = useCallback(async () => {
    setIsLoadingSystem(true)
    setSystemFetchError(null)
    try {
      const res = await systemApi.getStatus()
      setSystemStatus(res.data)
    } catch (error) {
      console.error('Failed to fetch system status:', error)
      setSystemFetchError('系统状态更新失败')
    } finally {
      setIsLoadingSystem(false)
    }
  }, [])

  const handleManualRefresh = useCallback(() => {
    fetchActiveTasks()
    fetchSystemStatus()
  }, [fetchActiveTasks, fetchSystemStatus])

  const toggleAutoRefresh = useCallback(() => {
    setIsAutoRefreshEnabled((prev) => {
      const nextEnabled = !prev
      if (!nextEnabled) {
        cleanupAllConnections()
      }
      return nextEnabled
    })
  }, [cleanupAllConnections])

  useEffect(() => {
    fetchActiveTasks()
    fetchSystemStatus()
  }, [fetchActiveTasks, fetchSystemStatus])

  useEffect(() => {
    if (!isAutoRefreshEnabled) {
      return
    }

    const taskIntervalId = window.setInterval(fetchActiveTasks, 5000)
    const systemIntervalId = window.setInterval(fetchSystemStatus, 10000)

    return () => {
      window.clearInterval(taskIntervalId)
      window.clearInterval(systemIntervalId)
    }
  }, [isAutoRefreshEnabled, fetchActiveTasks, fetchSystemStatus])

  useEffect(() => () => {
    cleanupAllConnections()
  }, [cleanupAllConnections])

  const processingCount = activeAnalyses.filter((analysis) => analysis.status === 'processing').length
  const pendingCount = activeAnalyses.filter((analysis) => analysis.status === 'pending').length
  const totalActive = activeAnalyses.length
  const refreshStatusText = isAutoRefreshEnabled ? '自动刷新：已开启' : '自动刷新：已暂停'

  const columns: ColumnsType<ActiveAnalysis> = [
    {
      title: '序列 ID',
      dataIndex: 'id',
      width: 100,
      render: (id) => <span className="realtime-code-text">#{id}</span>,
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
        <div className="realtime-progress-cell">
          <Progress
            percent={record.progress}
            size="small"
            status={record.status === 'processing' ? 'active' : 'normal'}
            strokeColor={record.status === 'processing' ? '#2563eb' : '#94a3b8'}
          />
          <div className="realtime-progress-text">{record.progressMessage}</div>
        </div>
      ),
    },
    {
      title: '连接',
      key: 'connection',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const dotClassName = record.wsConnected
          ? 'realtime-connection-dot is-live'
          : record.status === 'processing'
            ? 'realtime-connection-dot is-polling'
            : 'realtime-connection-dot is-waiting'

        return (
          <Tooltip title={record.wsConnected ? '实时连接中' : (record.status === 'processing' ? '轮询模式' : '等待处理')}>
            <span className={dotClassName} />
          </Tooltip>
        )
      },
    },
    {
      title: '类型',
      dataIndex: 'analysis_type',
      width: 120,
      render: (type) => <span className="realtime-muted-text">{getAnalysisTypeLabel(type)}</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 120,
      render: (date) => <span className="realtime-subtle-text">{dayjs(date).fromNow()}</span>,
    },
  ]

  return (
    <div className="realtime-page">
      <div className="realtime-toolbar">
        <span className={`realtime-toolbar-item ${isAutoRefreshEnabled ? 'is-active' : ''}`}>{refreshStatusText}</span>
        <span className="realtime-toolbar-item">WebSocket连接：{wsConnectionsRef.current.size}</span>
        {taskFetchError && <span className="realtime-toolbar-item is-warning">{taskFetchError}</span>}
        {systemFetchError && <span className="realtime-toolbar-item is-warning">{systemFetchError}</span>}
      </div>

      <div className="page-header">
        <Title level={4} className="page-title">实时数据</Title>
        <Space className="page-actions">
          <span className="realtime-last-refresh">
            最后刷新: {lastRefreshTime ? dayjs(lastRefreshTime).format('HH:mm:ss') : '-'}
          </span>
          <Button
            icon={<ReloadOutlined spin={isLoadingList || isLoadingSystem} />}
            onClick={handleManualRefresh}
            disabled={isLoadingList || isLoadingSystem}
          >
            刷新
          </Button>
          <Button
            type={isAutoRefreshEnabled ? 'default' : 'primary'}
            onClick={toggleAutoRefresh}
          >
            {isAutoRefreshEnabled ? '暂停自动刷新' : '恢复自动刷新'}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card realtime-kpi-card">
            <div className="realtime-kpi-label">活跃任务</div>
            <div className="realtime-kpi-value-row">
              <span className="realtime-kpi-value">{totalActive}</span>
              <span className="realtime-kpi-unit">个</span>
            </div>
            <div className="realtime-kpi-desc">实时监控中</div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card realtime-kpi-card realtime-kpi-card--processing">
            <div className="realtime-kpi-label">处理中</div>
            <div className="realtime-kpi-value-row">
              <span className="realtime-kpi-value realtime-kpi-value--processing">{processingCount}</span>
              <span className="realtime-kpi-unit">个</span>
            </div>
            <div className="realtime-kpi-desc">正在分析</div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card realtime-kpi-card">
            <div className="realtime-kpi-label">等待队列</div>
            <div className="realtime-kpi-value-row">
              <span className="realtime-kpi-value">{pendingCount}</span>
              <span className="realtime-kpi-unit">个</span>
            </div>
            <div className="realtime-kpi-desc">排队等待</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="realtime-main-row">
        <Col xs={24} lg={16}>
          <Card bordered={false} className="kpi-card realtime-task-card">
            <div className="realtime-card-head">
              <h3 className="realtime-card-title">活跃分析任务</h3>
              <span className="status-badge neutral realtime-card-badge">每 5 秒自动刷新</span>
            </div>
            {isLoadingList && activeAnalyses.length === 0 ? (
              <div className="realtime-empty-state">
                <Spin />
              </div>
            ) : activeAnalyses.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前没有活跃的分析任务"
                className="realtime-empty"
              />
            ) : (
              <Table<ActiveAnalysis>
                rowKey="id"
                dataSource={activeAnalyses}
                columns={columns}
                pagination={false}
                size="middle"
                scroll={{ x: 760 }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            bordered={false}
            className="kpi-card realtime-system-card realtime-system-card--full"
          >
            <div className="realtime-card-head realtime-card-head--compact">
              <h3 className="realtime-card-title">设备状态监控</h3>
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={isLoadingSystem} />}
                onClick={fetchSystemStatus}
                disabled={isLoadingSystem}
              />
            </div>
            <div className="realtime-system-body">
              {isLoadingSystem && !systemStatus ? (
                <div className="realtime-empty-state realtime-empty-state--short">
                  <Spin />
                </div>
              ) : systemStatus ? (
                <>
                  {systemStatus.models.map((model, index) => {
                    const statusClassName = model.status === 'online'
                      ? 'realtime-connection-dot is-live'
                      : model.status === 'standby'
                        ? 'realtime-connection-dot is-polling'
                        : 'realtime-connection-dot is-offline'

                    return (
                      <div key={`${model.name}-${index}`} className="realtime-model-card">
                        <div className="realtime-model-header">
                          <div className="realtime-model-title-wrap">
                            <span className={statusClassName} />
                            <span className="realtime-model-name">{model.name}</span>
                          </div>
                          <Tag color={getModelStatusColor(model.status)} className="realtime-model-tag">
                            {getModelStatusText(model.status)}
                          </Tag>
                        </div>
                        <div className="realtime-model-meta">
                          <span>{model.version}</span>
                          <span>{model.speed || '-'}</span>
                        </div>
                      </div>
                    )
                  })}

                  <Divider className="realtime-system-divider" />

                  <div>
                    <div className="realtime-resource-title">系统资源</div>
                    <div className="realtime-resource-list">
                      <div>
                        <div className="realtime-resource-row">
                          <span className="realtime-resource-label">CPU</span>
                          <span className="realtime-resource-value">{systemStatus.resources.cpu_percent}%</span>
                        </div>
                        <div className="realtime-resource-bar-track">
                          <div
                            className="realtime-resource-bar is-cpu"
                            style={{ width: `${clampPercent(systemStatus.resources.cpu_percent)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="realtime-resource-row">
                          <span className="realtime-resource-label">内存</span>
                          <span className="realtime-resource-value">
                            {systemStatus.resources.memory_percent}% ({systemStatus.resources.memory_used_gb}/{systemStatus.resources.memory_total_gb} GB)
                          </span>
                        </div>
                        <div className="realtime-resource-bar-track">
                          <div
                            className="realtime-resource-bar is-memory"
                            style={{ width: `${clampPercent(systemStatus.resources.memory_percent)}%` }}
                          />
                        </div>
                      </div>

                      {systemStatus.resources.gpu_available ? (
                        <div>
                          <div className="realtime-resource-row">
                            <span className="realtime-resource-label">GPU</span>
                            <span className="realtime-resource-value">
                              {systemStatus.resources.gpu_percent ?? 0}%
                              {systemStatus.resources.gpu_memory_used_gb !== null && (
                                <> ({systemStatus.resources.gpu_memory_used_gb}/{systemStatus.resources.gpu_memory_total_gb} GB)</>
                              )}
                            </span>
                          </div>
                          <div className="realtime-resource-bar-track">
                            <div
                              className="realtime-resource-bar is-gpu"
                              style={{ width: `${clampPercent(systemStatus.resources.gpu_percent)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="realtime-resource-row">
                            <span className="realtime-resource-label realtime-resource-label--disabled">GPU</span>
                            <span className="realtime-resource-value realtime-resource-value--disabled">未检测到</span>
                          </div>
                          <div className="realtime-resource-bar-track">
                            <div className="realtime-resource-bar is-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {systemStatus.uptime_seconds !== null && (
                    <div className="realtime-uptime-card">
                      <div className="realtime-uptime-row">
                        <CheckCircleOutlined className="realtime-uptime-icon" />
                        <span className="realtime-uptime-text">
                          系统已运行 {formatUptime(systemStatus.uptime_seconds)}
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
