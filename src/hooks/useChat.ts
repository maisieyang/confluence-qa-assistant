'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '../components/ChatWindow/types';

// SSE事件类型
enum SSEEventType {
  CONTENT = 'content',
  DONE = 'done',
  ERROR = 'error', 
  METADATA = 'metadata'
}

// SSE消息接口
interface SSEMessage {
  type: SSEEventType;
  data: string;
  id?: string;
  retry?: number;
}

// 连接状态
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// 性能指标
interface PerformanceMetrics {
  requestId?: string;
  startTime: number;
  messageCount: number;
  errorCount: number;
  latency: number[];
}

interface StreamMetadata {
  requestId?: string;
  references?: Array<{
    index: number;
    title: string;
    url?: string;
  }>;
  [key: string]: unknown;
}

interface UseChatOptions {
  apiUrl: string;
  onError?: (error: Error) => void;
  onSuccess?: (message: ChatMessage) => void;
  onStart?: () => void;
  onComplete?: () => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface UseChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (input: string) => void;
  sendMessage: (content: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  retry: () => Promise<void>;
  retryCount: number;
  clearMessages: () => void;
  metrics: PerformanceMetrics;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    startTime: 0,
    messageCount: 0,
    errorCount: 0,
    latency: []
  });

  // 使用 ref 来避免循环依赖
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const streamingMessageRef = useRef<{ index: number; requestId: string } | null>(null);
  const lastPayloadRef = useRef<Record<string, unknown> | undefined>(undefined);

  // 清除消息
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setRetryCount(0);
  }, []);

  // 更新连接状态
  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    optionsRef.current.onConnectionChange?.(status);
  }, []);

  // 处理标准SSE流式响应
  const handleStreamingResponse = useCallback(async (response: Response, requestId: string) => {
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const timestamp = new Date();

    setMessages(prev => {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp,
      };
      const nextMessages = [...prev, assistantMessage];
      streamingMessageRef.current = {
        index: nextMessages.length - 1,
        requestId,
      };
      return nextMessages;
    });
    updateConnectionStatus(ConnectionStatus.CONNECTED);

    const startTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (!data.trim()) continue;

            try {
              const sseMessage: SSEMessage = JSON.parse(data);

              switch (sseMessage.type) {
                case SSEEventType.METADATA: {
                  const metadata = JSON.parse(sseMessage.data) as StreamMetadata;
                  setMetrics(prev => ({
                    ...prev,
                    requestId: metadata.requestId ?? prev.requestId,
                    startTime: Date.now()
                  }));

                  if (metadata.references || metadata.queryTransform) {
                    setMessages(prev => {
                      const context = streamingMessageRef.current;
                      if (!context || context.requestId !== requestId) {
                        return prev;
                      }

                      const { index } = context;
                      const target = prev[index];
                      if (!target) {
                        return prev;
                      }

                      const updatedMessages = [...prev];
                      updatedMessages[index] = {
                        ...target,
                        references: metadata.references ?? target.references,
                        metadata: {
                          ...(target.metadata ?? {}),
                          ...(metadata.references ? { references: metadata.references } : {}),
                          ...(metadata.queryTransform ? { queryTransform: metadata.queryTransform } : {}),
                        },
                      };
                      return updatedMessages;
                    });
                  }
                  break;
                }

                case SSEEventType.CONTENT:
                  setMessages(prev => {
                    const context = streamingMessageRef.current;
                    if (!context || context.requestId !== requestId) {
                      return prev;
                    }

                    const { index } = context;
                    const target = prev[index];
                    if (!target) {
                      return prev;
                    }

                    const updatedMessages = [...prev];
                    updatedMessages[index] = {
                      ...target,
                      content: (target.content || '') + sseMessage.data,
                    };
                    return updatedMessages;
                  });

                  setMetrics(prev => ({
                    ...prev,
                    messageCount: prev.messageCount + 1,
                    latency: [...prev.latency.slice(-9), Date.now() - startTime]
                  }));
                  break;

                case SSEEventType.DONE:
                  streamingMessageRef.current = null;
                  updateConnectionStatus(ConnectionStatus.DISCONNECTED);
                  optionsRef.current.onComplete?.();
                  return;

                case SSEEventType.ERROR:
                  streamingMessageRef.current = null;
                  setError(sseMessage.data);
                  setMetrics(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
                  updateConnectionStatus(ConnectionStatus.ERROR);
                  optionsRef.current.onError?.(new Error(sseMessage.data));
                  return;
              }
            } catch (e) {
              console.warn('Failed to parse SSE message:', data, e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      streamingMessageRef.current = null;
      updateConnectionStatus(ConnectionStatus.DISCONNECTED);
    }
  }, [updateConnectionStatus]);

  // 发送消息的核心逻辑
  const sendMessageCore = useCallback(async (
    content: string,
    currentMessages: ChatMessage[],
    payload?: Record<string, unknown>
  ) => {
    if (!content.trim() || isLoading) return;

    lastPayloadRef.current = payload;

    // 调用开始回调
    optionsRef.current.onStart?.();
    setError(null);
    updateConnectionStatus(ConnectionStatus.CONNECTING);

    // 重置性能指标
    setMetrics({
      startTime: Date.now(),
      messageCount: 0,
      errorCount: 0,
      latency: []
    });

    // 1. 添加用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };
    
    const newMessages = [...currentMessages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // 2. 发送API请求
      const response = await fetch(optionsRef.current.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          ...(payload ?? {}),
        })
      });

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const errorPayload = await response.json();
          if (errorPayload?.error) {
            errorMessage = errorPayload.error;
          }
        } catch {
          try {
            errorMessage = await response.text();
          } catch {
            // ignore secondary parsing errors
          }
        }

        streamingMessageRef.current = null;
        updateConnectionStatus(ConnectionStatus.ERROR);
        setError(errorMessage);

        setMessages(prev => {
          if (!prev.length) {
            return prev;
          }

          const updated = [...prev];
          const lastIndex = updated.length - 1;
          const lastMessage = updated[lastIndex];

          if (lastMessage?.role === 'assistant') {
            updated[lastIndex] = {
              ...lastMessage,
              content: errorMessage,
              metadata: {
                ...(lastMessage.metadata ?? {}),
                error: true,
              },
            };
          } else {
            updated.push({
              role: 'assistant',
              content: errorMessage,
              timestamp: new Date(),
              metadata: { error: true },
            });
          }

          return updated;
        });

        return;
      }

      // 3. 处理流式响应
      const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      await handleStreamingResponse(response, requestId);

      // 调用成功回调
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage) {
        optionsRef.current.onSuccess?.(lastMessage);
      }
      
    } catch (error) {
      console.error('Chat Error:', error);
      const errorObj = error as Error;
      setError(errorObj.message);
      updateConnectionStatus(ConnectionStatus.ERROR);
      
      // 调用错误回调
      optionsRef.current.onError?.(errorObj);
      
      // 添加错误消息
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, handleStreamingResponse, updateConnectionStatus]);

  // 发送消息
  const sendMessage = useCallback(async (content: string, payload?: Record<string, unknown>) => {
    lastPayloadRef.current = payload;
    await sendMessageCore(content, messages, payload);
  }, [sendMessageCore, messages]);

  // 重试机制
  const retry = useCallback(async () => {
    if (retryCount >= (optionsRef.current.maxRetries || 3)) {
      setError('Maximum retry attempts reached');
      return;
    }
    
    setRetryCount(prev => prev + 1);
    setError(null);
    
    // 重新发送最后一条用户消息
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await sendMessageCore(lastUserMessage.content, messages.slice(0, -1), lastPayloadRef.current);
    }
  }, [retryCount, messages, sendMessageCore]);

  return {
    messages,
    input,
    setInput,
    sendMessage,
    isLoading,
    error,
    connectionStatus,
    retry,
    retryCount,
    clearMessages,
    metrics
  };
}
