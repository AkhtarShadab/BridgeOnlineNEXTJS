import { nanoid } from 'nanoid';

/**
 * Generate a unique invite code for a game room
 * Format: 6-10 uppercase alphanumeric characters
 */
export function generateInviteCode(): string {
    return nanoid(8).toUpperCase();
}

/**
 * Validate invite code format
 */
export function isValidInviteCode(code: string): boolean {
    return /^[A-Z0-9]{6,10}$/.test(code);
}
