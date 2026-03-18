# Confluence 智能文档问答系统

## 项目简介

Confluence QA Assistant 是一个基于 RAG（Retrieval Augmented Generation）技术的智能文档问答系统。它能从公司 Confluence 知识库中检索相关文档，并生成准确且有据可查的回答。

## 核心功能

### 智能问答
用户可以用自然语言提问，系统会自动：
1. 理解用户意图（意图识别）
2. 改写问题以提高检索精度（Query Rewriting）
3. 从向量数据库中检索相关文档片段
4. 基于检索到的内容生成回答，并标注引用来源

### 支持的问题类型
- **知识查询**："VPN 怎么配置？"
- **流程咨询**："新人入职需要做哪些事？"
- **技术问题**："Kafka 消费者组 rebalance 怎么处理？"
- **比较分析**："Alpha 项目和 Beta 项目的技术栈有什么区别？"

## 技术架构

### 数据索引流水线
```
Confluence 文档 → HTML 清洗 → Markdown 转换 → 智能分块 → 向量化 → Pinecone 存储
```

### 查询处理流水线
```
用户问题 → 意图识别 + 查询改写 → 向量检索 → 相似度过滤 → Prompt 组装 → LLM 生成 → 流式输出
```

### 技术栈
- **前端**：Next.js 15 + React 19 + TypeScript
- **向量数据库**：Pinecone（Serverless）
- **Embedding 模型**：OpenAI text-embedding-3-small / Qwen text-embedding-v4
- **LLM**：GPT-4o-mini / Qwen-max（可切换）
- **部署**：阿里云 ECS

## 关键设计决策

### 智能分块策略
系统基于 Markdown AST（抽象语法树）进行分块，而非简单的按 token 数切分：
- **Section 级别**：按标题层级（h1/h2/h3）分块
- **Node 级别**：代码块和表格作为原子单元，不拆分
- **Token 级别**：超长文本按 300-800 token 阈值进一步切分

### 增量更新
使用 ETag + 版本号做变更检测，日常更新只处理变更文档，计算量减少 90% 以上。

### 多级检索策略
- 主阈值 0.75：保证检索精度
- 降级阈值 0.6：覆盖率兜底
- Top-1 兜底：避免空回答

## 项目负责人

Yang Xiyue（AI Platform Tech Lead）

## 体验地址

http://119.23.182.148:3000/qa
