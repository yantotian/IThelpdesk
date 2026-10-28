export declare const PAGE_KEYS: readonly ["dashboard", "tickets", "kanban", "reports", "id-request", "id-requests", "ict-inventory", "ict-dashboard", "venues", "venue-bookings", "users", "categories", "priorities", "config", "audit", "templates"];
export declare function isBuiltinRole(role: string): boolean;
export declare function invalidateRoleCache(...names: (string | null | undefined)[]): void;
export declare function getCustomRolePages(role: string): Promise<string[]>;
export declare function hasCustomPage(role: string, page: string): Promise<boolean>;
