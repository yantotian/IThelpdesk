import postgres from 'postgres';
export declare const sql: postgres.Sql<{}>;
export declare function testConnection(): Promise<boolean>;
