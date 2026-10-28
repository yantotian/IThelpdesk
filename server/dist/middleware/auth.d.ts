import type { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: string;
        full_name: string | null;
        office: string | null;
        is_active: boolean;
        is_approved: boolean;
    };
}
export declare function generateToken(user: {
    id: string;
    username: string;
    role: string;
}): string;
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requireRole(...roles: string[]): (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare function requireAccess(rolesAllowed: string[], page: string): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
