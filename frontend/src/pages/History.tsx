import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Card, Table, Tag, Button, Space, Modal, Select, Typography, message, Input
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
  const [searchText, setSearchText] = useState<string>('')

  const {
    analyses,
    totalCount,
    currentPage,
    isLoadingList,
    fetchAnalyses,
    deleteAnalysis,
  } = useAnalysisStore()

  // Initialize search from navigation state
  useEffect(() => {
    if (location.state?.search) {
      setSearchText(location.state.search)
      // Clear state so it doesn't persist on refresh/re-nav unnecessarily
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  useEffect(() => {
    fetchAnalyses(1, statusFilter, searchText)
  }, [fetchAnalyses, statusFilter, searchText])

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

  const escapeCsv = (val: string) => {
    if (val.includes('"') || val.includes(',') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const exportCurrentPage = () => {
    const headers = ['ID', '分析状态', '超欠挖状态', '实际面积(m²)', '偏差(%)', '创建时间']
    const rows = analyses.map((a) => [
      String(a.id),
      a.status,
      a.excavation_status || '-',
      a.actual_area_m2 === undefined || a.actual_area_m2 === null ? '-' : a.actual_area_m2.toFixed(2),
      a.difference_percent === undefined || a.difference_percent === null ? '-' : a.difference_percent.toFixed(2),
      dayjs(a.created_at).format('YYYY-MM-DD HH:mm:ss'),
    ])
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n')

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
      render: (val) => (val === null || val === undefined ? '-' : `${val.toFixed(2)} m²`),
    },
    {
      title: '偏差',
      dataIndex: 'difference_percent',
      width: 100,
      render: (val) => {
        if (val === null || val === undefined) return '-'
        const color = Math.abs(val) > 2 ? (val > 0 ? 'red' : 'orange') : 'green'
        return <span style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/report/${record.id}`)
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(record.id)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} className="page-title">
          历史记录
        </Title>
        <Space wrap className="page-actions">
          <Input.Search
            placeholder="输入 ID 搜索"
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(val) => setSearchText(val)}
            style={{ width: 200 }}
          />
          <Select
            placeholder="筛选状态"
            allowClear
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
          >
            <Option value="over_excavation">超挖</Option>
            <Option value="under_excavation">欠挖</Option>
            <Option value="within_tolerance">合格</Option>
          </Select>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchAnalyses(currentPage, statusFilter, searchText)}
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

      <Card bordered={false} className="card-surface">
        <Table
          columns={columns}
          dataSource={analyses}
          rowKey="id"
          loading={isLoadingList}
          size="middle"
          rowClassName={() => 'table-row-clickable'}
          onRow={(record) => ({
            onClick: () => {
              navigate(`/report/${record.id}`)
            },
          })}
          pagination={{
            total: totalCount,
            current: currentPage,
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page) => fetchAnalyses(page, statusFilter, searchText),
          }}
        />
      </Card>
    </div>
  )
}

export default History
