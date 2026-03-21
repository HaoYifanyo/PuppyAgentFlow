/**
 * Extract string ID from MongoDB _id field.
 * Handles both plain string IDs and MongoDB extended JSON format {$oid: "..."}.
 */
export function extractId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id.$oid) return id.$oid;
  return String(id);
}
