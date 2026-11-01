import type { AuthUser } from '../domain/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionHash?: string;
    }
  }
}

export {};
