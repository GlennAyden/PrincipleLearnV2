import { NextResponse } from 'next/server';

export class ApiError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

/**
 * Handle API errors in a consistent way
 * @param error The error to handle
 * @returns NextResponse with appropriate status code and error message
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    // Intentional API errors — safe to return the message
    console.error(`API Error [${error.statusCode}]:`, error.message);
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  // Unexpected errors — log details server-side, return generic message to client
  console.error('Internal server error:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

/**
 * Common API errors
 */
export const ApiErrors = {
  Unauthorized: () => new ApiError('Not authenticated', 401),
  Forbidden: () => new ApiError('Access denied', 403),
  NotFound: (resource: string = 'Resource') => new ApiError(`${resource} not found`, 404),
  BadRequest: (message: string = 'Invalid request') => new ApiError(message, 400),
  Conflict: (message: string = 'Resource already exists') => new ApiError(message, 409),
  TooManyRequests: () => new ApiError('Too many requests', 429),
  ServerError: (message: string = 'Internal server error') => new ApiError(message, 500)
}; 