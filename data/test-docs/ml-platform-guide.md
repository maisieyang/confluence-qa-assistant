# ML Platform Guide

## 平台概述

公司 ML 平台为数据科学团队提供端到端的机器学习工作流支持，涵盖实验管理、特征工程、模型训练、模型部署和监控。平台基于 Kubernetes 构建，支持 GPU 计算。

### 平台组件

| 组件 | 工具 | 版本 | 用途 |
|------|------|------|------|
| 实验管理 | MLflow | 2.10 | 实验跟踪、模型注册 |
| 笔记本 | JupyterHub | 4.0 | 交互式开发环境 |
| 特征工程 | Feast | 0.36 | Feature Store |
| 模型训练 | Ray | 2.9 | 分布式训练框架 |
| 模型服务 | Triton Inference Server | 24.01 | 高性能推理服务 |
| 流水线 | Kubeflow Pipelines | 2.0 | ML 工作流编排 |
| 监控 | Evidently | 0.4 | 模型漂移监控 |

### 访问方式

| 服务 | URL | 认证 |
|------|-----|------|
| JupyterHub | https://jupyter.internal.company.com | LDAP SSO |
| MLflow | https://mlflow.internal.company.com | LDAP SSO |
| Kubeflow | https://kubeflow.internal.company.com | LDAP SSO |
| Grafana ML 看板 | https://grafana.internal.company.com/d/ml-overview | LDAP SSO |

## 实验管理

### MLflow 使用规范

所有 ML 实验必须通过 MLflow 记录，确保实验可复现：

```python
import mlflow

# 设置实验名称（按项目分组）
mlflow.set_experiment("payment-fraud-detection")

with mlflow.start_run(run_name="xgboost-v3-feature-selection"):
    # 记录参数
    mlflow.log_params({
        "model_type": "xgboost",
        "n_estimators": 500,
        "max_depth": 6,
        "learning_rate": 0.1,
        "feature_set": "v3",
    })

    # 训练模型
    model = train_model(X_train, y_train, params)

    # 记录指标
    metrics = evaluate_model(model, X_test, y_test)
    mlflow.log_metrics({
        "accuracy": metrics["accuracy"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1_score": metrics["f1"],
        "auc_roc": metrics["auc_roc"],
    })

    # 记录模型
    mlflow.sklearn.log_model(model, "model")

    # 记录特征重要性图
    mlflow.log_artifact("feature_importance.png")
```

### 实验命名规范

- **实验名称**: `{team}-{project}-{task}`，如 `ml-payment-fraud-detection`
- **运行名称**: `{model_type}-{version}-{description}`，如 `xgboost-v3-feature-selection`
- **模型注册名称**: `{project}_{model_type}`，如 `fraud_detection_xgboost`

### 模型注册流程

1. 数据科学家在 MLflow 中选择最佳实验运行
2. 将模型注册到 MLflow Model Registry
3. 模型进入 `Staging` 阶段，触发自动验证：
   - A/B 测试数据集上的性能验证
   - 推理延迟测试 (P99 < 50ms)
   - 内存使用评估
4. 验证通过后，由 ML Lead 审批升级到 `Production`
5. 升级后自动触发模型部署流水线

## Feature Store

### Feast 架构

```
Online Store: Redis (低延迟在线特征查询)
Offline Store: S3 Parquet (批量特征用于训练)
Registry: S3 (特征定义元数据)
```

### 核心特征集

| 特征集 | 实体 | 特征数 | 更新频率 | 用途 |
|--------|------|--------|---------|------|
| user_profile_features | user_id | 25 | 每日 | 用户画像 |
| user_behavior_features | user_id | 40 | 每小时 | 用户行为分析 |
| transaction_features | user_id | 30 | 实时 | 交易风控 |
| merchant_features | merchant_id | 20 | 每日 | 商户评分 |
| device_features | device_id | 15 | 实时 | 设备指纹 |

### 特征定义示例

```python
from feast import Entity, Feature, FeatureView, FileSource, ValueType
from datetime import timedelta

# 定义实体
user = Entity(
    name="user_id",
    value_type=ValueType.STRING,
    description="User identifier",
)

# 定义数据源
user_behavior_source = FileSource(
    path="s3://company-feature-store/user_behavior/*.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

# 定义特征视图
user_behavior_fv = FeatureView(
    name="user_behavior_features",
    entities=[user],
    ttl=timedelta(hours=24),
    schema=[
        Feature(name="total_transactions_7d", dtype=ValueType.INT64),
        Feature(name="avg_transaction_amount_7d", dtype=ValueType.DOUBLE),
        Feature(name="max_transaction_amount_7d", dtype=ValueType.DOUBLE),
        Feature(name="unique_merchants_7d", dtype=ValueType.INT64),
        Feature(name="login_count_24h", dtype=ValueType.INT64),
        Feature(name="failed_payment_count_24h", dtype=ValueType.INT64),
        Feature(name="device_change_count_7d", dtype=ValueType.INT64),
        Feature(name="location_change_count_24h", dtype=ValueType.INT64),
    ],
    source=user_behavior_source,
)
```

### 在线特征查询

```python
from feast import FeatureStore

store = FeatureStore(repo_path="feature_repo/")

# 在线推理时获取特征
features = store.get_online_features(
    features=[
        "user_behavior_features:total_transactions_7d",
        "user_behavior_features:avg_transaction_amount_7d",
        "user_behavior_features:failed_payment_count_24h",
        "user_profile_features:account_age_days",
        "user_profile_features:kyc_level",
    ],
    entity_rows=[{"user_id": "user-12345"}],
).to_dict()
```

