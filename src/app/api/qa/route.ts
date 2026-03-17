import { NextRequest } from 'next/server';
import { QAEngine } from '@/lib/pipeline';
import { getPineconeStore } from '@/lib/vectorstore';
import { resolveProvider } from '@/lib/providers/modelProvider';
import type { ChatMessage } from '@/components/ChatWindow/types';

export const runtime = 'nodejs';

enum SSEEventType {
  CONTENT = 'content',
  DONE = 'done',
  ERROR = 'error',
  METADATA = 'metadata',
}

interface SSEMessage {
  type: SSEEventType;
  data: string;
  id?: string;
  retry?: number;
}

interface PerformanceMetrics {
  requestId: string;
  startTime: number;
  messageCount: number;
  errorCount: number;
}

const buildSSEMessage = (type: SSEEventType, data: string, id?: string): string => {
  const message: SSEMessage = { type, data };
  if (id) {
    message.id = id;
  }
  return `data: ${JSON.stringify(message)}\n\n`;
};

const createPerformanceMetrics = (): PerformanceMetrics => ({
  requestId: crypto.randomUUID(),
  startTime: Date.now(),
  messageCount: 0,
  errorCount: 0,
});

const logPerformanceMetrics = (metrics: PerformanceMetrics, error?: Error) => {
  const duration = Date.now() - metrics.startTime;
  console.log(JSON.stringify({
    type: 'qa_performance_metrics',
    requestId: metrics.requestId,
    duration,
    messageCount: metrics.messageCount,
    errorCount: metrics.errorCount,
    error: error?.message,
    timestamp: new Date().toISOString(),
  }));
};

const formatChatHistory = (messages: ChatMessage[]) =>
  messages
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const metrics = createPerformanceMetrics();

  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];
    const requestedProvider = typeof body?.provider === 'string' ? body.provider : undefined;
    const provider = resolveProvider(requestedProvider);

    if (!messages.length || !messages[messages.length - 1]?.content?.trim()) {
      throw new Error('Invalid request: missing messages or content.');
    }

    const latestMessage = messages[messages.length - 1];
    const chatHistory = formatChatHistory(messages.slice(0, -1));

    const store = await getPineconeStore();
    const qa = new QAEngine(store, undefined, provider);
    const { references, stream, queryTransform } = await qa.createStreamingCompletion(
      latestMessage.content,
      chatHistory,
      provider,
      { label: 'qa.prompt', requestId: metrics.requestId }
    );

    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (type: SSEEventType, data: string, id?: string) => {
          controller.enqueue(encoder.encode(buildSSEMessage(type, data, id)));
        };

        try {
          send(
            SSEEventType.METADATA,
            JSON.stringify({
              requestId: metrics.requestId,
              references,
              provider,
              queryTransform: queryTransform ? {
                intent: queryTransform.intent,
                queries: queryTransform.queries,
              } : undefined,
            })
          );

          let chunkIndex = 0;
          for await (const chunk of stream) {
            const token = chunk.choices?.[0]?.delta?.content ?? '';
            if (!token) {
              continue;
            }

            metrics.messageCount += 1;
            send(
              SSEEventType.CONTENT,
              token,
              `${metrics.requestId}-chunk-${chunkIndex}`
            );
            chunkIndex += 1;
          }

          send(SSEEventType.DONE, '', `${metrics.requestId}-done`);
          controller.close();
          logPerformanceMetrics(metrics);
        } catch (error) {
          metrics.errorCount += 1;
          send(
            SSEEventType.ERROR,
            (error as Error).message ?? 'Unknown error',
            `${metrics.requestId}-error`
          );
          controller.close();
          logPerformanceMetrics(metrics, error as Error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    metrics.errorCount += 1;
    logPerformanceMetrics(metrics, error as Error);

    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (type: SSEEventType, data: string, id?: string) => {
          controller.enqueue(encoder.encode(buildSSEMessage(type, data, id)));
        };

        const errorMessage = (error as Error)?.message ?? 'Unable to answer the question at this time.';
        send(
          SSEEventType.ERROR,
          errorMessage,
          `${metrics.requestId}-error`
        );
        send(SSEEventType.DONE, '', `${metrics.requestId}-done`);
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
