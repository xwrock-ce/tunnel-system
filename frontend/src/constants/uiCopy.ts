export const UI_COPY = {
  dashboard: {
    emptyDashboard: {
      title: '暂无仪表盘数据',
      description: '请先上传并完成分析任务后再查看仪表盘。',
    },
    trendLoading: {
      title: '趋势计算中',
    },
    trendEmpty: {
      title: '暂无趋势数据',
      description: '请先上传分析图像，生成趋势序列。',
    },
    distributionLoading: {
      title: '统计计算中',
    },
    distributionEmpty: {
      title: '暂无统计数据',
      description: '当前没有可用的偏差统计样本。',
    },
    latestEmpty: {
      title: '暂无分析记录',
      description: '请先上传图像并完成分析。',
    },
  },
  history: {
    header: {
      title: '历史记录',
      description: '集中检索分析结果，支持状态筛选、关键词定位与当前页导出。',
    },
    summary: {
      filterPrefix: '筛选',
      keywordPrefix: '关键词',
      totalSuffix: '条',
    },
    actions: {
      saveCurrentFilter: '保存当前筛选',
      savedSuccess: '已保存当前筛选',
    },
    filters: {
      searchPlaceholder: '输入 ID 或关键词',
      statusPlaceholder: '筛选状态',
      all: '全部状态',
      allSimple: '全部',
      over: '超挖',
      under: '欠挖',
      normal: '合格',
    },
    tableEmpty: {
      title: '暂无历史记录',
      description: '暂无符合当前筛选条件的任务。',
    },
  },
  realtime: {
    taskLoading: {
      title: '任务列表加载中',
      description: '正在同步当前活跃任务。',
    },
    taskEmpty: {
      title: '当前没有活跃任务',
      description: '系统目前处于空闲状态。',
    },
    systemLoading: {
      title: '系统状态加载中',
      description: '正在读取设备与模型信息。',
    },
    systemError: {
      title: '无法获取系统状态',
      description: '请检查后端连接或稍后重试。',
    },
  },
  report: {
    loading: {
      title: '分析报告加载中',
      description: '正在读取图像与量化指标，请稍候。',
    },
    loadError: {
      title: '加载失败',
      fallbackDescription: '加载报告失败，请稍后重试。',
    },
    empty: {
      title: '暂无数据',
      description: '未获取到有效分析记录。',
    },
    taskFailed: {
      title: '分析失败',
      fallbackDescription: '任务执行失败，请稍后重试。',
    },
    imageEmpty: {
      title: '暂无图像数据',
      description: '当前分析未输出可展示图像。',
    },
    actions: {
      backToList: '返回列表',
      exportReport: '导出报告',
    },
    header: {
      titlePrefix: '分析报告 #',
    },
    cards: {
      visual: '智能视觉分析',
      excavationMetrics: '超欠挖量化指标',
      crackMetrics: '裂缝病害统计',
      metadata: '分析元数据',
    },
    stats: {
      excavationDeviation: '开挖面积偏差',
      crackCount: '识别数量',
      crackMaxLength: '最大长度',
    },
  },
  upload: {
    shared: {
      pageTitle: '上传分析',
      tabs: {
        single: '单张分析',
        batch: '批量分析',
      },
      resultCardTitle: '分析结果',
      detailButtons: {
        viewReport: '查看报告',
        restart: '新分析',
      },
      preview: {
        original: '原始图片',
        segmented: '分割视图',
        combined: '综合叠加',
        face: '掌子面',
        crack: '裂缝',
      },
      analysisSummaryTitle: '超欠挖分析',
      cards: {
        singleImage: '选择图片',
        batchImages: '选择图片（最多 50 张）',
        config: '分析参数',
      },
      configNote: '默认值可在系统设置中修改',
      fields: {
        designAreaLabel: '设计面积 (m²)',
        designAreaTooltip: '隧道设计轮廓面积',
        scaleLabel: '比例尺 (mm/pixel)',
        scaleTooltip: '图像像素与实际尺寸的对应关系',
      },
      buttons: {
        startSingle: '开始分析',
        startBatch: '开始批量分析',
        analyzing: '分析中…',
        submitting: '提交中…',
        viewHistory: '查看历史记录',
        clear: '清空',
      },
      selectedFilesText: (count: number) => `已选择 ${count} 张图片`,
    },
    face: {
      pageTitle: '掌子面分割',
      alert: {
        message: '掌子面分割功能',
        description: '上传隧道掌子面图片，系统将自动识别掌子面区域并计算超/欠挖情况。使用 YOLOv11 + SAM2 深度学习模型进行精确分割。',
      },
      status: {
        singleMode: '单张模式',
        batchMode: '批量模式',
        selectedPrefix: '已选文件：',
        active: '分析进行中',
        idle: '待开始',
      },
      tabs: {
        single: '单张分析',
        batch: '批量分析',
      },
      resultCardTitle: '分析结果',
      detailButtons: {
        viewReport: '查看报告',
        restart: '新分析',
      },
      preview: {
        original: '原始图片',
        result: '掌子面分割结果',
      },
      cards: {
        singleImage: '选择隧道掌子面图片',
        batchImages: '选择图片（最多 50 张）',
        config: '分析参数',
      },
      buttons: {
        startSingle: '开始掌子面分割',
        startBatch: '开始批量分割',
        analyzing: '分析中…',
        submitting: '提交中…',
        viewHistory: '查看历史记录',
        clear: '清空',
      },
    },
    crack: {
      pageTitle: '裂缝检测',
      alert: {
        message: '裂缝检测功能',
        description: '上传混凝土表面图片，系统将自动检测裂缝位置并标记。使用 YOLOv11 深度学习模型进行精确检测，支持多种裂缝类型识别。',
      },
      status: {
        singleMode: '单张模式',
        batchMode: '批量模式',
        selectedPrefix: '已选文件：',
        active: '检测进行中',
        idle: '待开始',
      },
      tabs: {
        single: '单张检测',
        batch: '批量检测',
      },
      resultCardTitle: '检测结果',
      detailButtons: {
        viewReport: '查看报告',
        restart: '新检测',
      },
      preview: {
        original: '原始图片',
        result: '裂缝检测结果',
      },
      metrics: {
        crackCount: '检测到的裂缝数量',
        confidence: '检测置信度',
        areaPixels: '检测区域像素',
      },
      crackDetected: {
        message: '检测到裂缝',
        description: (count: number) => `在图片中检测到 ${count} 条裂缝，建议进行进一步检查和维护。`,
      },
      cards: {
        singleImage: '选择混凝土表面图片',
        batchImages: '选择图片（最多 50 张）',
        config: '检测设置',
      },
      configAlert: {
        single: {
          message: '自动检测',
          description: '系统将使用预训练的 YOLOv11 模型自动检测图片中的裂缝，无需额外参数设置。',
        },
        batch: {
          message: '批量自动检测',
          description: '所有图片将使用相同的检测模型进行处理，结果可在历史记录中查看。',
        },
      },
      buttons: {
        startSingle: '开始裂缝检测',
        startBatch: '开始批量检测',
        detecting: '检测中…',
        submitting: '提交中…',
        viewHistory: '查看历史记录',
        clear: '清空',
      },
    },
    taskFailed: {
      title: '分析失败',
      fallbackDescription: '任务执行失败，请稍后重试。',
      actionText: '重新分析',
    },
    crackTaskFailed: {
      title: '检测失败',
      fallbackDescription: '任务执行失败，请稍后重试。',
      actionText: '重新检测',
    },
    taskProcessing: {
      title: '任务处理中',
      description: '系统正在执行综合分析，请稍候。',
    },
    faceTaskProcessing: {
      title: '任务处理中',
      description: '系统正在执行掌子面分割，请稍候。',
    },
    crackTaskProcessing: {
      title: '任务处理中',
      description: '系统正在执行裂缝检测，请稍候。',
    },
    batchStarted: {
      title: '批量任务已启动',
      description: (count: number) => `已提交 ${count} 张图片，任务将在后台依次处理。`,
      faceDescription: (count: number) => `已提交 ${count} 张图片进行掌子面分割，任务将在后台依次处理。`,
      crackDescription: (count: number) => `已提交 ${count} 张图片进行裂缝检测，任务将在后台依次处理。`,
      actions: {
        viewHistory: '去历史记录查看',
        continueUpload: '继续批量上传',
      },
    },
  },
} as const
