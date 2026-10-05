import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  request_id: string;
  user_id?: string;
  session_id?: string;
  active_role?: string;
  active_role_id?: string;
  active_facility_id?: string | null;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext | undefined => storage.getStore();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);

export const updateRequestContext = (patch: Partial<RequestContext>): void => {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
};
