import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Card, Table, Tag, Button, Space, Modal, Select, Typography, message, Input, Empty,
} from 'antd'
import { EyeOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { AnalysisListItem } from '@/api/client'

const { Title } = Typography
const { Option } = Select

const History: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [searchInput, setSearchInput] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  const {
    analyses,
    totalCount,
    currentPage,
    isLoadingList,
    fetchAnalyses,
    deleteAnalysis,
  } = useAnalysisStore()

  useEffect(() => {
    if (location.state?.search) {
      const initialSearch = String(location.state.search).trim()
      setSearchInput(initialSearch)
      setSearchKeyword(initialSearch)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = searchInput.trim()
      setSearchKeyword((prev) => (prev === normalized ? prev : normalized))
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchInput])

  useEffect(() => {
    fetchAnalyses(1, statusFilter, searchKeyword)
  }, [fetchAnalyses, statusFilter, searchKeyword])

  const handleSearchSubmit = (value: string) => {
    const normalized = value.trim()
    setSearchInput(normalized)
    setSearchKeyword(normalized)
  }

  const canOpenReport = (record: AnalysisListItem) => record.status === 'completed'

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条分析记录吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const success = await deleteAnalysis(id)
        if (success) {
          message.success('删除成功')
        } else {
          message.error('删除失败')
        }
      },
    })
  }

  const getStatusTag = (status: string | undefined) => {
    switch (status) {
      case 'over_excavation':
        return <Tag color="red">超挖</Tag>
      case 'under_excavation':
        return <Tag color="orange">欠挖</Tag>
      case 'within_tolerance':
        return <Tag color="green">合格</Tag>
      default:
        return <Tag color="default">-</Tag>
    }
  }

  const getAnalysisStatusTag = (status: string) => {
    switch (status) {
      case 'completed':
        return <Tag color="success">完成</Tag>
      case 'processing':
        return <Tag color="processing">处理中</Tag>
      case 'pending':
        return <Tag color="default">等待中</Tag>
      case 'failed':
        return <Tag color="error">失败</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  const escapeCsv = (value: string) => {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const exportCurrentPage = () => {
    const headers = ['ID', '分析状态', '超欠挖状态', '实际面积(m²)', '偏差(%)', '创建时间']
    const rows = analyses.map((analysis) => [
      String(analysis.id),
      analysis.status,
      analysis.excavation_status || '-',
      analysis.actual_area_m2 === undefined || analysis.actual_area_m2 === null ? '-' : analysis.actual_area_m2.toFixed(2),
      analysis.difference_percent === undefined || analysis.difference_percent === null ? '-' : analysis.difference_percent.toFixed(2),
      dayjs(analysis.created_at).format('YYYY-MM-DD HH:mm:ss'),
    ])

    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analysis_history_p${currentPage}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    message.success('已导出当前页')
  }

  const columns: ColumnsType<AnalysisListItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      render: (id) => <span className="history-id-text">#{id}</span>,
    },
    {
      title: '分析状态',
      dataIndex: 'status',
      width: 100,
      render: (status) => getAnalysisStatusTag(status),
    },
    {
      title: '超欠挖状态',
      dataIndex: 'excavation_status',
      width: 120,
      render: (status) => getStatusTag(status),
    },
    {
      title: '实际面积',
      dataIndex: 'actual_area_m2',
      width: 120,
      render: (value) => (value === null || value === undefined ? '-' : `${value.toFixed(2)} m²`),
    },
    {
      title: '偏差',
      dataIndex: 'difference_percent',
      width: 100,
      render: (value) => {
        if (value === null || value === undefined) return <span className="history-diff-text is-empty">-</span>

        const cls = Math.abs(value) > 2 ? (value > 0 ? 'is-over' : 'is-under') : 'is-normal'
        return (
          <span className={`history-diff-text ${cls}`}>
            {value > 0 ? '+' : ''}{value.toFixed(2)}%
          </span>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (date) => <span className="history-time-text">{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, record) => (
        <Space className="history-table-actions">
          <Button
            type="link"
            icon={<EyeOutlined />}
            disabled={!canOpenReport(record)}
            onClick={(event) => {
              event.stopPropagation()
              if (canOpenReport(record)) {
                navigate(`/report/${record.id}`)
              }
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              handleDelete(record.id)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const statusFilterLabel =
    statusFilter === 'over_excavation'
      ? '超挖'
      : statusFilter === 'under_excavation'
        ? '欠挖'
        : statusFilter === 'within_tolerance'
          ? '合格'
          : '全部状态'

  return (
    <div>
      <div className="page-header">
        <Title level={4} className="page-title">
          历史记录
        </Title>
        <Space wrap className="page-actions">
          <span className="history-summary">筛选：{statusFilterLabel} · 共 {totalCount} 条</span>
          {searchKeyword && <span className="history-summary">关键词：{searchKeyword}</span>}
          <Input.Search
            placeholder="输入 ID 或关键词"
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={handleSearchSubmit}
            className="history-search-input"
          />
          <Select
            placeholder="筛选状态"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            className="history-filter-select"
          >
            <Option value="over_excavation">超挖</Option>
            <Option value="under_excavation">欠挖</Option>
            <Option value="within_tolerance">合格</Option>
          </Select>
          <Button
            icon={<ReloadOutlined spin={isLoadingList} />}
            onClick={() => fetchAnalyses(currentPage, statusFilter, searchKeyword)}
            loading={isLoadingList}
          >
            刷新
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={exportCurrentPage}
            disabled={analyses.length === 0}
          >
            导出当前页
          </Button>
        </Space>
      </div>

      <Card bordered={false} className="card-surface data-table-card">
        <Table
          columns={columns}
          dataSource={analyses}
          rowKey="id"
          loading={isLoadingList}
          size="middle"
          scroll={{ x: 980 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史记录" />,
          }}
          rowClassName={(record) => (canOpenReport(record) ? 'table-row-clickable' : 'table-row-disabled')}
          onRow={(record) => ({
            onClick: () => {
              if (canOpenReport(record)) {
                navigate(`/report/${record.id}`)
              }
            },
            style: { cursor: canOpenReport(record) ? 'pointer' : 'default' },
          })}
          pagination={{
            total: totalCount,
            current: currentPage,
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (totalItems) => `共 ${totalItems} 条记录`,
            onChange: (page) => fetchAnalyses(page, statusFilter, searchKeyword),
          }}
        />
      </Card>
    </div>
  )
}

export default History
