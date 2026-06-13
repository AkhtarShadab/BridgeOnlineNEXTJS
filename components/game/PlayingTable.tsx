"use client";

/* ============================================================
   PlayingTable.tsx
   A presentational 3D POV bridge table. NO game logic lives here —
   it renders whatever state you pass and calls onPlayCard when the
   viewer clicks a legal card. Drive every prop from your server state.

   Card format: "AS" = rank + suit, with "T" for ten (matches the
   engine's cardToString()). Seats are the compact "N" | "E" | "S" | "W".
   If your data uses "NORTH" etc., map with FULL_TO_SEAT below.
   ============================================================ */

import { useEffect, useRef, type CSSProperties } from "react";
// NOTE: import the stylesheet ONCE in app/layout.tsx (Next.js only allows global
// CSS imports from the root layout):  import "@/components/game/playing-table.css";

export type Seat = "N" | "E" | "S" | "W";
export type Trump = "S" | "H" | "D" | "C" | "NT";
type Slot = "bottom" | "left" | "top" | "right";

export const FULL_TO_SEAT: Record<string, Seat> = {
  NORTH: "N", EAST: "E", SOUTH: "S", WEST: "W",
  N: "N", E: "E", S: "S", W: "W",
};

export interface PlayedCard {
  seat: Seat;
  card: string;
}

export interface PlayingTableProps {
  /** Who is looking at the table — always rendered at the bottom. */
  viewerSeat: Seat;
  /** Declarer of the contract. Dummy defaults to declarer's partner. */
  declarer: Seat;
  trump: Trump;
  /** Optional explicit dummy seat (defaults to partnerOf(declarer)). */
  dummySeat?: Seat;
  /** True once the opening lead has been made and the dummy is face-up. */
  dummyRevealed?: boolean;

  /**
   * Face-up hands you actually hold the cards for: ALWAYS the viewer's hand,
   * and the dummy's hand once revealed. Others can be omitted (shown as backs).
   */
  hands: Partial<Record<Seat, string[]>>;
  /** Card counts for hands you don't hold (drives the number of backs). */
  handCounts?: Partial<Record<Seat, number>>;

  /** The current trick on the table. */
  trick: PlayedCard[];
  /** Whose turn it is, or null. */
  turn: Seat | null;

  /** Legal plays for the seat the viewer currently controls (glow + click gate). */
  legalCards?: string[] | null;

  tricksWon?: { NS: number; EW: number };
  names?: Partial<Record<Seat, string>>;

  /** Called with (seat, card) when the viewer clicks a legal card. */
  onPlayCard?: (seat: Seat, card: string) => void;

  /** Feature 10: vulnerability indicators on table felt (NS / EW). */
  vulnerability?: { NS: boolean; EW: boolean } | null;

  /** Feature 11: compact contract chip rendered on the felt center. */
  contract?: { level: number; suit: string; doubled?: boolean; redoubled?: boolean } | null;

  fanStyle?: "fan" | "tilt" | "flat";
  /** Table rake in degrees (30–62 looks good). */
  rake?: number;
  /** Animation speed multiplier. */
  speed?: number;
  className?: string;
}

/* ---------- pure helpers (no engine) ---------- */
const SEATS: Seat[] = ["N", "E", "S", "W"]; // clockwise
const SUIT_ORDER = ["S", "H", "C", "D"] as const; // alternating colours
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const nextSeat = (s: Seat): Seat => SEATS[(SEATS.indexOf(s) + 1) % 4];
const partnerOf = (s: Seat): Seat => SEATS[(SEATS.indexOf(s) + 2) % 4];
const isNS = (s: Seat) => s === "N" || s === "S";
const suitOf = (c: string) => c[1];
const rankOf = (c: string) => c[0];
const isRed = (s: string) => s === "H" || s === "D";
const rankVal = (r: string) => RANKS.indexOf(r);

function bySuit(cards: string[]): string[] {
  return [...cards].sort((a, b) => {
    const sa = SUIT_ORDER.indexOf(suitOf(a) as any);
    const sb = SUIT_ORDER.indexOf(suitOf(b) as any);
    if (sa !== sb) return sa - sb;
    return rankVal(rankOf(b)) - rankVal(rankOf(a));
  });
}

