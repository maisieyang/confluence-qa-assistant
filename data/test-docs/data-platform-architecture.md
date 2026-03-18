# Data Platform Architecture

## 平台概述

公司的数据平台负责数据采集、存储、处理和分析全流程。平台服务于 BI 分析师、数据科学家和产品经理，日均处理数据量约 2TB，支撑公司的数据驱动决策。

### 技术栈总览

| 层级 | 组件 | 技术选型 | 版本 |
|------|------|---------|------|
| 数据采集 | CDC | Debezium | 2.4 |
| 数据采集 | Event Stream | Kafka | 3.6 |
| 数据采集 | API Ingestion | Custom Python Service | - |
| 数据存储 | Data Lake | AWS S3 (Iceberg format) | - |
| 数据存储 | Data Warehouse | ClickHouse | 23.8 |
| 数据存储 | Feature Store | Redis + S3 | - |
| 数据处理 | Batch ETL | Apache Spark on EMR | 3.5 |
| 数据处理 | Stream Processing | Flink on Kubernetes | 1.18 |
| 数据编排 | Workflow | Apache Airflow | 2.8 |
| 数据质量 | Data Quality | Great Expectations | 0.18 |
| 数据目录 | Metadata | DataHub | 0.12 |
| 数据分析 | BI | Metabase | 0.48 |
| 数据分析 | Ad-hoc Query | Jupyter Hub | 4.0 |

## 数据采集层

### CDC (Change Data Capture)

使用 Debezium 从 PostgreSQL 实时捕获数据变更，发送到 Kafka：

- **捕获的数据库**: payments_db, users_db, orders_db, inventory_db
- **Kafka Topic 命名**: `cdc.{database}.{schema}.{table}`
- **数据格式**: Avro (Schema Registry 管理)
- **延迟**: 平均 < 500ms（从数据库写入到 Kafka 可消费）

Debezium 连接器配置通过 Kafka Connect REST API 管理：

```json
{
  "name": "cdc-payments-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "pg-prod-01.internal",
    "database.port": "5432",
    "database.user": "debezium",
    "database.dbname": "payments_db",
    "topic.prefix": "cdc.payments",
    "table.include.list": "public.transactions,public.refunds,public.settlements",
    "slot.name": "debezium_payments",
    "publication.name": "dbz_payments",
    "plugin.name": "pgoutput",
    "transforms": "route",
    "transforms.route.type": "io.debezium.transforms.ByLogicalTableRouter",
    "transforms.route.topic.regex": "(.*)\\.(.*)",
    "transforms.route.topic.replacement": "cdc.$1.$2"
  }
}
```

### Event Stream

业务服务产生的事件通过 Kafka Producer SDK 直接发送：

- **核心 Topic**: `events.payment.completed`, `events.user.registered`, `events.order.placed`
- **保留策略**: 热数据 7 天（Kafka），冷数据永久（S3 Iceberg）
- **吞吐量**: 峰值 50,000 events/s

### API 数据采集

用于接入第三方数据源（如汇率、天气、社交媒体）：

- 通过 Airflow DAG 定时拉取
- 每个数据源独立的采集 Job
- 原始数据存入 S3 raw zone
- 失败自动重试 3 次，超过后发送告警

## 数据存储层

### Data Lake (S3 + Iceberg)

数据湖采用三层分区架构：

```
s3://company-data-lake/
├── raw/                    # 原始数据，保持源格式
│   ├── cdc/               # CDC 数据（Avro）
│   ├── events/            # 事件流数据（Avro）
│   └── api/               # API 采集数据（JSON）
├── curated/               # 清洗后的数据（Iceberg 表）
│   ├── dim_users/         # 用户维度表
│   ├── dim_products/      # 产品维度表
│   ├── fact_transactions/ # 交易事实表
│   └── ...
└── aggregated/            # 聚合数据（Iceberg 表）
    ├── daily_revenue/     # 日收入汇总
    ├── user_cohorts/      # 用户群组分析
    └── ...
```

Iceberg 表的优势：
- **Time Travel**: 支持查询历史快照，数据审计和回溯
- **Schema Evolution**: 安全地添加/删除/重命名列
- **Partition Evolution**: 无需重写数据即可调整分区策略
- **ACID Transactions**: 保证读写一致性

### Data Warehouse (ClickHouse)

ClickHouse 集群配置：
- **节点**: 6 个 `r6i.4xlarge`（16 vCPU / 128 GB）
- **副本**: 2 副本 × 3 分片
- **存储**: 每节点 2TB NVMe SSD
- **总数据量**: ~8TB（压缩后）

主要用途：
- 实时分析仪表板（P95 查询 < 2s）
- 产品 A/B 测试分析
- 用户行为漏斗分析
- 业务 KPI 报表

核心表引擎选择：
- **ReplacingMergeTree**: 用于维度表，支持去重更新
- **AggregatingMergeTree**: 用于预聚合表，查询性能最优
- **MergeTree**: 用于事实表，高写入吞吐

## 数据处理层

### Batch ETL (Spark)

使用 Spark on EMR 进行批量数据处理：

- **集群**: EMR 6.15，按需启动，处理完成后自动关闭
- **调度**: 通过 Airflow DAG 触发
- **典型 Job**:
  - 每日全量刷新维度表（凌晨 2:00 SGT）
  - 每小时增量合并 CDC 数据到 Iceberg 表
  - 每日计算用户特征并写入 Feature Store
  - 每周生成数据质量报告

Spark Job 标准配置：

