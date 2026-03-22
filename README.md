# Document QA Assistant

基于 RAG（Retrieval-Augmented Generation）的智能文档问答系统。支持 Confluence 页面和本地 Markdown 文档，通过向量检索 + BM25 混合搜索 + 重排序，提供高精度的流式问答体验。


## Architecture

```
                          Ingestion
                             │
                    chunkPageParentChild()
                       ┌─────┴─────┐
                    Parents      Children
                    (300-800t)   (100-200t)
                       │            │
              ┌────────┤            │
              ▼        ▼            ▼
        Parent Store  BM25       Pinecone
          (.json)    Index      (vectors)
              │        │            │
              │     Query           │
              │        │            │
              │   ┌────┴────┐      │
              │   ▼         ▼      │
              │ BM25     Dense     │
              │ search   search    │
              │   │         │      │
              │   │  expandToParents()
              │   │         │      │
              │   └────┬────┘
              │        ▼
              │    RRF Fusion → Rerank → LLM
```

### Parent-Child Retrieval

系统采用双层分块策略，解耦检索粒度和上下文粒度：

- **Child chunks (~100-200 tokens)**: 嵌入 Pinecone，语义密集，检索精度高
- **Parent chunks (~300-800 tokens)**: 存储在本地 JSON，命中后扩展送入 LLM，上下文完整
- **BM25 索引 parent 粒度**: 关键词搜索受益于更大的文本量

### Hybrid Search Pipeline

1. **Query Transform** — 意图分类 + 查询改写 + 多查询分解
2. **Dense Search** — Pinecone 向量检索 (child level) → parent 扩展
3. **Sparse Search** — BM25 关键词搜索 (parent level)
4. **RRF Fusion** — Reciprocal Rank Fusion 合并两路结果
5. **Rerank** — Jina Cross-Encoder 重排序
6. **Generation** — LLM 流式生成带引用的回答

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Pinecone 账号和索引

### Environment Variables

创建 `.env.local`：

```bash
# Required — Vector Store
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=your-index-name

# Required — LLM Provider (choose one)
OPENAI_API_KEY=your-openai-key          # OpenAI provider
QWEN_API_KEY=your-qwen-key              # Qwen provider (default)

# Optional — Reranker
JINA_API_KEY=your-jina-key              # Jina reranker (recommended)

# Optional — Retrieval tuning
PINECONE_NAMESPACE=default
RETRIEVAL_TOP_K=15                      # Candidates before reranking
RERANK_ENABLED=true
BM25_ENABLED=true
RRF_K=60                                # RRF fusion constant
SIMILARITY_THRESHOLD=0.65
RERANK_SCORE_THRESHOLD=0.5

# Optional — Provider model overrides
LLM_PROVIDER=qwen                       # openai | qwen
CHAT_MODEL=qwen-max
EMBEDDING_MODEL=text-embedding-v4

# Optional — Confluence (for live ingestion)
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_TOKEN=your-token
CONFLUENCE_SPACE_KEY=SPACE
CONFLUENCE_MAX_PAGES=5
CONFLUENCE_PAGE_LIMIT=25
```

### Install & Run