/* fan transform for the viewer's hand (bottom) */
function handTransform(i: number, n: number, style: string): string {
  const off = i - (n - 1) / 2;
  if (style === "flat") return `translateX(${off * 50}px)`;
  if (style === "tilt") {
    const ang = off * (44 / Math.max(n - 1, 1));
    return `rotateX(24deg) translateX(${off * 46}px) translateY(${off * off * 1.4}px) rotateZ(${ang}deg)`;
  }
  const ang = off * (52 / Math.max(n - 1, 1));
  return `translateX(${off * 47}px) translateY(${off * off * 2.0}px) rotateZ(${ang}deg)`;
}

/* mirrored fan for the dummy across the table (top) */
function dummyTransform(i: number, n: number, style: string): string {
  const off = i - (n - 1) / 2;
  if (style === "flat") return `translateX(${off * 50}px)`;
  if (style === "tilt") {
    const ang = off * (44 / Math.max(n - 1, 1));
    return `rotateX(-24deg) translateX(${off * 46}px) translateY(${off * off * 1.4}px) rotateZ(${-ang}deg)`;
  }
  const ang = off * (52 / Math.max(n - 1, 1));
  return `translateX(${off * 47}px) translateY(${off * off * 2.0}px) rotateZ(${-ang}deg)`;
}

const TRICK_POS: Record<Slot, string> = {
  bottom: "translate(-50%, 30px) translateZ(60px) scale(1.4)",
  top: "translate(-50%, -96px) translateZ(60px) scale(1.4)",
  right: "translate(36px, -34px) translateZ(60px) scale(1.4)",
  left: "translate(-138px, -34px) translateZ(60px) scale(1.4)",
};
const SLOT_ANIM: Record<Slot, string> = { bottom: "S", top: "N", right: "E", left: "W" };

/* ---------- card face ---------- */
function CardFace({ card }: { card: string }) {
  const r = rankOf(card), s = suitOf(card);
  const disp = r === "T" ? "10" : r;
  const col = isRed(s) ? "bt-red" : "bt-black";
  return (
    <div className="bt-card-face">
      <div className="bt-corner tl">
        <span className={`bt-rank ${col}`}>{disp}</span>
        <span className={`bt-pip-sm ${col}`}>{GLYPH[s]}</span>
      </div>
      <div className="bt-card-center"><span className={col}>{GLYPH[s]}</span></div>
      <div className="bt-corner tr">
        <span className={`bt-rank ${col}`}>{disp}</span>
        <span className={`bt-pip-sm ${col}`}>{GLYPH[s]}</span>
      </div>
    </div>
  );
}
const CardBack = () => <div className="bt-card-back" />;

