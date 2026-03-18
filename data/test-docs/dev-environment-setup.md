# 开发环境搭建指南

## 前置要求

在开始之前，请确保你已经：
1. 拿到了公司 GitLab 账号（找 Team Lead 开通）
2. 安装并连接了 VPN（参考《VPN Setup Guide》）
3. 有一台 macOS 或 Linux 开发机（推荐 macOS + Apple Silicon）

## 基础工具安装

### Homebrew（macOS）
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 必装工具
```bash
# 开发基础
brew install git node python3 go docker

# 数据库客户端
brew install postgresql redis

# Kubernetes 工具
brew install kubectl helm kubectx

# 其他
brew install jq yq awscli
```

### Node.js 版本管理
公司项目使用不同版本的 Node.js，推荐使用 nvm 管理：
```bash
brew install nvm
nvm install 20   # 大多数项目使用 Node 20
nvm install 18   # 部分老项目使用 Node 18
```

### Python 版本管理
```bash
brew install pyenv
pyenv install 3.11
pyenv global 3.11
```

## IDE 推荐

### VS Code（推荐）
必装插件：
- ESLint
- Prettier
- GitLens
- Docker
- Go（如果做 Go 开发）
- Python（如果做 Python 开发）
- Claude Code 扩展

### JetBrains 全家桶
公司提供 JetBrains 企业授权，找 IT 申请 license。适用于 GoLand、PyCharm、WebStorm 等。

## 代码仓库

所有代码托管在内部 GitLab：https://gitlab.internal.company.com

### 克隆项目
```bash
# 配置 SSH key
ssh-keygen -t ed25519 -C "your.name@company.com"
# 将公钥添加到 GitLab: Settings → SSH Keys

# 克隆示例
git clone git@gitlab.internal.company.com:payments/payment-service.git
```

### Git 全局配置
```bash
git config --global user.name "Your Name"
git config --global user.email "your.name@company.com"
git config --global pull.rebase true
```

## Docker 开发环境

大多数服务提供 Docker Compose 配置用于本地开发：
```bash
cd payment-service
docker-compose up -d   # 启动依赖服务（PostgreSQL, Redis, Kafka）
make dev               # 启动应用（热重载模式）
```

## 常见问题

### Docker Desktop 启动失败
确保分配了足够资源：Settings → Resources → 至少 4GB 内存，2 CPU。

### npm install 失败
公司使用内部 npm registry，需要配置：
```bash
npm config set registry https://npm.internal.company.com
```

### 连不上开发数据库
检查是否连接了 VPN，开发数据库只能通过 VPN 访问。