```python
spark = SparkSession.builder \
    .appName("daily_revenue_aggregation") \
    .config("spark.sql.catalog.iceberg", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.iceberg.type", "glue") \
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    .config("spark.dynamicAllocation.enabled", "true") \
    .config("spark.dynamicAllocation.minExecutors", "2") \
    .config("spark.dynamicAllocation.maxExecutors", "20") \
    .getOrCreate()
```

### Stream Processing (Flink)

使用 Flink on Kubernetes 进行实时数据处理：

- **部署方式**: Flink Operator on Kubernetes
- **检查点**: 每 60 秒一次，存储到 S3
- **典型应用**:
  - 实时交易风控（延迟 < 100ms）
  - 实时用户行为分析（Session window 30min）
  - 实时 CDC 数据同步到 ClickHouse
  - 实时异常检测（基于统计模型）

## 数据编排

### Airflow DAG 管理

所有 DAG 定义在 `data-pipelines` Git 仓库中，通过 GitSync 自动同步到 Airflow：

```
data-pipelines/
├── dags/
│   ├── etl/
│   │   ├── daily_revenue.py
│   │   ├── hourly_cdc_merge.py
│   │   └── weekly_data_quality.py
│   ├── ml/
│   │   ├── feature_engineering.py
│   │   └── model_training.py
│   └── ingestion/
│       ├── api_exchange_rates.py
│       └── api_weather_data.py
├── plugins/
│   ├── operators/
│   └── hooks/
└── tests/
```

### DAG 命名规范

- `etl_daily_{description}`: 每日运行的 ETL Job
- `etl_hourly_{description}`: 每小时运行的 ETL Job
- `ml_{description}`: 机器学习相关流水线
- `ingestion_{source}_{description}`: 数据采集 Job
- `dq_{description}`: 数据质量检查

### 常用 Airflow 操作

```bash
# 查看 DAG 状态
airflow dags list

# 手动触发 DAG
airflow dags trigger etl_daily_revenue

# 查看 Task 日志
airflow tasks logs etl_daily_revenue transform_task 2024-03-15

# 清除失败的 Task（重试）
airflow tasks clear etl_daily_revenue -t transform_task -s 2024-03-15 -e 2024-03-15
```

Airflow Web UI: https://airflow.internal.company.com

## 数据质量

### Great Expectations 检查

每个核心数据表都有配套的数据质量检查，通过 Airflow 在 ETL 完成后自动运行：

| 检查类型 | 示例 | 失败处理 |
|---------|------|---------|
| Completeness | `expect_column_values_to_not_be_null("user_id")` | 阻止下游 Job |
| Uniqueness | `expect_column_values_to_be_unique("transaction_id")` | 阻止下游 Job |
| Freshness | `expect_table_row_count_to_be_between(min=1000)` | 告警 |
| Consistency | `expect_column_values_to_be_in_set("status", ["success", "failed", "pending"])` | 阻止下游 Job |
| Accuracy | `expect_column_mean_to_be_between("amount", 10, 1000)` | 告警 |
| Referential Integrity | `expect_column_values_to_be_in_set("user_id", user_ids_set)` | 告警 |

### 数据质量看板

Grafana 数据质量看板 (`/d/data-quality`)：
- 各表的最近检查结果（通过/失败/跳过）
- 数据新鲜度（最后更新时间）
- 历史数据质量趋势
- 失败检查的详细信息和修复指引

## 数据目录

### DataHub

DataHub 作为公司的数据目录，记录所有数据资产的元数据：

- **自动发现**: 通过 Ingestion Framework 自动从 PostgreSQL、ClickHouse、S3、Kafka 采集元数据
- **血缘追踪**: 自动追踪数据从源到目标的完整血缘关系
- **数据字典**: 每个表/字段的业务含义、owner、SLA
- **搜索发现**: 全文搜索数据资产，按标签、owner、domain 过滤
- **访问控制**: 与 LDAP 集成，按角色控制数据访问权限

DataHub URL: https://datahub.internal.company.com

### 数据 Owner 制度

每个核心数据表必须指定 Owner（团队或个人）：
- Owner 负责数据质量、Schema 变更审批、SLA 保障
- 变更数据表 Schema 需要 Owner 审批
- 数据质量告警首先通知 Owner
- 每季度进行数据资产 Review

## 安全与合规

### 数据分级

| 级别 | 描述 | 示例 | 访问控制 |
|------|------|------|---------|
| L1 - Public | 可公开的数据 | 产品目录、公开定价 | 无限制 |
| L2 - Internal | 内部使用的数据 | 销售报表、运营指标 | 需要公司账号 |
| L3 - Confidential | 敏感业务数据 | 用户行为、交易明细 | 需要数据访问审批 |
| L4 - Restricted | 高度敏感数据 | PII、支付卡号、密码哈希 | 需要 VP 级别审批 + 审计日志 |

### PII 数据处理

- L4 数据在 Data Lake 中自动脱敏（SHA-256 哈希）
- 原始 PII 仅存储在源数据库中，访问受严格的 IAM 策略控制
- 分析场景使用脱敏后的数据，需要还原时走审批流程
- 数据保留策略：PII 数据最长保留 2 年，到期自动删除

### 审计追踪

所有数据访问和操作都记录审计日志：
- ClickHouse 查询日志（`system.query_log`）
- S3 访问日志（CloudTrail）
- Jupyter Hub 用户操作日志
- Metabase 查询和仪表板访问日志

审计日志保留 1 年，由安全团队定期审查异常访问模式。
