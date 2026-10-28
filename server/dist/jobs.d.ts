/**
 * Ported from the `auto-assign` Supabase edge function.
 * Assigns an unassigned ticket to the least-busy active technician.
 * Returns the technician id, or null if none is available / disabled.
 */
export declare function autoAssignTicket(ticketId: string): Promise<string | null>;
/**
 * Ported from the `sla-checker` edge function. Flags tickets past their SLA
 * deadline, notifies requester + assignee, and records the breach on the
 * timeline. Idempotent — the `sla_breached = false` guard makes repeat runs
 * no-ops.
 */
export declare function checkSlaBreaches(): Promise<number>;
/** Closes verified tickets whose 48h auto-close window has elapsed. */
export declare function autoCloseVerified(): Promise<number>;
