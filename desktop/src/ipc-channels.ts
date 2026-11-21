/** The IPC allow-list: preload can only invoke these, and main only answers these. */
export const INVOKE = [
  'auth:save-refresh-token',
  'auth:refresh',
  'auth:logout',
  'network:is-online',
  'offline:topics',
  'offline:random-problem',
  'offline:problem',
  'offline:hints',
  'offline:solution',
  'offline:run',
  'offline:submit',
] as const;
export type InvokeChannel = (typeof INVOKE)[number];

/** main → renderer events. */
export const EVENTS = { network: 'network:changed', menu: 'menu:action' } as const;
export const CONFIG_SYNC = 'config:get';
