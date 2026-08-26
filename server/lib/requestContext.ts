import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestExecutionContext {
  requestId: string;
}

const requestStorage = new AsyncLocalStorage<RequestExecutionContext>();

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function runWithRequestContext<T>(requestId: string, callback: () => T): T {
  return requestStorage.run({ requestId }, callback);
}

export function getRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}
