import { SUIT_ORDER } from '../constants/cards';

export type BidSuit = 'C' | 'D' | 'H' | 'S' | 'NT';
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Bid {
    level: BidLevel;
    suit: BidSuit;
    doubled?: boolean;
    redoubled?: boolean;
}

export interface BidAction {
    type: 'bid' | 'pass' | 'double' | 'redouble';
    bid?: Bid;
    player: string; // player ID
}

export interface Contract extends Bid {
    declarer: string; // player ID
    dummy: string; // player ID
}

/**
 * Validate if a bid is higher than the current bid
 */
export function isBidHigher(newBid: Bid, currentBid: Bid | null): boolean {
    if (!currentBid) return true;

    if (newBid.level > currentBid.level) return true;
    if (newBid.level < currentBid.level) return false;

    // Same level, compare suits
    return SUIT_ORDER[newBid.suit] > SUIT_ORDER[currentBid.suit];
}

/**
 * Validate a bid action
 */
export function validateBidAction(
    action: BidAction,
    bidHistory: BidAction[],
    currentPlayer: string,
    lastBidTeam: 'NS' | 'EW' | null
): { valid: boolean; error?: string } {
    if (action.player !== currentPlayer) {
        return { valid: false, error: 'Not your turn' };
    }

    const lastBid = bidHistory.filter(b => b.type === 'bid').pop();
    const lastThreeActions = bidHistory.slice(-3);

    switch (action.type) {
        case 'bid':
            if (!action.bid) {
                return { valid: false, error: 'Bid data required' };
            }
            const currentBid = lastBid?.bid || null;
            if (!isBidHigher(action.bid, currentBid)) {
                return { valid: false, error: 'Bid must be higher than current bid' };
            }
            return { valid: true };

        case 'pass':
            return { valid: true };

        case 'double':
            if (!lastBid) {
                return { valid: false, error: 'No bid to double' };
            }
            if (lastBid.bid?.doubled || lastBid.bid?.redoubled) {
                return { valid: false, error: 'Bid already doubled/redoubled' };
            }
            // Can only double opponent's bid
            const playerTeam = getPlayerTeam(action.player);
            if (playerTeam === lastBidTeam) {
                return { valid: false, error: 'Cannot double own team' };
            }
            return { valid: true };

        case 'redouble':
            if (!lastBid || !lastBid.bid?.doubled) {
                return { valid: false, error: 'No doubled bid to redouble' };
            }
            if (lastBid.bid.redoubled) {
                return { valid: false, error: 'Already redoubled' };
            }
            // Can only redouble own team's bid
            const team = getPlayerTeam(action.player);
            if (team !== lastBidTeam) {
                return { valid: false, error: 'Cannot redouble opponent bid' };
            }
            return { valid: true };

        default:
            return { valid: false, error: 'Invalid action type' };
    }
}

/**
 * Check if bidding phase is complete (3 consecutive passes)
 */
export function isBiddingComplete(bidHistory: BidAction[]): boolean {
    if (bidHistory.length < 4) return false;
    const lastThree = bidHistory.slice(-3);
    return lastThree.every(action => action.type === 'pass');
}

/**
 * Determine the contract from bid history
 */
export function determineContract(bidHistory: BidAction[]): Contract | null {
    if (!isBiddingComplete(bidHistory)) return null;

    // Find the last bid
    const lastBidAction = [...bidHistory].reverse().find(action => action.type === 'bid');
    if (!lastBidAction || !lastBidAction.bid) return null;

    // Find who first bid this suit on the declaring team
    const contractSuit = lastBidAction.bid.suit;
    const declarerTeam = getPlayerTeam(lastBidAction.player);

    const firstBidder = bidHistory.find(action =>
        action.type === 'bid' &&
        action.bid?.suit === contractSuit &&
        getPlayerTeam(action.player) === declarerTeam
    );

    if (!firstBidder) return null;

    const declarer = firstBidder.player;
    const dummy = getPartner(declarer);

    return {
        ...lastBidAction.bid,
        declarer,
        dummy,
    };
}

/**
 * Get player's team (NS or EW)
 */
function getPlayerTeam(playerId: string): 'NS' | 'EW' {
    // This is a simplified version - in reality you'd look up the player's seat
    // For now, assume seat is encoded in playerId or passed separately
    return 'NS'; // Placeholder
}

/**
 * Get player's partner ID
 */
function getPartner(playerId: string): string {
    // Placeholder - would need actual seat/player mapping
    return playerId;
}