/* ============================================================ */
export default function PlayingTable(props: PlayingTableProps) {
  const {
    viewerSeat, declarer, trump,
    dummySeat = partnerOf(declarer),
    dummyRevealed = false,
    hands, handCounts = {},
    trick, turn,
    legalCards = null,
    tricksWon = { NS: 0, EW: 0 },
    names = {},
    onPlayCard,
    vulnerability = null,
    contract = null,
    fanStyle = "fan",
    rake = 52,
    speed = 1,
    className = "",
  } = props;

  const stageRef = useRef<HTMLDivElement>(null);

  // fit the fixed 1120×700 scene into the component's box
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const s = Math.min(w / 1120, h / 700);
      el.style.setProperty("--bt-fit", s.toFixed(4));
      el.style.setProperty("--bt-handfit", Math.min(1, w / 760).toFixed(3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // viewer-relative screen slots
  const partnerSeat = partnerOf(viewerSeat);
  const screen: Record<Seat, Slot> = {
    [viewerSeat]: "bottom",
    [nextSeat(viewerSeat)]: "left",
    [partnerSeat]: "top",
    [nextSeat(partnerSeat)]: "right",
  } as Record<Seat, Slot>;

  // who can the viewer play right now?
  const viewerControlsDummy = viewerSeat === declarer && dummyRevealed;
  const interactiveSeat: Seat | null =
    turn === viewerSeat ? viewerSeat : (viewerControlsDummy && turn === dummySeat ? dummySeat : null);

  const handCount = (s: Seat) => handCounts[s] ?? hands[s]?.length ?? 13;

  const seatName = (s: Seat) =>
    names[s] ?? (s === viewerSeat ? "You" : s === partnerSeat ? "Partner" : `Opponent (${s})`);
  const seatSub = (s: Seat) =>
    s === declarer ? "Declarer" : s === dummySeat ? "Dummy" : "Defender";

  const stageStyle = {
    "--bt-tilt": `${rake}deg`,
    "--bt-speed": speed,
  } as CSSProperties;

  return (
    <div ref={stageRef} className={`bt-stage ${className}`} style={stageStyle}>
      <div className="bt-scene">
        <div className="bt-table">
          <div className="bt-felt" />

          {/* seats */}
          {SEATS.map((s) => {
            const active = turn === s;
            const opp = s !== viewerSeat && s !== partnerSeat;
            return (
              <div key={s} className={`bt-seat bt-seat-pos-${screen[s]}${active ? " active" : ""}`}>
                <div className="bt-seat-plate">
                  <div className={`bt-avatar${opp ? " ew" : ""}${dummyRevealed && s === dummySeat ? " dummy-tag" : ""}`}>{s}</div>
                  <div className="bt-seat-meta">
                    <span className="bt-seat-name">{seatName(s)}</span>
                    <span className="bt-seat-sub">{seatSub(s)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* hidden / dummy hands (everyone except the viewer) */}
          {SEATS.filter((s) => screen[s] !== "bottom").map((s) => {
            if (dummyRevealed && s === dummySeat) {
              if (screen[s] === "left" || screen[s] === "right")
                return <SideDummy key={s} cards={hands[s] ?? []} slot={screen[s]} />;
              return null; // top dummy → fixed overlay below
            }
            return <OppBacks key={s} slot={screen[s]} count={handCount(s)} />;
          })}

          {/* the current trick */}
          <div className="bt-trick">
            {trick.map((p) => {
              const slot = screen[p.seat];
              return (
                <div key={p.seat + p.card} className="bt-card" style={{ transform: TRICK_POS[slot] }}>
                  <div className={`bt-card-inner bt-anim-in-${SLOT_ANIM[slot]}`}><CardFace card={p.card} /></div>
                </div>
              );
            })}
          </div>

          {/* Feature 11: compact contract chip on the felt center */}
          {contract && (
            <div className="bt-felt-contract" data-testid="felt-contract">
              <span className={`bt-felt-contract-suit ${(contract.suit === 'H' || contract.suit === 'D') ? 'text-suit-red' : 'text-suit-black'}`}>
                {contract.level}
                {({S:'♠',H:'♥',D:'♦',C:'♣'} as Record<string,string>)[contract.suit] ?? contract.suit}
              </span>
              {contract.doubled && <span className="text-accent text-xs font-bold ml-1">x</span>}
              {contract.redoubled && <span className="text-accent text-xs font-bold ml-1">xx</span>}
            </div>
          )}

          {/* tricks won scoreboard */}
          <div className="bt-scoreboard">
            <div className="bt-score-row">
              <span className="bt-score-team bt-score-ns">NS</span>
              <span className="bt-score-val">{tricksWon.NS}</span>
            </div>
            <div className="bt-score-divider" />
            <div className="bt-score-row">
              <span className="bt-score-team bt-score-ew">EW</span>
              <span className="bt-score-val">{tricksWon.EW}</span>
            </div>
          </div>
        </div>
      </div>

      {/* viewer's own hand (bottom overlay, outside the tilted scene for reliable clicks) */}
      <HandFan
        seat={viewerSeat}
        cards={bySuit(hands[viewerSeat] ?? [])}
        fanStyle={fanStyle}
        legal={interactiveSeat === viewerSeat ? legalCards : null}
        interactive={interactiveSeat === viewerSeat}
        onPlayCard={onPlayCard}
      />

      {/* dummy as a top overlay when it sits across from the viewer (declarer POV) */}
      {dummyRevealed && screen[dummySeat] === "top" && (
        <DummyFan
          seat={dummySeat}
          cards={bySuit(hands[dummySeat] ?? [])}
          fanStyle={fanStyle}
          legal={interactiveSeat === dummySeat ? legalCards : null}
          interactive={interactiveSeat === dummySeat}
          onPlayCard={onPlayCard}
        />
      )}
    </div>
  );
}

/* ---------- viewer hand ---------- */
function HandFan({ seat, cards, fanStyle, legal, interactive, onPlayCard }: {
  seat: Seat; cards: string[]; fanStyle: string; legal: string[] | null; interactive: boolean;
  onPlayCard?: (seat: Seat, card: string) => void;
}) {
  const n = cards.length;
  return (
    <div className="bt-hand">
      {cards.map((card, i) => {
        const isLegal = !legal || legal.includes(card);
        const dim = interactive && legal != null && !legal.includes(card);
        const base = handTransform(i, n, fanStyle);
        const clickable = interactive && isLegal;
        return (
          <div key={card}
            className={`bt-card playable${interactive && isLegal ? " legal" : ""}${dim ? " illegal" : ""}`}
            style={{ transform: base, zIndex: i }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = base + " translateY(-26px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = base; }}
            onClick={() => clickable && onPlayCard?.(seat, card)}>
            <CardFace card={card} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- dummy top overlay ---------- */
function DummyFan({ seat, cards, fanStyle, legal, interactive, onPlayCard }: {
  seat: Seat; cards: string[]; fanStyle: string; legal: string[] | null; interactive: boolean;
  onPlayCard?: (seat: Seat, card: string) => void;
}) {
  const n = cards.length;
  return (
    <div className="bt-dummy-hand">
      {cards.map((card, i) => {
        const isLegal = legal && legal.includes(card);
        const base = dummyTransform(i, n, fanStyle);
        const clickable = interactive && !!isLegal;
        return (
          <div key={card}
            className={`bt-card${interactive ? " playable" : ""}${isLegal ? " legal" : interactive ? " illegal" : ""}`}
            style={{ transform: base, zIndex: i }}
            onMouseEnter={interactive ? (e) => { e.currentTarget.style.transform = base + " translateY(26px)"; e.currentTarget.style.zIndex = "60"; } : undefined}
            onMouseLeave={interactive ? (e) => { e.currentTarget.style.transform = base; e.currentTarget.style.zIndex = String(i); } : undefined}
            onClick={() => clickable && onPlayCard?.(seat, card)}>
            <CardFace card={card} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- dummy on a side (defender POV, display-only) ---------- */
function SideDummy({ cards, slot }: { cards: string[]; slot: Slot }) {
  const sorted = bySuit(cards);
  const n = sorted.length;
  const mid = (n - 1) / 2;
  const pos = slot === "left"
    ? { left: "150px", top: "46%" }
    : { left: "calc(100% - 150px)", top: "46%" };
  return (
    <div className="bt-side-dummy" style={pos}>
      {sorted.map((card, i) => {
        const off = i - mid;
        const tr = `translate(-50%,-50%) translateY(${off * 27}px) translateX(${-Math.abs(off) * 2}px) rotateZ(${off * 1.4}deg)`;
        return (
          <div key={card} className="bt-card" style={{ transform: tr, zIndex: i }}>
            <CardFace card={card} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- opponent card backs ---------- */
function OppBacks({ slot, count }: { slot: Slot; count: number }) {
  const pos: Record<Slot, { left: string; top: string; base: string }> = {
    top: { left: "50%", top: "96px", base: "translate(-50%,-50%)" },
    right: { left: "calc(100% - 150px)", top: "50%", base: "translate(-50%,-50%) rotateZ(90deg)" },
    left: { left: "150px", top: "50%", base: "translate(-50%,-50%) rotateZ(-90deg)" },
    bottom: { left: "50%", top: "calc(100% - 96px)", base: "translate(-50%,-50%)" },
  };
  const p = pos[slot];
  const n = Math.max(count, 0);
  const mid = (n - 1) / 2;
  return (
    <div className="bt-mini-fan" style={{ left: p.left, top: p.top, transform: p.base }}>
      {Array.from({ length: n }).map((_, i) => {
        const off = i - mid;
        const tr = `translate(-50%,-50%) translateX(${off * 13}px) translateY(${Math.abs(off) * 0.8}px) rotateZ(${off * 3.2}deg) scale(.62)`;
        return (
          <div key={i} className="bt-card is-down" style={{ transform: tr, left: 0, top: 0 }}>
            <CardBack />
          </div>
        );
      })}
    </div>
  );
}
