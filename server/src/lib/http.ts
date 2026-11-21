/** Error that the central handler turns into the agreed OpenAPI `Error` body. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`);

/** Opaque keyset cursor: base64url of the last row's sort key. */
export const encodeCursor = (key: string) => Buffer.from(key, 'utf8').toString('base64url');

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const key = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!key) throw new HttpError(400, 'VALIDATION_ERROR', 'cursor is invalid');
  return key;
}

/** Slices an already-sorted list after `afterKey` and builds the CursorPage body. */
export function keysetPage<T, R>(
  rows: T[],
  keyOf: (row: T) => string,
  afterKey: string | undefined,
  limit: number,
  map: (row: T) => R
) {
  const start = afterKey === undefined ? 0 : rows.findIndex((r) => keyOf(r) === afterKey) + 1;
  // Unknown cursor (row deleted / tampered) → findIndex = -1 → start 0 would repeat page 1; reject instead.
  if (afterKey !== undefined && start === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'cursor is invalid');
  }
  const page = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  return {
    data: page.map(map),
    nextCursor: hasMore ? encodeCursor(keyOf(page[page.length - 1])) : null,
  };
}
