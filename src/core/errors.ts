export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new ApiError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission for this operation') => new ApiError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (message: string, details?: unknown) => new ApiError(409, 'CONFLICT', message, details),
  tooMany: (message = 'Too many requests') => new ApiError(429, 'RATE_LIMITED', message),
  internal: (message = 'Unexpected error') => new ApiError(500, 'INTERNAL_ERROR', message)
};
