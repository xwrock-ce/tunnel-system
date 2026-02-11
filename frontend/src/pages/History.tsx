import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Card, Table, Tag, Button, Space, Modal, Select, Typography, message, Input,
} from 'antd'
import { EyeOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { AnalysisListItem } from '@/api/client'
import StatePanel from '@/components/feedback/StatePanel'
import { UI_COPY } from '@/constants/uiCopy'

const { Title } = Typography
const { Option } = Select

const History: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [searchInput, setSearchInput] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState<string>('')
  const [savedFilters, setSavedFilters] = useState<Array<{ key: string; label: string; status?: string; keyword: string }>>([])

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

  useEffect(() => {
    const raw = window.localStorage.getItem('history_saved_filters')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Array<{ key: string; label: string; status?: string; keyword: string }>
      if (Array.isArray(parsed)) {
        setSavedFilters(parsed.slice(0, 6))
      }
    } catch {
      // ignore
    }
  }, [])

  const persistSavedFilters = (filters: Array<{ key: string; label: string; status?: string; keyword: string }>) => {
    setSavedFilters(filters)
    window.localStorage.setItem('history_saved_filters', JSON.stringify(filters))
  }

  const handleSaveCurrentFilter = () => {
    const keyword = searchKeyword.trim()
    const statusText = statusFilter === 'over_excavation'
      ? UI_COPY.history.filters.over
      : statusFilter === 'under_excavation'
        ? UI_COPY.history.filters.under
        : statusFilter === 'within_tolerance'
          ? UI_COPY.history.filters.normal
          : UI_COPY.history.filters.allSimple

    const keywordText = keyword || '全部'
    const label = `${statusText} · ${keywordText}`
    const key = `${Date.now()}`

    const next = [{ key, label, status: statusFilter, keyword }, ...savedFilters].slice(0, 6)
    persistSavedFilters(next)
    message.success(UI_COPY.history.actions.savedSuccess)
  }

  const handleApplySavedFilter = (item: { status?: string; keyword: string }) => {
    setStatusFilter(item.status)
    setSearchInput(item.keyword)
    setSearchKeyword(item.keyword)
  }

  const handleRemoveSavedFilter = (key: string) => {
    const next = savedFilters.filter((item) => item.key !== key)
    persistSavedFilters(next)
  }

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
        return <Tag color="red">{UI_COPY.history.filters.over}</Tag>
      case 'under_excavation':
        return <Tag color="orange">{UI_COPY.history.filters.under}</Tag>
      case 'within_tolerance':
        return <Tag color="green">{UI_COPY.history.filters.normal}</Tag>
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
      ? UI_COPY.history.filters.over
      : statusFilter === 'under_excavation'
        ? UI_COPY.history.filters.under
        : statusFilter === 'within_tolerance'
          ? UI_COPY.history.filters.normal
          : UI_COPY.history.filters.all

  return (
    <div className="history-page">
      <div className="page-header">
        <div className="history-header-main">
          <Title level={4} className="page-title">
            {UI_COPY.history.header.title}
          </Title>
          <p className="history-header-desc">{UI_COPY.history.header.description}</p>
        </div>

        <div className="history-filter-panel">
          <div className="history-filter-row history-filter-row--meta">
            <span className="history-summary">{UI_COPY.history.summary.filterPrefix}：{statusFilterLabel} · 共 {totalCount} {UI_COPY.history.summary.totalSuffix}</span>
            {searchKeyword && <span className="history-summary">{UI_COPY.history.summary.keywordPrefix}：{searchKeyword}</span>}
            <Button size="small" type="text" onClick={handleSaveCurrentFilter}>
              {UI_COPY.history.actions.saveCurrentFilter}
            </Button>
          </div>

          {savedFilters.length > 0 && (
            <div className="history-filter-row history-filter-row--saved">
              {savedFilters.map((item) => (
                <span key={item.key} className="history-saved-pill">
                  <button
                    type="button"
                    className="history-saved-pill-main"
                    onClick={() => handleApplySavedFilter(item)}
                  >
                    {item.label}
                  </button>
                  <button
                    type="button"
                    className="history-saved-pill-remove"
                    onClick={() => handleRemoveSavedFilter(item.key)}
                    aria-label={`删除筛选 ${item.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="history-filter-row history-filter-row--actions">
            <Input.Search
              placeholder={UI_COPY.history.filters.searchPlaceholder}
              allowClear
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onSearch={handleSearchSubmit}
              className="history-search-input"
            />
            <Select
              placeholder={UI_COPY.history.filters.statusPlaceholder}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
              className="history-filter-select"
            >
              <Option value="over_excavation">{UI_COPY.history.filters.over}</Option>
              <Option value="under_excavation">{UI_COPY.history.filters.under}</Option>
              <Option value="within_tolerance">{UI_COPY.history.filters.normal}</Option>
            </Select>
            <Space className="history-filter-cta" wrap>
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
        </div>
      </div>

      <Card bordered={false} className="card-surface data-table-card">
        <Table
          columns={columns}
          dataSource={analyses}
          className="history-table"
          rowKey="id"
          loading={isLoadingList}
          size="middle"
          sticky
          scroll={{ x: 980 }}
          locale={{
            emptyText: (
              <StatePanel
                mode="empty"
                title={UI_COPY.history.tableEmpty.title}
                description={UI_COPY.history.tableEmpty.description}
                variant="table"
                compact
              />
            ),
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
