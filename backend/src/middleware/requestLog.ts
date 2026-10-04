import type { Request, Response, NextFunction } from 'express';

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const { method, originalUrl } = req;
  const pathOnly = originalUrl.split('?')[0];
  res.on('finish', () => {
    console.info(`${method} ${pathOnly} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
}
