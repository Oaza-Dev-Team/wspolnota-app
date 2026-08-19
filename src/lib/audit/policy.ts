/**
 * How long the change and export register is kept (spec §4.4). Its own module
 * so the privacy notice can state the period without importing the retention
 * job, which opens a database connection on the way in.
 */
export const AUDIT_RETENTION_MONTHS = 24;
