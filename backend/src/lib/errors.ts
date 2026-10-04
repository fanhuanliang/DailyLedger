export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function badRequest(message: string, fields?: Record<string, string>): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, fields);
}

export function notFound(message = 'Resource not found.'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, code = 'REVISION_CONFLICT'): ApiError {
  return new ApiError(409, code, message);
}

export function unprocessable(message: string, fields?: Record<string, string>): ApiError {
  return new ApiError(422, 'UNPROCESSABLE', message, fields);
}

export function forbidden(message: string, code = 'FORBIDDEN'): ApiError {
  return new ApiError(403, code, message);
}

export function isBodyParserSyntaxError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) return false;
  const status = (error as SyntaxError & { status?: unknown }).status;
  return status === 400;
}
