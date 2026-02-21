import { customAlphabet } from 'nanoid';

/**
 * Generate a unique invite code for game rooms
 * Format: 6-8 uppercase alphanumeric characters (A-Z, 0-9)
 * Example: "ABCD1234", "XYZ789"
 */
export function generateInviteCode(length: number = 8): string {
    // Use only uppercase letters and numbers (no ambiguous characters like I, O, 0, 1)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const nanoid = customAlphabet(alphabet, length);
    return nanoid();
}

/**
 * Validate invite code format
 */
export function isValidInviteCode(code: string): boolean {
    // Must be 6-10 characters, uppercase alphanumeric only
    const pattern = /^[A-Z0-9]{6,10}$/;
    return pattern.test(code);
}