## 模型训练

### GPU 资源申请

GPU 训练任务通过 Kubeflow Pipelines 提交到 GPU 节点池：

| GPU 类型 | 实例 | GPU 内存 | 适用场景 | 申请方式 |
|---------|------|---------|---------|---------|
| NVIDIA A10G | g5.xlarge | 24 GB | 中小模型训练/推理 | 自助 (Quota 内) |
| NVIDIA A100 40GB | p4d.24xlarge | 40 GB × 8 | 大模型训练 | 需审批 |
| NVIDIA A100 80GB | p5.48xlarge | 80 GB × 8 | LLM 微调 | 需 VP 审批 |

每个团队的 GPU 配额：
- ML Team: 8 × A10G (常驻) + 按需申请 A100
- Analytics Team: 2 × A10G (按需)
- 其他团队: 需要通过 ML Team 申请

### 分布式训练

使用 Ray 进行分布式训练：

```python
import ray
from ray import train
from ray.train.torch import TorchTrainer

# 定义训练函数
def train_func(config):
    model = build_model(config)
    dataset = load_dataset(config["data_path"])

    for epoch in range(config["epochs"]):
        train_one_epoch(model, dataset)
        metrics = evaluate(model, val_dataset)
        train.report(metrics)

# 配置分布式训练
trainer = TorchTrainer(
    train_loop_per_worker=train_func,
    train_loop_config={
        "lr": 1e-4,
        "epochs": 50,
        "batch_size": 256,
        "data_path": "s3://company-ml-data/fraud-detection/",
    },
    scaling_config=train.ScalingConfig(
        num_workers=4,
        use_gpu=True,
        resources_per_worker={"GPU": 1},
    ),
)

result = trainer.fit()
```

## 模型部署

### 部署方式

| 方式 | 工具 | 延迟要求 | 适用场景 |
|------|------|---------|---------|
| 实时推理 | Triton Inference Server | < 50ms P99 | 交易风控、推荐 |
| 批量推理 | Spark / Ray Batch | 无实时要求 | 用户画像更新、报表 |
| 边缘推理 | ONNX Runtime | < 10ms | 设备端模型 |

### Triton 部署配置

```
model_repository/
├── fraud_detection_xgboost/
│   ├── config.pbtxt
│   ├── 1/                    # Version 1
│   │   └── model.json
│   └── 2/                    # Version 2 (latest)
│       └── model.json
└── recommendation_nn/
    ├── config.pbtxt
    └── 1/
        └── model.onnx
```

config.pbtxt 示例：

```
name: "fraud_detection_xgboost"
platform: "fil"
max_batch_size: 256
input [
  {
    name: "input__0"
    data_type: TYPE_FP32
    dims: [ 95 ]  # 特征维度
  }
]
output [
  {
    name: "output__0"
    data_type: TYPE_FP32
    dims: [ 2 ]  # [正常概率, 欺诈概率]
  }
]
instance_group [
  {
    count: 2
    kind: KIND_GPU
  }
]
dynamic_batching {
  preferred_batch_size: [ 32, 64, 128 ]
  max_queue_delay_microseconds: 5000
}
```

### 模型版本管理

- 每个模型在 Triton 中可以同时加载多个版本
- 默认使用最新版本，支持指定版本调用
- A/B 测试通过 Kong 路由权重分配流量到不同版本
- 旧版本保留 7 天后自动清理

## 模型监控

### 监控指标

| 指标类别 | 指标 | 告警阈值 | 检查频率 |
|---------|------|---------|---------|
| 性能 | 推理延迟 P99 | > 100ms → P2 | 实时 |
| 性能 | QPS | < 预期 50% → P2 | 实时 |
| 数据 | 特征漂移 (PSI) | > 0.2 → P2 | 每小时 |
| 数据 | 预测分布漂移 | KL divergence > 0.1 → P2 | 每小时 |
| 业务 | 欺诈检测准确率 | 下降 > 5% → P1 | 每日 |
| 业务 | 推荐点击率 | 下降 > 10% → P2 | 每日 |
| 系统 | GPU 利用率 | > 90% 持续 30min → P2 | 实时 |
| 系统 | GPU 内存使用 | > 85% → P2 | 实时 |

### Evidently 监控配置

```python
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset, TargetDriftPreset

# 每小时运行的漂移检测
drift_report = Report(metrics=[
    DataDriftPreset(),
    TargetDriftPreset(),
])

drift_report.run(
    reference_data=training_data,
    current_data=last_hour_predictions,
)

# 检查是否有显著漂移
drift_detected = drift_report.as_dict()["metrics"][0]["result"]["dataset_drift"]
if drift_detected:
    send_alert("Model drift detected for fraud_detection model")
```

### 模型重训练策略

| 触发条件 | 重训练方式 | 审批要求 |
|---------|-----------|---------|
| 定期 (每月) | 全量重训练 | 自动 |
| 特征漂移 PSI > 0.2 | 增量训练 | ML Lead 审批 |
| 业务指标下降 > 5% | 紧急全量重训练 | 自动，但需事后审查 |
| 新特征上线 | 全量重训练 + A/B 测试 | ML Lead 审批 |
