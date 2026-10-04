import { sql } from './db/index.js';

/**
 * Ported from the `auto-assign` Supabase edge function.
 * Assigns an unassigned ticket to the least-busy active technician.
 * Returns the technician id, or null if none is available / disabled.
 */
export async function autoAssignTicket(ticketId: string): Promise<string | null> {
  const flag = await sql`SELECT value FROM system_config WHERE key = 'auto_assign_enabled'`;
  if (flag.length > 0 && flag[0].value !== 'true') return null;

  const candidates = await sql.unsafe(
    `SELECT u.id, count(t.id) AS load
       FROM users u
       LEFT JOIN tickets t
         ON t.assigned_to = u.id
        AND t.status NOT IN ('closed', 'verified')
      WHERE u.role = 'technician' AND u.is_active = true
      GROUP BY u.id
      ORDER BY load ASC, u.created_at ASC
      LIMIT 1`,
  );
  if (candidates.length === 0) return null;

  const techId = candidates[0].id as string;

  const updated = await sql`
    UPDATE tickets
       SET assigned_to = ${techId}, status = 'assigned'
     WHERE id = ${ticketId} AND assigned_to IS NULL
    RETURNING id
  `;
  if (updated.length === 0) return null;

  // actor_id NULL => rendered as "System" on the timeline.
  await sql`
    INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, new_value)
    VALUES (${ticketId}, NULL, 'assignment', 'Auto-assigned to least-busy technician', ${techId})
  `;
  return techId;
}

/**
 * Ported from the `sla-checker` edge function. Flags tickets past their SLA
 * deadline, notifies requester + assignee, and records the breach on the
 * timeline. Idempotent — the `sla_breached = false` guard makes repeat runs
 * no-ops.
 */
export async function checkSlaBreaches(): Promise<number> {
  const breached = await sql`
    UPDATE tickets
       SET sla_breached = true
     WHERE sla_due_at < now()
       AND sla_breached = false
       AND status NOT IN ('closed', 'verified', 'resolved')
    RETURNING id, ticket_number, requester_id, assigned_to, priority
  `;
  if (breached.length === 0) return 0;

  for (const t of breached) {
    await sql`
      INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, new_value)
      VALUES (${t.id}, NULL, 'sla_breach', ${`SLA breached for ${t.priority} priority ticket`}, 'sla_breach')
    `;

    const body = `Ticket ${t.ticket_number} has breached its ${t.priority} priority SLA.`;
    const recipients = [t.requester_id, t.assigned_to].filter(
      (id, i, arr): id is string => !!id && arr.indexOf(id) === i,
    );
    for (const uid of recipients) {
      await sql`
        INSERT INTO notifications (user_id, ticket_id, type, title, body)
        VALUES (${uid}, ${t.id}, 'sla_breach', 'SLA breached', ${body})
      `;
    }
  }

  return breached.length;
}

/** Closes verified tickets whose 48h auto-close window has elapsed. */
export async function autoCloseVerified(): Promise<number> {
  const closed = await sql`
    UPDATE tickets
       SET status = 'closed', updated_at = now()
     WHERE status = 'verified'
       AND auto_close_at IS NOT NULL
       AND auto_close_at <= now()
    RETURNING id, ticket_number
  `;
  return closed.length;
}
