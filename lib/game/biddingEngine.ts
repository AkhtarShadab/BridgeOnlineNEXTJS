/**
 * Bidding validation and logic for Bridge game
 */

import { type SeatPosition } from './gameEngine';

export type BidSuit = 'C' | 'D' | 'H' | 'S' | 'NT';
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Bid {
    player: SeatPosition;
    level?: BidLevel;
    suit?: BidSuit;
    type: 'BID' | 'PASS' | 'DOUBLE' | 'REDOUBLE';
}

/**
 * Compare two bids to determine if newBid is higher than currentBid
 */
export function isBidHigher(newBid: { level: BidLevel; suit: BidSuit }, currentBid: { level: BidLevel; suit: BidSuit } | null): boolean {
    if (!currentBid) return true;

    // Higher level is always higher
    if (newBid.level > currentBid.level) return true;
    if (newBid.level < currentBid.level) return false;

    // Same level, check suit hierarchy: C < D < H < S < NT
    const suitOrder: Record<BidSuit, number> = {
        'C': 1,
        'D': 2,
        'H': 3,
        'S': 4,
        'NT': 5,
    };

    return suitOrder[newBid.suit] > suitOrder[currentBid.suit];
}

/**
 * Validate if a bid is legal in the current game state
 */
export function validateBid(
    bid: Bid,
    gameState: any,
    currentPlayerSeat: SeatPosition
): { valid: boolean; error?: string } {
    // Check if it's the player's turn
    if (bid.player !== currentPlayerSeat) {
        return { valid: false, error: "Not your turn" };
    }

    const bidHistory = gameState.bidHistory || [];
    const currentBid = gameState.currentBid;

    if (bid.type === 'BID') {
        if (!bid.level || !bid.suit) {
            return { valid: false, error: "Invalid bid format" };
        }

        // Bid must be higher than current bid
        if (!isBidHigher({ level: bid.level, suit: bid.suit }, currentBid)) {
            return { valid: false, error: "Bid must be higher than current bid" };
        }

        return { valid: true };
    }

    if (bid.type === 'PASS') {
        return { valid: true };
    }

    if (bid.type === 'DOUBLE') {
        // Can only double opponent's bid
        if (!currentBid) {
            return { valid: false, error: "No bid to double" };
        }

        // Check if last bid was from opponent
        const lastBid = bidHistory[bidHistory.length - 1];
        if (!lastBid || lastBid.type !== 'BID') {
            return { valid: false, error: "Can only double a bid" };
        }

        // Check if already doubled
        if (gameState.doubled) {
            return { valid: false, error: "Bid already doubled" };
        }

        // Check if it's opponent's bid (not partner's)
        const isOpponent = !arePartners(bid.player, lastBid.player);
        if (!isOpponent) {
            return { valid: false, error: "Can only double opponent's bid" };
        }

        return { valid: true };
    }

    if (bid.type === 'REDOUBLE') {
        // Can only redouble if partner's bid was doubled
        if (!gameState.doubled) {
            return { valid: false, error: "No doubled bid to redouble" };
        }

        if (gameState.redoubled) {
            return { valid: false, error: "Already redoubled" };
        }

        return { valid: true };
    }

    return { valid: false, error: "Invalid bid type" };
}

/**
 * Check if two players are partners
 */
function arePartners(seat1: SeatPosition, seat2: SeatPosition): boolean {
    return (
        (seat1 === 'NORTH' && seat2 === 'SOUTH') ||
        (seat1 === 'SOUTH' && seat2 === 'NORTH') ||
        (seat1 === 'EAST' && seat2 === 'WEST') ||
        (seat1 === 'WEST' && seat2 === 'EAST')
    );
}

/**
 * Check if bidding is complete (3 consecutive passes after at least one bid)
 */
export function isBiddingComplete(bidHistory: Bid[]): boolean {
    if (bidHistory.length < 4) return false;

    // Check if there was at least one bid
    const hasBid = bidHistory.some(b => b.type === 'BID');
    if (!hasBid) return false;

    // Check last 3 bids are passes
    const lastThree = bidHistory.slice(-3);
    return lastThree.every(b => b.type === 'PASS');
}

/**
 * Determine contract from bid history
 */
export function determineContract(bidHistory: Bid[]): {
    level: BidLevel;
    suit: BidSuit;
    declarer: SeatPosition;
    doubled: boolean;
    redoubled: boolean;
} | null {
    if (!isBiddingComplete(bidHistory)) return null;

    // Find the last BID
    let lastBidIndex = -1;
    for (let i = bidHistory.length - 1; i >= 0; i--) {
        if (bidHistory[i].type === 'BID') {
            lastBidIndex = i;
            break;
        }
    }

    if (lastBidIndex === -1) return null;

    const lastBid = bidHistory[lastBidIndex];

    // Check if doubled/redoubled
    let doubled = false;
    let redoubled = false;

    for (let i = lastBidIndex + 1; i < bidHistory.length; i++) {
        if (bidHistory[i].type === 'DOUBLE') doubled = true;
        if (bidHistory[i].type === 'REDOUBLE') redoubled = true;
    }

    // Find declarer (first player of partnership to bid this suit)
    let declarer = lastBid.player;
    const partner = getPartner(lastBid.player);

    for (let i = 0; i <= lastBidIndex; i++) {
        const bid = bidHistory[i];
        if (bid.type === 'BID' && bid.suit === lastBid.suit) {
            if (bid.player === lastBid.player || bid.player === partner) {
                declarer = bid.player;
                break;
            }
        }
    }

    return {
        level: lastBid.level!,
        suit: lastBid.suit!,
        declarer,
        doubled,
        redoubled,
    };
}

/**
 * Get partner seat
 */
function getPartner(seat: SeatPosition): SeatPosition {
    const partners: Record<SeatPosition, SeatPosition> = {
        NORTH: 'SOUTH',
        SOUTH: 'NORTH',
        EAST: 'WEST',
        WEST: 'EAST',
    };
    return partners[seat];
}