```bash
pnpm install

# Ingest local markdown docs
pnpm ingest-local

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the chat interface.

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Start Next.js dev server (Turbopack) |
| `build` | `pnpm build` | Production build |
| `ingest-local` | `pnpm ingest-local` | Ingest local markdown docs → Pinecone + BM25 + Parent Store |
| `vectorize` | `pnpm vectorize` | Ingest from Confluence → Pinecone + BM25 + Parent Store |
| `evaluate` | `pnpm evaluate` | Run RAG evaluation suite (36 test cases) |
| `verify-pinecone` | `pnpm verify-pinecone` | Check Pinecone index stats and sample query |
| `lint` | `pnpm lint` | Lint all source files |

## Project Structure

```
src/
├── app/                          # Next.js 页面 + API Routes
│   ├── page.tsx                  # 首页（Knowledge Assistant）
│   ├── layout.tsx                # 布局
│   └── api/
│       └── qa/route.ts           # QA API endpoint
│
├── components/                   # React 组件（16个）
│   ├── ChatWindow/               # 核心聊天窗口组件
│   │   ├── ChatWindow.tsx
│   │   └── types.ts
│   ├── MessageBubble.tsx         # 消息气泡
│   ├── MarkdownRenderer.tsx      # Markdown 渲染
│   ├── EnhancedMarkdownRenderer.tsx
│   ├── QAReferenceList.tsx       # 引用列表
│   ├── SendButton.tsx            # 发送按钮
│   ├── ThemeSelector.tsx         # 主题选择
│   ├── ErrorBoundary.tsx         # 错误边界
│   ├── ErrorMessage.tsx          # 错误提示
│   ├── CodeCopyButton.tsx        # 代码复制
│   ├── MessageFeedback.tsx       # 消息反馈
│   ├── CollapsibleSection.tsx    # 可折叠区域
│   ├── ScrollToBottomButton.tsx  # 滚动到底部
│   ├── CalloutBox.tsx            # 提示框
│   ├── VisualSeparator.tsx       # 视觉分隔
│   └── MarkdownComponents.tsx    # Markdown 子组件
│
├── hooks/                        # 自定义 Hooks（4个）
│   ├── useChat.ts                # 聊天逻辑（核心）
│   ├── useTheme.ts               # 主题管理
│   ├── useDarkMode.ts            # 暗色模式
│   └── useAutoScroll.ts          # 自动滚动
│
├── lib/                          # 后端逻辑
│   ├── confluence/               # Confluence 数据源
│   │   ├── client.ts             # API 客户端
│   │   ├── chunk.ts              # 分块逻辑（核心）
│   │   ├── clean.ts              # 数据清洗
│   │   └── types.ts              # 类型定义
│   ├── pipeline/                 # RAG Pipeline（核心）
│   │   ├── qa.ts                 # 问答主流程
│   │   ├── queryTransform.ts     # 查询改写 + 意图分类
│   │   ├── contextManager.ts     # 上下文管理
│   │   ├── reranker.ts           # 重排序
│   │   ├── qaObservation.ts      # 可观测性日志
│   │   ├── loader.ts             # 文档加载
│   │   ├── evaluate.ts           # 评测
│   │   ├── build.ts              # 索引构建
│   │   ├── vectorCache.ts        # 向量缓存
│   │   └── vectorLog.ts          # 日志
│   ├── search/                   # 检索
│   │   ├── bm25.ts               # BM25 关键词检索
│   │   ├── fusion.ts             # RRF 混合检索
│   │   └── tokenizer.ts          # 分词器
│   ├── vectorstore/              # 向量存储
│   │   ├── pineconeStore.ts      # Pinecone 操作
│   │   └── parentStore.ts        # Parent-Child 存储
│   ├── embeddings/               # Embedding
│   │   └── index.ts
│   ├── providers/                # 模型 Provider
│   │   ├── modelProvider.ts      # 多 Provider 抽象层
│   │   └── types.ts
│   └── prompts/                  # Prompt 模板
│       ├── systemPrompts.ts
│       └── unifiedPrompt.ts
│
├── utils/                        # 工具函数
│   ├── markdownPreprocessor.ts   # Markdown 预处理
│   └── astMarkdownProcessor.ts   # AST Markdown 处理
│
└── styles/                       # 样式文件

scripts/                          # 独立脚本
├── vectorize.ts                  # 向量化
├── evaluate.ts                   # 评测运行
├── ingest-local-docs.ts          # 本地文档导入
├── clearEmbeddings.ts            # 清理 Embedding
└── verify-pinecone.ts            # Pinecone 验证

data/
├── test-docs/               # 29 markdown test documents (short + long)
├── eval-test-cases.json     # 36 evaluation test cases
├── bm25-index.json          # BM25 inverted index (generated)
└── parent-store.json        # Parent chunk content store (generated)
```

## Evaluation

Run the evaluation suite:

```bash
pnpm evaluate
```

Evaluates 36 test cases across factual, how-to, comparison, and general categories. Uses LLM-as-judge to score:

| Metric | Description | Current Score |
|--------|-------------|---------------|
| **Faithfulness** | Are answer claims supported by retrieved context? | 0.954 |
| **Relevancy** | Does the answer address the question? | 0.954 |
| **Context Precision** | Is the retrieved context relevant? | 0.939 |

Report saved to `logs/eval-report.json`.

## Key Design Decisions

- **Cross-section merging**: Adjacent small sections (headings, code blocks, tables) are merged into 300-800 token parents, preventing fragmented chunks
- **Graceful degradation**: If parent store is unavailable, `expandToParents()` passes through child results unchanged
- **Incremental ingestion**: Both BM25 index and parent store support page-level incremental updates, avoiding full rebuilds
