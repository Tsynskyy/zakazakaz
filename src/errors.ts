export type ErrorCode =
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_LIMIT_EXCEEDED'
  | 'ORDER_HAS_ACTIVE'
  | 'INVALID_STATE_TRANSITION'
  | 'INSUFFICIENT_STOCK'
  | 'PROMO_CODE_INVALID'
  | 'PROMO_CODE_MIN_AMOUNT'
  | 'ORDER_OWNERSHIP_VIOLATION'
  | 'VALIDATION_ERROR'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_TOKEN_INVALID'
  | 'ACCESS_DENIED'
  | 'INTERNAL_ERROR';

const HTTP_STATUS: Record<ErrorCode, number> = {
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_INACTIVE: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_LIMIT_EXCEEDED: 429,
  ORDER_HAS_ACTIVE: 409,
  INVALID_STATE_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  PROMO_CODE_INVALID: 422,
  PROMO_CODE_MIN_AMOUNT: 422,
  ORDER_OWNERSHIP_VIOLATION: 403,
  VALIDATION_ERROR: 400,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  REFRESH_TOKEN_INVALID: 401,
  ACCESS_DENIED: 403,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly errorCode: ErrorCode;
  readonly details?: unknown;

  constructor(errorCode: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = HTTP_STATUS[errorCode];
    this.details = details;
  }
}
