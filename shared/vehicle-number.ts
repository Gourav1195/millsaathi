/** Indian vehicle registration number — input, validation, and display helpers. */

export const VEHICLE_NUMBER_MAX_LENGTH = 10;

export const VEHICLE_NUMBER_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{1,4}$/;

export const VEHICLE_NUMBER_PLACEHOLDER = 'e.g. UP32RN5761';

export const VEHICLE_NUMBER_ERROR = 'Please enter a valid Indian vehicle number (e.g., DL01CA1234).';

/** Strip spaces and non-alphanumeric characters; uppercase; enforce max length. */
export function sanitizeVehicleNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, VEHICLE_NUMBER_MAX_LENGTH);
}

export function isValidVehicleNumber(value: string): boolean {
  return VEHICLE_NUMBER_REGEX.test(sanitizeVehicleNumber(value));
}

/** Returns normalized vehicle number, or null if invalid. */
export function normalizeVehicleNumber(value: string): string | null {
  const sanitized = sanitizeVehicleNumber(value);
  return VEHICLE_NUMBER_REGEX.test(sanitized) ? sanitized : null;
}

/** Format a stored vehicle number for display (e.g. UP32RN5761 → UP 32 RN 5761). */
export function formatVehicleNumber(value: string | null | undefined): string {
  if (!value) return '—';
  const sanitized = sanitizeVehicleNumber(value);
  const match = sanitized.match(/^([A-Z]{2})([0-9]{2})([A-Z]{1,2})([0-9]{1,4})$/);
  if (!match) return value;
  return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}
