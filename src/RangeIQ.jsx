import React, { useState, useEffect, useRef, useCallback } from "react";

// ================================================================
// DESIGN SYSTEM  -  Component System Spec
// ================================================================
const C = {
  bg:       "#0B0F14",
  card:     "#111827",
  surface:  "#1F2937",
  elevated: "#243041",
  border:   "rgba(255,255,255,0.07)",
  borderHi: "rgba(255,255,255,0.15)",
  text:     "#E5E7EB",
  muted:    "#9CA3AF",
  disabled: "#6B7280",
  gold:     "#E6C566",
  goldHov:  "#F4D47A",
  goldAct:  "#C9A94A",
  green:    "#10B981",
  red:      "#EF4444",
  blue:     "#3B82F6",
  orange:   "#F97316",
  purple:   "#8B5CF6",
  teal:     "#14B8A6",
  amber:    "#F59E0B",
};

function scoreBand(s) {
  if (s <= 25) return { col:"#6B7280", label:"Low" };
  if (s <= 50) return { col:"#F59E0B", label:"Medium" };
  if (s <= 75) return { col:"#10B981", label:"Strong" };
  return { col:"#E6C566", label:"Max" };
}

const SUIT_SYM  = { s:"\u2660", h:"\u2665", d:"\u2666", c:"\u2663" };
const SUIT_COL  = { s:"#CBD5E1", h:"#F87171", d:"#F87171", c:"#CBD5E1" };
const RANKS     = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS     = ["s","h","d","c"];
const POSITIONS = ["UTG","HJ","CO","BTN","SB","BB"];
const POSITIONS_FULL = ["UTG","LJ","HJ","CO","BTN","SB","BB"]; // full 7-seat table

// Game size system
const GAME_SIZES = [
  { label:"$1/$2", sb:1,  bb:2,  totalBlinds:3  },
  { label:"$1/$3", sb:1,  bb:3,  totalBlinds:4  },
  { label:"$2/$5", sb:2,  bb:5,  totalBlinds:7  },
  { label:"$5/$10",sb:5,  bb:10, totalBlinds:15 },
];

// Convert BB amount to dollar string (clean rounding, no trailing decimals)
function bbToDollars(bbAmount, bigBlind) {
  const raw = bbAmount * bigBlind;
  const rounded = raw < 10 ? Math.round(raw * 2) / 2 : Math.round(raw);
  return "$"+rounded;
}

// Convert sizing pct string ("33%","50%","66%","75%","2.5x") to dollar bet
function sizingToDollars(sizing, potSizeBB, bigBlind) {
  if (!sizing||!potSizeBB||!bigBlind) return null;
  let betBB = 0;
  if (sizing.endsWith("%")) {
    const pct = parseFloat(sizing) / 100;
    betBB = potSizeBB * pct;
  } else if (sizing.endsWith("x")) {
    // raise sizing like 2.5x
    betBB = potSizeBB * parseFloat(sizing);
  } else {
    return null;
  }
  const raw = betBB * bigBlind;
  const rounded = raw < 5 ? Math.round(raw * 2) / 2 : Math.round(raw);
  return "$"+rounded;
}

// Get population modifier for game size
function getGameSizeModifier(bigBlind) {
  if (bigBlind <= 2) return { foldAdjust:+5, aggrAdjust:-8,  label:"Low Stakes" };
  if (bigBlind <= 3) return { foldAdjust:+3, aggrAdjust:-5,  label:"Low Stakes" };
  if (bigBlind <= 5) return { foldAdjust: 0, aggrAdjust: 0,  label:"Mid Stakes"  };
  return                   { foldAdjust:-4, aggrAdjust:+10,  label:"High Stakes" };
}

// Postflop position order: BTN acts last, SB acts first
// Returns true if heroPos acts after villainPos postflop
function getPositionStatus(heroPos, villainPos) {
  const order = ["SB","BB","UTG","HJ","CO","BTN"];
  return order.indexOf(heroPos) > order.indexOf(villainPos);
}


// ================================================================
// HAND EVALUATOR  -  river only, O(1) lookup
// ================================================================
function evaluateHand(heroCards, board) {
  if (!heroCards[0]||!heroCards[1]||!board||board.length<5) return null;
  const all=[...heroCards,...board];
  const ranks=all.map(c=>RANKS.indexOf(c.rank));   // lower = higher card
  const suits=all.map(c=>c.suit);
  const rankCounts={};
  ranks.forEach(r=>{ rankCounts[r]=(rankCounts[r]||0)+1; });
  const counts=Object.values(rankCounts).sort((a,b)=>b-a);
  const uniqueSuits=new Set(suits);
  const isFlush=suits.filter(s=>s===suits[0]).length>=5||
    ["s","h","d","c"].some(s=>suits.filter(x=>x===s).length>=5);
  const sortedRanks=[...new Set(ranks)].sort((a,b)=>a-b);
  let isStraight=false;
  for(let i=0;i<=sortedRanks.length-5;i++){
    if(sortedRanks[i+4]-sortedRanks[i]===4&&new Set(sortedRanks.slice(i,i+5)).size===5) isStraight=true;
  }
  // wheel
  if(sortedRanks.includes(0)&&sortedRanks.includes(9)&&sortedRanks.includes(10)&&sortedRanks.includes(11)&&sortedRanks.includes(12)) isStraight=true;

  // top two ranks by frequency then value
  const rankEntries=Object.entries(rankCounts).sort(([r1,c1],[r2,c2])=>c2-c1||r1-r2);
  const topRank=RANKS[+rankEntries[0][0]];
  const secRank=rankEntries[1]?RANKS[+rankEntries[1][0]]:"";

  let rank,description,short,pct;

  if (isFlush&&isStraight)      { rank="Straight Flush"; description="Straight Flush"; short="SF";  pct=1; }
  else if (counts[0]===4)       { rank="Four of a Kind"; description="Four of a Kind ("+topRank+")"; short="Quads"; pct=3; }
  else if (counts[0]===3&&counts[1]===2) { rank="Full House"; description="Full House, "+topRank+"s full of "+secRank+"s"; short="Full House"; pct=6; }
  else if (isFlush)             { rank="Flush"; description="Flush"; short="Flush"; pct=9; }
  else if (isStraight)          { rank="Straight"; description="Straight"; short="Str8"; pct=12; }
  else if (counts[0]===3)       { rank="Three of a Kind"; description="Three of a Kind, "+topRank+"s"; short="Trips "+topRank+"s"; pct=20; }
  else if (counts[0]===2&&counts[1]===2) {
    // Find kicker: highest rank not in a pair
    const pairRanks = new Set(Object.entries(rankCounts).filter(([,c])=>c===2).map(([r])=>+r));
    const kickers = ranks.filter(r=>!pairRanks.has(r)).sort((a,b)=>a-b);
    const kicker = kickers.length ? " (K: "+RANKS[kickers[0]]+")" : "";
    rank="Two Pair"; description="Two Pair, "+topRank+"s & "+secRank+"s"+kicker; short="Two Pair "+topRank+"s & "+secRank+"s"; pct=35;
  }
  else if (counts[0]===2)       { rank="Pair"; description="Pair of "+topRank+"s"; short="Pair of "+topRank+"s"; pct=55; }
  else {
    const best=RANKS[Math.min(...ranks)];
    rank="High Card"; description=best+" High"; short=best+" High"; pct=80;
  }

  // Build the best 5-card hand combo for display
  // Find the actual 5 cards that make up the hand
  let bestFive = [];
  const allCards = [...heroCards, ...board];  // heroCards/board in scope from outer

  if (isFlush && isStraight) {
    // Find the flush suit
    const flushSuit = ["s","h","d","c"].find(s=>suits.filter(x=>x===s).length>=5);
    const flushCards = allCards.filter(c=>c.suit===flushSuit).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank));
    bestFive = flushCards.slice(0,5);
  } else if (counts[0]===4) {
    const quadRank = RANKS[+rankEntries[0][0]];
    const quads = allCards.filter(c=>c.rank===quadRank).slice(0,4);
    const kicker = allCards.filter(c=>c.rank!==quadRank).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank))[0];
    bestFive = kicker ? [...quads, kicker] : quads;
  } else if (counts[0]===3 && counts[1]===2) {
    const trips = allCards.filter(c=>c.rank===topRank).slice(0,3);
    const pair  = allCards.filter(c=>c.rank===secRank).slice(0,2);
    bestFive = [...trips, ...pair];
  } else if (isFlush) {
    const flushSuit = ["s","h","d","c"].find(s=>suits.filter(x=>x===s).length>=5);
    const flushCards = allCards.filter(c=>c.suit===flushSuit).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank));
    bestFive = flushCards.slice(0,5);
  } else if (isStraight) {
    bestFive = allCards.sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank)).slice(0,5);
  } else if (counts[0]===3) {
    const trips = allCards.filter(c=>c.rank===topRank).slice(0,3);
    const kickers = allCards.filter(c=>c.rank!==topRank).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank)).slice(0,2);
    bestFive = [...trips, ...kickers];
  } else if (counts[0]===2 && counts[1]===2) {
    const pairRanks2 = Object.entries(rankCounts).filter(([,c])=>c===2).map(([r])=>RANKS[+r]);
    const pair1 = allCards.filter(c=>c.rank===pairRanks2[0]).slice(0,2);
    const pair2 = allCards.filter(c=>c.rank===pairRanks2[1]).slice(0,2);
    const kicker = allCards.filter(c=>c.rank!==pairRanks2[0]&&c.rank!==pairRanks2[1]).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank))[0];
    bestFive = kicker ? [...pair1,...pair2,kicker] : [...pair1,...pair2];
  } else if (counts[0]===2) {
    const pairCards = allCards.filter(c=>c.rank===topRank).slice(0,2);
    const kickers = allCards.filter(c=>c.rank!==topRank).sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank)).slice(0,3);
    bestFive = [...pairCards, ...kickers];
  } else {
    bestFive = allCards.sort((a,b)=>RANKS.indexOf(a.rank)-RANKS.indexOf(b.rank)).slice(0,5);
  }

  // Build flush description like "Ace-High Flush"
  const highCard = bestFive.length > 0 ? bestFive[0].rank : topRank;
  if (rank==="Flush") description = highCard+"-High Flush";
  if (rank==="Straight") description = highCard+"-High Straight";

  const isStrong=pct<=20;
  return { rank, description, short, pct, isStrong, bestFive, highCard };
}

// ================================================================
// FINAL HAND BADGE  -  shows only on river with 5 board cards
// ================================================================
function FinalHandBadge({ heroCards, board }) {
  const showFinalHand = board&&board.length===5&&heroCards[0]&&heroCards[1];
  if (!showFinalHand) return null;
  const result = evaluateHand(heroCards, board);
  if (!result) return null;
  const valueColor = result.isStrong ? C.gold : C.text;
  return (
    <div style={{ display:"inline-flex",alignItems:"center",gap:8,animation:"fadeUp 0.3s ease" }}>
      {/* Divider dot */}
      <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.3)",flexShrink:0 }}/>
      {/* Label */}
      <span style={{ fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",color:"rgba(255,255,255,0.5)",fontWeight:500,flexShrink:0 }}>
        Final Hand
      </span>
      {/* Value */}
      <span style={{ fontSize:13,fontWeight:600,color:valueColor,letterSpacing:"-0.01em" }}>
        {result.description}
      </span>
      {/* Strength hint for top 20% */}
      {result.isStrong&&(
        <span style={{ fontSize:10,color:C.gold+"99",fontWeight:500,background:C.gold+"14",
          padding:"2px 7px",borderRadius:99,border:"1px solid "+C.gold+"33" }}>
          Top {result.pct}%
        </span>
      )}
    </div>
  );
}

const HAND_GRID = RANKS.map((r1,i) => RANKS.map((r2,j) => {
  if (i===j) return r1+r1;
  if (i<j)   return r1+r2+"s";
  return r2+r1+"o";
}));

// ================================================================
// ARCHETYPES
// ================================================================
const ARCHETYPES = {
  nit:          { label:"Nit",             color:"#60A5FA", vpip:12,  aggression:20, foldFlop:68, foldTurn:72, bluffFreq:5,  desc:"Premium hands only. Folds to almost any pressure." },
  tag:          { label:"TAG",             color:"#34D399", vpip:22,  aggression:55, foldFlop:52, foldTurn:48, bluffFreq:28, desc:"Tight aggressive. Balanced. Respects strong lines." },
  lag:          { label:"LAG",             color:"#FBBF24", vpip:35,  aggression:75, foldFlop:38, foldTurn:32, bluffFreq:42, desc:"Wide range, high bluff frequency. Hard to pin down." },
  young_aggro:  { label:"Young Aggro",     color:"#F472B6", vpip:28,  aggression:82, foldFlop:28, foldTurn:22, bluffFreq:48, desc:"3-bets any position. Barrels all three streets. Calls 3-bets to outplay. Tighten up and let premiums do the work." },
  loose_passive:{ label:"Loose Passive",   color:"#A78BFA", vpip:45,  aggression:18, foldFlop:32, foldTurn:42, bluffFreq:6,  desc:"Calls wide passively. Rarely raises." },
  station:      { label:"Calling Station", color:"#F87171", vpip:62,  aggression:15, foldFlop:18, foldTurn:24, bluffFreq:8,  desc:"Calls everything. Never folds. Bluffs rarely." },
  maniac:       { label:"Maniac",          color:"#FB923C", vpip:72,  aggression:92, foldFlop:15, foldTurn:18, bluffFreq:62, desc:"Aggression off the charts. Bluffs constantly." },
  rec:          { label:"Recreational",    color:"#94A3B8", vpip:48,  aggression:28, foldFlop:38, foldTurn:44, bluffFreq:12, desc:"Unpredictable. Wide passive with random aggression." },
  unknown:      { label:"Unknown / Mixed",  color:"#CBD5E1", vpip:38,  aggression:42, foldFlop:44, foldTurn:50, bluffFreq:20, desc:"Population average. Use when player tendencies are unknown or mixed across multiple opponents." },
};

// ================================================================
// RANGE ENGINE
// ================================================================
function buildRange(archetype) {
  const p=ARCHETYPES[archetype]||ARCHETYPES.unknown; const range={};
  RANKS.forEach((r1,i) => RANKS.forEach((r2,j) => {
    const hand=HAND_GRID[i][j], isPair=i===j, isSuited=i<j; let w=0;
    // Maniac: wide, aggressive range - deterministic based on hand grid position
    // Uses vpip (85%) spread evenly with slight bias toward connected/suited hands
    if (archetype==="maniac") {
      const k = p.vpip / 100; // 0.85
      // Weight based on hand type: maniac plays almost everything, suited/connected slightly more
      if (isPair)        { w = i<=1?0.99:i<=4?0.95*k:i<=7?0.88*k:0.80*k; }
      else if (isSuited) { const g=j-i; w = g<=1?0.90*k:g<=3?0.82*k:g<=5?0.72*k:0.60*k; }
      else               { const g=i-j; w = g<=1?0.80*k:g<=3?0.70*k:g<=5?0.55*k:0.40*k; }
    }
    else {
      const k=p.vpip/100;
      if (isPair)        { w=i<=1?0.96:i<=4?0.80*k:i<=7?0.60*k:0.40*k; }
      else if (isSuited) { const g=j-i; w=i===0&&g<=2?0.92:i<=1&&g<=3?0.70*k:g<=2?0.50*k:g<=4?0.28*k:0.12*k; }
      else               { const g=i-j; w=j===0&&g<=2?0.82:j<=1&&g<=2?0.55*k:g<=2?0.28*k:0.08*k; }
    }
    range[hand]=Math.min(1,Math.max(0,w));
  }));
  return range;
}

function compressRange(range, action, archetype) {
  const p=ARCHETYPES[archetype]||ARCHETYPES.unknown; const out={};
  Object.entries(range).forEach(([hand,w]) => {
    let m=1; const isPair=hand[0]===hand[1]; const ri=isPair?RANKS.indexOf(hand[0]):99;
    if (action==="bet"||action==="raise") { m=isPair?(ri<=3?1.4:0.75):(0.7+p.bluffFreq/100); }
    else if (action==="check") { if(isPair) m=ri<=2?0.65:1.15; }
    else if (action==="call")  { if(isPair) m=ri>=2&&ri<=7?1.25:0.80; }
    else if (action==="fold")  { m=0; }
    out[hand]=Math.min(1,Math.max(0,w*m));
  });
  return out;
}

function analyzeBoard(board) {
  if (!board||!board.length) return null;
  const suits=board.map(c=>c.suit), ranks=board.map(c=>RANKS.indexOf(c.rank));
  const uniqS=new Set(suits).size;
  const sorted=[...ranks].sort((a,b)=>a-b);
  let conn=0; for(let i=1;i<sorted.length;i++) if(sorted[i]-sorted[i-1]<=2) conn++;
  let wet=(uniqS===1?3:uniqS===2?1.5:0)+conn*1.5+(ranks.some(r=>r>=3&&r<=7)?0.5:0);
  const label=wet>=4?"Very Wet":wet>=2.5?"Wet":wet>=1.5?"Semi-Wet":"Dry";
  const col=wet>=4?C.red:wet>=2.5?C.orange:wet>=1.5?C.amber:C.green;
  return { label, col, wet:Math.round(wet*10)/10, mono:uniqS===1 };
}

function heroStrength(heroCards, board) {
  if (!heroCards[0]||!heroCards[1]) return 0.5;
  const r1=RANKS.indexOf(heroCards[0].rank), r2=RANKS.indexOf(heroCards[1].rank);
  const suited=heroCards[0].suit===heroCards[1].suit, paired=r1===r2;
  let s=paired?0.50+(12-r1)*0.035:0.30+(12-Math.min(r1,r2))*0.025-Math.abs(r1-r2)*0.02+(suited?0.05:0);
  if (board&&board.length) {
    const br=board.map(c=>RANKS.indexOf(c.rank)), bs=board.map(c=>c.suit);
    const heroSuit0 = heroCards[0].suit;
    const heroSuit1 = heroCards[1].suit;
    const boardSuitCount0 = bs.filter(x=>x===heroSuit0).length;
    const boardSuitCount1 = bs.filter(x=>x===heroSuit1).length;
    const boardSuitCount = suited ? boardSuitCount0 : Math.max(boardSuitCount0, boardSuitCount1);

    // Pair detection with rank-relative bonus
    const hit1 = br.includes(r1), hit2 = br.includes(r2);
    if (hit1 || hit2) {
      const hitRank = hit1 ? r1 : r2;
      const overcards = br.filter(r => r < hitRank).length; // board cards higher than our pair
      const kicker = hit1 ? r2 : r1; // the non-paired card
      // Top pair: full bonus. Each overcard on board reduces value significantly.
      if (overcards === 0) {
        s += 0.24; // top pair
        if (kicker <= 3) s += 0.04; // premium kicker (A/K/Q/J)
      } else if (overcards === 1) {
        s += 0.15; // middle pair
      } else {
        s += 0.08; // bottom pair - minimal value
        if (kicker >= 8) s -= 0.03; // bad kicker penalty (8 or worse)
      }
    }
    if (hit1 && hit2) s+=0.15; // two pair
    if (paired&&br.includes(r1)) s+=0.25; // set

    // Monotone board vulnerability: when board is 3+ of one suit and hero has
    // ZERO cards of that suit, any non-nut made hand is severely devalued.
    // A flush is already out or easily made by any opponent with one card of that suit.
    const suitCounts = {};
    bs.forEach(x => { suitCounts[x] = (suitCounts[x]||0)+1; });
    const dominantSuit = Object.entries(suitCounts).sort((a,b)=>b[1]-a[1])[0];
    const boardIsMono = dominantSuit && dominantSuit[1] >= 3;
    if (boardIsMono) {
      const monoSuit = dominantSuit[0];
      const heroHasMonoSuit = heroCards[0].suit === monoSuit || heroCards[1].suit === monoSuit;
      const heroHasTwoMonoSuit = heroCards[0].suit === monoSuit && heroCards[1].suit === monoSuit;
      if (!heroHasMonoSuit) {
        // No cards in the dominant suit - any pair/two-pair is nearly dead
        // and unpaired hands are drawing nearly dead against any flush
        const hasPair = hit1 || hit2 || (paired && br.includes(r1));
        s -= hasPair ? 0.18 : 0.25; // harsher when not even paired
      } else if (heroHasMonoSuit && !heroHasTwoMonoSuit) {
        // One card of the suit - check if it's the PAIRED card or the kicker
        // If the paired card is NOT in the mono suit, the pair is still vulnerable
        const monoCard = heroCards[0].suit === monoSuit ? r1 : r2;
        const nonMonoCard = heroCards[0].suit === monoSuit ? r2 : r1;
        const pairedCardIsInMonoSuit = (hit1 && heroCards[0].suit === monoSuit && br.includes(r1)) ||
                                        (hit2 && heroCards[1].suit === monoSuit && br.includes(r2));
        const hitWithNonMonoCard = (hit1 && heroCards[0].suit !== monoSuit) || (hit2 && heroCards[1].suit !== monoSuit);
        
        if (hitWithNonMonoCard && !pairedCardIsInMonoSuit) {
          // Paired a card but the pair card isn't in the mono suit - still very vulnerable
          // e.g., T♦4♣ on A♦K♦4♦: the 4 is clubs, paired but dominated by any diamond
          s -= 0.12;
        }
        if (monoCard <= 2) s += 0.10; // nut flush draw or made nut flush
        else if (monoCard <= 5) s += 0.04; // decent flush card
        // low flush card: no bonus, slight risk
      }
    }

    // Flush detection: distinguish made flush from draw
    if (suited) {
      if (boardSuitCount >= 3) {
        // MADE FLUSH: both hero cards + 3+ board cards in same suit
        s += 0.42;
      } else if (boardSuitCount === 2) {
        // Flush draw: 2 board cards + 2 hero cards = 4 to a flush
        s += 0.14;
      } else if (boardSuitCount === 1) {
        // Backdoor flush draw: minor bonus
        s += 0.04;
      }
    }

    // Straight detection: check if hero + board makes a 5-card straight
    const allRanksUniq = [...new Set([...br, r1, r2])].sort((a,b)=>a-b);
    let bestRun = 1, curRun = 1;
    for (let si=1; si<allRanksUniq.length; si++) {
      if (allRanksUniq[si] - allRanksUniq[si-1] === 1) { curRun++; if(curRun > bestRun) bestRun = curRun; }
      else curRun = 1;
    }
    // Check for A-2-3-4-5 wheel (A is index 0, 2-5 are indices 8-11)
    if (allRanksUniq.includes(0) && allRanksUniq.includes(9) && allRanksUniq.includes(10) && allRanksUniq.includes(11) && allRanksUniq.includes(12)) {
      bestRun = Math.max(bestRun, 5);
    }
    const heroUsedInStraight = bestRun >= 5 && (
      !br.includes(r1) || !br.includes(r2)
    );
    if (bestRun >= 5 && heroUsedInStraight) {
      s += 0.35;
    } else if (bestRun >= 4 && !paired) {
      // OESD: only count if at least one hero card is part of the consecutive sequence
      // Find the best run that includes a hero card
      const boardOnly = [...new Set(br)].sort((a,b)=>a-b);
      let boardBestRun = 1, boardCur = 1;
      for (let si=1; si<boardOnly.length; si++) {
        if (boardOnly[si] - boardOnly[si-1] === 1) { boardCur++; if(boardCur > boardBestRun) boardBestRun = boardCur; }
        else boardCur = 1;
      }
      // Only give OESD credit if the hero cards extend the board's run
      if (bestRun > boardBestRun && boardSuitCount < 3) s += 0.08;
    }

    // No-connection penalty: if hero has NO pair, NO flush draw, NO straight contribution,
    // the hand is pure air on this board - deflate significantly
    const hasAnyPair = hit1 || hit2 || (paired && br.includes(r1));
    const hasFlushDraw = suited && boardSuitCount >= 2;
    const hasStrConn = bestRun >= 4 && bestRun > (()=>{
      const bo2=[...new Set(br)].sort((a,b)=>a-b);let br2=1,bc2=1;
      for(let si=1;si<bo2.length;si++){if(bo2[si]-bo2[si-1]===1){bc2++;if(bc2>br2)br2=bc2;}else bc2=1;}return br2;
    })();
    if (!hasAnyPair && !hasFlushDraw && !hasStrConn && board.length >= 3) {
      // Complete air - no connection to the board
      s -= 0.12;
    }
  }
  return Math.min(0.98,Math.max(0.08,s));
}

function recommend(state) {
  const { heroCards, archetype, heroIsIP, board, potSize, stackBB, bigBlind, vilAction } = state;
  const gameMod = bigBlind ? getGameSizeModifier(bigBlind) : { foldAdjust:0, aggrAdjust:0 };
  const p=ARCHETYPES[archetype]||ARCHETYPES.unknown, tex=analyzeBoard(board);
  const str=!board||!board.length?"preflop":board.length===3?"flop":board.length===4?"turn":"river";
  const hs=heroStrength(heroCards,board), spr=potSize>0?stackBB/potSize:15;

  // - Derive node situation from action history -
  const nodeSit = getCurrentNodeSituation(str, vilAction||[], heroIsIP);
  const facingBet = nodeSit === "facing_bet";
  const checkedTo = nodeSit === "checked_to" || nodeSit === "unopened";
  const isRiver   = str === "river";
  const isTerminal = isRiver && heroIsIP; // IP hero is always last on river

  // - LIMPED POT CONTEXT -
  // Detect if the pot was limped (no preflop raise) vs raised.
  // In limped pots at live low-stakes:
  //   - Ranges are wide and undefined (anyone could have anything)
  //   - Flop stabs are one-and-done: bet flop, give up on turn if called
  //   - C-bet profitability is board-dependent, not automatic
  //   - Callers are a mix of floats and real hands
  //   - Call lighter on flop (villain won't barrel turn), fold if they fire turn (it's real)
  const pfActions = (vilAction||[]).filter(a => a.street === "preflop");
  const wasRaisedPot = pfActions.some(a => a.type === "raise" || a.type === "bet");
  const isLimpedPot = !wasRaisedPot && str !== "preflop";
  // In a limped pot, villain's flop bet is less credible (stab) but turn bet IS credible
  const limpedPotTurnBet = isLimpedPot && str === "turn" && facingBet;
  const limpedPotFlopBet = isLimpedPot && str === "flop" && facingBet;
  // C-bet in a limped pot should be texture-dependent
  const limpedPotCbet = isLimpedPot && str === "flop" && checkedTo;
  const isDryBoard = tex && tex.wet < 2;

  // - LIVE SIZING TELLS -
  // At live low-stakes ($1/$3 to $2/$5), villain bet sizing is highly informative:
  //   Small bet (<33% pot) = blocker/weak hand, almost never a bluff
  //   Standard bet (33-80%) = could be anything, flop c-bets are often automatic
  //   Overbet (>80% pot) = almost always the nuts or near-nuts
  //   Double barrel (flop + turn) = real hand, wouldn't bet twice without it
  //   Triple barrel (flop + turn + river) = near-nuts at low stakes
  //   Bet flop, check turn = draw missed or marginal hand giving up
  const allVilActs = (vilAction||[]).filter(a => a.actor === "Villain");
  const vilFlopBet = allVilActs.find(a => a.street === "flop" && (a.type === "bet" || a.type === "raise"));
  const vilTurnBet = allVilActs.find(a => a.street === "turn" && (a.type === "bet" || a.type === "raise"));
  const vilRiverBet = allVilActs.find(a => a.street === "river" && (a.type === "bet" || a.type === "raise"));
  const vilTurnCheck = allVilActs.find(a => a.street === "turn" && a.type === "check");
  const vilBarrelCount = [vilFlopBet, vilTurnBet, vilRiverBet].filter(Boolean).length;

  // Classify current street's villain bet sizing
  const currentVilBet = allVilActs.filter(a => a.street === str && (a.type === "bet" || a.type === "raise")).slice(-1)[0];
  const vilBetDollarsNow = currentVilBet && currentVilBet.amount ? parseFloat(currentVilBet.amount) : 0;
  const potDollarsNow = potSize * (bigBlind || 3);
  const vilBetPctOfPot = potDollarsNow > 0 && vilBetDollarsNow > 0 ? vilBetDollarsNow / potDollarsNow : 0;
  const isSmallBet = vilBetPctOfPot > 0 && vilBetPctOfPot < 0.33;
  const isOverbet = vilBetPctOfPot > 0.80;
  const isStandardBet = vilBetPctOfPot >= 0.33 && vilBetPctOfPot <= 0.80;

  // Bet-then-check pattern: villain bet the flop but checked this street (turn)
  const betThenCheck = vilFlopBet && str === "turn" && !vilTurnBet && vilTurnCheck;

  // Double/triple barrel tracking
  const isDoubleBarrel = vilBarrelCount >= 2 && str !== "flop";
  const isTripleBarrel = vilBarrelCount >= 3 && str === "river";

  // Sizing tell context string for display
  let _sizing_tell = null;

  // - DONK BET & POSITIONAL ADJUSTMENTS -
  // At live low-stakes:
  //   - OOP opponents donk bet frequently after hero raised preflop
  //   - Donk bet = they hit something (at least a pair), NOT a bluff
  //   - Raising donk bets is rarely profitable
  //   - When OOP villain checks to preflop raiser: they're giving up
  //   - C-bets: profitable on dry boards, less effective on wet boards
  const heroRaisedPre = wasRaisedPot; // hero was the preflop raiser (or there was a raise)
  const isDonkBet = facingBet && heroIsIP && heroRaisedPre && str !== "preflop";
  // Donk bet sizing classification (same thresholds as regular sizing tells)
  const donkIsSmall = isDonkBet && isSmallBet;
  const donkIsStandard = isDonkBet && isStandardBet;
  const donkIsBig = isDonkBet && isOverbet;
  // OOP villain checked to preflop raiser = giving up
  const oopCheckToRaiser = checkedTo && heroIsIP && heroRaisedPre && str !== "preflop";
  let _position_tell = null;

  // Apply game-size population modifier to fold/aggression tendencies
  const adjFoldFlop = Math.min(90,Math.max(5, p.foldFlop + gameMod.foldAdjust));
  const adjAggression = Math.min(95,Math.max(5, p.aggression + gameMod.aggrAdjust));

  // Board-texture aggression flags
  const isMono       = tex && tex.mono;          // all same suit
  const isVeryWet    = tex && tex.wet >= 4;       // 9/7/8 flush board = 6.5
  const isHighDynamic= isMono || isVeryWet;       // triggers aggression override
  // Hero equity classification
  const heroIsStrong     = hs >= 0.72;           // made flush / set / two pair+
  const heroIsHighDraw   = hs >= 0.55 && hs < 0.72; // combo draw / top pair + draw
  // Wide villain flag  -  LAG/Maniac ranges are exploitable with aggression
  const villainIsWide = p.vpip >= 35;             // LAG=35, Maniac=72

  // --- Archetype-aware sizing profiles ---
  // Exploitative principle: size bets to maximize EV against specific tendencies
  // Calling stations/loose passive: SIZE UP - they call too wide, charge maximum
  // Nits: SIZE DOWN - they fold to pressure, small bets achieve same fold equity
  // LAGs/Maniacs: MEDIUM-LARGE - build pot but keep their bluff range intact
  // TAGs: MEDIUM - balanced opponents respect sizing, find the sweet spot
  const SIZING = {
    station:       { valueStrong:"80%", valueMed:"66%", thin:"50%", bluff:null,  probe:null,  raise:"3x",   wetAdj:true,  desc:"Max value - they call everything" },
    nit:           { valueStrong:"40%", valueMed:"33%", thin:"25%", bluff:"25%", probe:"25%", raise:"2x",   wetAdj:false, desc:"Small sizing - they fold to pressure" },
    maniac:        { valueStrong:null,  valueMed:null,  thin:null,  bluff:null,  probe:null,  raise:"3x",   wetAdj:false, desc:"Trap - let them bluff into you" },
    lag:           { valueStrong:"66%", valueMed:"50%", thin:null,  bluff:null,  probe:null,  raise:"2.5x", wetAdj:true,  desc:"Build pot vs wide range" },
    young_aggro:   { valueStrong:"75%", valueMed:"60%", thin:null,  bluff:null,  probe:null,  raise:"3x",   wetAdj:true,  desc:"Value heavy - they barrel into you, let them pay" },
    loose_passive: { valueStrong:"75%", valueMed:"66%", thin:"50%", bluff:null,  probe:null,  raise:"3x",   wetAdj:true,  desc:"Size up - they call wide but never raise" },
    tag:           { valueStrong:"60%", valueMed:"50%", thin:"33%", bluff:"33%", probe:"33%", raise:"2.5x", wetAdj:true,  desc:"Medium sizing vs balanced opponent" },
    rec:           { valueStrong:"66%", valueMed:"50%", thin:"40%", bluff:"33%", probe:"33%", raise:"2.5x", wetAdj:true,  desc:"Standard sizing vs unpredictable player" },
    unknown:       { valueStrong:"60%", valueMed:"50%", thin:"33%", bluff:"33%", probe:"33%", raise:"2.5x", wetAdj:true,  desc:"Default balanced sizing" },
  };
  const sz = SIZING[archetype] || SIZING.unknown;

  let action,sizing,bullets,tag,score,foldEq,altLines;

  if (archetype==="station") {
    if (hs>=0.7)       { action="Bet";   sizing=tex&&tex.wet>=3?"90%":sz.valueStrong; tag="Value Realization"; score=88; foldEq=12; bullets=["Calling stations continue with any pair, draw, or overcards","Size up to maximum - they will not fold to any reasonable bet","Extract every dollar from their wide calling range"]; altLines=["Bet "+sz.valueMed+" pot","Check (trap)"]; }
    else if (hs>=0.45) { action="Bet";   sizing=sz.thin; tag="Thin Value"; score=72; foldEq=18; bullets=["Opponent rarely folds any made hand","Thin value bet is profitable against their wide range","Do not check and give them a free card"]; altLines=["Bet 33% pot","Check behind"]; }
    else               { action="Check"; sizing=null; tag="Pot Control"; score=85; foldEq=8; bullets=["Opponent calls at too high a frequency for bluffs to profit","Check and realize equity cheaply","Fold to significant aggression with air"]; altLines=["Fold to any bet","Bet 25% (last resort)"]; }
  } else if (archetype==="nit") {
    if (hs>=0.78)      { action="Bet";   sizing=sz.valueMed; tag="Value Realization"; score=79; foldEq=38; bullets=["Small sizing keeps nits from folding marginal hands","Their narrow range is behind - extract thin value","If they raise, proceed with extreme caution - they have it"]; altLines=["Bet "+sz.thin+" pot","Check (induce)"]; }
    else if (heroIsIP) { action="Bet"; sizing=sz.probe; tag="Protection"; score=82; foldEq=72; bullets=["Nits fold dominated pairs and weak aces at high frequency","Small size achieves the same fold equity as a large bet","Low risk, positive EV steal - especially in position"]; altLines=["Bet "+sz.valueMed+" pot","Check (free card)"]; }
    else               { action="Check"; sizing=null; tag="Pot Control"; score=68; foldEq=22; bullets=["Out of position against a nit, checking is preferred","Their narrow range means betting OOP without a strong hand is -EV","Check and re-evaluate with more information on the next street"]; altLines=["Bet "+sz.thin+" (strong hand only)","Fold to any bet"]; }
  } else if (archetype==="maniac") {
    if (hs>=0.72) {
      action="Check"; sizing=null; foldEq=15; score=84;
      if (!isTerminal) {
        tag="Trap Line";
        bullets=["Maniacs bet at 60%+ frequency - let them build the pot","Do not bet strong hands into a maniac, let them bluff","Check-raise or call when they fire - max EV"];
        altLines=["Small bet (merge)","Raise "+sz.raise+" if they bet"];
      } else {
        tag="Showdown Value";
        bullets=["Check back to lock in showdown value - river is complete","Betting risks a raise you cannot continue against","Your hand strength wins at showdown - no further action needed"];
        altLines=["Small bet (thin value if opponent is passive)"];
      }
    }
    else if (hs>=0.50) { action="Call";  sizing=null; tag="Bluff Catch"; score=71; foldEq=22; bullets=["Maniacs bluff at over 60% frequency on most boards","Your hand has sufficient showdown value to call down","Do not raise without a premium hand  -  just call"]; altLines=["Fold (very bad board)","Raise (strong draw)"]; }
    else               { action="Fold";  sizing=null; tag="Pot Control"; score=68; foldEq=0; bullets=["Even maniacs hold value hands in their range","Without clear equity, folding preserves your stack","Wait for a better spot to trap effectively"]; altLines=["Call (3:1+ pot odds)"]; }
  } else if (archetype==="lag") {
    if (hs>=0.65)      { action="Raise"; sizing=sz.raise; tag="Value Realization"; score=77; foldEq=35; bullets=["LAGs continue wide with bluffs, draws, and weak pairs","Raise to build the pot against their wide calling range","Do not just call  -  charge them for their drawing equity"]; altLines=["Call (pot control)","Bet "+sz.valueStrong+" (OOP)"]; }
    else if (hs>=0.42) { action=heroIsIP?"Call":"Check"; sizing=null; tag="Pot Control"; score=73; foldEq=40; bullets=["LAGs have real equity in their wide range","Control the pot while keeping their bluffs in","In position, a call is stronger than a raise here"]; altLines=["Raise (bluff catch)","Fold (bad range)"]; }
    else               { action="Fold";  sizing=null; tag="Pot Control"; score=66; foldEq=0; bullets=["Without equity or a strong bluff candidate, folding is correct","Their aggression range is often ahead of yours here","Save your stack for a better spot"]; altLines=["Call (getting odds)"]; }
  } else if (archetype==="young_aggro") {
    // YOUNG AGGRO: 3-bets from any position, barrels all three streets, calls 3-bets to outplay.
    // Key exploit: tighten up preflop, play big pots with premiums, don't bluff them.
    // Their barrels are NOT automatic nuts tells - override triple barrel credibility.
    // They have it less often than their betting frequency suggests, but more often than a maniac.
    // Counter-strategy: strong hands (two pair+) value bet, top pair calls down, weak hands fold.
    if (hs>=0.88) {
      // Very strong hand (two pair+/set): bet for value. They call with worse and sometimes raise as a bluff.
      action="Bet"; sizing=sz.valueStrong; tag="Value vs Aggro"; score=85; foldEq=20;
      bullets=[
        "Young aggro players call too wide and raise as bluffs - bet large for value",
        "They will pay you off with top pair and worse when you have a premium hand",
        "Do not slow play - build the pot now while they are willing to put money in",
      ];
      altLines=["Check-raise (if they bet when checked to)"];
    } else if (hs>=0.50) {
      // Medium hand: call down. They barrel frequently but have air a significant % of the time.
      // Do NOT raise - they will only continue when they have you beat.
      action=facingBet?"Call":"Check"; sizing=null; tag="Call Down"; score=72; foldEq=15;
      if (facingBet) {
        bullets=[
          "Young aggro players barrel with a wide range including many bluffs",
          "Your hand has showdown value - calling is more profitable than folding or raising",
          "Do not raise - they fold bluffs and continue with better hands when you raise",
        ];
      } else {
        bullets=[
          "Check to let the young aggro player bet - they will fire with a wide range",
          "Plan to call their bet with this hand strength",
          "Betting gives up the chance to catch their bluffs",
        ];
      }
      altLines=["Fold (only if board is extremely scary)","Raise (only with top of this range)"];
    } else {
      // Weak hand: fold to their aggression. Don't bluff them - they call.
      action=facingBet?"Fold":"Check"; sizing=null; tag="Give Up vs Aggro"; score=74; foldEq=0;
      if (facingBet) {
        bullets=[
          "Without a strong hand, folding to a young aggro player is correct",
          "They barrel frequently but calling without equity is a long-term losing play",
          "Wait for a premium hand to play a big pot against this opponent",
        ];
      } else {
        bullets=[
          "Check with low equity - do not attempt to bluff a young aggro player",
          "They call too frequently for bluffs to be profitable",
          "If they bet after your check, fold without a meaningful hand",
        ];
      }
      altLines=["Call (only with pot odds of 4:1+)"];
    }
  } else if (archetype==="loose_passive") {
    if (hs>=0.55)      { action="Bet";   sizing=tex&&tex.wet>=3?"80%":sz.valueStrong; tag="Value Realization"; score=83; foldEq=28; bullets=["Loose passive players call wide but almost never raise","Bet large for value - they continue with second pair and worse","Their passive nature means they will not punish you with raises"]; altLines=["Bet "+sz.valueMed+" pot","Bet 80% (wet board)"]; }
    else               { action="Check"; sizing=null; tag="Pot Control"; score=78; foldEq=35; bullets=["Loose passive players do not fold to bluffs","Check back and take a free card  -  do not waste chips","They call with anything, making bluffs deeply -EV"]; altLines=["Bet 25% (small probe)"]; }
  } else {
    // TAG, Rec, Unknown - medium balanced sizing
    if (hs>=0.70)      { action="Bet";   sizing=tex&&tex.wet>=3?"75%":sz.valueStrong; tag="Value Realization"; score=76; foldEq=42; bullets=["Your hand leads their calling range on this texture","Medium sizing extracts value without overcommitting","Extract value from weaker pairs and speculative hands"]; altLines=["Bet "+sz.valueMed+" (dry board)","Check-raise (OOP)"]; }
    else if (hs>=0.45&&heroIsIP) { action="Bet"; sizing=sz.probe; tag="Protection"; score=68; foldEq=55; bullets=["Balanced opponents fold marginal hands even to small bets","Low risk probe captures fold equity efficiently","In position, information from their response is valuable"]; altLines=["Check back","Bet "+sz.valueMed+" (value)"]; }
    else if (hs<0.30&&heroIsIP&&adjFoldFlop>55) { action="Bet"; sizing=sz.bluff; tag="Protection"; score=65; foldEq=62; bullets=["Their preflop range connects poorly with this board texture","Small size achieves the necessary fold equity efficiently","Be ready to give up on the turn if called"]; altLines=["Check (give up)","Bet "+sz.valueMed+" (commit)"]; }
    else { action="Check"; sizing=null; tag="Pot Control"; score=63; foldEq=38; bullets=["No clear high-EV exploit available on this street","Check to control pot size and gather free information","Reassess your options as more cards and action develop"]; altLines=["Bet 25% (probe)","Fold to any bet"]; }
  }
  if (tex&&sizing&&tex.wet>=4&&sz.wetAdj&&(action==="Bet"||action==="Raise")) {
    // Wet boards: size up one tier to charge draws (except nits/maniacs where sizing strategy differs)
    const pctVal = parseInt(sizing);
    if (!isNaN(pctVal) && pctVal < 75) {
      sizing = Math.min(pctVal + 15, 90) + "%";
    }
    bullets=[bullets[0],"Wet board increases draw density - sizing up charges draws correctly",bullets[2]||bullets[1]];
  }
  if (spr<3&&action!=="Fold") bullets=[...bullets,"Low SPR ("+spr.toFixed(1)+")  -  stack-off range is in play"];
  // Filter altLines to only surface meaningful alternatives (> 0.5 BB EV difference implied)
  const filteredAltLines = (altLines||[]).filter(a => {
    const lower = a.toLowerCase();
    // Suppress "last resort" and trivially obvious lines
    return !lower.includes("last resort") && !lower.includes("n/a");
  });
  // - BOARD TEXTURE AGGRESSION OVERRIDE -
  // When board is highly dynamic AND hero has strong equity AND villain range is wide,
  // passive defaults are replaced with aggressive lines.
  // Fires BEFORE legality enforcement so it sets the correct action first.
  if (isHighDynamic && villainIsWide) {
    if (heroIsStrong && !facingBet && !isTerminal) {
      if (action === "Check" || action === "Call") {
        action = "Bet";
        sizing = isMono ? "75%" : "66%";
        tag = "Value + Protection";
        score = Math.min(92, (score||75) + 8);
        bullets = [
          isMono
            ? "Monotone board - charge draws and worse flushes immediately"
            : "Highly connected board - protect your equity while extracting value",
          "Villain range is wide - many dominated hands and draws will call",
          "Passive play loses value and gives free cards on dynamic boards",
        ];
        altLines = ["Check-raise if re-raised", "2/3 pot sizing also correct"];
      }
    } else if (heroIsStrong && facingBet) {
      if (action === "Call") {
        action = "Raise";
        sizing = sz.raise;
        tag = "Value Raise";
        score = Math.min(90, (score||75) + 6);
        bullets = [
          "Villain bet into a dynamic board with a wide range - your hand is well ahead",
          isMono
            ? "Raise denies equity to flush draws and dominated flushes"
            : "Raise to build the pot and deny free cards to drawing hands",
          "Calling under-realizes your equity against a wide betting range",
        ];
        altLines = ["Call (if villain is very tight)", "Re-raise if facing a raise"];
      }
    } else if (heroIsHighDraw && !facingBet && !isTerminal) {
      if (action === "Check") {
        action = "Bet";
        sizing = "50%";
        tag = "Semi-Bluff";
        score = Math.min(82, (score||70) + 5);
        bullets = [
          "Semi-bluff: your draw has enough equity to bet for fold equity + value",
          "Wide range folds mediocre hands - pick up the pot or build for when you hit",
          "Checking gives free cards to worse draws that may beat you",
        ];
        altLines = ["Check behind (pot control)", "Bet larger vs loose players"];
      }
    }
  }

  // - MULTIWAY POSTFLOP MODIFIER -
  // Live-calibrated for $1/$3 tables:
  //   - Flop bets in multiway = real hand (top pair+, nobody bluffs into 3 people)
  //   - Callers have mix of draws, pairs, and made hands
  //   - Pots frequently stay multiway to the river
  //   - Best value sizing: medium (50-66%), NOT big. Big bets fold out the draws you want calling.
  //   - Bluffing is VERY dangerous - someone always has a hand. Zero bluffs.
  //   - Marginal hands: fold to any bet, don't try to get to showdown cheaply.
  //   - When it checks around on flop: someone eventually stabs small on turn/river.
  const numOpponents = parseInt(state.playersLeft) || 1;
  const isMultiwayPot = state.isMultiway || numOpponents >= 2;
  let _multiway_note = null;

  if (isMultiwayPot && str !== "preflop") {
    const opps = numOpponents >= 3 ? numOpponents : 2;

    // Facing a bet in multiway: the bet is almost always real (top pair+).
    // Fold marginal hands aggressively. Only continue with strong hands or draws with odds.
    // Note: also catch action="Check" when facingBet, because legality enforcement will
    // convert it to Call later. We need to intercept before that happens.
    if (facingBet) {
      if (hs < 0.65 && (action === "Call" || action === "Check" || action === "Bet")) {
        action = "Fold"; sizing = null;
        tag = "Multiway Fold";
        score = Math.max(score, 76);
        bullets = [
          "Facing a bet in a " + (opps+1) + "-way pot - this bet is almost always a real hand",
          "With " + opps + " opponents, you need top pair or better to continue",
          "Fold and wait for a stronger spot - someone always has it in multiway",
        ];
        _multiway_note = "Multiway pot (" + opps + " opponents) - folding marginal hand to credible bet";
      } else if (hs >= 0.65) {
        _multiway_note = "Multiway pot (" + opps + " opponents) - continuing with strong holding";
      }
    }

    // Betting in multiway: medium sizing (50-66%), not big.
    // But if facing a bet, the Bet will be converted to Call/Raise by legality.
    // In multiway facing a bet, we already handled that above. Skip the bet sizing path.
    if ((action === "Bet" || action === "Raise") && !facingBet) {
      if (hs < 0.60) {
        // Not strong enough to bet into multiway - check
        action = "Check"; sizing = null;
        tag = "Multiway Pot Control";
        score = Math.max(score, 72);
        bullets = [
          "With " + opps + " opponents in the pot, only bet strong made hands",
          "Marginal hands lose value when multiple players can have you beat",
          "Check and let the action develop - someone will bet if they have it",
        ];
        altLines = ["Fold to any significant bet"];
        _multiway_note = "Multiway pot (" + opps + " opponents) - checking marginal hand";
      } else {
        // Strong hand: use MEDIUM sizing (50-66%), not big
        // Big bets fold out exactly the hands you want calling
        if (sizing && sizing.endsWith("%")) {
          const curPct = parseInt(sizing);
          if (!isNaN(curPct) && curPct > 66) {
            sizing = "60%";  // cap at 60% in multiway
          }
        }
        const mwBullet = "Multiway pot - medium sizing (50-66%) keeps draws and weak pairs calling";
        if (bullets.length >= 2) bullets[1] = mwBullet;
        else bullets.push(mwBullet);
        _multiway_note = "Multiway pot (" + opps + " opponents) - medium sizing for value";
      }
    }

    // Absolute bluff suppression in multiway - no exceptions at live low-stakes
    if (hs < 0.40 && (action === "Bet" || action === "Raise")) {
      action = "Check"; sizing = null;
      tag = "Multiway - No Bluff";
      score = Math.max(score, 74);
      bullets = [
        "Do not bluff into " + opps + " opponents - someone almost always has a hand",
        "Bluffing in multiway pots at live low-stakes is deeply -EV",
        "Check and fold to any bet without a strong hand or a draw",
      ];
      _multiway_note = "Multiway pot (" + opps + " opponents) - bluffs suppressed";
    }

    // Check-around exploit: when checked to in multiway on the turn after flop checked around,
    // a small stab takes the pot at high frequency (someone eventually bets small)
    const flopCheckedAround = str === "turn" && checkedTo &&
      !(vilAction||[]).some(a => a.street === "flop" && (a.type === "bet" || a.type === "raise"));
    if (flopCheckedAround && action === "Check" && hs >= 0.25 && heroIsIP) {
      action = "Bet"; sizing = "33%";
      tag = "Multiway Delayed Stab";
      score = 70;
      bullets = [
        "Flop checked around in a multiway pot - nobody wanted to bet into " + opps + " opponents",
        "A small turn bet takes this pot down frequently when nobody showed strength",
        "This is the live pattern: check-around on flop, someone stabs the turn",
      ];
      _multiway_note = "Multiway pot - exploiting the check-around with a delayed stab";
    }
  }

  // - ACTION LEGALITY ENFORCEMENT -
  // Remap actions that are illegal given the current node situation
  // Rule: Call only legal if facing a bet
  if (action === "Call" && !facingBet) {
    // No bet to call  -  convert to Check (if checked to) or Bet (if we should bet)
    if (hs >= 0.65) {
      action = "Bet"; sizing = sz.valueStrong || "66%";
      bullets = bullets ? bullets.map(b =>
        b.replace(/call down/gi,"bet for value").replace(/call/gi,"bet")
      ) : bullets;
      tag = tag && tag.includes("Catch") ? "Value Realization" : tag;
    } else {
      action = "Check"; sizing = null;
      bullets = bullets ? bullets.map(b =>
        b.replace(/call down/gi,"check back").replace(/calling/gi,"checking")
      ) : bullets;
    }
  }
  // Rule: terminal node  -  no trap/induce bullets
  if (isTerminal && action === "Check") {
    bullets = (bullets||[]).map(b => {
      const lower = b.toLowerCase();
      if (lower.includes("invite") || lower.includes("aggress") || lower.includes("trap") || lower.includes("induce") || lower.includes("let them bluff"))
        return "Check back for showdown value - river is complete, no further action";
      if (lower.includes("call down"))
        return "Check back to lock in equity - no more streets remain";
      return b;
    });
    if (tag === "Pot Control" && bullets && bullets[0] && bullets[0].includes("showdown"))
      tag = "Showdown Value";
  }
  // Rule: facing a bet, Check is not legal
  if (action === "Check" && facingBet) {
    // On monotone boards, raise the call threshold - pairs without a flush are nearly dead
    const monoBoard = tex && tex.mono;
    const heroSuited = heroCards[0].suit === heroCards[1].suit;
    const heroHasFlush = heroSuited && tex && (()=>{
      const heroSuit2 = heroCards[0].suit;
      const boardSuits = board.map(c=>c.suit);
      return boardSuits.filter(x=>x===heroSuit2).length >= 3;
    })();
    const callThreshold = (monoBoard && !heroHasFlush) ? 0.55 : 0.35;
    
    if (hs >= 0.60) {
      action = "Call"; sizing = null;
      tag = "Bluff Catch";
      bullets = ["Villain has taken an aggressive action - calling preserves equity", "Do not fold a strong hand when you can call profitably"];
    } else if (hs >= callThreshold) {
      action = "Call"; sizing = null;
      tag = "Pot Control";
      bullets = monoBoard && !heroHasFlush
        ? ["Calling on a monotone board without a flush draw is marginal", "Consider folding if villain shows further aggression"]
        : ["Calling is the correct action facing this bet size","Folding surrenders too much equity with your hand strength"];
    } else {
      action = "Fold"; sizing = null;
      tag = "Fold to Pressure";
      bullets = ["Hand does not have sufficient equity to call this bet","Folding preserves stack for better spots"];
    }
  }
  // Rule: facing a bet, Bet is not legal - must Raise
  if (action === "Bet" && facingBet) {
    if (hs >= 0.65) {
      action = "Raise"; sizing = sz.raise;
      tag = "Value Raise";
      bullets = ["Villain bet into you with a strong hand - raise for value",
        "Your hand is ahead of their betting range on this texture",
        "Raising builds the pot and charges their draws"];
    } else if (hs >= 0.40) {
      action = "Call"; sizing = null;
      tag = "Pot Control";
      bullets = ["Calling is the correct action facing this bet size","Raising risks bloating the pot with a marginal hand"];
    } else {
      action = "Fold"; sizing = null;
      tag = "Fold to Pressure";
      bullets = ["Hand does not have sufficient equity to continue","Folding preserves stack for better spots"];
    }
  }
  // Rule: Raise is not legal without a bet to raise - convert to Bet
  if (action === "Raise" && !facingBet) {
    action = "Bet";
    sizing = sz.valueStrong || "66%";
    tag = tag === "Value Realization" ? tag : "Value Bet";
    bullets = (bullets||[]).map(b =>
      b.replace(/\braise\b/gi,"bet").replace(/\bRaise\b/g,"Bet").replace(/\braising\b/gi,"betting")
    );
  }
  // Rule: Fold is not legal without a bet to fold to - convert to Check
  if (action === "Fold" && !facingBet) {
    action = "Check";
    sizing = null;
    tag = "Pot Control";
    bullets = [
      "No bet to fold to - check and see the next card for free",
      "With low equity, checking preserves your stack without investing more chips",
    ];
  }

  // - LIMPED POT POSTFLOP ADJUSTMENTS -
  // Based on live $1/$3 table dynamics:
  // 1. Flop bets in limped pots are often stabs - call lighter
  // 2. Turn bets in limped pots after a flop bet = real hand - fold more
  // 3. C-betting in limped pots: profitable on dry boards, not on wet boards
  // 4. When hero bets in a limped pot, add context about wide ranges
  let _limped_pot_context = null;
  if (isLimpedPot) {
    // Adjustment 1: Facing a flop bet in a limped pot - call wider (villain is stabbing)
    // BUT not on monotone boards, not in multiway pots (multiway fold takes priority), and not with total air
    if (limpedPotFlopBet && action === "Fold" && hs >= 0.28 && !(tex && tex.mono) && hs < 0.55 && !isMultiwayPot) {
      action = "Call"; sizing = null;
      tag = "Limped Pot Float";
      bullets = [
        "Limped pot flop bets are often stabs with weak holdings",
        "Calling is profitable because villain rarely fires the turn",
        "Plan to fold if villain bets the turn - that signals real strength",
      ];
      _limped_pot_context = "Limped pot - flop bet is likely a stab, calling is wider here";
    }
    // Adjustment 2: Facing a turn bet in a limped pot - fold wider (villain has it)
    if (limpedPotTurnBet && action === "Call" && hs < 0.55) {
      action = "Fold"; sizing = null;
      tag = "Limped Pot Fold";
      bullets = [
        "In a limped pot, a turn bet after the flop action signals real strength",
        "Villain's flop stab got called and they are betting again - this is not a bluff",
        "Fold marginal hands and wait for a better spot",
      ];
      _limped_pot_context = "Limped pot - turn bet after flop action is credible, folding marginal hands";
    }
    // Adjustment 3: C-betting in a limped pot - only on dry boards
    if (limpedPotCbet && action === "Bet" && !isDryBoard && hs < 0.60) {
      action = "Check"; sizing = null;
      tag = "Limped Pot Check";
      bullets = [
        "Wet board in a limped pot - c-betting is not profitable here",
        "Wide ranges connect with wet boards too often for a stab to work",
        "Check and re-evaluate - bet only when you have real equity",
      ];
      _limped_pot_context = "Limped pot on wet board - checking is preferred over stabbing";
    }
    // Adjustment 4: Add context note when limped pot is detected
    if (!_limped_pot_context && str !== "preflop") {
      _limped_pot_context = "Limped pot - ranges are wide and undefined, opponent bets are less credible on the flop";
    }
  }

  // - LIVE SIZING TELL ADJUSTMENTS -
  // These fire on any postflop street when villain has bet with a known dollar amount.
  if (str !== "preflop" && facingBet && vilBetDollarsNow > 0) {

    // Tell 1: Small bet (<33% pot) = blocker/weak. Call wider, consider raising.
    if (isSmallBet && action === "Fold" && hs >= 0.22) {
      action = "Call"; sizing = null;
      tag = "Call Blocker Bet";
      bullets = [
        "Small bet into a large pot is a classic blocker bet - villain is trying to see showdown cheap",
        "This sizing almost never represents a strong hand at live low-stakes",
        "Calling is highly profitable - you could also raise to take the pot",
      ];
      _sizing_tell = "Villain's small bet ($" + Math.round(vilBetDollarsNow) + " into $" + Math.round(potDollarsNow) + " pot) is a blocker bet - calling or raising is correct";
    }
    // Tell 2: Overbet (>80% pot) = near-nuts. Fold wider, only continue with very strong hands.
    // At live low-stakes, overbets are almost always the nuts. Top pair is not enough.
    // EXCEPTION: In small pots (<$30) or limped pots, pot-size bets are normal, not overbets.
    if (isOverbet && (action === "Call" || action === "Raise") && hs < 0.80 && potDollarsNow >= 30 && !isLimpedPot) {
      action = "Fold"; sizing = null;
      tag = "Fold to Overbet";
      bullets = [
        "Overbets at live low-stakes are almost always the nuts or near-nuts",
        "Very few players at this level overbet as a bluff",
        "Fold and wait for a better spot - this bet is exactly what it looks like",
      ];
      _sizing_tell = "Villain's overbet ($" + Math.round(vilBetDollarsNow) + " into $" + Math.round(potDollarsNow) + " pot) is almost always the nuts - fold without a premium hand";
    }
    // Tell 3: Double barrel = real hand. Tighten calling range.
    // EXCEPTION: Young aggro players barrel as default - double barrel is less meaningful
    if (isDoubleBarrel && action === "Call" && hs < 0.50 && !isSmallBet && archetype !== "young_aggro") {
      action = "Fold"; sizing = null;
      tag = "Fold to Double Barrel";
      bullets = [
        "Villain has bet two streets - at live low-stakes this signals a real hand",
        "Most players at this level do not fire a second barrel without genuine strength",
        "Fold marginal holdings and save your stack for a better spot",
      ];
      _sizing_tell = "Double barrel from villain - two bets signals real strength, folding without a strong hand";
    }
    // Tell 4: Triple barrel = near-nuts. Only continue with very strong hands.
    // EXCEPTION: Young aggro players fire all three streets regardless - their triple barrel
    // is NOT the nuts. The young_aggro archetype branch handles this correctly already.
    if (isTripleBarrel && action === "Call" && hs < 0.65 && archetype !== "young_aggro") {
      action = "Fold"; sizing = null;
      tag = "Fold to Triple Barrel";
      bullets = [
        "Triple barrel at live $1/$3 is almost always the nuts",
        "Villain has bet all three streets - this is not a bluff at these stakes",
        "Only continue with very strong hands - top two pair or better",
      ];
      _sizing_tell = "Triple barrel - villain has bet flop, turn, and river. At live low-stakes this is almost always a monster";
    }
  }

  // Tell 5: Bet-then-check exploit - villain bet flop, checked turn = giving up
  if (betThenCheck && checkedTo && str === "turn" && !_sizing_tell) {
    if (action === "Check" && hs >= 0.20) {
      // Villain showed weakness by checking after betting - stab to take the pot
      action = "Bet"; sizing = "33%";
      tag = "Exploit Check-Back";
      bullets = [
        "Villain bet the flop but checked the turn - this usually means a missed draw or marginal hand",
        "A small bet here takes down the pot at high frequency",
        "Villain gave up - capitalize on their weakness with a probe bet",
      ];
      _sizing_tell = "Villain bet flop then checked turn - classic weakness signal, probe bet to take the pot";
    } else if (!_sizing_tell) {
      _sizing_tell = "Villain bet the flop but checked the turn - this signals weakness (missed draw or giving up)";
    }
  }

  // Hero blocker bet: when hero has medium-strength hand on river and is first to act or checked to
  // Recommend a small 25-33% pot blocker bet instead of a large bet or check
  if (str === "river" && checkedTo && !_sizing_tell) {
    const isMediumHand = hs >= 0.45 && hs < 0.65;
    if (isMediumHand && action === "Bet" && sizing) {
      const curPct = parseInt(sizing);
      if (!isNaN(curPct) && curPct > 40) {
        // Downsize to blocker bet range
        sizing = "25%";
        tag = "Blocker Bet";
        bullets = [
          "Medium-strength hand on the river - a small bet controls the pot",
          "Betting small gets value from worse hands while avoiding a large raise",
          "This sizing blocks villain from making a large bet that puts you in a tough spot",
        ];
        _sizing_tell = "Blocker bet sizing - small river bet with medium hand controls the pot and avoids tough decisions";
      }
    } else if (isMediumHand && action === "Check") {
      // Consider betting small instead of checking
      action = "Bet"; sizing = "25%";
      tag = "Blocker Bet";
      bullets = [
        "A small river bet with a medium hand is more profitable than checking at live tables",
        "Villain will often fold marginal hands and only call with worse or better",
        "Checking gives villain the option to bet large and put you in a difficult spot",
      ];
      _sizing_tell = "Blocker bet line - betting small is better than checking with a medium-strength river hand";
    }
  }

  // - DONK BET ADJUSTMENTS -
  // When OOP villain leads into the preflop raiser, this is a donk bet.
  // At live low-stakes: donk bet = they hit at least a pair. Rarely a bluff.
  // Hero should: call with medium+ hands, fold weak hands, only raise with very strong hands.
  if (isDonkBet && !_sizing_tell) {
    if (donkIsSmall) {
      // Small donk bet = weak pair or "seeing where they're at"
      if (action === "Fold" && hs >= 0.30) {
        action = "Call"; sizing = null;
        tag = "Call Small Donk";
        bullets = [
          "Small donk bet usually means a weak pair or a feeler bet",
          "At this sizing you have excellent pot odds to continue",
          "Plan to take over the betting lead on the turn if they check",
        ];
      }
      _position_tell = "Small donk bet - villain has a weak pair or is testing. Call and take control on the turn.";
    } else if (donkIsBig) {
      // Big donk bet = strong hand, protect your stack
      if (action === "Call" && hs < 0.60) {
        action = "Fold"; sizing = null;
        tag = "Fold to Big Donk";
        bullets = [
          "Large donk bet from an OOP opponent signals genuine strength",
          "At live low-stakes, big leads into the raiser mean they have a real hand",
          "Fold without a strong holding - they are not bluffing at this sizing",
        ];
      }
      _position_tell = "Large donk bet - villain hit the board hard. Only continue with strong hands.";
    } else {
      // Standard donk bet = at least a pair
      if (action === "Raise" && hs < 0.72) {
        action = "Call"; sizing = null;
        tag = "Call Donk Bet";
        bullets = [
          "Donk bet means villain connected with the board - they have at least a pair",
          "Raising is rarely profitable against donk bettors at live low-stakes",
          "Call and re-evaluate on the turn - many donk bettors slow down",
        ];
      }
      if (!_position_tell) _position_tell = "Donk bet from OOP opponent - they hit at least a pair. Call and re-evaluate.";
    }
  }

  // - IP PROBE ADJUSTMENT -
  // When OOP villain checks to the preflop raiser (hero IP), they are giving up.
  // At live low-stakes: probe more aggressively on dry boards, check back on wet boards.
  if (oopCheckToRaiser && action === "Check" && !_sizing_tell) {
    if (isDryBoard && hs >= 0.25) {
      // Dry board + villain checked = high fold equity probe
      action = "Bet"; sizing = "33%";
      tag = "IP Probe";
      bullets = [
        "Villain checked to you on a dry board - they are giving up",
        "A small c-bet takes this pot down at high frequency",
        "Your position and the preflop initiative make this a profitable stab",
      ];
      _position_tell = "Villain checked dry board to preflop raiser - high fold equity probe";
    } else if (!isDryBoard && hs < 0.50) {
      // Wet board + weak hand = checking back is fine, don't stab into connected boards
      _position_tell = "Villain checked wet board - c-betting is less effective here, checking is fine";
    }
  }

  // - RIVER PLAY PATTERNS -
  // Live-calibrated for $1/$3 tables:
  //   Bet-bet-check (flop/turn then check river) = giving up, not trapping
  //   Check-check-bet (passive then river bet) = very strong, slow-played monster
  //   Small-small-BIG sizing escalation = two pair+ (very strong)
  //   Scare card + bet = draw usually got there
  //   Hero river bluffs = never at $1/$3 (population calls too much)
  //   Thin value betting when checked to = recommended (addresses leak)
  let _river_tell = null;

  if (str === "river") {
    const vilFlopBetR = (vilAction||[]).find(a => a.street === "flop" && a.actor === "Villain" && (a.type === "bet" || a.type === "raise"));
    const vilTurnBetR = (vilAction||[]).find(a => a.street === "turn" && a.actor === "Villain" && (a.type === "bet" || a.type === "raise"));
    const vilRiverBetR = (vilAction||[]).find(a => a.street === "river" && a.actor === "Villain" && (a.type === "bet" || a.type === "raise"));
    const vilFlopCheckR = (vilAction||[]).find(a => a.street === "flop" && a.actor === "Villain" && a.type === "check");
    const vilTurnCheckR = (vilAction||[]).find(a => a.street === "turn" && a.actor === "Villain" && a.type === "check");
    const vilRiverCheckR = (vilAction||[]).find(a => a.street === "river" && a.actor === "Villain" && a.type === "check");

    // Pattern 1: Bet-bet-check = giving up. Hero should value bet with any showdown hand.
    const betBetCheck = vilFlopBetR && vilTurnBetR && vilRiverCheckR && !vilRiverBetR;
    if (betBetCheck && checkedTo) {
      if (hs >= 0.35 && (action === "Check" || !action)) {
        action = "Bet"; sizing = "50%";
        tag = "River Value (Villain Gave Up)";
        score = 78;
        bullets = [
          "Villain bet flop and turn but checked the river - they are giving up",
          "At live low-stakes, this almost always means they missed a draw or have a marginal hand",
          "Bet for thin value - they will call with worse or fold, either outcome is profitable",
        ];
        _river_tell = "Bet-bet-check pattern - villain gave up on the river. Value bet with any showdown hand.";
      } else if (hs >= 0.35) {
        _river_tell = "Villain bet two streets then checked river - classic giving-up pattern. Value betting is profitable.";
      }
    }

    // Pattern 2: Check-check-bet = very strong (slow-played monster). Fold without a premium.
    const checkCheckBet = vilFlopCheckR && vilTurnCheckR && vilRiverBetR && facingBet;
    if (checkCheckBet) {
      if (hs < 0.80 && (action === "Call" || action === "Check" || action === "Bet" || action === "Raise")) {
        action = "Fold"; sizing = null;
        tag = "Fold to River Wake-Up";
        score = 80;
        bullets = [
          "Villain checked two streets then suddenly bet the river - this is a very strong hand",
          "At live low-stakes, this pattern almost always means they slow-played a monster",
          "Fold without a premium hand - they want to get paid now",
        ];
        _river_tell = "Check-check-bet pattern - villain slow-played a strong hand. Only continue with very strong holdings.";
      } else if (hs >= 0.80) {
        _river_tell = "Villain checked two streets then bet river - slow-play pattern. Your hand is strong enough to continue.";
      }
    }

    // Pattern 3: Sizing escalation (small-small-BIG) = two pair+ on the river.
    if (vilFlopBetR && vilTurnBetR && vilRiverBetR && facingBet) {
      const flopAmt = vilFlopBetR.amount ? parseFloat(vilFlopBetR.amount) : 0;
      const turnAmt = vilTurnBetR.amount ? parseFloat(vilTurnBetR.amount) : 0;
      const riverAmt = vilRiverBetR.amount ? parseFloat(vilRiverBetR.amount) : 0;
      if (flopAmt > 0 && turnAmt > 0 && riverAmt > 0 && riverAmt > turnAmt * 1.5 && riverAmt > flopAmt * 2) {
        // River bet is significantly larger than prior streets = sizing escalation
        if (hs < 0.75 && !_river_tell) {
          action = "Fold"; sizing = null;
          tag = "Fold to Sizing Escalation";
          score = 82;
          bullets = [
            "Villain bet small on flop and turn, then bet big on the river - sizing escalation",
            "At live low-stakes, this pattern signals two pair or better",
            "They were building the pot quietly and now want maximum value",
          ];
          _river_tell = "Small-small-BIG sizing escalation - villain has two pair+ and wants to get paid.";
        }
      }
    }

    // Pattern 4: Scare card awareness. When flush/straight completes and villain bets, tighten up.
    if (facingBet && board && board.length === 5 && !_river_tell) {
      const riverCard = board[4];
      const riverSuit = riverCard.suit;
      const boardSuits = board.map(c => c.suit);
      const suitCount = boardSuits.filter(s => s === riverSuit).length;
      const flushCompleted = suitCount >= 3; // river made 3+ of one suit on board

      const boardRanks = board.map(c => RANKS.indexOf(c.rank)).sort((a,b) => a-b);
      const uniqueRanks = [...new Set(boardRanks)];
      let bestRun = 1, curRun = 1;
      for (let si = 1; si < uniqueRanks.length; si++) {
        if (uniqueRanks[si] - uniqueRanks[si-1] === 1) { curRun++; if (curRun > bestRun) bestRun = curRun; }
        else curRun = 1;
      }
      const straightPossible = bestRun >= 3; // 3+ consecutive on board = straight possible

      if ((flushCompleted || straightPossible) && hs < 0.65) {
        if (action === "Call") {
          action = "Fold"; sizing = null;
          tag = "Fold to Scare Card";
          score = 76;
          bullets = [
            flushCompleted
              ? "A flush completed on the river and villain is betting - they usually have it"
              : "A straight is possible on this board and villain is betting after it completed",
            "At live low-stakes, river bets when draws complete are reliable tells",
            "Fold without a strong hand - the draw got there",
          ];
          _river_tell = (flushCompleted ? "Flush" : "Straight") + " completed on the river and villain is betting - usually means they got there.";
        }
      }
    }

    // Pattern 5: Hero river bluff suppression. Never bluff the river at $1/$3.
    if (action === "Bet" && hs < 0.35 && !_river_tell) {
      action = "Check"; sizing = null;
      tag = "No River Bluff";
      score = 75;
      bullets = [
        "River bluffs do not work at live $1/$3 - the population calls too much",
        "Check and accept the showdown result rather than investing more chips",
        "Save your bluffing for earlier streets where fold equity exists",
      ];
      _river_tell = "River bluffs are -EV at live low-stakes. Check and take the showdown.";
    }

    // Pattern 6: Thin value betting when checked to on the river.
    // This addresses the identified leak: checking back too much with showdown value.
    // When villain checks river, hero should bet thinner than instinct says.
    if (checkedTo && !_river_tell && hs >= 0.45 && hs < 0.72) {
      if (action === "Check") {
        action = "Bet"; sizing = "33%";
        tag = "Thin River Value";
        score = 72;
        bullets = [
          "Villain checked the river - they don't have a strong hand",
          "A small value bet gets called by worse hands more often than you think",
          "Checking back with showdown value leaves money on the table at live tables",
        ];
        _river_tell = "Thin value bet when checked to on the river - villain's check signals weakness, bet small for value.";
      }
    }
  }

  // Deduplicate bullets (legality rewrites can create identical strings)
  if (bullets) {
    bullets = bullets.filter((b, i, arr) => arr.indexOf(b) === i);
    if (bullets.length === 0) bullets = ["No further action possible - showdown value applies"];
  }

  // Build enriched sizing model per spec
  let size_dollars = null, size_bb = null, pot_percentage = null, sizingLabel = null;
  if (sizing && potSize > 0) {
    if (sizing.endsWith("%")) {
      const pct = parseFloat(sizing)/100;
      const rawBB = potSize * pct;
      size_bb = Math.round(rawBB * 10)/10;
      const rawDollars = rawBB * (bigBlind||3);
      size_dollars = rawDollars < 10 ? Math.round(rawDollars*2)/2 : Math.round(rawDollars);
      pot_percentage = parseFloat(sizing);
      sizingLabel = "$"+size_dollars+" ("+sizing+" pot)";
    } else if (sizing.endsWith("x")) {
      const mult = parseFloat(sizing);
      // For raises/re-raises: if villain bet/raised, size relative to their amount
      // Standard raise sizing: villain_amount * multiplier
      const vilRaiseAmt = (vilAction||[]).filter(a=>a.type==="bet"||a.type==="raise").slice(-1)[0];
      const vilDollars = vilRaiseAmt && vilRaiseAmt.amount ? parseFloat(vilRaiseAmt.amount) : 0;
      let rawBB2;
      if (vilDollars > 0 && (bigBlind||3) > 0) {
        // Raise relative to villain's bet: villain_amount * mult
        const vilBB = vilDollars / (bigBlind||3);
        rawBB2 = vilBB * mult;
      } else {
        // Fallback: pot-relative if no villain amount
        rawBB2 = potSize * mult;
      }
      size_bb = Math.round(rawBB2 * 10)/10;
      const rawD2 = rawBB2 * (bigBlind||3);
      size_dollars = rawD2 < 10 ? Math.round(rawD2*2)/2 : Math.round(rawD2);
      sizingLabel = "$"+size_dollars+" ("+sizing+(vilDollars>0?" of $"+vilDollars:"")+")";
    }
  }
  return { action, sizing, size_dollars, size_bb, pot_percentage, sizingLabel,
    bullets, tag, score, foldEq:foldEq!==undefined?foldEq:Math.round(p.foldFlop*hs), str, tex, hs, altLines:filteredAltLines, _multiway_note, _limped_pot_context, _sizing_tell, _position_tell, _river_tell };
}

function catRange(range) {
  const cats={"Overpairs":0,"Top Pair":0,"Middle Pair":0,"Sets":0,"Flush Draws":0,"Straight Draws":0,"Air":0};
  Object.entries(range).forEach(([hand,w]) => {
    if (w<0.05) return;
    const isPair=hand[0]===hand[1],isSuited=hand.endsWith("s"),ri=RANKS.indexOf(hand[0]);
    if (isPair)        { cats[ri<=3?"Overpairs":"Sets"]+=w; }
    else if (isSuited) { cats["Flush Draws"]+=w*0.22; cats["Straight Draws"]+=w*0.18; cats[ri<=4?"Top Pair":"Middle Pair"]+=w*0.35; cats["Air"]+=w*0.15; }
    else               { cats[ri<=3?"Top Pair":"Middle Pair"]+=w*0.30; cats["Air"]+=w*0.50; }
  });
  const total=Object.values(cats).reduce((a,b)=>a+b,0);
  const out={};
  Object.entries(cats).forEach(([k,v])=>{ out[k]=total>0?Math.round((v/total)*100):0; });
  return out;
}

function parseCardInput(input) {
  if (!input) return { cards:[], partial:null, error:null };
  const str=input.trim().toUpperCase();
  const suitMap={S:"s",H:"h",D:"d",C:"c"};
  const tokens=str.match(/[AKQJT2-9][SHDC]?/gi)||[];
  const cards=[]; let partial=null;
  for (let i=0;i<Math.min(tokens.length,2);i++) {
    const t=tokens[i], rank=t[0], suit=t[1]?suitMap[t[1].toUpperCase()]:null;
    if (!RANKS.includes(rank)) return { cards, partial, error:"Invalid rank: "+rank };
    if (t[1]&&!suit) return { cards, partial, error:"Invalid suit: "+t[1] };
    if (suit) cards.push({rank,suit}); else partial={rank};
  }
  return { cards, partial, error:null };
}


// ================================================================
// RANGE STORYLINE ENGINE
// Translates raw range data into human-readable narrative insights
// ================================================================
// computeRangeNarrative - full version at L676
// (duplicate removed)
function _computeRangeNarrativeLegacy(prevRange, currRange, street, archetype) {
  if (!prevRange||!currRange) return null;
  const p = ARCHETYPES[archetype];

  function getCategories(range) {
    let value=0, draw=0, air=0, pair=0;
    Object.entries(range).forEach(([hand,w]) => {
      if (w<0.05) return;
      const isPair=hand[0]===hand[1], isSuited=hand.endsWith("s");
      const ri=RANKS.indexOf(hand[0]);
      if (isPair&&ri<=4)      value+=w;
      else if (isPair)         pair+=w;
      else if (isSuited)       draw+=w;
      else                     air+=w;
    });
    const total=value+draw+air+pair||1;
    return { value:value/total, draw:draw/total, air:air/total, pair:pair/total };
  }

  const prev=getCategories(prevRange);
  const curr=getCategories(currRange);
  const valueDelta=curr.value-prev.value;
  const drawDelta=curr.draw-prev.draw;
  const airDelta=curr.air-prev.air;

  const prevTotal=Object.values(prevRange).filter(v=>v>0.1).length;
  const currTotal=Object.values(currRange).filter(v=>v>0.1).length;
  const combosRemoved=Math.max(0,prevTotal-currTotal);
  const rangeReduction=prevTotal>0?Math.round((combosRemoved/prevTotal)*100):0;

  const insights=[];
  const vulnerability=[];

  // Value insights
  if (valueDelta < -0.08) {
    insights.push({ type:"value", text:"Value hands removed - range weakening", col:"#F87171" });
  } else if (valueDelta > 0.06) {
    insights.push({ type:"value", text:"Value-heavy distribution - range strengthening", col:"#10B981" });
  }

  // Draw insights
  if (drawDelta > 0.08) {
    insights.push({ type:"draw", text:"Draw-heavy distribution on this street", col:"#F59E0B" });
    vulnerability.push("Opponent vulnerable to aggression on wet runouts");
  } else if (drawDelta < -0.06) {
    insights.push({ type:"draw", text:"Draw combos removed - range more defined", col:"#3B82F6" });
  }

  // Air / bluff insights
  if (airDelta > 0.08) {
    insights.push({ type:"air", text:"Air increasing - more bluff candidates in range", col:"#8B5CF6" });
    vulnerability.push("Range capped - susceptible to large bets");
  } else if (airDelta < -0.06) {
    insights.push({ type:"air", text:"Bluffs removed - range becoming more condensed", col:"#94A3B8" });
  }

  // Range compression summary
  if (rangeReduction > 30) {
    insights.push({ type:"compression", text:rangeReduction+"% of combos eliminated this street", col:"#E6C566" });
  }

  // Vulnerability conclusion
  if (curr.air > 0.4) vulnerability.push("High air density - positional pressure effective");
  if (curr.value > 0.35) vulnerability.push("Value-dense - proceed cautiously with bluffs");

  return {
    street, insights, vulnerability, rangeReduction,
    valueDelta:Math.round(valueDelta*100),
    drawDelta:Math.round(drawDelta*100),
    airDelta:Math.round(airDelta*100),
    prevCombos:prevTotal*6, currCombos:currTotal*4,
  };
}

// ================================================================
// EXPLOIT DELTA ENGINE
// Compares GTO baseline vs exploit strategy, calculates EV gain
// ================================================================
function computeExploitDelta(heroCards, archetype, heroIsIP, board, potSize, stackBB) {
  const p = ARCHETYPES[archetype];
  const hs = heroStrength(heroCards, board);
  const tex = analyzeBoard(board);
  const spr = potSize > 0 ? stackBB / potSize : 15;

  // GTO baseline - balanced strategy ignoring opponent tendencies
  let gtoAction, gtoSizing, gtoEV;
  const wet = tex ? tex.wet : 0;
  if (hs >= 0.72)      { gtoAction="Bet";   gtoSizing=wet>=3?"66%":"50%"; gtoEV=0; }
  else if (hs >= 0.52) { gtoAction="Bet";   gtoSizing="33%"; gtoEV=0; }
  else if (hs >= 0.38) { gtoAction=heroIsIP?"Check":"Check"; gtoSizing=null; gtoEV=0; }
  else if (hs >= 0.22) { gtoAction="Check"; gtoSizing=null; gtoEV=0; }
  else                 { gtoAction="Fold";  gtoSizing=null; gtoEV=0; }

  // Exploit recommendation
  const exploitRec = recommend({ heroCards, archetype, heroIsIP, board, potSize, stackBB });

  // EV delta calculation based on opponent tendencies - fully deterministic
  // Formula: gain = how much villain deviates from GTO x stake of decision x hand strength factor
  let evGain = 0;
  const foldFreq = p.foldFlop / 100;
  const callFreq = 1 - foldFreq;
  const bluffFreq = p.bluffFreq / 100;
  const archMod = ARCHETYPE_MODIFIERS[archetype] || {};
  const callAdj = archMod.call_freq || 0;
  const effectiveCallFreq = Math.min(0.95, Math.max(0.05, callFreq + callAdj));
  const effectiveFoldFreq = 1 - effectiveCallFreq;
  // hsMult: scales gain by how extreme the hand strength is (strong hands = more value; air = more bluff equity)
  const hsMult = 0.5 + Math.abs(hs - 0.5);
  // aggrFactor: scales exploit gains by villain aggression tendency (LAG/maniac exploit more from trapping)
  const aggrFactor = 1 + (archMod.aggression || 0);

  // Exploit gains vs GTO by archetype
  if (archetype === "station") {
    // Station calls too wide: value bets gain from extra calls; bluffs lose from calls
    if (exploitRec.action === "Bet" && gtoAction === "Check") {
      evGain = +(effectiveCallFreq * potSize * 0.4 * hsMult).toFixed(1);
    } else if (exploitRec.action === "Check" && gtoAction === "Bet") {
      evGain = +(effectiveFoldFreq * potSize * 0.25).toFixed(1);
    } else {
      evGain = +(effectiveCallFreq * potSize * 0.15 * hsMult).toFixed(1);
    }
  } else if (archetype === "nit") {
    // Nit folds too much: steals and small bets achieve full fold equity cheaply
    if (exploitRec.action === "Bet" && exploitRec.sizing === "33%") {
      evGain = +(effectiveFoldFreq * potSize * 0.6 * hsMult).toFixed(1);
    } else if (exploitRec.action === "Bet") {
      evGain = +(effectiveFoldFreq * potSize * 0.45).toFixed(1);
    } else {
      evGain = +(effectiveFoldFreq * potSize * 0.2).toFixed(1);
    }
  } else if (archetype === "maniac") {
    // Maniac bluffs too much: trapping gains from their bluff frequency
    if (exploitRec.action === "Check" && gtoAction === "Bet") {
      evGain = +(bluffFreq * potSize * 0.5 * effectiveCallFreq).toFixed(1);
    } else if (exploitRec.action === "Bet") {
      evGain = +(effectiveCallFreq * potSize * 0.35 * hsMult).toFixed(1);
    } else {
      evGain = +(bluffFreq * potSize * 0.3).toFixed(1);
    }
  } else if (archetype === "rec" || archetype === "loose_passive") {
    // Rec/Loose passive: calls too wide -> value bets gain most, bluffs lose
    // Key exploit: bet wider for value, never bluff
    if (exploitRec.action === "Bet" || exploitRec.action === "Open Raise" || exploitRec.action === "Isolate Raise") {
      // Value bet vs wide caller: gain = extra calls from dominated/weak hands
      evGain = +(effectiveCallFreq * potSize * 0.45 * hsMult).toFixed(1);
    } else if (exploitRec.action === "Check") {
      // Checking vs calling station: modest gain from pot control, avoiding bad runouts
      evGain = +(effectiveFoldFreq * potSize * 0.2).toFixed(1);
    } else {
      evGain = +(effectiveCallFreq * potSize * 0.3 * hsMult).toFixed(1);
    }
  } else if (archetype === "lag") {
    // LAG: wide range, high aggression -> check-raising and trapping gains most
    if (exploitRec.action === "Check" && gtoAction === "Bet") {
      evGain = +(aggrFactor * potSize * 0.4 * effectiveCallFreq).toFixed(1);
    } else if (exploitRec.action === "Bet") {
      evGain = +(effectiveCallFreq * potSize * 0.3 * hsMult).toFixed(1);
    } else {
      evGain = +(aggrFactor * potSize * 0.25).toFixed(1);
    }
  } else if (archetype === "tag") {
    // TAG: balanced but folds to pressure -> well-timed bets gain fold equity
    const scoreDev = Math.abs(exploitRec.score - 63) / 100;
    if (exploitRec.action === "Bet") {
      evGain = +(effectiveFoldFreq * potSize * 0.35 * hsMult + scoreDev * potSize * 0.2).toFixed(1);
    } else {
      evGain = +(scoreDev * potSize * 0.3 * hsMult).toFixed(1);
    }
  } else {
    // unknown/mixed: conservative estimate based on score deviation
    const scoreDev = Math.abs(exploitRec.score - 63) / 100;
    evGain = +(scoreDev * potSize * 0.4 * hsMult).toFixed(1);
  }

  // SPR adjustment
  if (spr < 3) evGain = +(evGain * 1.4).toFixed(1);
  if (spr > 15) evGain = +(evGain * 0.7).toFixed(1);

  const isSameAction = gtoAction === exploitRec.action && gtoSizing === exploitRec.sizing;

  return {
    gto: { action:gtoAction, sizing:gtoSizing, label:"GTO Baseline" },
    exploit: { action:exploitRec.action, sizing:exploitRec.sizing, label:"Exploit Line" },
    evGain: isSameAction ? 0 : evGain,
    evGainLabel: evGain > 0 ? "+"+evGain+"bb/100" : "0bb/100",
    isSameAction,
    exploitScore: exploitRec.score,
    insight: isSameAction
      ? "GTO and exploit lines converge here - opponent profile does not create a meaningful edge"
      : "Exploiting "+p.label+" tendencies gains "+evGain+"bb/100 vs balanced play",
  };
}

// ================================================================
// EXPLOIT EDGE HELPER + BADGE COMPONENT
// Replaces user-facing "Exploit Delta" naming throughout the app
// Internal computeExploitDelta logic is preserved unchanged.
// ================================================================
function getExploitEdgeLevel(evGain) {
  if (evGain >= 2) return { label:"HIGH",    color:"#22C55E", bg:"rgba(34,197,94,0.12)",  border:"rgba(34,197,94,0.3)"  };
  if (evGain >= 1) return { label:"MODERATE", color:"#EAB308", bg:"rgba(234,179,8,0.12)",  border:"rgba(234,179,8,0.3)"  };
  return              { label:"LOW",      color:"#6B7280", bg:"rgba(107,114,128,0.12)", border:"rgba(107,114,128,0.3)" };
}

// ExploitEdgeBadge  -  reusable across decision panel, Play the Spot, result screen
function ExploitEdgeBadge({ value, label, description, color, showTooltip }) {
  const [tip, setTip] = useState(false);
  const edge = getExploitEdgeLevel(value);
  const col   = color || edge.color;
  const lbl   = label || edge.label;
  const desc  = description || (value > 0 ? "Clear exploit opportunity" : "Lines converge near equilibrium");

  return (
    <div style={{ position:"relative", display:"inline-flex", flexDirection:"column", gap:4 }}>
      {/* Main badge row */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
        borderRadius:8, background:edge.bg, border:"1px solid "+edge.border }}>
        {/* Label + value */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
            <span style={{ fontSize:10, fontWeight:700, color:col, textTransform:"uppercase",
              letterSpacing:"0.1em" }}>Exploit Edge</span>
            <span style={{ padding:"1px 7px", borderRadius:99, background:col+"22",
              color:col, fontSize:10, fontWeight:800, letterSpacing:"0.06em" }}>{lbl}</span>
            {/* Tooltip trigger */}
            {showTooltip!==false&&(
              <span onMouseEnter={()=>setTip(true)} onMouseLeave={()=>setTip(false)}
                style={{ width:14, height:14, borderRadius:"50%", background:"rgba(255,255,255,0.08)",
                  color:"#6B7280", fontSize:9, fontWeight:700, display:"inline-flex",
                  alignItems:"center", justifyContent:"center", cursor:"default", flexShrink:0 }}>?</span>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ fontSize:20, fontWeight:800, color:col, lineHeight:1 }}>
              {value>0?"+":""}{value}
            </span>
            <span style={{ fontSize:11, color:"#9CA3AF", fontWeight:500 }}>BB vs baseline</span>
          </div>
        </div>
        {/* Right arrow indicator */}
        <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          <div style={{ fontSize:18, color:col, lineHeight:1 }}>&#8594;</div>
          <div style={{ fontSize:9, color:col, fontWeight:600, textTransform:"uppercase",
            letterSpacing:"0.06em" }}>{lbl}</div>
        </div>
      </div>
      {/* Description line */}
      <div style={{ fontSize:11, color:"#9CA3AF", paddingLeft:2 }}>
        &#8594; {desc}
      </div>
      {/* Tooltip */}
      {tip&&(
        <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:0, zIndex:50,
          background:"#1F2937", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8,
          padding:"10px 12px", width:260, fontSize:11, color:"#9CA3AF", lineHeight:1.6,
          boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>
          Exploit Edge measures how much more profitable the optimal exploit is compared to standard play.
        </div>
      )}
    </div>
  );
}

// ================================================================
// SIMULATION ENGINE
// Full interactive Play the Spot session state machine
// ================================================================
function createSimSession(heroCards, archetype, board, potSize, stackBB, heroIsIP) {
  const p = ARCHETYPES[archetype];
  const streets = ["flop","turn","river"];
  const currentStreetIdx = board.length === 3 ? 0 : board.length === 4 ? 1 : 2;

  return {
    id: Date.now(),
    heroCards,
    archetype,
    board,
    potSize,
    stackBB,
    heroIsIP,
    street: streets[currentStreetIdx] || "flop",
    streetIdx: currentStreetIdx,
    actions: [],
    totalEV: 0,
    optimalEV: 0,
    complete: false,
    score: 0,
    maxScore: 0,
  };
}

function simEvaluateAction(session, chosenAction) {
  const rec = recommend({
    heroCards: session.heroCards, archetype: session.archetype,
    heroIsIP: session.heroIsIP, board: session.board,
    potSize: session.potSize, stackBB: session.stackBB,
  });

  const isOptimal = chosenAction.toLowerCase().includes(rec.action.toLowerCase()) ||
    (rec.sizing && chosenAction.includes(rec.sizing.replace("%","")));

  // Deterministic EV delta: penalty scales with score deviation, pot size, and archetype call tendency
  const archModSim = ARCHETYPE_MODIFIERS[session.archetype] || {};
  const pSim = ARCHETYPES[session.archetype];
  const hsSim = heroStrength(session.heroCards, session.board);
  const callAdjSim = archModSim.call_freq || 0;
  const effectiveCallSim = Math.min(0.95, Math.max(0.05, (1 - pSim.foldFlop/100) + callAdjSim));
  const scorePenalty = isOptimal ? 0 : Math.max(0, (100 - rec.score) / 100);
  const hsMult = 0.5 + Math.abs(hsSim - 0.5);
  const evDelta = isOptimal ? 0 : -+((scorePenalty * session.potSize * 0.3 + effectiveCallSim * session.potSize * 0.1) * hsMult).toFixed(1);
  const pointsEarned = isOptimal ? 10 : Math.max(0, 10 - Math.round(Math.abs(evDelta) * 0.8));

  // Generate villain response - deterministic based on archetype fold tendency
  // villain folds if foldFlop >= 55 (tendency threshold, not random coin flip)
  const p = ARCHETYPES[session.archetype];
  let villainResponse, villainRange;

  if (chosenAction === "Fold") {
    villainResponse = "Hero folds. Hand complete.";
    villainRange = "N/A";
  } else if (chosenAction.toLowerCase().includes("bet") || chosenAction === "Raise") {
    const folds = p.foldFlop >= 55; // deterministic: nit/tag fold, station/maniac call
    villainResponse = folds
      ? p.label+" folds. Pot awarded to hero."
      : p.label+" calls. Pot grows to "+(session.potSize*2)+"bb.";
    villainRange = folds ? "Folded range" : "Calling range - pairs, draws, weak hands";
  } else {
    villainResponse = p.aggression > 60
      ? p.label+" bets "+Math.round(session.potSize*0.65)+"bb aggressively."
      : p.label+" checks back.";
    villainRange = p.aggression > 60 ? "Polar betting range" : "Check-back range";
  }

  const actionRecord = {
    street: session.street,
    chosen: chosenAction,
    optimal: rec.action + (rec.sizing ? " "+rec.sizing : ""),
    isOptimal,
    evDelta: evDelta.toFixed(1),
    pointsEarned,
    villainResponse,
    villainRange,
    explanation: rec.bullets ? rec.bullets[0] : "",
  };

  const newSession = {
    ...session,
    actions: [...session.actions, actionRecord],
    totalEV: session.totalEV + evDelta,
    optimalEV: session.optimalEV + 0,
    score: session.score + pointsEarned,
    maxScore: session.maxScore + 10,
    complete: session.streetIdx >= 2 || chosenAction === "Fold",
  };

  return { session: newSession, actionRecord, rec };
}


// ================================================================
// RANGE STORYLINE PANEL (enhanced with narrative)
// ================================================================
function classifyRange(range) {
  let value=0, draw=0, air=0, pair=0, total=0;
  Object.entries(range).forEach(([hand,w]) => {
    if (w<0.05) return; total+=w;
    const isPair=hand[0]===hand[1], isSuited=hand.endsWith("s"), ri=RANKS.indexOf(hand[0]);
    if (isPair&&ri<=4) value+=w; else if (isPair) pair+=w; else if (isSuited) draw+=w; else air+=w;
  });
  const t=total||1;
  return { value:value/t, draw:draw/t, air:air/t, pair:pair/t, combos:Object.values(range).filter(v=>v>0.1).length };
}

function computeRangeDeltaV2(prev, curr) {
  return {
    valueDelta: curr.value-prev.value, drawDelta: curr.draw-prev.draw,
    airDelta: curr.air-prev.air, pairDelta: curr.pair-prev.pair,
    comboReduction: Math.max(0,prev.combos-curr.combos),
    comboReductionPct: prev.combos>0 ? Math.round(((prev.combos-curr.combos)/prev.combos)*100) : 0,
    isCapped: curr.value < prev.value*0.7,
    isPolar: curr.value>0.3 && curr.air>0.35,
    isDrawHeavy: curr.draw>0.3,
  };
}

function computeRangeNarrative(prevRange, currRange, street, archetype, bigBlind, board, vilAction, prevStreet) {
  if (!prevRange||!currRange) return null;
  const pc=classifyRange(prevRange), cc=classifyRange(currRange);
  const delta=computeRangeDeltaV2(pc, cc);
  const prevSt=prevStreet||"preflop";
  const pop=buildPopulationProfile(bigBlind||3, archetype, board||[], street, vilAction||[]);
  const tex = analyzeBoard(board||[]);
  const boardLabel = tex ? tex.label.toLowerCase() : "unknown";
  const lastVilAct = (vilAction||[]).filter(a=>a.street===street).slice(-1)[0];
  const vilActType = lastVilAct ? lastVilAct.type : null;

  // --- Archetype-aware narrative descriptions ---
  const ARCH_NAMES = { station:"Calling Station", nit:"Nit", lag:"LAG", maniac:"Maniac", loose_passive:"Loose Passive", tag:"TAG", rec:"Recreational", unknown:"Unknown" };
  const vilName = ARCH_NAMES[archetype] || "Villain";

  // --- TRANSITION: What changed from previous street ---
  const transition=[];
  if (delta.comboReductionPct > 30) {
    const why = vilActType === "call" ? "by calling" : vilActType === "bet" ? "by betting" : vilActType === "raise" ? "by raising" : "with this action";
    transition.push({ text:vilName+" narrowed their range significantly "+why+" - "+delta.comboReductionPct+"% of hands eliminated from "+prevSt+".", col:"#E6C566" });
  } else if (delta.comboReductionPct > 10) {
    transition.push({ text:"Range narrowed moderately on the "+street+" - "+delta.comboReductionPct+"% of "+prevSt+" hands removed.", col:"#E6C566" });
  } else if (delta.comboReductionPct > 0) {
    transition.push({ text:vilName+"'s range narrowed slightly on the "+street+" - "+delta.comboReductionPct+"% of hands removed. Their range remains mostly intact.", col:"#9CA3AF" });
  } else {
    transition.push({ text:vilName+"'s range is stable - no significant changes from "+prevSt+". They are continuing with roughly the same set of hands.", col:"#9CA3AF" });
  }
  if (delta.isCapped) {
    transition.push({ text:vilName+"'s range is now capped - their strongest hands would have raised on "+prevSt+". They are unlikely to hold the nuts.", col:"#F87171" });
  } else if (delta.valueDelta > 0.07) {
    transition.push({ text:"Value density is increasing. The remaining hands are stronger on average - "+vilName+" shed their weakest holdings.", col:"#10B981" });
  }
  if (delta.drawDelta < -0.08) {
    transition.push({ text:"Draw combos have been removed. "+vilName+"'s range is more defined now - fewer speculative hands remain.", col:"#3B82F6" });
  } else if (delta.drawDelta > 0.08) {
    transition.push({ text:"The "+street+" card improved drawing hands in "+vilName+"'s range. More straight and flush draws are now active.", col:"#F59E0B" });
  }

  // --- STATE: What the range looks like now ---
  const currentState=[];
  if (cc.value > 0.35) {
    currentState.push({ text:vilName+"'s remaining range is value-heavy. They hold mostly made hands - pairs, two pair, or better. Be cautious with thin value bets.", col:"#10B981" });
  } else if (cc.value < 0.10) {
    currentState.push({ text:vilName+"'s range is mostly draws and air right now. Very few made hands remain - this is a good spot to apply pressure.", col:"#F87171" });
  } else {
    currentState.push({ text:vilName+" holds a mixed range - some value hands, some draws, some air. Board texture and position determine the best line.", col:"#9CA3AF" });
  }
  if (cc.draw > 0.30 && street !== "river") {
    currentState.push({ text:"Significant draw density remains. On the "+boardLabel+" board, "+vilName+" likely has straight draws, flush draws, or both. Charge them before the next card.", col:"#F59E0B" });
  }
  if (cc.air > 0.40) {
    const airAdvice = archetype === "maniac" ? "This is normal for a Maniac - let them bluff and call down with medium strength."
      : archetype === "station" ? "Even with this much air, Calling Stations will not fold. Value bet relentlessly."
      : archetype === "nit" ? "Unusual air density for a Nit - they may have missed a draw. A small bet takes it down."
      : "High air content means bluff-catching with medium hands is profitable here.";
    currentState.push({ text:airAdvice, col:"#8B5CF6" });
  }

  // --- POPULATION: How this stake pool behaves ---
  const populationLayer=[];
  if ((bigBlind||3) <= 3) {
    populationLayer.push({ text:"At "+pop.stake+", players call too wide on every street. Size your value bets larger and cut bluff frequency.", col:"#8B5CF6" });
  } else if ((bigBlind||3) <= 5) {
    populationLayer.push({ text:pop.stake+" players respond to sizing. Use precise bet sizes - they fold to overbets but call standard sizing.", col:"#3B82F6" });
  } else {
    populationLayer.push({ text:pop.stake+" pool is more balanced. Exploit windows are narrower - focus on positional edges and timing.", col:"#10B981" });
  }
  if (pop.turn_overfold > 0.38 && street === "turn") {
    populationLayer.push({ text:"This population overfolds on the turn. A second barrel here is +EV regardless of your hand - they give up too often.", col:"#F59E0B" });
  }

  // --- IMPLICATION: What hero should do ---
  const implication=[];
  if (delta.isCapped || cc.value < 0.15) {
    const capAdvice = archetype === "nit" ? "Even a small bet applies maximum pressure against their capped range."
      : archetype === "station" ? "They are capped but will still call. Bet for value - do not try to bluff them off."
      : "Their range cannot withstand large bets. Apply pressure with overbets or large sizing.";
    implication.push(capAdvice);
  }
  if (cc.draw > 0.30 && street !== "river") {
    const drawAdvice = archetype === "station" ? "Charge draws at maximum sizing. They will call with any draw regardless."
      : archetype === "nit" ? "A small bet folds out their draws. They do not chase without direct odds."
      : "Bet to deny equity. If they have draws, make them pay the wrong price to continue.";
    implication.push(drawAdvice);
  }
  if (cc.air > 0.38) {
    const airAdv = archetype === "maniac" ? "Call down with medium strength. Their bluff frequency makes folding a mistake."
      : archetype === "lag" ? "Call lighter than normal. LAGs have enough bluffs to make your marginal hands profitable calls."
      : "Medium-strength hands have showdown value against this air-heavy range.";
    implication.push(airAdv);
  }
  if (pop.turn_overfold > 0.38 && street === "turn") {
    implication.push("Double-barrel the turn. This population folds too often on this street.");
  }
  // Fallback if no implications triggered
  if (implication.length === 0) {
    const defaultAdv = archetype === "station" ? "Continue value betting. Calling Stations pay off every street - do not slow down."
      : archetype === "nit" ? "Be cautious. A Nit who is still in the hand likely has a strong holding."
      : archetype === "maniac" ? "Stay patient. Maniacs will give you opportunities to trap with strong hands."
      : archetype === "lag" ? "Play solid. LAGs will test you with aggression - call with strong hands, fold the marginals."
      : archetype === "tag" ? "Respect their range. TAGs only continue with strong holdings - adjust your value range accordingly."
      : "Play your hand according to its strength relative to the board and villain's likely range.";
    implication.push(defaultAdv);
  }

  return {
    street, currentState:currentState.slice(0,3), transition:transition.slice(0,3),
    populationLayer:populationLayer.slice(0,2), implication:implication.slice(0,3),
    delta, currClass:cc,
    rangeReduction:delta.comboReductionPct,
    valueDelta:Math.round(delta.valueDelta*100),
    drawDelta:Math.round(delta.drawDelta*100),
    airDelta:Math.round(delta.airDelta*100),
    isPolar:delta.isPolar, isCapped:delta.isCapped,
  };
}

function RangeStorylinePanel({ snapshots, hoveredHand, onHover, archetype, bigBlind, board, vilAction }) {
  const [active, setActive] = useState(0);
  const [activeSection, setActiveSection] = useState("transition");

  if (!snapshots||!snapshots.length) return (
    <div style={{ textAlign:"center", padding:"28px 16px" }}>
      <div style={{ fontSize:11, color:"#6B7280", fontStyle:"italic" }}>Add board cards to see range evolution</div>
    </div>
  );

  const snap = snapshots[active];
  const narrative = active>0 ? computeRangeNarrative(
    snapshots[active-1].range, snap.range, snap.label.toLowerCase(),
    archetype, bigBlind, board, vilAction, snapshots[active-1].label.toLowerCase()
  ) : null;

  const SECTIONS = [
    { key:"transition",   label:"What Changed", color:"#3B82F6" },
    { key:"currentState", label:"Range Now",    color:"#10B981" },
    { key:"population",   label:"Table Read",   color:"#8B5CF6" },
    { key:"implication",  label:"What To Do",   color:"#E6C566" },
  ];

  function renderBullets(bullets) {
    if (!bullets||!bullets.length) return <div style={{ fontSize:11,color:"#6B7280",fontStyle:"italic" }}>No data for this view.</div>;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {bullets.map((b,i) => {
          const isStr=typeof b==="string", text=isStr?b:b.text, col=isStr?"#9CA3AF":(b.col||"#9CA3AF");
          return (
            <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
              <span style={{ color:col, fontSize:8, marginTop:4, flexShrink:0 }}>&#9679;</span>
              <span style={{ fontSize:12, color:"#E5E7EB", lineHeight:1.5 }}>{text}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function getActiveBullets() {
    if (!narrative) return null;
    if (activeSection==="transition")   return narrative.transition;
    if (activeSection==="currentState") return narrative.currentState;
    if (activeSection==="population")   return narrative.populationLayer;
    if (activeSection==="implication")  return narrative.implication;
    return null;
  }

  const secColor = SECTIONS.find(s=>s.key===activeSection)?.color||"#9CA3AF";

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Villain's Range Storyline</div>
        <div style={{ display:"flex", gap:10, fontSize:11 }}>
          <span style={{ color:"#9CA3AF" }}>Range: <span style={{ color:"#8B5CF6", fontWeight:700 }}>{snap.pct}%</span></span>
          <span style={{ color:"#9CA3AF" }}>Combos: <span style={{ color:"#E6C566", fontWeight:700 }}>{snap.combos}</span></span>
        </div>
      </div>
      <div style={{ display:"flex", gap:0, marginBottom:12, borderRadius:8, overflow:"hidden", border:"1px solid rgba(255,255,255,0.07)" }}>
        {snapshots.map((s,i) => {
          const reduction=i>0?snapshots[i-1].pct-s.pct:0;
          return (
            <button key={s.label} onClick={() => { setActive(i); setActiveSection("transition"); }} style={{
              flex:1, padding:"9px 4px", border:"none", cursor:"pointer",
              background:active===i?"#8B5CF633":"#111827",
              borderRight:i<snapshots.length-1?"1px solid rgba(255,255,255,0.07)":"none",
              transition:"all 0.15s",
            }}>
              <div style={{ fontSize:9, color:active===i?"#8B5CF6":"#9CA3AF", textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>{s.label}</div>
              <div style={{ fontSize:13, fontWeight:700, color:active===i?"#8B5CF6":"#E5E7EB" }}>{s.pct}%</div>
              <div style={{ fontSize:9, color:"#6B7280" }}>{s.combos}</div>
              {reduction>0&&<div style={{ fontSize:9, color:"#EF4444" }}>-{reduction}%</div>}
            </button>
          );
        })}
      </div>
      {narrative&&(
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:10 }}>
            {SECTIONS.map(sec => (
              <button key={sec.key} onClick={() => setActiveSection(sec.key)} style={{
                padding:"6px 4px", borderRadius:6, cursor:"pointer",
                border:"1px solid "+(activeSection===sec.key?sec.color+"66":"rgba(255,255,255,0.06)"),
                background:activeSection===sec.key?sec.color+"18":"rgba(255,255,255,0.03)",
                color:activeSection===sec.key?sec.color:"#6B7280",
                fontSize:9, fontWeight:600, textTransform:"uppercase", transition:"all 0.15s",
              }}>{sec.label}</button>
            ))}
          </div>
          <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"12px 14px", marginBottom:10, borderLeft:"3px solid "+secColor, border:"1px solid "+secColor+"22", animation:"fadeUp 0.2s ease" }}>
            <div style={{ fontSize:10, fontWeight:600, color:secColor, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
              {SECTIONS.find(s=>s.key===activeSection)?.label} - {snap.label}
            </div>
            {renderBullets(getActiveBullets())}
          </div>
          {(narrative.isPolar||narrative.isCapped)&&(
            <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
              {narrative.isCapped&&<span style={{ padding:"3px 10px", borderRadius:99, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.35)", color:"#F87171", fontSize:10, fontWeight:700 }}>CAPPED</span>}
              {narrative.isPolar&&<span style={{ padding:"3px 10px", borderRadius:99, background:"rgba(249,115,22,0.15)", border:"1px solid rgba(249,115,22,0.35)", color:"#F97316", fontSize:10, fontWeight:700 }}>POLAR</span>}
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
            {[["Value",narrative.valueDelta,"#10B981"],["Draws",narrative.drawDelta,"#F59E0B"],["Air",narrative.airDelta,"#8B5CF6"]].map(([lbl,d,col]) => (
              <div key={lbl} style={{ background:"rgba(255,255,255,0.03)", borderRadius:6, padding:"8px 10px", textAlign:"center" }}>
                <div style={{ fontSize:9, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{lbl}</div>
                <div style={{ fontSize:14, fontWeight:700, color:d>0?col:d<0?"#EF4444":"#6B7280" }}>{d>0?"+":""}{d}%</div>
              </div>
            ))}
          </div>
        </>
      )}
      {!narrative&&snap.range&&(
        <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"12px 14px", marginBottom:12, border:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Preflop Baseline</div>
          <div style={{ fontSize:11, color:"#6B7280", lineHeight:1.5, marginBottom:8 }}>
            {archetype==="station"||archetype==="loose_passive"||archetype==="rec"
              ? "This villain enters pots with a wide range. Expect many weak hands and draws in their holdings."
              : archetype==="nit"
              ? "This villain only plays premium hands. Any action from them signals real strength."
              : archetype==="maniac"
              ? "This villain plays almost everything. Their range is extremely wide and full of bluffs."
              : archetype==="lag"
              ? "This villain plays wide but with aggression. Strong hands mixed with many bluffs."
              : archetype==="tag"
              ? "This villain is selective but plays strong. Narrow range, mostly value-heavy."
              : "Unknown tendencies. Using population averages for range estimates."}
          </div>
          {renderBullets([
            { text:snap.pct+"% of hands in range", col:"#E6C566" },
            { text:snap.combos+" active combos vs "+archetype+" tendencies", col:"#8B5CF6" },
          ])}
        </div>
      )}
      <RangeHeatmap range={snap.range} hoveredHand={hoveredHand} onHover={onHover}/>
    </div>
  );
}


function ExploitDeltaPanel({ heroCards, archetype, heroIsIP, board, potSize, stackBB }) {
  const [expanded, setExpanded] = useState(false);
  if (!heroCards[0]||!heroCards[1]) return null;

  const delta = computeExploitDelta(heroCards, archetype, heroIsIP, board, potSize, stackBB);
  const p = ARCHETYPES[archetype];
  const edge = getExploitEdgeLevel(delta.evGain);
  const actionColors = { Bet:"#10B981",Raise:"#F97316",Call:"#3B82F6",Check:"#F59E0B",Fold:"#EF4444" };

  return (
    <div style={{ background:"#111827",borderRadius:10,border:"1px solid "+(expanded?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.03)"),overflow:"hidden",transition:"border 0.2s" }}>

      {/* Always-visible header  -  ExploitEdgeBadge summary */}
      <div style={{ padding:"14px 16px" }}>
        <ExploitEdgeBadge
          value={delta.evGain}
          description={delta.isSameAction
            ? "GTO and exploit lines converge - no clear edge here"
            : "Clear exploit opportunity vs "+p.label}
        />
      </div>

      {/* Expandable GTO vs Exploit detail */}
      <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={()=>setExpanded(v=>!v)} style={{
          width:"100%",padding:expanded?"10px 16px":"7px 14px",background:"none",border:"none",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          transition:"padding 0.2s",
        }}>
          <span style={{ fontSize:10,fontWeight:600,color:expanded?"#6B7280":"#374151",textTransform:"uppercase",letterSpacing:"0.08em",transition:"color 0.2s" }}>
            Compare to GTO
          </span>
          <span style={{ color:expanded?"#6B7280":"#374151",fontSize:11,transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"all 0.2s" }}>&#9660;</span>
        </button>

        {expanded&&(
          <div style={{ padding:"0 16px 16px",animation:"fadeUp 0.2s ease" }}>
            {/* Side-by-side */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:14 }}>
              <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 14px",textAlign:"center" }}>
                <div style={{ fontSize:10,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>GTO Baseline</div>
                <div style={{ fontSize:22,fontWeight:700,color:actionColors[delta.gto.action]||"#E5E7EB",lineHeight:1 }}>{delta.gto.action}</div>
                {delta.gto.sizing&&<div style={{ fontSize:12,color:"#9CA3AF",marginTop:3 }}>{delta.gto.sizing} pot</div>}
                <div style={{ fontSize:11,color:"#6B7280",marginTop:6 }}>Balanced range</div>
              </div>
              <div style={{ textAlign:"center" }}>
                {delta.isSameAction
                  ? <span style={{ fontSize:12,color:"#6B7280" }}>=</span>
                  : <div>
                      <div style={{ fontSize:16,color:edge.color }}>&#8594;</div>
                      <div style={{ fontSize:11,fontWeight:700,color:edge.color,whiteSpace:"nowrap" }}>{delta.evGainLabel}</div>
                    </div>
                }
              </div>
              <div style={{ background:edge.bg,borderRadius:8,padding:"12px 14px",textAlign:"center",border:"1px solid "+edge.border }}>
                <div style={{ fontSize:10,color:edge.color,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>Exploit Line</div>
                <div style={{ fontSize:22,fontWeight:700,color:actionColors[delta.exploit.action]||edge.color,lineHeight:1 }}>{delta.exploit.action}</div>
                {delta.exploit.sizing&&<div style={{ fontSize:12,color:"#9CA3AF",marginTop:3 }}>{delta.exploit.sizing} pot</div>}
                <div style={{ fontSize:11,color:edge.color,marginTop:6 }}>vs {p.label}</div>
              </div>
            </div>
            {/* Insight */}
            <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#9CA3AF",lineHeight:1.6 }}>
              {delta.insight}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// PLAY THE SPOT  -  Production component tree
// Per spec: SpotContextCard, DecisionCard, ActionPanel,
//           FeedbackCard, RangeShiftCard, ProgressFooter, ResultScreen
// ================================================================

// -- Shared mini-card wrapper ------------------------------------
function PtsCard({ children, style, accent }) {
  return (
    <div style={{
      background:"#1F2937", borderRadius:10,
      border:"1px solid "+(accent?accent+"33":"rgba(255,255,255,0.07)"),
      padding:"16px 18px", ...style,
    }}>{children}</div>
  );
}

// -- SpotContextCard ---------------------------------------------
function SpotContextCard({ heroCards, board, street, potSize, stackBB, heroPosition, villainProfile, villainLastAction, heroIsIP, bigBlind }) {
  const p = ARCHETYPES[villainProfile] || {};
  const actionCol = { check:"#F59E0B", bet:"#10B981", raise:"#F97316", call:"#3B82F6", fold:"#EF4444" };
  const bb = bigBlind || 3;
  return (
    <PtsCard>
      <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12 }}>Current Spot</div>
      {/* Cards row */}
      <div style={{ display:"flex",gap:5,alignItems:"center",marginBottom:12,flexWrap:"wrap" }}>
        <span style={{ fontSize:10,color:"#6B7280",marginRight:2 }}>Hero</span>
        {heroCards.filter(Boolean).map((c,i)=>(
          <div key={i} style={{ width:34,height:46,borderRadius:6,background:"linear-gradient(145deg,#1e293b,#0f172a)",border:"1.5px solid "+SUIT_COL[c.suit]+"77",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,color:SUIT_COL[c.suit] }}>
            <span style={{ fontSize:11,fontWeight:900,lineHeight:1 }}>{c.rank}</span>
            <span style={{ fontSize:9,lineHeight:1 }}>{SUIT_SYM[c.suit]}</span>
          </div>
        ))}
        {board.length>0&&(
          <>
            <span style={{ color:"rgba(255,255,255,0.15)",margin:"0 3px",fontSize:14 }}>|</span>
            <span style={{ fontSize:10,color:"#6B7280",marginRight:2 }}>Board</span>
            {board.map((c,i)=>(
              <div key={i} style={{ width:34,height:46,borderRadius:6,background:"linear-gradient(145deg,#1e293b,#0f172a)",border:"1.5px solid "+SUIT_COL[c.suit]+"44",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,color:SUIT_COL[c.suit]+"bb" }}>
                <span style={{ fontSize:11,fontWeight:900,lineHeight:1 }}>{c.rank}</span>
                <span style={{ fontSize:9,lineHeight:1 }}>{SUIT_SYM[c.suit]}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {/* Stats grid */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10 }}>
        {[
          ["Street", street.charAt(0).toUpperCase()+street.slice(1)],
          ["Pot",    potSize+"bb ("+bbToDollars(potSize,bb)+")"],
          ["Stack",  stackBB+"bb ("+bbToDollars(stackBB,bb)+")"],
          ["Hero",   heroPosition],
          ["Pos",    heroIsIP?"IP":"OOP"],
          ["Villain",p.label||villainProfile],
        ].map(([lbl,val])=>(
          <div key={lbl} style={{ background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"6px 8px" }}>
            <div style={{ fontSize:9,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2 }}>{lbl}</div>
            <div style={{ fontSize:11,fontWeight:600,color:"#E5E7EB" }}>{val}</div>
          </div>
        ))}
      </div>
      {/* Villain last action */}
      {villainLastAction&&(
        <div style={{ display:"flex",alignItems:"center",gap:6,fontSize:12 }}>
          <span style={{ color:"#6B7280" }}>Villain:</span>
          <span style={{ padding:"2px 9px",borderRadius:99,background:(actionCol[villainLastAction]||"#9CA3AF")+"22",color:actionCol[villainLastAction]||"#9CA3AF",fontWeight:600,textTransform:"capitalize" }}>
            {villainLastAction}
          </span>
        </div>
      )}
    </PtsCard>
  );
}

// -- DecisionCard ------------------------------------------------
function DecisionCard({ street, exploitTheme, boardTexture }) {
  return (
    <PtsCard accent="#E6C566" style={{ textAlign:"center",padding:"20px 18px" }}>
      <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>
        {street.toUpperCase()} Decision
      </div>
      <div style={{ fontSize:20,fontWeight:700,color:"#E5E7EB",marginBottom:6,lineHeight:1.3 }}>
        What do you do here?
      </div>
      <div style={{ fontSize:13,color:"#9CA3AF",marginBottom:exploitTheme?12:0 }}>
        {"Choose the highest EV exploit."}
      </div>
      {exploitTheme&&(
        <div style={{ display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap" }}>
          <span style={{ padding:"3px 10px",borderRadius:99,background:"rgba(230,197,102,0.15)",color:"#E6C566",fontSize:11,fontWeight:600,border:"1px solid rgba(230,197,102,0.3)" }}>
            {exploitTheme}
          </span>
          {boardTexture&&(
            <span style={{ padding:"3px 10px",borderRadius:99,background:"rgba(255,255,255,0.06)",color:"#9CA3AF",fontSize:11 }}>
              {boardTexture}
            </span>
          )}
        </div>
      )}
    </PtsCard>
  );
}

// -- ActionPanel --------------------------------------------------
function ActionPanel({ actions, onSelectAction, isSubmitting }) {
  const colMap = { bet:"#10B981",raise:"#F97316",call:"#3B82F6",check:"#F59E0B",fold:"#EF4444",jam:"#EC4899" };
  return (
    <div>
      <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>
        Choose Your Action
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8 }}>
        {actions.map(action=>{
          const typeKey = action.actionType.toLowerCase();
          const col = colMap[typeKey] || "#9CA3AF";
          return (
            <button key={action.id} disabled={isSubmitting} onClick={()=>onSelectAction(action.id)}
              style={{
                padding:"18px 14px",borderRadius:10,border:"1px solid "+col+"44",
                background:"rgba(255,255,255,0.04)",color:"#E5E7EB",
                cursor:isSubmitting?"not-allowed":"pointer",
                fontSize:15,fontWeight:700,transition:"all 0.15s",
                opacity:isSubmitting?0.5:1,
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                minHeight:64,
              }}
              onMouseEnter={e=>{ if(!isSubmitting){ e.currentTarget.style.background=col+"18"; e.currentTarget.style.borderColor=col+"88"; e.currentTarget.style.color=col; }}}
              onMouseLeave={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor=col+"44"; e.currentTarget.style.color="#E5E7EB"; }}>
              <span style={{ fontSize:16,fontWeight:700 }}>{action.label}</span>
              {action.sizePctPot&&<span style={{ fontSize:12,color:"#9CA3AF" }}>{action.sizePctPot}% pot</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -- FeedbackCard ------------------------------------------------
function FeedbackCard({ selectedActionLabel, villainResponse, playerEv, optimalEv, summary, visible }) {
  if (!visible) return null;
  const isOptimal = Math.abs((playerEv||0)-(optimalEv||0)) < 0.5;
  const evDiff = ((optimalEv||0)-(playerEv||0)).toFixed(1);
  return (
    <PtsCard accent={isOptimal?"#10B981":"#EF4444"} style={{ animation:"fadeUp 0.3s ease" }}>
      <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12 }}>Result</div>
      {/* Action taken */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11,color:"#6B7280",marginBottom:2 }}>You chose</div>
          <div style={{ fontSize:15,fontWeight:700,color:"#E5E7EB" }}>{selectedActionLabel}</div>
        </div>
        <div style={{ padding:"4px 12px",borderRadius:99,background:isOptimal?"rgba(16,185,129,0.18)":"rgba(239,68,68,0.18)",color:isOptimal?"#10B981":"#EF4444",fontSize:12,fontWeight:700,border:"1px solid "+(isOptimal?"rgba(16,185,129,0.4)":"rgba(239,68,68,0.4)") }}>
          {isOptimal?"Optimal":"Suboptimal"}
        </div>
      </div>
      {/* Villain response */}
      {villainResponse&&(
        <div style={{ padding:"8px 10px",borderRadius:6,background:"rgba(20,184,166,0.1)",border:"1px solid rgba(20,184,166,0.25)",fontSize:12,color:"#14B8A6",marginBottom:10 }}>
          {villainResponse}
        </div>
      )}
      {/* EV comparison */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
        {[
          ["Your EV",  (playerEv||0).toFixed(1),  isOptimal?"#10B981":"#F59E0B"],
          ["Optimal EV",(optimalEv||0).toFixed(1), "#10B981"],
        ].map(([lbl,val,col])=>(
          <div key={lbl} style={{ background:"rgba(255,255,255,0.04)",borderRadius:7,padding:"10px 12px",textAlign:"center" }}>
            <div style={{ fontSize:10,color:"#6B7280",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em" }}>{lbl}</div>
            <div style={{ fontSize:20,fontWeight:700,color:col,lineHeight:1 }}>
              {val>0?"+":""}{val}
            </div>
          </div>
        ))}
      </div>
      {/* EV delta + Exploit Edge Badge */}
      {!isOptimal&&(
        <div style={{ fontSize:12,color:"#9CA3AF",padding:"8px 10px",borderRadius:6,background:"rgba(255,255,255,0.03)",marginBottom:8 }}>
          EV lost: <span style={{ color:"#EF4444",fontWeight:700 }}>-{evDiff}bb/100</span> vs optimal line
        </div>
      )}
      {optimalEv!=null&&(
        <div style={{ marginBottom:8 }}>
          <ExploitEdgeBadge
            value={+(Math.abs((optimalEv||0)-(playerEv||0))).toFixed(1)}
            description={isOptimal?"You played the optimal exploit line":"Adjust to the exploit line to recover this edge"}
            showTooltip={false}
          />
        </div>
      )}
      {/* Summary */}
      {summary&&(
        <div style={{ fontSize:12,color:"#9CA3AF",lineHeight:1.6,fontStyle:"italic" }}>{summary}</div>
      )}
    </PtsCard>
  );
}

// -- RangeShiftCard -----------------------------------------------
function RangeShiftCard({ summaryLines, implication, breakdown, visible }) {
  if (!visible||!summaryLines?.length) return null;
  const catColors = { overpairs:"#F87171",topPair:"#F97316",draws:"#3B82F6",air:"#6B7280" };
  return (
    <PtsCard style={{ animation:"fadeUp 0.35s ease" }}>
      <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Range Shift</div>
      <div style={{ display:"flex",flexDirection:"column",gap:5,marginBottom:implication?10:0 }}>
        {summaryLines.map((line,i)=>(
          <div key={i} style={{ display:"flex",gap:7,alignItems:"flex-start" }}>
            <span style={{ color:"#8B5CF6",fontSize:9,marginTop:4,flexShrink:0 }}>&#9679;</span>
            <span style={{ fontSize:12,color:"#E5E7EB",lineHeight:1.5 }}>{line}</span>
          </div>
        ))}
      </div>
      {implication&&(
        <div style={{ marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#E6C566",display:"flex",gap:6,alignItems:"flex-start" }}>
          <span style={{ fontSize:11,marginTop:1 }}>&#8594;</span>
          <span style={{ lineHeight:1.5 }}>{implication}</span>
        </div>
      )}
      {/* Optional breakdown bars */}
      {breakdown&&(
        <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:5 }}>
          {Object.entries(breakdown).filter(([,v])=>v>0).map(([cat,pct])=>(
            <div key={cat}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2 }}>
                <span style={{ color:"#6B7280",textTransform:"capitalize" }}>{cat.replace(/([A-Z])/g," $1").trim()}</span>
                <span style={{ color:catColors[cat]||"#9CA3AF",fontWeight:700 }}>{pct}%</span>
              </div>
              <div style={{ height:3,background:"rgba(255,255,255,0.07)",borderRadius:99 }}>
                <div style={{ height:"100%",borderRadius:99,background:catColors[cat]||"#8B5CF6",width:pct+"%" }}/>
              </div>
            </div>
          ))}
        </div>
      )}
    </PtsCard>
  );
}

// -- ProgressFooter -----------------------------------------------
function ProgressFooter({ currentStreet, stepIndex, totalSteps, canContinue, onContinue, score, maxScore }) {
  const streets = ["preflop","flop","turn","river"];
  const currentIdx = streets.indexOf(currentStreet);
  const accuracy = maxScore>0?Math.round((score/maxScore)*100):null;
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 0" }}>
      {/* Street dots */}
      <div style={{ display:"flex",alignItems:"center",gap:6 }}>
        {streets.map((s,i)=>(
          <div key={s} style={{ display:"flex",alignItems:"center",gap:6 }}>
            {i>0&&<div style={{ width:14,height:1,background:i<=currentIdx?"rgba(139,92,246,0.5)":"rgba(255,255,255,0.08)" }}/>}
            <div style={{ display:"flex",alignItems:"center",gap:3 }}>
              <div style={{
                width:8,height:8,borderRadius:"50%",
                background:i<currentIdx?"#8B5CF6":i===currentIdx?"#E6C566":"rgba(255,255,255,0.12)",
                boxShadow:i===currentIdx?"0 0 6px #E6C56688":"none",
              }}/>
              <span style={{ fontSize:9,color:i===currentIdx?"#E6C566":i<currentIdx?"#8B5CF6":"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em" }}>
                {s}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:12 }}>
        {accuracy!==null&&(
          <div style={{ fontSize:11,color:"#6B7280" }}>
            Score: <span style={{ color:accuracy>=80?"#10B981":accuracy>=50?"#F59E0B":"#EF4444",fontWeight:700 }}>{accuracy}%</span>
          </div>
        )}
        {canContinue&&(
          <button onClick={onContinue} style={{
            padding:"9px 18px",borderRadius:7,background:"rgba(139,92,246,0.2)",
            border:"1px solid rgba(139,92,246,0.5)",color:"#8B5CF6",cursor:"pointer",
            fontSize:12,fontWeight:600,transition:"all 0.15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(139,92,246,0.35)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(139,92,246,0.2)";}}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

// -- ResultScreen ------------------------------------------------
function ResultScreen({ finalHandLabel, playerEv, optimalEv, score, maxScore, takeaway, stepHistory, onReplay, onNextSpot, onSaveToVault }) {
  const accuracy = maxScore>0?Math.round((score/maxScore)*100):0;
  const evRealized = optimalEv>0?Math.round((playerEv/optimalEv)*100):100;
  const scoreColor = accuracy>=80?"#10B981":accuracy>=50?"#F59E0B":"#EF4444";
  return (
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      {/* Score hero */}
      <PtsCard accent={scoreColor} style={{ textAlign:"center",marginBottom:12 }}>
        <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12 }}>
          Session Complete
        </div>
        <div style={{ fontSize:52,fontWeight:900,color:scoreColor,lineHeight:1,marginBottom:6 }}>{accuracy}</div>
        <div style={{ fontSize:14,color:"#9CA3AF",marginBottom:16 }}>/ 100</div>
        {/* EV realized */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14 }}>
          {[
            ["Your EV",  (playerEv||0).toFixed(1),  "#E5E7EB"],
            ["Optimal",  (optimalEv||0).toFixed(1),  "#10B981"],
            ["Realized", evRealized+"%",              scoreColor],
          ].map(([lbl,val,col])=>(
            <div key={lbl} style={{ background:"rgba(255,255,255,0.05)",borderRadius:7,padding:"10px 8px" }}>
              <div style={{ fontSize:9,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4 }}>{lbl}</div>
              <div style={{ fontSize:16,fontWeight:700,color:col }}>{val>0&&lbl!=="Realized"?"+":""}{val}</div>
            </div>
          ))}
        </div>
        {/* Exploit Edge summary */}
        {optimalEv>0&&(
          <div style={{ marginBottom:12 }}>
            <ExploitEdgeBadge
              value={+(Math.abs((optimalEv||0)-(playerEv||0))).toFixed(1)}
              description={accuracy>=80?"Optimal exploit execution":"Review the exploit lines to close the EV gap"}
              showTooltip={false}
            />
          </div>
        )}
        {/* Final hand */}
        {finalHandLabel&&(
          <div style={{ padding:"8px 12px",borderRadius:7,background:"rgba(230,197,102,0.1)",border:"1px solid rgba(230,197,102,0.25)",fontSize:12,color:"#E6C566",marginBottom:12 }}>
            Final Hand: <span style={{ fontWeight:700 }}>{finalHandLabel}</span>
          </div>
        )}
        {/* Takeaway */}
        {takeaway&&(
          <div style={{ fontSize:13,color:"#9CA3AF",lineHeight:1.6,fontStyle:"italic",padding:"0 8px" }}>
            {takeaway}
          </div>
        )}
      </PtsCard>

      {/* Step breakdown */}
      {stepHistory&&stepHistory.length>0&&(
        <PtsCard style={{ marginBottom:12 }}>
          <div style={{ fontSize:10,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Decision Log</div>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {stepHistory.map((step,i)=>(
              <div key={i} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"8px 10px",borderRadius:7,
                background:step.isOptimal?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.06)",
                border:"1px solid "+(step.isOptimal?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.18)"),
              }}>
                <div>
                  <span style={{ fontSize:10,color:"#6B7280",textTransform:"uppercase",marginRight:6 }}>{step.street}:</span>
                  <span style={{ fontSize:12,color:"#E5E7EB",fontWeight:600 }}>{step.selectedActionLabel}</span>
                  {!step.isOptimal&&<span style={{ fontSize:11,color:"#6B7280" }}> (opt: {step.optimalActionLabel})</span>}
                </div>
                <span style={{ fontSize:11,fontWeight:700,color:step.isOptimal?"#10B981":"#EF4444",flexShrink:0,marginLeft:8 }}>
                  {step.isOptimal?"+10":step.playerEv.toFixed(1)+"bb"}
                </span>
              </div>
            ))}
          </div>
        </PtsCard>
      )}

      {/* CTAs */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
        <button onClick={onReplay} style={{ padding:"12px",borderRadius:8,background:"rgba(230,197,102,0.15)",border:"1px solid rgba(230,197,102,0.4)",color:"#E6C566",cursor:"pointer",fontSize:13,fontWeight:600 }}>
          Play Again
        </button>
        {onSaveToVault&&(
          <button onClick={onSaveToVault} style={{ padding:"12px",borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",color:"#E5E7EB",cursor:"pointer",fontSize:13,fontWeight:600 }}>
            Save to Vault
          </button>
        )}
      </div>
    </div>
  );
}

// -- usePlayTheSpotSession hook -----------------------------------
function usePlayTheSpotSession(heroCards, archetype, board, potSize, stackBB, heroIsIP) {
  const [status, setStatus]           = useState("idle");
  const [currentNode, setCurrentNode] = useState(null);
  const [history, setHistory]         = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const [awaitingContinue, setAwaitingContinue] = useState(false);

  const streets = ["flop","turn","river"];
  const p = ARCHETYPES[archetype];

  // Build a SpotNode from current state
  function buildNode(overrides={}) {
    const rec = recommend({ heroCards, archetype, heroIsIP, board, potSize, stackBB, ...overrides });
    const tex = analyzeBoard(board);
    const actions = [
      { id:"fold",    label:"Fold",      actionType:"fold" },
      { id:"check",   label:"Check",     actionType:"check" },
      { id:"call",    label:"Call",      actionType:"call" },
      { id:"bet_33",  label:"Bet 33%",   actionType:"bet",  sizePctPot:33 },
      { id:"bet_50",  label:"Bet 50%",   actionType:"bet",  sizePctPot:50 },
      { id:"bet_75",  label:"Bet 75%",   actionType:"bet",  sizePctPot:75 },
      { id:"raise",   label:"Raise",     actionType:"raise" },
    ].filter(a => {
      // Remove irrelevant actions based on street/context
      if (a.id==="call" && !overrides.villainLastAction) return false;
      return true;
    }).slice(0, 4);

    const streetLabel = !board||!board.length?"preflop":board.length===3?"flop":board.length===4?"turn":"river";
    return {
      nodeId: Date.now()+"",
      street: streetLabel,
      heroHand: heroCards.filter(Boolean),
      boardCards: board,
      potSizeBb: potSize,
      stackBb: stackBB,
      heroPosition: heroIsIP?"BTN":"BB",
      villainProfile: archetype,
      villainLastAction: overrides.villainLastAction||null,
      prompt: "What do you do here?",
      availableActions: actions,
      rec,
      tex,
    };
  }

  function startSession() {
    setStatus("loading");
    setHistory([]);
    setFinalResult(null);
    setAwaitingContinue(false);
    setTimeout(()=>{
      const node = buildNode();
      setCurrentNode(node);
      setStatus("active");
    }, 200);
  }

  function submitAction(actionId) {
    if (!currentNode||status!=="active") return;
    setStatus("submitting");

    setTimeout(()=>{
      const rec = currentNode.rec;
      const chosen = currentNode.availableActions.find(a=>a.id===actionId);
      if (!chosen) { setStatus("active"); return; }

      const isOptimal = actionId.includes(rec.action.toLowerCase()) ||
        (rec.sizing && chosen.label.includes(rec.sizing.replace("%","")));

      // Deterministic EV: anchored to rec.score and archetype call tendency
      const archModPS = ARCHETYPE_MODIFIERS[archetype] || {};
      const callAdjPS = archModPS.call_freq || 0;
      const effectiveCallPS = Math.min(0.95, Math.max(0.05, (1 - p.foldFlop/100) + callAdjPS));
      const hsPS = currentNode.rec.hs || 0.55;
      const hsMPS = 0.5 + Math.abs(hsPS - 0.5);
      // Optimal EV: based on rec score scaled to bb/100 range (score 70-90 = 2-4bb/100)
      const optimalEv = +((rec.score / 100) * potSize * 0.4 * hsMPS).toFixed(1);
      // Player EV: optimal if correct, penalized by score deviation otherwise
      const scorePenPS = isOptimal ? 0 : Math.max(0, (100 - rec.score) / 100);
      const playerEv  = isOptimal
        ? optimalEv
        : +Math.max(0, optimalEv - scorePenPS * potSize * 0.3 * effectiveCallPS).toFixed(1);

      // Villain response - deterministic based on archetype fold threshold
      const foldChance = p.foldFlop/100;
      const villainFolds = chosen.actionType==="bet" && foldChance >= 0.55;
      const villainResponse = chosen.actionType==="fold"
        ? "Hero folds. Villain takes the pot."
        : villainFolds
          ? p.label+" folds. Hero wins the pot."
          : chosen.actionType==="check"
            ? p.aggression>60 ? p.label+" bets "+Math.round(potSize*0.65)+"bb." : p.label+" checks back."
            : p.label+" calls.";

      // Range shift
      const rangeShift = {
        summaryLines: isOptimal
          ? ["Villain range remains under pressure","Weak hands continue at higher frequency","Drawing hands still represented"]
          : ["Villain range polarizes after this action","Strong hands become more likely","Bluff frequency may increase"],
        implication: isOptimal
          ? "Your line keeps villain's range elastic and exploitable"
          : "Suboptimal sizing allows villain to continue with stronger range",
        breakdown: { overpairs:22, topPair:28, draws:30, air:20 },
      };

      const stepResult = {
        nodeId: currentNode.nodeId,
        street: currentNode.street,
        selectedActionId: actionId,
        selectedActionLabel: chosen.label,
        villainResponse,
        playerEv,
        optimalEv,
        optimalActionLabel: rec.action+(rec.sizing?" "+rec.sizing:""),
        isOptimal,
        summary: isOptimal
          ? "Well played. Your exploit line is correct against this opponent type."
          : "You lost "+((optimalEv-playerEv).toFixed(1))+"bb by not taking the optimal line.",
        rangeShift,
      };

      const newHistory = [...history, stepResult];
      setHistory(newHistory);
      setStatus("active");
      setAwaitingContinue(true);

      // Check completion
      const isComplete = currentNode.street==="river" || chosen.actionType==="fold";
      if (isComplete) {
        const totalPlayerEv  = newHistory.reduce((s,h)=>s+h.playerEv,0);
        const totalOptimalEv = newHistory.reduce((s,h)=>s+h.optimalEv,0);
        const scoreVal = Math.round((newHistory.filter(h=>h.isOptimal).length/newHistory.length)*100);
        const finalHand = evaluateHand(heroCards, board.length>=5?board:[...board,{rank:"2",suit:"s"},{rank:"7",suit:"h"},{rank:"K",suit:"d"}].slice(0,5));
        setFinalResult({
          finalHandLabel: finalHand?finalHand.description:null,
          playerEv: +totalPlayerEv.toFixed(1),
          optimalEv: +totalOptimalEv.toFixed(1),
          score: scoreVal,
          maxScore: 100,
          takeaway: scoreVal>=80
            ? "Strong session. You identified and applied the correct exploits consistently."
            : scoreVal>=50
              ? "Solid attempt. Focus on sizing adjustments against this opponent type."
              : "Review the optimal lines  -  the key is reading villain tendency vs board texture.",
        });
      }
    }, 200);
  }

  function continueToNext() {
    setAwaitingContinue(false);
    // Advance street if not complete
    if (!finalResult) {
      const node = buildNode({ villainLastAction: history[history.length-1]?.villainResponse?.toLowerCase().includes("call")?"call":"check" });
      setCurrentNode(node);
    }
  }

  function resetSession() {
    setStatus("idle"); setCurrentNode(null); setHistory([]); setFinalResult(null); setAwaitingContinue(false);
  }

  return { status, currentNode, history, finalResult, awaitingContinue, startSession, submitAction, continueToNext, resetSession };
}

// -- PlayTheSpotPage  -  top-level controller -----------------------
function PlayTheSpotSim({ heroCards, archetype, heroIsIP, board, potSize, stackBB, bigBlind, onClose, onSaveToVault }) {
  const bb = bigBlind || 3; // default $1/$3
  const p = ARCHETYPES[archetype];
  const sess = usePlayTheSpotSession(heroCards, archetype, board, potSize, stackBB, heroIsIP);
  const lastStep = sess.history[sess.history.length-1]||null;
  const tex = analyzeBoard(board);

  // Auto-start on mount
  useEffect(()=>{ sess.startSession(); }, []);

  const isComplete = !!sess.finalResult;
  const showFeedback = sess.awaitingContinue && !!lastStep;

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:400,overflowY:"auto" }}>
      <div style={{ maxWidth:860,margin:"0 auto",padding:"20px 16px",minHeight:"100vh",display:"flex",flexDirection:"column" }}>

        {/* PlayTheSpotHeader */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,background:"#0B0F14",borderRadius:10,padding:"12px 18px",border:"1px solid rgba(255,255,255,0.07)",flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <RangeIQLogo size={22}/>
            <div style={{ width:1,height:20,background:"rgba(255,255,255,0.08)" }}/>
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:"#E6C566" }}>Play This Spot</div>
              <div style={{ fontSize:10,color:"#6B7280",marginTop:1 }}>
                Interactive Exploit Training
                {p&&<span> - vs {p.label}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"#9CA3AF",cursor:"pointer",fontSize:12,padding:"5px 12px",fontWeight:600 }}>
            Exit
          </button>
        </div>

        {/* Loading */}
        {sess.status==="loading"&&(
          <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <div style={{ textAlign:"center",color:"#6B7280" }}>
              <div style={{ width:24,height:24,border:"2px solid #1F2937",borderTopColor:"#8B5CF6",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px" }}/>
              <div style={{ fontSize:13 }}>Loading spot...</div>
            </div>
          </div>
        )}

        {/* Active / Complete */}
        {sess.status!=="loading"&&(
          isComplete ? (
            <ResultScreen
              finalHandLabel={sess.finalResult.finalHandLabel}
              playerEv={sess.finalResult.playerEv}
              optimalEv={sess.finalResult.optimalEv}
              score={sess.finalResult.score}
              maxScore={sess.finalResult.maxScore}
              takeaway={sess.finalResult.takeaway}
              stepHistory={sess.history}
              onReplay={()=>sess.resetSession()||sess.startSession()}
              onNextSpot={onClose}
              onSaveToVault={onSaveToVault}
            />
          ) : (
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              {/* Left column */}
              <div style={{ display:"flex",flexDirection:"column",gap:18 }}>
                {sess.currentNode&&(
                  <SpotContextCard
                    heroCards={sess.currentNode.heroHand}
                    board={sess.currentNode.boardCards}
                    street={sess.currentNode.street}
                    potSize={sess.currentNode.potSizeBb}
                    stackBB={sess.currentNode.stackBb}
                    bigBlind={bb}
                    heroPosition={sess.currentNode.heroPosition}
                    villainProfile={sess.currentNode.villainProfile}
                    villainLastAction={sess.currentNode.villainLastAction}
                    heroIsIP={heroIsIP}
                  />
                )}
                {!showFeedback&&sess.currentNode&&(
                  <>
                    <DecisionCard
                      street={sess.currentNode.street}
                      exploitTheme={sess.currentNode.rec?.tag}
                      boardTexture={tex?.label}
                    />
                    <ActionPanel
                      actions={sess.currentNode.availableActions}
                      onSelectAction={sess.submitAction}
                      isSubmitting={sess.status==="submitting"}
                    />
                  </>
                )}
                {/* Progress footer */}
                {sess.currentNode&&(
                  <ProgressFooter
                    currentStreet={sess.currentNode.street}
                    stepIndex={sess.history.length}
                    totalSteps={3}
                    canContinue={showFeedback}
                    onContinue={sess.continueToNext}
                    score={sess.history.filter(h=>h.isOptimal).length*10}
                    maxScore={sess.history.length*10}
                  />
                )}
              </div>
              {/* Right column */}
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <FeedbackCard
                  selectedActionLabel={lastStep?.selectedActionLabel}
                  villainResponse={lastStep?.villainResponse}
                  playerEv={lastStep?.playerEv}
                  optimalEv={lastStep?.optimalEv}
                  summary={lastStep?.summary}
                  visible={showFeedback}
                />
                <RangeShiftCard
                  summaryLines={lastStep?.rangeShift?.summaryLines}
                  implication={lastStep?.rangeShift?.implication}
                  breakdown={lastStep?.rangeShift?.breakdown}
                  visible={showFeedback}
                />
                {!showFeedback&&(
                  <PtsCard style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:120,opacity:0.4 }}>
                    <div style={{ textAlign:"center",color:"#6B7280",fontSize:13 }}>
                      <div style={{ fontSize:24,marginBottom:6,opacity:0.5 }}>&#9654;</div>
                      Make your decision to see feedback
                    </div>
                  </PtsCard>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}



// ================================================================
// CARD INPUT SYSTEM  -  Visual-first, rank-then-suit flow
// Components: CardSlot, RankGrid, SuitSelector, CardSelector, BoardSelector
// ================================================================

// Suit display config
const SUIT_DISPLAY = [
  { key:"h", sym:"\u2665", col:"#F87171", label:"Hearts" },
  { key:"d", sym:"\u2666", col:"#F87171", label:"Diamonds" },
  { key:"s", sym:"\u2660", col:"#CBD5E1", label:"Spades" },
  { key:"c", sym:"\u2663", col:"#CBD5E1", label:"Clubs" },
];

// Large clickable card slot
function CardSlot({ card, size, active, onClick, empty, dimmed }) {
  const s = size || 64;
  const h = Math.round(s * 1.4);
  const isActive = active;

  if (!card) return (
    <div onClick={onClick} style={{
      width:s, height:h, borderRadius:10, flexShrink:0, cursor:"pointer",
      background: isActive ? "rgba(230,197,102,0.12)" : "rgba(255,255,255,0.04)",
      border: isActive ? "2px solid #E6C566" : "2px dashed rgba(255,255,255,0.15)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      transition:"all 0.15s",
      boxShadow: isActive ? "0 0 16px rgba(230,197,102,0.3)" : "none",
    }}
    onMouseEnter={e=>{ if(!isActive){ e.currentTarget.style.borderColor="rgba(255,255,255,0.3)"; e.currentTarget.style.background="rgba(255,255,255,0.07)"; }}}
    onMouseLeave={e=>{ if(!isActive){ e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"; e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}}>
      {isActive
        ? <div style={{ fontSize:11,color:"#E6C566",fontWeight:600,textAlign:"center",lineHeight:1.4 }}>Select<br/>Rank</div>
        : <div style={{ fontSize:22,color:"rgba(255,255,255,0.15)",lineHeight:1 }}>+</div>
      }
    </div>
  );

  const suitInfo = SUIT_DISPLAY.find(s=>s.key===card.suit)||SUIT_DISPLAY[0];
  return (
    <div onClick={onClick} style={{
      width:s, height:h, borderRadius:10, flexShrink:0, cursor:"pointer",
      background:"linear-gradient(145deg,#1e293b,#0f172a)",
      border:"2px solid "+suitInfo.col+(dimmed?"22":"66"),
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:3, color:suitInfo.col, opacity:dimmed?0.45:1,
      transition:"all 0.15s",
      boxShadow: isActive ? "0 0 16px "+suitInfo.col+"55" : "0 0 8px "+suitInfo.col+"18",
    }}
    onMouseEnter={e=>{ e.currentTarget.style.borderColor=suitInfo.col+(dimmed?"44":"99"); e.currentTarget.style.boxShadow="0 0 14px "+suitInfo.col+"44"; }}
    onMouseLeave={e=>{ e.currentTarget.style.borderColor=suitInfo.col+(dimmed?"22":"66"); e.currentTarget.style.boxShadow=dimmed?"none":"0 0 8px "+suitInfo.col+"18"; }}>
      <span style={{ fontSize:Math.round(s*0.33),fontWeight:900,lineHeight:1 }}>{card.rank}</span>
      <span style={{ fontSize:Math.round(s*0.28),lineHeight:1 }}>{suitInfo.sym}</span>
    </div>
  );
}

// Rank selection grid  A K Q J T 9 8 7 6 5 4 3 2
function RankGrid({ onSelect, usedRanks }) {
  return (
    <div style={{ animation:"fadeUp 0.15s ease" }}>
      <div style={{ fontSize:10,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>
        Select Rank
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5 }}>
        {RANKS.map(rank=>{
          const isUsed = (usedRanks||[]).includes(rank);
          return (
            <button key={rank} disabled={isUsed} onClick={()=>!isUsed&&onSelect(rank)}
              style={{
                padding:"10px 4px", borderRadius:7, fontSize:14, fontWeight:700,
                background: isUsed ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)",
                border: "1px solid "+(isUsed?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.12)"),
                color: isUsed ? "#374151" : "#E5E7EB",
                cursor: isUsed ? "not-allowed" : "pointer",
                transition:"all 0.1s",
              }}
              onMouseEnter={e=>{ if(!isUsed){ e.currentTarget.style.background="#E6C56622"; e.currentTarget.style.borderColor="#E6C56688"; e.currentTarget.style.color="#E6C566"; }}}
              onMouseLeave={e=>{ if(!isUsed){ e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.color="#E5E7EB"; }}}>
              {rank}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Suit selector - 4 large suit buttons
function SuitSelector({ rank, onSelect, usedCards }) {
  return (
    <div style={{ animation:"fadeUp 0.15s ease" }}>
      <div style={{ fontSize:10,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>
        Select Suit for <span style={{ color:"#E6C566" }}>{rank}</span>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6 }}>
        {SUIT_DISPLAY.map(suit=>{
          const cardKey = rank+suit.key;
          const isUsed = (usedCards||[]).includes(cardKey);
          return (
            <button key={suit.key} disabled={isUsed} onClick={()=>!isUsed&&onSelect(suit.key)}
              style={{
                padding:"12px 6px", borderRadius:8,
                background: isUsed ? "rgba(255,255,255,0.03)" : suit.col+"14",
                border: "1px solid "+(isUsed?"rgba(255,255,255,0.05)":suit.col+"44"),
                color: isUsed ? "#374151" : suit.col,
                cursor: isUsed ? "not-allowed" : "pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                transition:"all 0.1s",
              }}
              onMouseEnter={e=>{ if(!isUsed){ e.currentTarget.style.background=suit.col+"28"; e.currentTarget.style.borderColor=suit.col+"88"; }}}
              onMouseLeave={e=>{ if(!isUsed){ e.currentTarget.style.background=suit.col+"14"; e.currentTarget.style.borderColor=suit.col+"44"; }}}>
              <span style={{ fontSize:20,lineHeight:1 }}>{suit.sym}</span>
              <span style={{ fontSize:9,fontWeight:600,opacity:0.7 }}>{suit.label}</span>
            </button>
          );
        })}
      </div>
      <button onClick={()=>onSelect(null)} style={{ marginTop:8,width:"100%",padding:"6px",borderRadius:6,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"#6B7280",cursor:"pointer",fontSize:11 }}>
        Back to ranks
      </button>
    </div>
  );
}

// Main CardSelector - orchestrates rank -> suit flow for a set of slots
function CardSelector({ cards, onCardChange, maxCards, label, usedKeys, slotSize }) {
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [pendingRank, setPendingRank] = React.useState(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [advInput, setAdvInput] = React.useState("");
  const [advError, setAdvError] = React.useState(null);

  const slotsCount = maxCards || 2;
  const allCards = Array.from({length:slotsCount},(_,i)=>cards[i]||null);

  // All card keys already used (to prevent duplicates)
  const takenKeys = [...(usedKeys||[]), ...allCards.filter(Boolean).map(c=>c.rank+c.suit)];

  // Keys used only by OTHER slots (not the active one)
  const takenByOthers = allCards
    .filter((_,i)=>i!==activeSlot)
    .filter(Boolean)
    .map(c=>c.rank+c.suit);

  // Ranks fully used across all suits
  const fullyUsedRanks = RANKS.filter(r=>
    SUITS.every(s=> (usedKeys||[]).includes(r+s) || takenByOthers.includes(r+s))
  );

  function handleSlotClick(idx) {
    if (activeSlot===idx) { setActiveSlot(null); setPendingRank(null); return; }
    setActiveSlot(idx);
    setPendingRank(null);
  }

  function handleRankSelect(rank) {
    setPendingRank(rank);
  }

  function handleSuitSelect(suit) {
    if (suit===null) { setPendingRank(null); return; }
    const newCards=[...allCards];
    newCards[activeSlot]={rank:pendingRank, suit};
    onCardChange(newCards);
    setPendingRank(null);
    // Auto-advance to next empty slot
    const nextEmpty = newCards.findIndex((c,i)=>i>activeSlot&&!c);
    if (nextEmpty!==-1) setActiveSlot(nextEmpty);
    else setActiveSlot(null);
  }

  function handleAdvInput(val) {
    setAdvInput(val); setAdvError(null);
    const parsed = parseCardInput(val);
    if (parsed.error) { setAdvError(parsed.error); return; }
    if (parsed.cards.length>0) {
      const newCards=[...allCards];
      parsed.cards.forEach((c,i)=>{ if(i<slotsCount) newCards[i]=c; });
      onCardChange(newCards);
      if (parsed.cards.length>=slotsCount) { setAdvInput(""); setActiveSlot(null); }
    }
  }

  function removeCard(idx) {
    const newCards=[...allCards];
    newCards[idx]=null;
    onCardChange(newCards);
    setActiveSlot(idx);
    setPendingRank(null);
  }

  const showPicker = activeSlot!==null;

  return (
    <div>
      {/* Slot row */}
      <div style={{ display:"flex",gap:10,marginBottom:showPicker?14:0,alignItems:"flex-end" }}>
        {allCards.map((card,idx)=>(
          <div key={idx} style={{ position:"relative" }}>
            <CardSlot
              card={card}
              size={slotSize||56}
              active={activeSlot===idx}
              onClick={()=>card ? (activeSlot===idx ? removeCard(idx) : handleSlotClick(idx)) : handleSlotClick(idx)}
            />
            {card&&(
              <button onClick={e=>{e.stopPropagation();removeCard(idx);}} style={{
                position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",
                background:"#EF4444",border:"none",color:"#fff",fontSize:10,fontWeight:700,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                lineHeight:1,
              }}>x</button>
            )}
          </div>
        ))}
        <div style={{ fontSize:11,color:C.disabled,paddingBottom:8,marginLeft:4 }}>
          {activeSlot!==null ? "Choose rank below" : allCards.filter(Boolean).length>0 ? "Tap to change" : "Click to select"}
        </div>
      </div>

      {/* Rank or Suit picker */}
      {showPicker&&(
        <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)" }}>
          {pendingRank===null
            ? <RankGrid onSelect={handleRankSelect} usedRanks={fullyUsedRanks}/>
            : <SuitSelector rank={pendingRank} onSelect={handleSuitSelect} usedCards={[...(usedKeys||[]),...takenByOthers]}/>
          }
        </div>
      )}

      {/* Advanced text input toggle */}
      <div style={{ marginTop:10 }}>
        <button onClick={()=>setShowAdvanced(v=>!v)} style={{ background:"none",border:"none",color:C.disabled,cursor:"pointer",fontSize:11,padding:0,textDecoration:"underline" }}>
          {showAdvanced?"Hide":"Advanced Input"}
        </button>
        {showAdvanced&&(
          <div style={{ marginTop:6,animation:"fadeUp 0.15s ease" }}>
            <input value={advInput} onChange={e=>handleAdvInput(e.target.value)}
              placeholder="AhKd, QJs, 77..."
              style={{ width:"100%",background:"#0F172A",border:"1px solid "+(advError?"rgba(239,68,68,0.5)":"rgba(255,255,255,0.10)"),borderRadius:6,padding:"8px 10px",color:C.text,fontSize:12 }}/>
            {advError&&<div style={{ fontSize:10,color:C.red,marginTop:3 }}>{advError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// BoardSelector - street-aware, context-driven board card selection
function BoardSelector({ board, onBoardChange, street, usedKeys }) {
  const boardSlots = street==="preflop"?0:street==="flop"?3:street==="turn"?4:5;
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [pendingRank, setPendingRank] = React.useState(null);

  if (boardSlots===0) return null;

  const takenByOthers = board.filter((_,i)=>i!==activeSlot).map(c=>c.rank+c.suit);
  const fullyUsedRanks = RANKS.filter(r=>
    SUITS.every(s=>(usedKeys||[]).includes(r+s)||takenByOthers.includes(r+s))
  );

  function handleSlotClick(idx) {
    if (idx<board.length) { // Remove card
      onBoardChange(board.filter((_,i)=>i!==idx));
      setActiveSlot(idx); setPendingRank(null);
    } else if (idx===board.length) { // Add next
      setActiveSlot(idx); setPendingRank(null);
    }
  }

  function handleRankSelect(rank) { setPendingRank(rank); }

  function handleSuitSelect(suit) {
    if (suit===null) { setPendingRank(null); return; }
    const newBoard=[...board,{rank:pendingRank,suit}];
    onBoardChange(newBoard);
    setPendingRank(null);
    const next=newBoard.length;
    if (next<boardSlots) setActiveSlot(next); else setActiveSlot(null);
  }

  return (
    <div style={{ marginTop:14 }}>
      <div style={{ fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>
        Board  -  {street.charAt(0).toUpperCase()+street.slice(1)}
      </div>
      {/* Board slots */}
      <div style={{ display:"flex",gap:8,marginBottom:activeSlot!==null?12:0,flexWrap:"wrap" }}>
        {Array.from({length:boardSlots},(_,i)=>(
          <div key={i} style={{ position:"relative" }}>
            <CardSlot
              card={board[i]||null}
              size={44}
              active={activeSlot===i}
              onClick={()=>handleSlotClick(i)}
              dimmed={false}
            />
            {board[i]&&(
              <button onClick={e=>{e.stopPropagation();const nb=board.filter((_,idx)=>idx!==i);onBoardChange(nb);setActiveSlot(i);setPendingRank(null);}} style={{
                position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",
                background:"#EF4444",border:"none",color:"#fff",fontSize:9,fontWeight:700,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              }}>x</button>
            )}
          </div>
        ))}
      </div>
      {/* Picker panel */}
      {activeSlot!==null&&(
        <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)",animation:"fadeUp 0.15s ease" }}>
          {pendingRank===null
            ? <RankGrid onSelect={handleRankSelect} usedRanks={fullyUsedRanks}/>
            : <SuitSelector rank={pendingRank} onSelect={handleSuitSelect} usedCards={[...(usedKeys||[]),...takenByOthers]}/>
          }
        </div>
      )}
    </div>
  );
}


// ================================================================
// POPULATION PROFILES ENGINE
// ================================================================

const POPULATION_PROFILES = {
  2:  { stake:"$1/$2", call_freq:0.68, bluff_freq:0.12, aggression:0.28, fold_to_cbet:0.30, turn_overfold:0.45, river_bluff_freq:0.10, label:"Low Stakes" },
  3:  { stake:"$1/$3", call_freq:0.65, bluff_freq:0.15, aggression:0.32, fold_to_cbet:0.32, turn_overfold:0.42, river_bluff_freq:0.12, label:"Low Stakes" },
  5:  { stake:"$2/$5", call_freq:0.55, bluff_freq:0.22, aggression:0.45, fold_to_cbet:0.42, turn_overfold:0.30, river_bluff_freq:0.20, label:"Mid Stakes" },
  10: { stake:"$5/$10", call_freq:0.48, bluff_freq:0.30, aggression:0.58, fold_to_cbet:0.50, turn_overfold:0.22, river_bluff_freq:0.28, label:"High Stakes" },
};

const ARCHETYPE_MODIFIERS = {
  station:      { call_freq:+0.18, bluff_freq:-0.10, aggression:-0.15, fold_to_cbet:-0.20, turn_overfold:-0.18 },
  nit:          { call_freq:-0.20, bluff_freq:-0.08, aggression:-0.18, fold_to_cbet:+0.25, turn_overfold:+0.22 },
  lag:          { call_freq:+0.05, bluff_freq:+0.15, aggression:+0.20, fold_to_cbet:-0.10, turn_overfold:-0.08 },
  young_aggro:  { call_freq:+0.02, bluff_freq:+0.22, aggression:+0.30, fold_to_cbet:-0.15, turn_overfold:-0.12 },
  maniac:       { call_freq:+0.10, bluff_freq:+0.28, aggression:+0.35, fold_to_cbet:-0.18, turn_overfold:-0.15 },
  loose_passive:{ call_freq:+0.15, bluff_freq:-0.08, aggression:-0.20, fold_to_cbet:-0.12, turn_overfold:-0.10 },
  tag:          { call_freq:-0.05, bluff_freq:+0.05, aggression:+0.08, fold_to_cbet:+0.08, turn_overfold:+0.05 },
  rec:          { call_freq:+0.08, bluff_freq:-0.05, aggression:-0.10, fold_to_cbet:+0.05, turn_overfold:+0.08 },
};

function getSituationAdjustment(board, street, vilAction) {
  const tex = analyzeBoard(board);
  const adj = { call_freq:0, bluff_freq:0, aggression:0, fold_to_cbet:0, turn_overfold:0 };
  if (tex && tex.wet >= 3) { adj.call_freq += 0.08; adj.fold_to_cbet -= 0.06; }
  if (street === "turn")   { adj.turn_overfold += 0.06; adj.fold_to_cbet += 0.05; }
  if (street === "river")  { adj.bluff_freq -= 0.05; adj.aggression -= 0.08; }
  const villainBet = vilAction && vilAction.some(a => a.type==="bet" || a.type==="raise");
  if (villainBet)  { adj.bluff_freq += 0.04; adj.call_freq -= 0.05; }
  const villainPassive = vilAction && vilAction.length > 0 && vilAction.every(a => a.type==="check" || a.type==="call");
  if (villainPassive) { adj.fold_to_cbet += 0.08; adj.turn_overfold += 0.06; adj.bluff_freq -= 0.06; }
  return adj;
}

function buildPopulationProfile(bigBlind, archetype, board, street, vilAction) {
  const bb = bigBlind || 3;
  const stakeBBs = [2, 3, 5, 10];
  const nearestBB = stakeBBs.reduce((prev, curr) =>
    Math.abs(curr-bb) < Math.abs(prev-bb) ? curr : prev
  );
  const base = { ...POPULATION_PROFILES[nearestBB] };
  const archMod = ARCHETYPE_MODIFIERS[archetype] || {};
  const sitAdj  = getSituationAdjustment(board, street, vilAction);
  const clamp = v => Math.min(1, Math.max(0, v));
  const final = {
    stake:            base.stake,
    label:            base.label,
    call_freq:        clamp(base.call_freq        + (archMod.call_freq||0)     + sitAdj.call_freq),
    bluff_freq:       clamp(base.bluff_freq       + (archMod.bluff_freq||0)    + sitAdj.bluff_freq),
    aggression:       clamp(base.aggression       + (archMod.aggression||0)    + sitAdj.aggression),
    fold_to_cbet:     clamp(base.fold_to_cbet     + (archMod.fold_to_cbet||0)  + sitAdj.fold_to_cbet),
    turn_overfold:    clamp(base.turn_overfold    + (archMod.turn_overfold||0) + sitAdj.turn_overfold),
    river_bluff_freq: clamp(base.river_bluff_freq + (archMod.bluff_freq||0)*0.5),
  };
  const p = ARCHETYPES[archetype] || {};
  const tex = analyzeBoard(board);
  const insights = [];
  if (bb <= 3) {
    if (final.call_freq > 0.65) insights.push(base.stake+" players call too wide - value bet relentlessly");
    else insights.push(base.stake+" pool is passive - expect condensed calling ranges");
  } else if (bb <= 5) {
    insights.push(base.stake+" pool is structured - precise bets are more exploitable");
  } else {
    insights.push(base.stake+" players balance well - exploit tendencies are narrower");
  }
  if (final.fold_to_cbet > 0.48) insights.push(p.label+" folds frequently - probe bets generate strong EV");
  if (final.bluff_freq < 0.15)   insights.push("Bluff frequency below baseline - call down more liberally");
  if (final.bluff_freq > 0.30)   insights.push("High bluff frequency - trapping lines gain significant EV");
  if (final.turn_overfold > 0.38) insights.push("Population overflows on turn barrels - double barrel is +EV");
  if (tex && tex.wet >= 3 && final.call_freq > 0.60) insights.push(base.stake+" players overcall wet boards - size up for value");
  final.insights = insights.slice(0, 3);
  return final;
}

function PopulationInsightPanel({ bigBlind, archetype, board, street, vilAction }) {
  const [expanded, setExpanded] = React.useState(false);
  const profile = buildPopulationProfile(bigBlind, archetype, board, street, vilAction);
  if (!profile.insights||!profile.insights.length) return null;
  return (
    <div style={{ background:"#111827", borderRadius:10, overflow:"hidden", border:"1px solid rgba(255,255,255,0.07)" }}>
      <button onClick={() => setExpanded(v=>!v)} style={{
        width:"100%", padding:"12px 16px", background:"none", border:"none",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Population Insight</span>
          <span style={{ padding:"2px 8px", borderRadius:99, background:"rgba(139,92,246,0.2)", color:"#8B5CF6", fontSize:10, fontWeight:700 }}>{profile.stake}</span>
        </div>
        <span style={{ fontSize:11, color:"#6B7280", transform:expanded?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>&#9660;</span>
      </button>
      <div style={{ padding:"0 16px 12px" }}>
        <div style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
          <span style={{ color:"#8B5CF6", fontSize:9, marginTop:3, flexShrink:0 }}>&#9679;</span>
          <span style={{ fontSize:12, color:"#E5E7EB", lineHeight:1.5 }}>{profile.insights[0]}</span>
        </div>
        {expanded && profile.insights.slice(1).map((ins,i) => (
          <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", marginTop:6 }}>
            <span style={{ color:"#6B7280", fontSize:9, marginTop:3, flexShrink:0 }}>&#9679;</span>
            <span style={{ fontSize:12, color:"#9CA3AF", lineHeight:1.5 }}>{ins}</span>
          </div>
        ))}
        {expanded && (
          <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:10, color:"#6B7280" }}>
            {profile.label} &bull; {Math.round(profile.call_freq*100)}% call &bull; {Math.round(profile.fold_to_cbet*100)}% fold to cbet
          </div>
        )}
      </div>
    </div>
  );
}


// ================================================================
// MULTIWAY PREFLOP ENGINE
// ================================================================

const PREFLOP_FIELD_PROFILES = {
  tight:        { label:"Tight",         limp_freq:0.08, overcall_freq:0.12, squeeze_freq:0.20, three_bet_freq:0.08, fold_to_iso:0.72, fold_to_squeeze:0.65, passive_density:0.25, aggression_density:0.35 },
  standard:     { label:"Standard",      limp_freq:0.18, overcall_freq:0.22, squeeze_freq:0.15, three_bet_freq:0.10, fold_to_iso:0.58, fold_to_squeeze:0.55, passive_density:0.45, aggression_density:0.45 },
  loose_passive:{ label:"Loose Passive", limp_freq:0.42, overcall_freq:0.48, squeeze_freq:0.06, three_bet_freq:0.05, fold_to_iso:0.35, fold_to_squeeze:0.40, passive_density:0.80, aggression_density:0.15 },
  aggressive:   { label:"Aggressive",    limp_freq:0.12, overcall_freq:0.18, squeeze_freq:0.28, three_bet_freq:0.18, fold_to_iso:0.45, fold_to_squeeze:0.42, passive_density:0.25, aggression_density:0.72 },
  limp_heavy:   { label:"Limp-Heavy",    limp_freq:0.60, overcall_freq:0.55, squeeze_freq:0.05, three_bet_freq:0.04, fold_to_iso:0.30, fold_to_squeeze:0.35, passive_density:0.85, aggression_density:0.12 },
};

const PREFLOP_SITUATION_LABELS = {
  unopened:      "Unopened",
  one_limper:    "1 Limper",
  two_limpers:   "2+ Limpers",
  raise:         "Facing Raise",
  raise_caller:  "Raise + Caller",
};

function getIsoSize(bigBlind, limpCount, tableType) {
  // Live-calibrated iso sizing based on real $1/$3 table data:
  // At $1/$3, $18-20 is needed to actually thin the field (6-7x BB)
  // Standard formula: 5bb + 1.5bb per limper at $1/$3, scaling for other stakes
  // At $1/$2: slightly less. At $2/$5+: slightly more relative to BB.
  const base = bigBlind <= 2 ? 4 : bigBlind <= 3 ? 5 : bigBlind <= 5 ? 4.5 : 4;
  const perLimper = bigBlind <= 2 ? 1.5 : bigBlind <= 3 ? 1.5 : bigBlind <= 5 ? 1.5 : 1;
  const limpers = limpCount === "one_limper" ? 1 : limpCount === "two_limpers" ? 2 : 0;
  const raw = (base + limpers * perLimper) * bigBlind;
  // Round to nearest dollar
  return "$" + Math.round(raw);
}

function recommendPreflop(state) {
  const { heroCards, heroPos, bigBlind, tableType, preflopSituation, playersLeft, fieldStickiness, archetype, heroHasActedPreflop, heroIsIP, vilAction } = state;
  const bb = bigBlind || 3;
  const field = PREFLOP_FIELD_PROFILES[tableType || "standard"];
  const hs = heroStrength(heroCards, []);

  // Extract villain's bet amount for sizing calculations
  const vilBetEntry = (vilAction||[]).filter(a=>a.street==="preflop"&&a.actor==="Villain"&&(a.type==="bet"||a.type==="raise")).slice(-1)[0];
  const vilOpenDollars = vilBetEntry && vilBetEntry.amount ? parseFloat(vilBetEntry.amount) : 0;
  // 3-bet sizing: live-calibrated for $1/$3 where $45+ is needed to isolate
  // 3.5x IP or 4x OOP of villain's open. At $1/$3 vs a $15 open: $52-60.
  const threeBetMult = heroIsIP ? 3.5 : 4;
  const threeBetSize = vilOpenDollars > 0
    ? Math.max(Math.round(vilOpenDollars * threeBetMult), Math.round(bb * 15))  // minimum 15bb ($45 at $1/$3)
    : Math.round(bb * (bb <= 3 ? 15 : 12));  // fallback: 15bb at $1/$3
  const r1 = RANKS.indexOf(heroCards[0]?.rank ?? "2");
  const r2 = RANKS.indexOf(heroCards[1]?.rank ?? "2");
  const isPair = r1 === r2;
  const isSuited = heroCards[0]?.suit === heroCards[1]?.suit;
  const topRank = Math.min(r1, r2);
  const isConnector = Math.abs(r1 - r2) <= 2;
  const isBroadway = topRank <= 3;
  const isPremium = (isPair && topRank <= 2) || (isBroadway && !isSuited ? topRank <= 1 : topRank <= 3);
  const isSpeculative = (isSuited && isConnector) || (isPair && topRank <= 8);
  const situation = preflopSituation || "unopened";
  const stickiness = fieldStickiness || "medium";
  const pLeft = parseInt(playersLeft) || 2;

  // Stickiness multiplier  -  how likely limpers/callers are to continue
  const stickyMod = stickiness === "high" ? 1.25 : stickiness === "low" ? 0.75 : 1.0;

  let action, sizing, tag, bullets, altLines, score, actionType;

  // OOP multiway penalty: when hero is out of position against 2+ opponents,
  // require significantly stronger hands. Being OOP in a multiway pot with
  // marginal holdings is a losing proposition at live small stakes.
  const oopMultiway = !heroIsIP && pLeft >= 3;
  const oopHeadsUp = !heroIsIP && pLeft < 3;

  // - UNOPENED -
  if (situation === "unopened") {
    if (isPremium || (isBroadway && topRank <= 2)) {
      action = "Open Raise"; actionType = "Open Raise";
      // Live-calibrated: $1/$3 needs 5x ($15) to get results. $1/$2: 4x, $2/$5+: 4x
      sizing = "$" + Math.round((bb <= 2 ? 4 : bb <= 3 ? 5 : bb <= 5 ? 4 : 4) * bb);
      tag = "Value Open"; score = 88;
      bullets = [
        "Premium hand warrants a standard open from any position",
        "Expect 1-2 callers at live low-stakes - your hand dominates their calling range",
        pLeft >= 3 ? "Multiple players left to act - sizing at 5x reduces callers" : "Position is in your favor - build the pot now",
      ];
      altLines = ["Open to 6x (very loose table)", "Open to 4x (tight table)"];
    } else if (oopMultiway && hs < 0.58 && !isPremium) {
      // OOP against 3+ opponents: SB folds marginal hands, BB checks for free
      const isBB = heroPos === "BB" || heroPos === "bb";
      if (isBB && (situation === "unopened" || situation === "one_limper" || situation === "two_limpers")) {
        // BB already posted - check is free, never fold
        action = "Check"; actionType = "Check"; sizing = null;
        tag = "Free Flop"; score = 72;
        bullets = [
          "You are in the big blind - checking is free, never fold when you can see the flop",
          "Hand is marginal but you have pot odds with $" + bb + " already invested",
          "Look to flop two pair, trips, or a strong draw before committing more chips",
        ];
        altLines = ["Raise (only with strong hands to thin the field)"];
      } else {
        // SB or other OOP positions: fold marginal hands
        action = "Fold"; actionType = "Fold"; sizing = null;
        tag = "OOP Multiway Fold"; score = 78;
        bullets = [
          "Out of position against " + pLeft + " opponents - marginal hands lose money",
          "Playing " + (heroCards[0]?.rank||"") + (heroCards[1]?.rank||"") + " OOP in a multiway pot has poor equity realization",
          "Save your stack for better spots with position or stronger hands",
        ];
        altLines = ["Complete (only with suited connectors for implied odds)"];
      }
    } else if (hs >= 0.52 || isSpeculative) {
      action = "Open Raise"; actionType = "Open Raise";
      // Same sizing as premium opens - consistent sizing prevents reads
      sizing = "$" + Math.round((bb <= 2 ? 4 : bb <= 3 ? 5 : bb <= 5 ? 4 : 4) * bb);
      tag = "Steal / Speculative Open"; score = 74;
      bullets = [
        "Hand has playability and equity vs standard calling ranges",
        pLeft <= 2 ? "Few players left - steal equity is high" : "Open to take initiative and define the field",
        field.fold_to_iso > 0.55 ? "Table folds frequently - open is profitable" : "Loose table - tighten open range slightly",
      ];
      altLines = ["Limp behind (very loose table)", "Fold (very tight position)"];
    } else {
      action = "Fold"; actionType = "Fold"; sizing = null;
      tag = "Below Open Range"; score = 78;
      bullets = [
        "Hand does not meet minimum equity threshold for this position",
        "Opening too wide vs " + (field.label || "this table") + " creates -EV spots postflop",
        "Wait for better hands or position",
      ];
      altLines = ["Limp (only if table is very passive and pot odds allow)"];
    }
  }

  // - FACING LIMPERS -
  else if (situation === "one_limper" || situation === "two_limpers") {
    const limpCount = situation === "two_limpers" ? 2 : 1;
    const isoSize = getIsoSize(bb, situation, tableType);
    const foldToIso = field.fold_to_iso * (stickiness === "high" ? 0.7 : stickiness === "low" ? 1.2 : 1.0);

    if (isPremium || (hs >= 0.60 && isBroadway)) {
      action = "Isolate Raise"; actionType = "Isolate Raise";
      sizing = isoSize;
      tag = "Iso Value"; score = 85;
      bullets = [
        "Limper" + (limpCount > 1 ? "s" : "") + " call iso raises too wide - you are well ahead of their range",
        "Larger sizing reduces multiway equity loss and charges drawing hands",
        "Hand dominates limping range - iso to extract maximum value",
      ];
      altLines = ["Overlimp (suited connectors only)", "Raise bigger vs sticky table"];
    } else if (oopMultiway && hs < 0.58 && !isPremium) {
      // OOP against 3+ opponents with limpers: BB checks free, SB folds
      const isBB = heroPos === "BB" || heroPos === "bb";
      if (isBB) {
        action = "Check"; actionType = "Check"; sizing = null;
        tag = "Free Flop"; score = 72;
        bullets = [
          "You are in the big blind - checking is free with " + limpCount + " limper" + (limpCount>1?"s":"") + " in",
          "Your $" + bb + " is already in the pot - see the flop and look for a strong connection",
          "Do not raise to isolate OOP with a marginal hand against multiple callers",
        ];
        altLines = ["Raise (only premiums to thin the field)"];
      } else {
        action = "Fold"; actionType = "Fold"; sizing = null;
        tag = "OOP Multiway Fold"; score = 76;
        bullets = [
          "Out of position against " + pLeft + " opponents including limpers",
          "Iso-raising OOP bloats the pot while you act first on every street",
          "Even completing the blind is marginal - fold preserves stack for better spots",
        ];
        altLines = ["Complete (only pocket pairs or suited connectors for set/straight value)"];
      }
    } else if (isSpeculative && foldToIso < 0.45) {
      action = "Overlimp"; actionType = "Overlimp";
      sizing = "$" + bb;
      tag = "Pot Odds Overlimp"; score = 66;
      bullets = [
        "Table is too sticky - iso raise bloats pot without fold equity",
        "Speculative hand plays well multiway with implied odds",
        "Take the cheap flop and look to flop big",
      ];
      altLines = ["Fold (if out of position)", "Isolate (if you have position)"];
    } else if (hs >= 0.48) {
      action = "Isolate Raise"; actionType = "Isolate Raise";
      sizing = isoSize;
      tag = "Iso Steal"; score = 72;
      bullets = [
        "Limper range is wide and capped - isolation creates fold equity",
        field.fold_to_iso > 0.55
          ? Math.round(field.fold_to_iso * 100) + "% of this table folds to iso raises"
          : "Even at lower fold frequency, initiative is valuable postflop",
        "In position, iso raise is preferred over overlimping",
      ];
      altLines = ["Overlimp (out of position)", "Fold (weak speculative hand)"];
    } else {
      action = "Fold"; actionType = "Fold"; sizing = null;
      tag = "Below Iso Range"; score = 70;
      bullets = [
        "Hand does not have sufficient equity vs limping + calling ranges",
        "Overlimping with this hand risks multiway pot with poor realization",
        "Fold and wait for cleaner spots",
      ];
      altLines = ["Overlimp (last to act only, very multiway)"];
    }
  }

  // - FACING RAISE -
  else if (situation === "raise") {
    // Live-calibrated 3-bet range: tighter than standard because 3-bets get called multi-way
    // Only 3-bet with: AA, KK, QQ, JJ, AKs, AKo (hands that play well in bloated multiway pots)
    const is3BetPremium = (isPair && topRank <= 3) || // AA, KK, QQ, JJ
      (topRank === 0 && Math.max(r1,r2) <= 1); // AK (both top 2 ranks)
    if (is3BetPremium) {
      action = "3-Bet"; actionType = "3-Bet";
      sizing = "$" + threeBetSize;
      tag = "3-Bet Value"; score = 90;
      bullets = [
        "Premium hand has strong equity vs raiser's opening range",
        vilOpenDollars > 0 ? "3-bet to $" + threeBetSize + " (" + threeBetMult + "x their $" + vilOpenDollars + " open) to isolate" : "3-bet large enough to isolate - $45+ at live $1/$3",
        "Expect 1-2 callers even with this sizing - your hand prints money multiway",
      ];
      altLines = ["Flat call (trapping, deep stacks)"];
    } else if (hs >= 0.45 && (isSuited || isPair)) {
      action = "Flat Call"; actionType = "Flat Call";
      sizing = null;
      tag = "Speculative Call"; score = 62;
      bullets = [
        "Hand has implied odds and set/flush potential",
        "Do not 3-bet - at live low-stakes, 3-bets get called multi-way and you need a premium to justify the bloated pot",
        "Call and look to flop a strong made hand cheaply",
      ];
      altLines = ["Fold (out of position)", "3-Bet (only with premium blockers)"];
    } else {
      action = "Fold"; actionType = "Fold"; sizing = null;
      tag = "Below Calling Range"; score = 80;
      bullets = [
        "Hand does not have sufficient equity vs raiser's range",
        "At live low-stakes, even calling here builds a pot you cannot profitably navigate",
        "Wait for a stronger hand or better position",
      ];
      altLines = [];
    }
  }

  // - RAISE + CALLER (SQUEEZE SPOT) -
  else if (situation === "raise_caller") {
    const squeezeEV = field.fold_to_squeeze * stickyMod;
    // Squeeze sizing: 4x villain's open (one caller adds dead money)
    const squeezeMult = 4;
    const squeezeSize = vilOpenDollars > 0
      ? Math.round(vilOpenDollars * squeezeMult)
      : Math.round(bb * (bb <= 3 ? 14 : 12));
    if (isPremium && topRank <= 2) {
      action = "Squeeze"; actionType = "Squeeze";
      sizing = "$" + squeezeSize;
      tag = "Squeeze Value"; score = 88;
      bullets = [
        "Premium hand vs two opponents - squeeze builds maximum pot",
        "Raiser and caller have capped ranges vs a squeeze",
        "Large sizing charges both players to continue",
      ];
      altLines = ["Flat (trap deep stacks)"];
    } else if (squeezeEV > 0.50 && (hs >= 0.55 || (isSuited && isBroadway))) {
      action = "Squeeze"; actionType = "Squeeze";
      sizing = "$" + Math.round(squeezeSize * 0.85);
      tag = "Squeeze Bluff / Semi-Bluff"; score = 74;
      bullets = [
        Math.round(field.fold_to_squeeze * 100) + "% fold frequency makes squeeze profitable",
        "Caller caps their range - they rarely continue to a squeeze",
        "When called, hand has playability and equity",
      ];
      altLines = ["Fold (sticky table, weak hand)", "Flat (position, deep)"];
    } else {
      action = "Fold"; actionType = "Fold"; sizing = null;
      tag = "Fold to Squeeze Pressure"; score = 75;
      bullets = [
        "Hand does not justify entering a 3-way pot vs raise + call",
        "Squeeze risk is high - pot odds do not compensate",
        "Wait for a premium hand before entering raised + called pots",
      ];
      altLines = ["Flat (premium pairs only, in position)"];
    }
  }

  // When hero has already raised preflop and is now facing a villain re-raise,
  // a "3-Bet" action is actually a 4-Bet. Relabel accordingly.
  if (heroHasActedPreflop && (action === "3-Bet" || actionType === "3-Bet")) {
    action = "4-Bet";
    actionType = "4-Bet";
    tag = tag ? tag.replace("3-Bet", "4-Bet") : tag;
    bullets = (bullets || []).map(b => b.replace(/3-bet/gi, "4-bet").replace(/3-Bet/g, "4-Bet"));
  }

  const pop = buildPopulationProfile(bb, archetype || "station", [], "preflop", []);
  const popInsight = pop.insights?.[0] || null;

  // Enriched preflop sizing: "to $X (Nbb)" format
  let pf_size_dollars = null, pf_size_bb = null, pf_sizingLabel = null;
  if (sizing && sizing.startsWith("$")) {
    pf_size_dollars = parseFloat(sizing.replace("$",""));
    pf_size_bb = bb > 0 ? Math.round((pf_size_dollars/bb)*10)/10 : null;
    pf_sizingLabel = sizing + (pf_size_bb ? " ("+pf_size_bb+"bb)" : "");
  }

  return {
    action, actionType,
    sizing: pf_sizingLabel || sizing,
    size_dollars: pf_size_dollars,
    size_bb: pf_size_bb,
    pot_percentage: null,
    sizingLabel: pf_sizingLabel,
    tag, score: score || 70,
    bullets: bullets || [],
    altLines: altLines || [],
    foldEq: Math.round((field.fold_to_iso || 0.5) * 100),
    hs: hs,
    str: "preflop",
    tex: null,
    populationContext: popInsight,
    field,
    situation,
  };
}


// ================================================================
// PREFLOP RANGE BUILDER ENGINE
// ================================================================

const RANGE_ACTION_COLORS = {
  Open:     "#3B82F6",   // Blue
  Iso:      "#10B981",   // Green
  Overlimp: "#F59E0B",   // Yellow/Amber
  Squeeze:  "#8B5CF6",   // Purple
  Call:     "#14B8A6",   // Teal
  Fold:     "#374151",   // Grey
};

const POSITION_TIGHTNESS = {
  UTG: 0.72, HJ: 0.62, CO: 0.50, BTN: 0.36, SB: 0.45, BB: 0.30,
};

function buildPreflopRangeMap(gameSize, position, tableType, situation, playersLeft, stickiness, stackBB, villainArchetype) {
  const bb = gameSize ? gameSize.bb : 3;
  const field = PREFLOP_FIELD_PROFILES[tableType || "standard"];
  const posTightness = POSITION_TIGHTNESS[position || "BTN"];
  const pLeft = parseInt(playersLeft) || 2;
  const stickyMod = stickiness === "high" ? 1.3 : stickiness === "low" ? 0.7 : 1.0;
  const sit = situation || "unopened";

  // Archetype modifier on field tendencies
  const archMod = villainArchetype ? (ARCHETYPE_MODIFIERS[villainArchetype] || {}) : {};
  const effFoldIso = Math.min(0.95, Math.max(0.1,
    field.fold_to_iso + (archMod.fold_to_cbet || 0) * 0.5
  ));
  const effFoldSqueeze = Math.min(0.95, Math.max(0.1,
    field.fold_to_squeeze + (archMod.fold_to_cbet || 0) * 0.4
  ));

  const rangeMap = {};

  RANKS.forEach((r1, i) => {
    RANKS.forEach((r2, j) => {
      const hand = HAND_GRID[i][j];
      const isPair   = i === j;
      const isSuited = i < j;
      const topRank  = Math.min(i, j);   // lower index = stronger rank
      const rankGap  = Math.abs(i - j);
      const isConnector = rankGap <= 2;
      const isBroadway  = topRank <= 3;
      const isSC        = isSuited && isConnector;

      // Raw hand strength score (0-1)
      let rawHS = 0;
      if (isPair)            rawHS = 0.55 + (12 - topRank) * 0.038;
      else if (isBroadway)   rawHS = 0.45 + (4 - topRank) * 0.06 + (isSuited ? 0.06 : 0) - rankGap * 0.04;
      else if (isSC)         rawHS = 0.28 + (12 - topRank) * 0.015 + (isSuited ? 0.05 : 0);
      else                   rawHS = 0.12 + (12 - topRank) * 0.01 + (isSuited ? 0.03 : 0);
      rawHS = Math.min(0.98, Math.max(0.04, rawHS));

      // Position threshold adjustment
      // Villain-type modifiers: adjust thresholds based on how villain responds to raises
      // - Callers (station, rec, loose_passive): widen range (they never 3-bet, more value)
      // - Aggressive (maniac, lag): tighten range (they 3-bet wide, pot becomes bloated)
      // - Tight (nit): tighten (their continue range is narrow, less value in wide iso)
      const villainThreshAdj = villainArchetype === "station"      ? -0.04
                             : villainArchetype === "rec"           ? -0.05
                             : villainArchetype === "loose_passive" ? -0.03
                             : villainArchetype === "maniac"        ? +0.04
                             : villainArchetype === "lag"           ? +0.03
                             : villainArchetype === "nit"           ? +0.06
                             : villainArchetype === "tag"           ? +0.01
                             : 0;
      const openThreshold = posTightness        + villainThreshAdj;
      const isoThreshold  = posTightness - 0.10 + villainThreshAdj;
      const olThreshold   = posTightness - 0.18 + villainThreshAdj * 0.5;
      const squeezThresh  = posTightness + 0.12 + villainThreshAdj;

      // Multiway penalty: more players = tighter pure open range
      const mwPenalty = Math.max(0, (pLeft - 2) * 0.04);

      let action, frequency, sizing, reasoning;

      // - UNOPENED -
      if (sit === "unopened") {
        if (rawHS >= openThreshold + mwPenalty) {
          action = "Open";
          frequency = Math.min(1, (rawHS - openThreshold) * 2.5);
          sizing = "$" + Math.round((bb <= 2 ? 3 : bb <= 3 ? 4 : 5) * bb);
          reasoning = [
            "Hand meets minimum equity threshold for " + position + " open",
            pLeft >= 3 ? "Multiple players behind - standard sizing maintains balance" : "Heads-up potential - open for value and fold equity",
            isBroadway ? "Broadway cards dominate calling ranges" : isPair ? "Set potential adds implied odds value" : "Suited/connected adds multiway equity",
          ];
        } else if (rawHS >= olThreshold + mwPenalty * 0.5 && (isSC || isPair)) {
          action = "Overlimp";
          frequency = Math.min(0.6, (rawHS - olThreshold) * 1.5);
          sizing = "$" + bb;
          reasoning = [
            "Hand has multiway implied odds but not enough equity to open",
            "Overlimping preserves pot control with speculative holding",
            "Position post-flop will determine profitability",
          ];
        } else {
          action = "Fold";
          frequency = 0;
          sizing = null;
          reasoning = [
            "Hand below minimum threshold for " + position,
            "Opening creates -EV spots with dominated postflop ranges",
            "Wait for better position or stronger holding",
          ];
        }
      }

      // - FACING LIMPERS -
      else if (sit === "one_limper" || sit === "two_limpers") {
        const limpCount = sit === "two_limpers" ? 2 : 1;
        const isoSize = "$" + Math.round((bb <= 2 ? (3 + limpCount) : (4 + limpCount)) * bb);
        const netFoldIso = effFoldIso * (1 / (1 + limpCount * 0.15)) * stickyMod;

        if (rawHS >= isoThreshold) {
          action = "Iso";
          frequency = Math.min(1, (rawHS - isoThreshold) * 2.8);
          sizing = isoSize;
          reasoning = [
            "Iso raise: limper range is wide and capped - you are well ahead",
            Math.round(effFoldIso * 100) + "% of this table folds to isolation",
            limpCount > 1 ? "Larger sizing needed to reduce multiway equity loss" : "Single limper - standard iso sizing applies",
          ];
        } else if (rawHS >= olThreshold && (isSC || isPair) && netFoldIso < 0.45) {
          action = "Overlimp";
          frequency = Math.min(0.75, (rawHS - olThreshold) * 2.0);
          sizing = "$" + bb;
          reasoning = [
            "Table too sticky for iso - " + Math.round((1 - effFoldIso) * 100) + "% of limpers call",
            "Speculative hand benefits from multiway implied odds",
            "Overlimp to see cheap flop with set/flush potential",
          ];
        } else {
          action = "Fold";
          frequency = 0;
          sizing = null;
          reasoning = [
            "Hand does not meet iso or overlimp threshold",
            "Entering limped pot out of position with weak hand is -EV",
            "Fold and wait for a stronger spot",
          ];
        }
      }

      // - FACING RAISE -
      else if (sit === "raise") {
        if (rawHS >= squeezThresh) {
          action = "Iso";   // 3-bet/squeeze context
          frequency = Math.min(1, (rawHS - squeezThresh) * 3.0);
          sizing = "$" + Math.round(bb * (bb <= 3 ? 10 : 9));
          reasoning = [
            "3-bet for value: hand has strong equity vs raiser's range",
            "Re-raising takes initiative and defines the raiser",
            "Do not flat strong hands - build the pot now",
          ];
        } else if (rawHS >= openThreshold && (isSC || isPair || isSuited)) {
          action = "Call";
          frequency = Math.min(0.8, (rawHS - openThreshold) * 1.8);
          sizing = null;
          reasoning = [
            "Hand has implied odds but not strong enough to 3-bet",
            "Calling in position preserves equity with speculative hand",
            "Look to flop a strong made hand or draw",
          ];
        } else {
          action = "Fold";
          frequency = 0;
          sizing = null;
          reasoning = [
            "Hand below calling threshold vs this raise",
            "Calling too wide vs raises creates -EV postflop spots",
            "Fold and wait for better hands or position",
          ];
        }
      }

      // - RAISE + CALLER (SQUEEZE) -
      else if (sit === "raise_caller") {
        const squeezEV = effFoldSqueeze * stickyMod;
        if (rawHS >= squeezThresh || (squeezEV > 0.52 && rawHS >= openThreshold && isBroadway)) {
          action = "Squeeze";
          frequency = Math.min(1, squeezEV * rawHS * 2.5);
          sizing = "$" + Math.round(bb * (bb <= 3 ? 13 : 11));
          reasoning = [
            "Squeeze: raiser + caller ranges are capped vs 3-bet",
            Math.round(effFoldSqueeze * 100) + "% fold to squeeze - high fold equity",
            rawHS >= squeezThresh ? "Premium hand - squeeze for max value" : "Suitable bluff candidate with blocker equity",
          ];
        } else if (rawHS >= openThreshold && isPair && topRank >= 5) {
          action = "Call";
          frequency = Math.min(0.5, rawHS * 0.8);
          sizing = null;
          reasoning = [
            "Medium pair has set mining potential in multiway pot",
            "Squeezing without premium is too thin given caller's range",
            "Call and look to flop a set with implied odds",
          ];
        } else {
          action = "Fold";
          frequency = 0;
          sizing = null;
          reasoning = [
            "Hand too weak to enter raise + caller pot",
            "Squeeze equity insufficient without strong holding",
            "Fold - pot odds do not compensate for equity deficit",
          ];
        }
      }

      else {
        action = "Fold"; frequency = 0; sizing = null;
        reasoning = ["Default fold - no clear action defined"];
      }

      rangeMap[hand] = { hand, action, frequency, sizing, reasoning };
    });
  });

  return rangeMap;
}

// ================================================================
// PREFLOP RANGE BUILDER SCREEN
// ================================================================

function RangeBuilderScreen({ onBack, initialGameSize }) {
  const [gameSize,   setGameSize]   = useState(initialGameSize || GAME_SIZES[1]);
  const [position,   setPosition]   = useState("BTN");
  const [tableType,  setTableType]  = useState("standard");
  const [situation,  setSituation]  = useState("unopened");
  const [playersLeft,setPlayersLeft]= useState("1");
  const [stickiness, setStickiness] = useState("medium");
  const [stackBB,    setStackBB]    = useState(100);
  const [villainType,setVillainType]= useState(null);
  const [filterMode, setFilterMode] = useState("Open");
  const [hovered,    setHovered]    = useState(null);
  const [tableCondOpen, setTableCondOpen] = useState(false);
  const [gameSizeOpen, setGameSizeOpen] = useState(false);
  const [viewMode, setViewMode]     = useState("grid"); // "grid", "quick", "print"

  const rangeMap = buildPreflopRangeMap(
    gameSize, position, tableType, situation, playersLeft, stickiness, stackBB, villainType
  );

  // Count hands per action
  const counts = {};
  Object.entries(RANGE_ACTION_COLORS).forEach(([a]) => { counts[a] = 0; });
  Object.values(rangeMap).forEach(({ action }) => { counts[action] = (counts[action] || 0) + 1; });
  const total169 = 169;

  // Auto-switch to first non-zero tab when current filterMode shows 0 hands.
  // e.g. selecting "2+ Limpers" while on "Open" tab -> auto-switch to "Iso"
  const ACTION_PRIORITY = ["Open","Iso","Squeeze","Overlimp","Call","Fold"];
  const smartFilterMode = (counts[filterMode]||0) > 0
    ? filterMode
    : ACTION_PRIORITY.find(a => (counts[a]||0) > 0) || filterMode;

  // Sync filterMode state when smart default differs (avoids stale tab on situation change)
  React.useEffect(() => {
    if (smartFilterMode !== filterMode) setFilterMode(smartFilterMode);
  }, [situation, tableType, position]);

  const hoveredData = hovered ? rangeMap[hovered] : null;

  // Active tabs only - filter to actions that have >0 hands for current situation
  const activeTabs = Object.entries(RANGE_ACTION_COLORS).filter(([a])=>(counts[a]||0)>0 || a==="Fold");

  // Quick reference: top 20 playable hands sorted by frequency/strength
  const topHands = Object.entries(rangeMap)
    .filter(([,d])=>d.action!=="Fold")
    .sort((a,b)=>(b[1].frequency||0.5)-(a[1].frequency||0.5))
    .slice(0,20);

  // Stats
  const playedCount = Object.values(rangeMap).filter(r=>r.action!=="Fold").length;
  const playedPct = Math.round(playedCount/total169*100);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter',sans-serif", color:C.text }}>
      <style>{BASE_CSS}</style>

      {/* Header */}
      <div style={{ borderBottom:"1px solid "+C.border, padding:"0 20px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Btn variant="ghost" onClick={onBack} style={{ padding:"4px 8px" }}>&#8592; Back</Btn>
            <div style={{ width:1, height:24, background:C.border }}/>
            <span style={{ fontSize:16, fontWeight:700, color:C.text }}>Preflop Range Builder</span>
            <span style={{ padding:"2px 8px", borderRadius:99, background:C.gold+"18", color:C.gold, fontSize:11, fontWeight:700 }}>
              {gameSize.label}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:11, color:C.muted }}>
              {playedPct}% hands played
            </div>
            {/* View mode toggle */}
            <div style={{ display:"flex", gap:2, background:C.surface, borderRadius:6, padding:2 }}>
              {[["grid","Grid"],["quick","Top 20"],["print","Print"]].map(([k,l])=>(
                <button key={k} onClick={()=>setViewMode(k)} style={{
                  padding:"4px 10px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
                  background:viewMode===k?C.card:"transparent", border:"none",
                  color:viewMode===k?C.text:C.disabled,
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="riq-builder-grid" style={{ maxWidth:1100, margin:"0 auto", padding:"20px 16px", display:"grid", gridTemplateColumns:"260px 1fr", gap:20, alignItems:"start" }}>

        {/* LEFT  -  Controls (redesigned: 2 groups, minimal scroll) */}
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>

          {/* GROUP 1: SPOT SETUP - position, situation, villain, game size */}
          <Card style={{ marginBottom:12 }}>
            {/* Game Size - inline header badge, expandable */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <SectionLabel style={{ marginBottom:0 }}>Spot Setup</SectionLabel>
              <button onClick={()=>setGameSizeOpen(v=>!v)} style={{
                padding:"3px 10px", borderRadius:99, fontSize:10, fontWeight:700, cursor:"pointer",
                background:C.gold+"18", border:"1px solid "+C.gold+"44", color:C.gold,
              }}>{gameSize.label}{!gameSizeOpen&&<span style={{ fontSize:8, marginLeft:4, opacity:0.6 }}>&#9660;</span>}</button>
            </div>
            {gameSizeOpen&&(
              <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                {GAME_SIZES.map(gs=>(
                  <button key={gs.label} onClick={()=>{ setGameSize(gs); setGameSizeOpen(false); }} style={{
                    flex:1, padding:"6px 2px", borderRadius:6, fontSize:10, fontWeight:700, cursor:"pointer",
                    background:gameSize.label===gs.label?C.gold+"22":C.surface,
                    border:"1px solid "+(gameSize.label===gs.label?C.gold:C.border),
                    color:gameSize.label===gs.label?C.gold:C.muted,
                  }}>{gs.label}</button>
                ))}
              </div>
            )}

            {/* Position - 3x2 compact grid */}
            <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Position</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:3, marginBottom:10 }}>
              {POSITIONS.map(pos=>(
                <button key={pos} onClick={()=>setPosition(pos)} style={{
                  padding:"6px 4px", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer",
                  background:position===pos?C.purple+"22":C.surface,
                  border:"1px solid "+(position===pos?C.purple:C.border),
                  color:position===pos?C.purple:C.muted,
                }}>{pos}</button>
              ))}
            </div>

            {/* Situation - compact wrapped pills */}
            <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Situation</div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:10 }}>
              {Object.entries(PREFLOP_SITUATION_LABELS).map(([key,label])=>(
                <button key={key} onClick={()=>setSituation(key)} style={{
                  padding:"5px 8px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
                  background:situation===key?C.purple+"22":C.surface,
                  border:"1px solid "+(situation===key?C.purple:C.border),
                  color:situation===key?C.purple:C.muted,
                }}>{label}</button>
              ))}
            </div>

            {/* Villain - compact pills, moved up from bottom */}
            <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
              Villain <span style={{ fontWeight:400, textTransform:"none" }}>(optional)</span>
            </div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
              <button onClick={()=>setVillainType(null)} style={{
                padding:"4px 8px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
                background:villainType===null?C.gold+"18":C.surface,
                border:"1px solid "+(villainType===null?C.gold:C.border),
                color:villainType===null?C.gold:C.disabled,
              }}>None</button>
              {Object.entries(ARCHETYPES).filter(([k])=>k!=="unknown").map(([key,prof])=>(
                <button key={key} onClick={()=>setVillainType(key)} style={{
                  padding:"4px 8px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
                  background:villainType===key?prof.color+"22":C.surface,
                  border:"1px solid "+(villainType===key?prof.color:C.border),
                  color:villainType===key?prof.color:C.muted,
                }}>{prof.label}</button>
              ))}
            </div>
          </Card>

          {/* GROUP 2: TABLE CONDITIONS - collapsed by default */}
          <Card>
            <button onClick={()=>setTableCondOpen(v=>!v)} style={{
              width:"100%", background:"none", border:"none", cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"space-between", padding:0,
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>Table Conditions</div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:10, color:C.teal, fontWeight:600 }}>{(PREFLOP_FIELD_PROFILES[tableType]||{}).label||"Standard"}</span>
                <span style={{ fontSize:9, color:C.disabled }}>&#183;</span>
                <span style={{ fontSize:10, color:C.muted }}>{playersLeft} left</span>
                <span style={{ fontSize:9, color:C.disabled }}>&#183;</span>
                <span style={{ fontSize:10, color:C.muted }}>{stickiness.charAt(0).toUpperCase()+stickiness.slice(1,3)}</span>
                <span style={{ fontSize:9, color:C.disabled, transform:tableCondOpen?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.15s", display:"inline-block" }}>&#9660;</span>
              </div>
            </button>
            {tableCondOpen&&(
              <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:10 }}>
                {/* Table Type - compact pills */}
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Table Type</div>
                  <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                    {Object.entries(PREFLOP_FIELD_PROFILES).map(([key,prof])=>(
                      <button key={key} onClick={()=>setTableType(key)} style={{
                        padding:"5px 9px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer",
                        background:tableType===key?C.teal+"22":C.surface,
                        border:"1px solid "+(tableType===key?C.teal:C.border),
                        color:tableType===key?C.teal:C.muted,
                      }}>{prof.label}</button>
                    ))}
                  </div>
                </div>
                {/* Players Left */}
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Players Left to Act</div>
                  <div style={{ display:"flex", gap:3 }}>
                    {["1","2","3","4+"].map(n=>(
                      <button key={n} onClick={()=>setPlayersLeft(n)} style={{
                        flex:1, padding:"5px 4px", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer",
                        background:playersLeft===n?C.amber+"22":C.surface,
                        border:"1px solid "+(playersLeft===n?C.amber:C.border),
                        color:playersLeft===n?C.amber:C.muted,
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
                {/* Field Stickiness */}
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Field Stickiness</div>
                  <div style={{ display:"flex", gap:3 }}>
                    {[["low","Low",C.green],["medium","Medium",C.amber],["high","High",C.red]].map(([key,label,col])=>(
                      <button key={key} onClick={()=>setStickiness(key)} style={{
                        flex:1, padding:"5px 4px", borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer",
                        background:stickiness===key?col+"18":C.surface,
                        border:"1px solid "+(stickiness===key?col:C.border),
                        color:stickiness===key?col:C.muted,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT  -  Grid + Tooltip + Quick Ref + Print */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Intro explanation */}
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>
            This grid shows which hands to play from <span style={{ color:C.purple, fontWeight:700 }}>{position}</span> in a <span style={{ color:C.teal, fontWeight:600 }}>{(PREFLOP_FIELD_PROFILES[tableType]||{}).label||"Standard"}</span> game.
            Highlighted hands are recommended plays. Everything else is a fold. Tap any hand for details.
          </div>

          {/* Summary stats row - ABOVE the grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
            {[
              ["Played", playedCount, C.green],
              [smartFilterMode, counts[smartFilterMode]||0, RANGE_ACTION_COLORS[smartFilterMode]||C.gold],
              ["Folded", counts["Fold"]||0, C.disabled],
            ].map(([label,val,col])=>(
              <div key={label} style={{ background:C.card, border:"1px solid "+C.border, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:col, lineHeight:1, marginBottom:2 }}>{val}</div>
                <div style={{ fontSize:9, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label} ({Math.round(val/total169*100)}%)</div>
              </div>
            ))}
          </div>

          {/* Action tabs - only show tabs with >0 hands */}
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {activeTabs.map(([action, col])=>(
              <button key={action} onClick={()=>setFilterMode(action)} style={{
                padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                background:smartFilterMode===action?col+"22":C.surface,
                border:"1.5px solid "+(smartFilterMode===action?col:C.border),
                color:smartFilterMode===action?col:C.muted,
              }}>
                {action} <span style={{ fontSize:10, opacity:0.8 }}>{counts[action]||0}</span>
              </button>
            ))}
          </div>

          {/* Situation Summary - fully villain-aware */}
          {(()=>{
            const field = PREFLOP_FIELD_PROFILES[tableType] || PREFLOP_FIELD_PROFILES["standard"];
            const limpCount = situation === "two_limpers" ? 2 : situation === "one_limper" ? 1 : 0;
            const isoSize = limpCount > 0
              ? "$" + Math.round((gameSize.bb <= 2 ? (3 + limpCount) : (4 + limpCount)) * gameSize.bb)
              : "$" + Math.round((gameSize.bb <= 2 ? 3 : gameSize.bb <= 3 ? 4 : 5) * gameSize.bb);
            const openPct   = Math.round((counts["Open"]||0)/169*100);
            const isoPct    = Math.round((counts["Iso"]||0)/169*100);
            const villainLabel = villainType ? (ARCHETYPES[villainType]?.label || villainType) : null;
            const vt = villainType;

            let summary = "";
            if (situation === "unopened") {
              if (vt === "station") {
                summary = position + " opens " + openPct + "% of hands vs a Calling Station. Raise to " + isoSize + ". Size up for value - they call with any pair, draw, or ace. Never bluff postflop. Your range is wider because their calling frequency makes thin value profitable.";
              } else if (vt === "nit") {
                summary = position + " opens " + openPct + "% of hands vs a Nit. Raise to " + isoSize + ". Open wider than normal - Nits fold preflop at extremely high frequency. A standard raise takes the pot uncontested most of the time. If they 3-bet, fold everything except premiums.";
              } else if (vt === "maniac") {
                summary = position + " opens " + openPct + "% of hands vs a Maniac. Raise to " + isoSize + ". Tighten your opening range slightly - Maniacs 3-bet and squeeze at high frequency. Open only hands you are comfortable playing in a 3-bet pot. Postflop, value bet large and let them bluff into you.";
              } else if (vt === "lag") {
                summary = position + " opens " + openPct + "% of hands vs a LAG. Raise to " + isoSize + ". Expect frequent 3-bets. Keep your opening range strong enough to continue vs aggression. Fold the bottom of your range to 3-bets but 4-bet your premiums for value.";
              } else if (vt === "loose_passive") {
                summary = position + " opens " + openPct + "% of hands vs a Loose Passive player. Raise to " + isoSize + ". Open wider for value - they call too wide but almost never raise. Every value hand is profitable. Size up slightly to build bigger pots when you connect.";
              } else if (vt === "tag") {
                summary = position + " opens " + openPct + "% of hands vs a TAG. Raise to " + isoSize + ". TAGs play tight and strong - your opening range stays standard. They respect raises and fold marginal hands. Postflop, use medium sizing for value and pick spots for bluffs carefully.";
              } else if (vt === "rec") {
                summary = position + " opens " + openPct + "% of hands vs a Recreational player. Raise to " + isoSize + ". Recs are unpredictable - they call wide with random hands and make mistakes postflop. Open a standard range and focus on value betting strong hands after the flop.";
              } else {
                summary = position + " opens " + openPct + "% of hands at a " + field.label + " table. Raise to " + isoSize + ". Standard sizing builds the pot while keeping fold equity intact against this field.";
              }
            } else if (situation === "one_limper" || situation === "two_limpers") {
              const limpers = limpCount > 1 ? limpCount + " limpers" : "1 limper";
              if (vt === "station") {
                summary = "With " + limpers + " and a Calling Station at the table, isolate with " + isoPct + "% of hands. Raise to " + isoSize + ". Stations call iso raises with any pair or draw - your range is wider because every value hand prints money against them.";
              } else if (vt === "nit") {
                summary = "With " + limpers + " and a Nit in the field, isolate with " + isoPct + "% of hands. Raise to " + isoSize + ". The Nit folds to iso raises at extremely high frequency, so you pick up the pot uncontested often. Widen your iso range slightly.";
              } else if (vt === "maniac") {
                summary = "With " + limpers + " and a Maniac behind, isolate with " + isoPct + "% of hands. Raise to " + isoSize + ". Be prepared for a squeeze or 3-bet from the Maniac - iso only hands you can play in a big pot.";
              } else if (vt === "lag") {
                summary = "With " + limpers + " and a LAG in the field, isolate with " + isoPct + "% of hands. Raise to " + isoSize + ". LAGs may 3-bet over your iso - tighten to the top of your range and be prepared to continue vs aggression.";
              } else {
                summary = "With " + limpers + ", isolating from " + position + " is the highest-EV play. Raise to " + isoSize + " with " + isoPct + "% of hands." + (vt === "loose_passive" ? " Loose Passive players call iso raises wide - size up and value bet relentlessly postflop." : vt === "rec" ? " Recreational players call wide and make mistakes - iso for value with a wider range." : "");
              }
            } else if (situation === "raise") {
              if (vt === "maniac") {
                summary = "Facing a raise from a Maniac. Their opening range is extremely wide - 3-bet a wide value range and include bluffs with blockers. They call or 4-bet frequently, so be prepared to play a big pot.";
              } else if (vt === "nit") {
                summary = "Facing a raise from a Nit. Their opening range is narrow and strong - only 3-bet premium hands for value. Bluff 3-bets are deeply unprofitable vs tight openers who only continue with the nuts.";
              } else if (vt === "lag") {
                summary = "Facing a raise from a LAG. Their wide opening range makes 3-bets highly profitable. Expand your 3-bet value range and add suited bluffs with blockers to AK and QQ.";
              } else if (vt === "station") {
                summary = "Facing a raise from a Calling Station. They open too wide and call 3-bets with marginal hands. 3-bet a wide value range - they will pay you off postflop with second pair and worse.";
              } else {
                summary = "Facing a raise" + (villainLabel ? " from a " + villainLabel : "") + ". 3-bet your strongest hands for value and fold everything else - calling out of position is rarely the best line.";
              }
            } else if (situation === "raise_caller") {
              if (vt === "maniac") {
                summary = "Raise and caller with a Maniac in the field. The Maniac may call or shove over the squeeze - size up and only squeeze hands you can play all-in with.";
              } else if (vt === "station") {
                summary = "Raise and caller with a Calling Station. They flatten squeezes with any pair or draw - squeeze only strong value hands. Bluff squeezes lose money vs players who never fold.";
              } else {
                summary = "Raise and caller in front - squeeze with your strongest hands to take the initiative. Both the raiser and caller have capped ranges vs a 3-bet.";
              }
            }
            if (!summary) return null;
            const overlimpCount = counts["Overlimp"]||0;
            return (
              <div style={{ padding:"10px 14px", borderRadius:8, background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.18)" }}>
                <div style={{ fontSize:12, color:"#E5E7EB", lineHeight:1.6 }}>{summary}</div>
                {overlimpCount > 0 && (
                  <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid rgba(139,92,246,0.12)", fontSize:12, color:"#D4B483", lineHeight:1.6 }}>
                    <span style={{ fontWeight:700 }}>Overlimp ({overlimpCount} hands):</span> Instead of raising or folding, some speculative hands (small pairs, suited connectors) are best played by just calling the existing limp. This is called "overlimping" - you put in the minimum to see a cheap flop with a hand that has big potential (sets, straights, flushes) but poor standalone value. If you miss the flop, you can fold cheaply. If you hit, you can win a big pot.
                  </div>
                )}
              </div>
            );
          })()}

          {/* GRID VIEW */}
          {viewMode==="grid"&&(
            <>
              {/* Grid + floating tooltip side by side */}
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <Card style={{ padding:12 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                        {smartFilterMode} Range - {position}
                      </div>
                      <div style={{ fontSize:10, color:C.muted }}>
                        {counts[smartFilterMode]||0} hands
                      </div>
                    </div>

                    {/* Rank labels */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(13,1fr)", gap:2, marginBottom:2 }}>
                      {RANKS.map(r=>(
                        <div key={r} style={{ textAlign:"center", fontSize:8, color:C.disabled, fontWeight:600, padding:"1px 0" }}>{r}</div>
                      ))}
                    </div>

                    {/* 13x13 Grid */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(13,1fr)", gap:2 }}>
                      {HAND_GRID.map((row, i) => row.map((hand, j) => {
                        const data = rangeMap[hand];
                        const isTarget = data && data.action === smartFilterMode;
                        const col = isTarget ? RANGE_ACTION_COLORS[data.action] : "transparent";
                        const isHov = hovered === hand;
                        return (
                          <div key={hand}
                            onMouseEnter={()=>setHovered(hand)}
                            onMouseLeave={()=>setHovered(null)}
                            onClick={()=>setHovered(hovered===hand?null:hand)}
                            style={{
                              paddingBottom:"100%", position:"relative", borderRadius:2,
                              background: isTarget ? col+"33" : "rgba(255,255,255,0.03)",
                              border: isHov ? "2px solid "+col : "1px solid "+(isTarget ? col+"55" : "rgba(255,255,255,0.05)"),
                              cursor:"pointer", transition:"all 0.08s",
                              opacity: isTarget ? 1 : 0.25,
                            }}>
                            <div style={{
                              position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:7, fontWeight:700,
                              color: isTarget ? col : "rgba(255,255,255,0.2)",
                              fontFamily:"monospace",
                            }}>
                              {hand}
                            </div>
                          </div>
                        );
                      }))}
                    </div>

                    {/* Legend */}
                    <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap", fontSize:9, color:C.disabled }}>
                      <span>Diagonal = pairs</span>
                      <span>Upper-right = suited</span>
                      <span>Lower-left = offsuit</span>
                    </div>
                  </Card>
                </div>

                {/* Floating hand detail panel - beside the grid */}
                <div style={{ width:220, flexShrink:0 }}>
                  {hoveredData ? (
                    <Card style={{ padding:"12px 14px", position:"sticky", top:70 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:18, fontWeight:900, color:C.gold, fontFamily:"monospace" }}>{hoveredData.hand}</span>
                        <span style={{
                          padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:700,
                          background:(RANGE_ACTION_COLORS[hoveredData.action]||C.muted)+"22",
                          color:RANGE_ACTION_COLORS[hoveredData.action]||C.muted,
                        }}>{hoveredData.action}</span>
                      </div>
                      {hoveredData.sizing&&(
                        <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:6 }}>{hoveredData.sizing}</div>
                      )}
                      {hoveredData.frequency > 0 && (
                        <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>{Math.round(hoveredData.frequency * 100)}% frequency</div>
                      )}
                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        {(hoveredData.reasoning||[]).map((r,i)=>(
                          <div key={i} style={{ display:"flex", gap:5, alignItems:"flex-start" }}>
                            <span style={{ color:RANGE_ACTION_COLORS[hoveredData.action]||C.muted, fontSize:7, marginTop:3, flexShrink:0 }}>&#9679;</span>
                            <span style={{ fontSize:11, color:C.muted, lineHeight:1.4 }}>{r}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card style={{ padding:"14px", textAlign:"center" }}>
                      <div style={{ fontSize:11, color:C.disabled, fontStyle:"italic" }}>Hover or tap a hand for details</div>
                    </Card>
                  )}
                  {/* Export CSV - copy to clipboard as fallback for sandbox */}
                  <button
                    onClick={()=>{
                      const header = "Hand,Action,Frequency,Sizing\n";
                      const rows = Object.entries(rangeMap)
                        .sort((a,b)=>a[0].localeCompare(b[0]))
                        .map(([hand,d])=>hand+","+d.action+","+Math.round((d.frequency||0)*100)+"%,"+(d.sizing||""))
                        .join("\n");
                      const csv = header+rows;
                      // Try download first, fall back to clipboard
                      try {
                        const blob = new Blob([csv], { type:"text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href=url; a.download="rangeiq-"+position+"-"+situation+"-"+gameSize.label.replace("/","_")+".csv"; a.click();
                        URL.revokeObjectURL(url);
                      } catch(e) {
                        // Fallback: copy to clipboard
                        try { navigator.clipboard.writeText(csv); alert("CSV copied to clipboard - paste into a text file and save as .csv"); }
                        catch(e2) { alert("Export not available in this environment. Use the Print view instead."); }
                      }
                    }}
                    style={{ width:"100%", marginTop:8, padding:"6px 10px", borderRadius:6, fontSize:10, fontWeight:600,
                      cursor:"pointer", background:"transparent", border:"1px solid "+C.border, color:C.disabled,
                    }}>
                    Export CSV (all 169 hands with actions)
                  </button>
                </div>
              </div>
            </>
          )}

          {/* QUICK REFERENCE VIEW */}
          {viewMode==="quick"&&(
            <Card style={{ padding:16 }}>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:2 }}>Quick Reference - {position} {situation==="unopened"?"Open":situation}</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>
                Your top plays from this position. The hands below are your highest-value starting hands - play these confidently and fold the rest.
              </div>
              {/* Group by tier */}
              {[
                { label:"Premium (always play)", slice:[0,5], bg:"rgba(16,185,129,0.06)", border:"rgba(16,185,129,0.15)" },
                { label:"Strong (play from most positions)", slice:[5,12], bg:"rgba(245,158,11,0.04)", border:"rgba(245,158,11,0.1)" },
                { label:"Playable (position-dependent)", slice:[12,20], bg:"rgba(255,255,255,0.02)", border:"rgba(255,255,255,0.05)" },
              ].map(tier=>{
                const hands = topHands.slice(tier.slice[0], tier.slice[1]);
                if (hands.length===0) return null;
                return (
                  <div key={tier.label} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{tier.label}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {hands.map(([hand,d])=>{
                        const handType = hand.length===2?"pair":hand.endsWith("s")?"suited":"offsuit";
                        return (
                          <div key={hand} style={{ padding:"8px 12px", borderRadius:8, background:tier.bg, border:"1px solid "+tier.border, display:"flex", flexDirection:"column", alignItems:"center", minWidth:70 }}>
                            <span style={{ fontSize:16, fontWeight:900, color:C.gold, fontFamily:"monospace" }}>{hand}</span>
                            <span style={{ padding:"1px 6px", borderRadius:99, fontSize:9, fontWeight:700, marginTop:2,
                              background:(RANGE_ACTION_COLORS[d.action]||C.muted)+"22",
                              color:RANGE_ACTION_COLORS[d.action]||C.muted,
                            }}>{d.action} {d.sizing||""}</span>
                            <span style={{ fontSize:8, color:C.disabled, marginTop:2 }}>{handType}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {topHands.length===0&&(
                <div style={{ textAlign:"center", padding:20, color:C.disabled, fontStyle:"italic" }}>No playable hands for this situation</div>
              )}
              {/* Tip */}
              <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"rgba(230,197,102,0.06)", border:"1px solid rgba(230,197,102,0.15)", fontSize:11, color:C.gold, lineHeight:1.5 }}>
                Tip: Suited hands (like AKs) have more equity than their offsuit versions (AKo) because they can make flushes. Pairs have the highest raw equity preflop.
              </div>
            </Card>
          )}

          {/* PRINT VIEW */}
          {viewMode==="print"&&(
            <Card style={{ padding:20, background:"#fff", color:"#111" }}>
              <div style={{ textAlign:"center", marginBottom:16 }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#111" }}>RangeIQ - {position} {situation==="unopened"?"Opening":situation} Range</div>
                <div style={{ fontSize:12, color:"#666" }}>{gameSize.label} - {(PREFLOP_FIELD_PROFILES[tableType]||{}).label||"Standard"} Table</div>
              </div>
              {/* Compact grid for print */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(13,1fr)", gap:1, marginBottom:12 }}>
                {HAND_GRID.map((row, i) => row.map((hand, j) => {
                  const data = rangeMap[hand];
                  const isPlay = data && data.action !== "Fold";
                  const col = isPlay ? (RANGE_ACTION_COLORS[data.action]||"#888") : "#eee";
                  return (
                    <div key={hand} style={{
                      paddingBottom:"100%", position:"relative", borderRadius:1,
                      background: isPlay ? col+"44" : "#f5f5f5",
                      border:"1px solid "+(isPlay ? col : "#ddd"),
                    }}>
                      <div style={{
                        position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:7, fontWeight:700, color: isPlay ? "#222" : "#bbb", fontFamily:"monospace",
                      }}>{hand}</div>
                    </div>
                  );
                }))}
              </div>
              {/* Legend for print */}
              <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", fontSize:10, color:"#666", marginBottom:12 }}>
                {Object.entries(RANGE_ACTION_COLORS).filter(([a])=>(counts[a]||0)>0).map(([a,col])=>(
                  <span key={a} style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:col+"66", border:"1px solid "+col }}/>
                    {a} ({counts[a]})
                  </span>
                ))}
              </div>
              <div style={{ textAlign:"center", fontSize:10, color:"#999" }}>
                {playedCount} hands played ({playedPct}%) - Diagonal = pairs, upper-right = suited, lower-left = offsuit
              </div>
              <div style={{ textAlign:"center", marginTop:12 }}>
                <button onClick={()=>window.print()} style={{ padding:"8px 20px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", background:"#111", color:"#fff", border:"none" }}>
                  Print This Page
                </button>
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}



// ================================================================
// DECISION STATE ENGINE (DSE) v1.0
// + AGGRESSION CALIBRATION LAYER (ACL) v1.0
// ================================================================
// Architecture:
//   UI Input
//   -> DSE (validate state, legal actions, readiness gate)
//   -> Hand Evaluation + Board Texture
//   -> ACL (score aggression, apply overrides, calibrate confidence)
//   -> Recommendation Engine
//   -> UI Output
// ================================================================

// ================================================================
// DECISION STATE ENGINE (DSE) v1.0
// Single source of truth for game flow.
// No assumptions. No hidden actions.
// Every recommendation comes from a fully validated, visible state.
// ================================================================

// -- DSE State Builder --------------------------------------------
function buildDSEState({
  heroCards, heroPos, villainPos,
  board, street, vilAction,
  potSize, stackBB, heroIsIP,
  isMultiway, heroLastToAct,
  archetype, preflopSituation, heroHasActedPreflop,
  heroStreetDecision
}) {
  return {
    hero:    { cards: heroCards, position: heroPos },
    villain: { position: villainPos, profile: archetype },
    board:   { cards: board, street },
    action:  { history: vilAction || [], potSize, stackBB },
    context: { heroIsIP, isMultiway, heroLastToAct, preflopSituation, heroHasActedPreflop, heroStreetDecision },
  };
}

// -- DSE Rule 1: Position Integrity -------------------------------
function dseValidatePositions(dseState) {
  const { hero, villain } = dseState;
  const errors = [];
  if (hero.position && villain.position && hero.position === villain.position) {
    errors.push("Hero and Villain cannot occupy the same position (" + hero.position + ")");
  }
  return errors;
}

// -- DSE Rule 2: Board Completeness -------------------------------
function dseValidateBoard(dseState) {
  const { board } = dseState;
  const required = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const needed = required[board.street] || 0;
  const errors = [];
  if (board.cards.length < needed) {
    const diff = needed - board.cards.length;
    errors.push("Add " + diff + " more " + board.street + " card" + (diff !== 1 ? "s" : "") + " to continue");
  }
  return errors;
}

// -- DSE Rule 3: Turn Order & Legal Actions -----------------------
function dseGetLegalActions(dseState) {
  const { board, action, context } = dseState;
  const street = board.street;
  const vilActs = (action.history || []).filter(a => a.street === street);
  const lastVil = vilActs.length > 0 ? vilActs[vilActs.length - 1] : null;

  // IP hero acts last  -  villain must act first on each postflop street
  if (street === "preflop") {
    // Preflop hero legal actions  -  what hero can do based on prior villain action
    const vilPreflop = (action.history || []).filter(a => a.street === "preflop");
    const lastVilPF  = vilPreflop.length > 0 ? vilPreflop[vilPreflop.length-1] : null;
    if (!lastVilPF || lastVilPF.type === "check") {
      // No villain action or villain checked (BB option) -> hero can open/limp/fold
      return ["Open Raise", "Call", "Fold"];
    }
    if (lastVilPF.type === "call") {
      // Villain limped -> hero can isolate, over-limp, fold
      return ["Isolate Raise", "Call", "Fold"];
    }
    if (lastVilPF.type === "raise") {
      // Villain raised -> hero can 3-bet, call, fold; or squeeze if callers present
      const callerCount = vilPreflop.filter(a => a.type === "call").length;
      return callerCount >= 1
        ? ["Squeeze", "Call", "Fold"]
        : ["3-Bet", "Call", "Fold"];
    }
    // Default fallback
    return ["Open Raise", "Call", "Fold", "Squeeze", "3-Bet"];
  }

  if (!lastVil) {
    // No villain action recorded yet
    if (context.heroIsIP) {
      // Villain acts first when hero is IP  -  no legal hero action until villain acts
      return [];  // block until villain action is set
    } else {
      // OOP hero acts first
      return ["Bet", "Check"];
    }
  }

  if (lastVil.type === "check") return ["Bet", "Check"];
  if (lastVil.type === "bet" || lastVil.type === "raise") return ["Fold", "Call", "Raise"];
  if (lastVil.type === "call") return ["Bet", "Check"];  // villain called a bet, hero acts again
  if (lastVil.type === "fold") return [];  // hand over

  return ["Bet", "Check", "Fold", "Call", "Raise"]; // fallback
}

// -- DSE Rule 4: Recommendation Readiness Gate --------------------
// Spec: "Recommendations cannot be generated without visible action state."
function dseReadinessCheck(dseState) {
  const posErrors   = dseValidatePositions(dseState);
  const boardErrors = dseValidateBoard(dseState);
  const legalActions= dseGetLegalActions(dseState);
  const { board, context } = dseState;
  const street = board.street;

  const errors   = [...posErrors, ...boardErrors];
  const warnings = [];
  const flags    = [];

  // Hero cards required
  if (!dseState.hero.cards[0] || !dseState.hero.cards[1]) {
    errors.push("Hero hand is required");
    flags.push("missing_hero_cards");
  }

  // Postflop: villain action required when hero is IP (villain acts first).
  // EXEMPTION: if hero has already bet/raised this street, the rec stays visible
  // while we wait for villain's response - do not block it.
  const hsd = dseState.context.heroStreetDecision;
  const heroActedPostflop = street !== "preflop" && (
    hsd && hsd.action &&
    ["Bet","Raise","Re-Raise"].includes(hsd.action)
  );
  if (street !== "preflop" && context.heroIsIP && legalActions.length === 0 && !heroActedPostflop) {
    errors.push("Action state incomplete  -  please confirm Villain action");
    flags.push("missing_state");
  }

  // River terminal node  -  no forward-looking logic
  const isRiverIP = street === "river" && context.heroIsIP;

  const is_ready = errors.length === 0;
  // Street closure check (addendum rule)
  const closure = dseCheckStreetClosure(dseState);

  // If preflop is closed (villain called/folded), suppress recommendation
  if (closure.preflop_closed) {
    return {
      is_ready: false,
      preflop_closed: true,
      villain_folded: closure.villain_folded,
      suppress_recommendation: true,
      guidance: closure.guidance,
      next_street: closure.next_street,
      closure_reason: closure.reason,
      legal_actions: [],
      errors: [],
      warnings: [],
      flags: ["preflop_closed"],
      is_terminal: false,
      street,
    };
  }

  return {
    is_ready,
    preflop_closed: false,
    legal_actions: legalActions,
    errors,
    warnings,
    flags,
    is_terminal: isRiverIP,
    street,
  };
}

// -- DSE: Street Closure Rule (Addendum) -------------------------
// "Treat Villain Call after Hero open-raise as a hard street-closure event"
function dseCheckStreetClosure(dseState) {
  const { board, action, context } = dseState;
  const street = board.street;

  // ----------------------------------------------------------------
  // POSTFLOP street closure
  // ----------------------------------------------------------------
  if (street !== "preflop") {
    const streetActs = (action.history || []).filter(a => a.street === street);
    const lastVilAct = streetActs.filter(a => a.actor === "Villain");
    const lastVil = lastVilAct.length > 0 ? lastVilAct[lastVilAct.length-1] : null;

    // PF-4: villain folded -> hand over
    if (lastVil && lastVil.type === "fold") {
      return {
        preflop_closed: true,
        villain_folded: true,
        suppress_recommendation: true,
        reason: "villain_fold_postflop",
        next_street: null,
        guidance: null,
      };
    }

    // PF-2: villain called hero's bet -> street resolves, advance
    // Hero bet is inferred from decisions[street] having Bet/Raise
    const heroDecision = context.heroStreetDecision; // passed from runAnalysis
    const heroBetThisStreet = heroDecision &&
      ["Bet","Raise","Re-Raise"].includes(heroDecision.action);
    if (heroBetThisStreet && lastVil && lastVil.type === "call") {
      const nextStreetMap = { flop:"turn", turn:"river", river:null };
      const nextSt = nextStreetMap[street] || null;
      return {
        preflop_closed: true,
        villain_folded: false,
        suppress_recommendation: true,
        reason: "villain_called_hero_bet",
        next_street: nextSt,
        guidance: nextSt
          ? street.charAt(0).toUpperCase()+street.slice(1) + " complete - advance to the " + nextSt + "."
          : "River complete - hand over.",
      };
    }

    // PF-3: both checked (hero checked, villain checked back) -> street resolves
    const heroCheckedStreet = heroDecision && heroDecision.action === "Check";
    if (heroCheckedStreet && lastVil && lastVil.type === "check") {
      const nextStreetMap = { flop:"turn", turn:"river", river:null };
      const nextSt = nextStreetMap[street] || null;
      return {
        preflop_closed: true,
        villain_folded: false,
        suppress_recommendation: true,
        reason: "both_checked",
        next_street: nextSt,
        guidance: nextSt
          ? "Both checked - advance to the " + nextSt + "."
          : "River checked through - hand over.",
      };
    }

    // T-3: hero calls villain's raise/bet (terminal hero action) -> street resolves
    // Hero clicked Call or Fold on the hero row after villain raised
    const heroTerminal = heroDecision && heroDecision._hero_terminal;
    if (heroTerminal) {
      const nextStreetMap = { flop:"turn", turn:"river", river:null };
      const nextSt = nextStreetMap[street] || null;
      if (heroDecision.action === "Fold") {
        return {
          preflop_closed: true,
          villain_folded: false,
          suppress_recommendation: true,
          reason: "hero_folded",
          next_street: null,
          guidance: null,
          hero_folded: true,
        };
      }
      if (heroDecision.action === "Call") {
        return {
          preflop_closed: true,
          villain_folded: false,
          suppress_recommendation: true,
          reason: "hero_called_villain_raise",
          next_street: nextSt,
          guidance: nextSt
            ? street.charAt(0).toUpperCase()+street.slice(1) + " complete - advance to the " + nextSt + "."
            : "River complete - hand over.",
        };
      }
    }

    return { preflop_closed: false, villain_folded: false, reason: null };
  }

  // Read the preflop action history
  const pfActs = (action.history || []).filter(a => a.street === "preflop");

  // Find the most recent villain action
  const vilPFActs  = pfActs.filter(a => a.actor === "Villain");
  const lastVilAct = vilPFActs.length > 0 ? vilPFActs[vilPFActs.length - 1] : null;

  // QA Case B: Villain folded -> branch closes, no flop
  if (lastVilAct && lastVilAct.type === "fold") {
    return {
      preflop_closed: true,
      villain_folded: true,
      suppress_recommendation: true,
      reason: "villain_fold",
      next_street: null,
      guidance: null,  // no flop guidance  -  hand is over
    };
  }

  // QA Case A: Hero raised (any raise-type) AND Villain called -> preflop resolves
  // Hero actions are NOT in vilAction (only villain actions are stored there)
  // Use preflopSituation to detect that hero has already raised
  const pfSit = context && context.preflopSituation;
  const heroRaised = pfActs.some(a => a.actor !== "Villain" && (a.type === "raise" || a.type === "bet"))
    || (context && context.heroHasActedPreflop === true)
    || pfSit === "raise"
    || pfSit === "raise_caller";
  const vilCalled  = lastVilAct && lastVilAct.type === "call";

  if (heroRaised && vilCalled) {
    return {
      preflop_closed: true,
      villain_folded: false,
      suppress_recommendation: true,
      reason: "hero_raise_villain_call",
      next_street: "flop",
      street_status: "complete",
      guidance: "Preflop complete - add 3 flop cards to continue.",
    };
  }

  // QA Case C: Villain raised back -> preflop still active, hero must respond
  if (lastVilAct && (lastVilAct.type === "raise")) {
    return { preflop_closed: false, villain_folded: false, reason: "villain_raised_back" };
  }

  return { preflop_closed: false, villain_folded: false, reason: null };
}

// -- DSE: Derive villain action for current street -----------------
function dseGetVillainActionForStreet(dseState) {
  const { board, action } = dseState;
  const street = board.street;
  const vilActs = (action.history || []).filter(a => a.street === street);
  return vilActs.length > 0 ? vilActs[vilActs.length - 1] : null;
}


// ================================================================
// AGGRESSION CALIBRATION LAYER (ACL) v1.0
// Determines action bias (Aggressive/Neutral/Passive) from
// validated DSE state + hand evaluation + board texture.
// Sits on top of DSE  -  requires validated state as input.
// ================================================================

// -- ACL Hand Classification ---------------------------------------
function aclClassifyHand(hs) {
  if (hs >= 0.92) return "nut_value";
  if (hs >= 0.80) return "very_strong_value";
  if (hs >= 0.68) return "strong_value";
  if (hs >= 0.58) return "combo_draw";    // flush draw / OESD with equity
  if (hs >= 0.48) return "strong_draw";
  if (hs >= 0.38) return "draw";
  if (hs >= 0.28) return "weak_showdown";
  return "air";
}

// -- ACL Board Classification -------------------------------------
function aclClassifyBoard(tex) {
  if (!tex) return "unknown";
  if (tex.mono) return "monotone";
  if (tex.wet >= 4) return "highly_connected";
  if (tex.wet >= 2.5) return "wet";
  if (tex.wet >= 1.5) return "semi_wet";
  return "static";
}

// -- ACL Scoring Engine (Section 5.3 - 5.4) -----------------------
function aclScore({
  handClass, boardClass, villainProfile,
  heroIsIP, facingBet, heroLastToAct,
  tex, potSize, stackBB
}) {
  let aggression = 0;
  let passive_risk = 0;

  // A. Value Component
  if (handClass === "strong_value")      aggression += 20;
  if (handClass === "very_strong_value") aggression += 28;
  if (handClass === "nut_value")         aggression += 35;

  // B. Board Texture Component
  if (boardClass === "monotone")         aggression += 8;
  if (boardClass === "highly_connected") aggression += 10;
  if (boardClass === "wet")              aggression += 8;
  if (tex && tex.wet >= 3)               aggression += 10; // high draw density

  // C. Protection Component  -  volatile boards with strong hands
  const badRunouts = (boardClass === "monotone" || boardClass === "highly_connected")
    && (handClass === "strong_value" || handClass === "very_strong_value");
  if (badRunouts) aggression += 12;

  // D. Draw Component
  if (handClass === "draw")              aggression += 8;
  if (handClass === "strong_draw")       aggression += 14;
  if (handClass === "combo_draw")        aggression += 20;

  // E. Opponent Profile Component
  const profileBonus = {
    lag:          10,
    maniac:       12,
    station:      14,   // value only  -  always calls
    loose_passive:12,
    nit:          -8,   // tighter, fold more
    tag:          0,
    rec:          8,
    unknown:      5,
  };
  aggression += (profileBonus[villainProfile] || 0);

  // F. Position Component
  if (heroIsIP && !facingBet) aggression += 10; // IP + checked to = prime bet spot
  if (heroIsIP)               aggression += 5;

  // G. Passive Risk (Section 5.4)
  if (handClass === "weak_showdown")     passive_risk += 12;
  if (boardClass === "static")           passive_risk += 8;
  // Nit folds too much  -  betting loses value
  if (villainProfile === "nit" && handClass !== "nut_value" && handClass !== "very_strong_value")
    passive_risk += 10;

  return { aggression, passive_risk };
}

// -- ACL Override Rules (Section 5.7  -  Critical) ------------------
function aclApplyOverrides({ aggression, handClass, boardClass, villainProfile, heroLastToAct, facingBet, villainAction }) {
  let forced = null;

  // Override 1: Dynamic board + strong hand -> FORCE aggressive
  if ((boardClass === "monotone" || boardClass === "highly_connected")
      && (handClass === "strong_value" || handClass === "very_strong_value" || handClass === "nut_value")) {
    forced = "Aggressive";
  }

  // Override 2: LAG/Maniac + strong hand -> FORCE aggressive
  if (["lag","maniac"].includes(villainProfile)
      && (handClass === "strong_value" || handClass === "very_strong_value" || handClass === "nut_value")) {
    forced = "Aggressive";
  }

  // Override 3: Hero last to act + villain checked -> REMOVE passive-call options
  if (heroLastToAct && villainAction && villainAction.type === "check") {
    // No call possible  -  only Bet or Check
    if (aggression >= 50) forced = forced || "Aggressive";
  }

  return forced;
}

// -- ACL Reason Tag Builder ----------------------------------------
function aclBuildReasonTags({ action, handClass, boardClass, facingBet, heroLastToAct, villainProfile }) {
  const tags = [];

  if (action === "Bet" || action === "Raise") {
    if (handClass === "nut_value" || handClass === "very_strong_value" || handClass === "strong_value")
      tags.push("value");
    if (boardClass === "monotone" || boardClass === "highly_connected")
      tags.push("protection", "equity_denial");
    if (["lag","maniac","station","loose_passive"].includes(villainProfile))
      tags.push("exploit");
    tags.push("charge_draws");
  }

  if (action === "Check") {
    if (heroLastToAct) tags.push("showdown_control");
    else               tags.push("pot_control");
  }

  if (action === "Call" && facingBet) {
    tags.push("bluff_catcher");
  }

  return tags;
}

// -- ACL Explanation Validator -------------------------------------
// Section 6.2: Prohibited Mismatches
function aclValidateExplanation(action, bullets, heroLastToAct) {
  const flags = [];
  const invalid = {
    Check:   ["value raise"],
    Call:    heroLastToAct ? ["call down", "trap", "induce"] : [],
    Bet:     [],
    Raise:   [],
  };
  const heroLastToActInvalid = ["trap", "induce", "let them bluff", "invite aggression", "trap line"];

  (bullets || []).forEach(b => {
    const lower = b.toLowerCase();
    (invalid[action] || []).forEach(phrase => {
      if (lower.includes(phrase)) flags.push("logic_conflict: '" + phrase + "' invalid with " + action);
    });
    if (heroLastToAct) {
      heroLastToActInvalid.forEach(phrase => {
        if (lower.includes(phrase)) flags.push("logic_conflict: '" + phrase + "' invalid when hero is last to act");
      });
    }
  });

  return flags;
}

// -- ACL Confidence Calculator (Section 7) -------------------------
function aclConfidence({ aggression, passive_risk, handClass, boardClass, facingBet }) {
  // Base score from aggression / passive balance
  const balance = aggression - passive_risk;
  let confidence = 60 + Math.round(balance * 0.25);

  // Clarity bonus: clear hand + clear board
  if (handClass === "nut_value" || handClass === "very_strong_value") confidence += 6;
  if (boardClass === "monotone" || boardClass === "highly_connected") confidence += 3;

  // Dominance gap: if action bias is very clear
  if (aggression >= 80) confidence += 5;
  if (passive_risk >= 20) confidence -= 4;

  // Conflict penalty
  if (facingBet && handClass === "air") confidence -= 8;

  return Math.min(95, Math.max(52, confidence));
}

// -- MAIN ACL FUNCTION ---------------------------------------------
// Takes validated DSE state + current raw recommendation,
// returns enriched recommendation with scores, bias, and validated explanation.
function runACL(rawRec, dseState, hs, tex) {
  const { board, context, villain, action } = dseState;
  const street = board.street;
  const vilActionThis = dseGetVillainActionForStreet(dseState);

  const handClass    = aclClassifyHand(hs);
  const boardClass   = aclClassifyBoard(tex);
  const villainProfile = villain.profile || "unknown";
  const facingBet    = vilActionThis && (vilActionThis.type === "bet" || vilActionThis.type === "raise");
  const heroLastToAct= context.heroIsIP && street === "river"
    ? true
    : context.heroIsIP && (!vilActionThis || vilActionThis.type === "check");

  // Score
  const { aggression, passive_risk } = aclScore({
    handClass, boardClass, villainProfile,
    heroIsIP: context.heroIsIP,
    facingBet,
    heroLastToAct,
    tex,
    potSize: action.potSize,
    stackBB: action.stackBB,
  });

  // Determine bias
  const forcedBias = aclApplyOverrides({
    aggression, handClass, boardClass, villainProfile,
    heroLastToAct, facingBet, villainAction: vilActionThis
  });

  const actionBias = forcedBias || (
    aggression >= 65 ? "Aggressive" :
    aggression >= 50 ? "Neutral"    : "Passive"
  );

  // Validate existing explanation
  const explanationFlags = aclValidateExplanation(
    rawRec.action, rawRec.bullets, heroLastToAct
  );

  // Build reason tags
  const reasonTags = aclBuildReasonTags({
    action: rawRec.action, handClass, boardClass,
    facingBet, heroLastToAct, villainProfile
  });

  // Compute ACL-calibrated confidence
  const aclConfScore = aclConfidence({ aggression, passive_risk, handClass, boardClass, facingBet });

  // Override passive actions when bias is Aggressive
  let finalAction = rawRec.action;
  let finalSizing = rawRec.sizing;
  let finalBullets = rawRec.bullets;
  let finalTag = rawRec.tag;

  if (actionBias === "Aggressive") {
    // Young aggro exemption: do NOT convert Call→Raise against young aggro players.
    // They call 3-bets and fight back - raising only gets action when they have you beat.
    // The young_aggro archetype branch already sets the correct action.
    const isYoungAggro = villainProfile === "young_aggro";
    if (finalAction === "Check" && !facingBet && !heroLastToAct && !isYoungAggro) {
      finalAction = "Bet";
      finalSizing = boardClass === "monotone" ? "75%" : "66%";
      finalTag    = "Value + Protection";
      finalBullets = [
        boardClass === "monotone"
          ? "Monotone board - bet now to charge draws and deny equity"
          : "Connected board - protect your hand and extract value",
        "Villain range (" + (villain.profile||"opponent") + ") contains many drawing and dominated hands",
        "Passive play surrenders value on dynamic boards",
      ];
    } else if (finalAction === "Call" && facingBet && !isYoungAggro) {
      finalAction = "Raise";
      finalSizing = "2.5x";
      finalTag    = "Value Raise";
      finalBullets = [
        "Villain bet with a wide range - your hand is comfortably ahead",
        "Raising charges draws and extracts maximum value",
        "Calling under-realizes equity against a loose betting range",
      ];
    }
  }

  // Build ACL metadata for logging and display
  const aclMeta = {
    aggression_score:  aggression,
    passive_risk_score:passive_risk,
    action_bias:       actionBias,
    hand_class:        handClass,
    board_class:       boardClass,
    reason_tags:       reasonTags,
    validation_flags:  explanationFlags,
    confidence:        aclConfScore,
  };

  return {
    ...rawRec,
    action:  finalAction,
    sizing:  finalSizing,
    bullets: finalBullets,
    tag:     finalTag,
    score:   Math.max(rawRec.score || 70, aclConfScore), // take higher of engine vs ACL
    _acl:    aclMeta,
  };
}


// ================================================================
// ACTION NAMING ENGINE (ANE) v1.0
// Maps full action sequence -> correct poker terminology.
// Runs after DSE. Must override generic labels.
// Spec: "No generic or incorrect naming is allowed."
// ================================================================

// -- ANE State Derivation -----------------------------------------
function aneGetActionCounts(actionHistory, street, preflopSituation) {
  // Count raises, calls, and limps in the action sequence for the given street
  const acts = (actionHistory || []).filter(a => a.street === street);

  let raise_count = 0;
  let call_count  = 0;
  let limp_count  = 0;

  // CRITICAL: hero's open raise is NOT in vilAction (only villain actions stored).
  // Use preflopSituation to detect that hero already raised preflop.
  // If hero raised, any villain call is a CALL (not a limp).
  // heroAlreadyRaised: true when a preflop rec was already generated
  // (decisions.preflop set) OR when preflopSituation signals facing a raise
  const heroAlreadyRaised = street === "preflop" && (
    preflopSituation === "heroActed" ||  // sentinel passed by applyANE
    preflopSituation === "raise" ||
    preflopSituation === "raise_caller"
  );

  // If hero raised, seed raise_count = 1 so villain calls are counted as calls, not limps
  if (heroAlreadyRaised) raise_count = 1;

  let first_raise_seen = heroAlreadyRaised;
  for (const a of acts) {
    if (a.type === "raise" || a.type === "bet") {
      raise_count++;
      first_raise_seen = true;
    } else if (a.type === "call") {
      if (!first_raise_seen && street === "preflop") {
        limp_count++;
      } else {
        call_count++;
      }
    }
  }

  return { raise_count, call_count, limp_count };
}

// -- ANE Core Label Logic (Section 3 pseudocode) ------------------
function aneGetActionLabel(actionHistory, street, currentAction, preflopSituation) {
  // Only applies to raise/aggressive actions
  if (!["Raise","Open Raise","3-Bet","4-Bet","5-Bet","Squeeze","Isolate Raise","Iso"].includes(currentAction)) {
    return currentAction; // non-raise actions pass through unchanged
  }

  // POSTFLOP: 3-Bet / 4-Bet / Squeeze naming is PREFLOP ONLY
  // On flop/turn/river, a raise is just "Raise" (or "Re-Raise" if facing a raise)
  if (street !== "preflop") {
    const postflopVilRaise = actionHistory &&
      actionHistory.some(a => a.street === street &&
        (a.type === "raise" || a.type === "bet"));
    return postflopVilRaise ? "Re-Raise" : "Raise";
  }

  const { raise_count, call_count, limp_count } = aneGetActionCounts(actionHistory, street, preflopSituation);

  // When hero already raised (raise_count seeded = 1) but villain has NOT yet
  // called or raised back, hero's action is still just the original open.
  // A "3-Bet" requires villain to have RAISED first - if villain checked or
  // did nothing, the label stays "Open Raise".
  const heroSeededOnly = preflopSituation === "heroActed" || preflopSituation === "raise";
  const villainHasRespondedWithRaise = actionHistory &&
    actionHistory.some(a => a.street === street && a.actor !== "Hero" &&
      (a.type === "raise" || a.type === "bet"));
  if (heroSeededOnly && !villainHasRespondedWithRaise) {
    // Villain has NOT raised back - hero's action is still the original open
    // (villain called = preflop closes, no new label needed; villain checked = illegal but handled)
    return "Open Raise";
  }
  if (heroSeededOnly && villainHasRespondedWithRaise) {
    // Villain raised back over hero's open - hero is now 3-betting
    return "3-Bet";
  }

  // Pseudocode from spec, section 4:
  // ISO: limpers present, no prior raises
  if (limp_count > 0 && raise_count === 0) return "Isolation Raise";
  // Open: no prior raises of any kind
  if (raise_count === 0) return "Open Raise";
  // Squeeze: one raise + at least one caller
  if (raise_count === 1 && call_count >= 1) return "Squeeze";
  // 3-Bet: facing exactly one raise, no callers
  if (raise_count === 1) return "3-Bet";
  // 4-Bet: facing two raises
  if (raise_count === 2) return "4-Bet";
  // 5-Bet+: three or more prior raises
  return "5-Bet";
}

// -- ANE Display Label (with sizing) ------------------------------
// Spec: format is "{Action Name} to $Amount" e.g. "3-Bet to $12"
function aneFormatLabel(actionLabel, sizingDollars, isPreflop) {
  if (!sizingDollars) return actionLabel;
  if (isPreflop) return actionLabel + " to " + sizingDollars;
  return actionLabel + " " + sizingDollars;
}

// -- ANE: Apply to recommendation result --------------------------
// Takes a raw result + action history, returns result with corrected labels.
function applyANE(result, actionHistory, street, preflopSituation) {
  if (!result || !result.action) return result;

  const correctedLabel = aneGetActionLabel(actionHistory, street, result.action, preflopSituation);

  if (correctedLabel === result.action && correctedLabel === result.actionType) {
    return result; // no change needed
  }

  return {
    ...result,
    action:     correctedLabel,
    actionType: correctedLabel,
  };
}

// ================================================================
// SCENARIO PRESETS + COMPARE MODE HELPERS
// ================================================================
const SCENARIO_PRESETS = {
  default:     { label:"Default",      archetype:"station",      desc:"Balanced starting point" },
  loose_table: { label:"Loose Table",  archetype:"loose_passive", desc:"Wide, passive field" },
  sticky_fish: { label:"Sticky Fish",  archetype:"station",      desc:"Calls everything, rarely folds" },
  aggro_reg:   { label:"Aggro Reg",    archetype:"lag",          desc:"Aggressive, wide 3-bet range" },
  custom:      { label:"Custom",       archetype:null,           desc:"Manual tendency adjustment" },
};

function getWhatChanged(archA, archB) {
  const a = ARCHETYPES[archA], b = ARCHETYPES[archB];
  if (!a || !b) return [];
  const diffs = [];
  if (b.foldFlop - a.foldFlop > 12) diffs.push("Higher fold frequency vs " + b.label + " enables more bluffing");
  if (a.foldFlop - b.foldFlop > 12) diffs.push(b.label + " folds less - value-heavy approach needed");
  if (b.aggression - a.aggression > 20) diffs.push(b.label + " is more aggressive - trapping lines gain EV");
  if (a.aggression - b.aggression > 20) diffs.push(b.label + " is passive - probe bets extract extra value");
  if (b.vpip - a.vpip > 15) diffs.push(b.label + " plays wider - range advantage shifts in your favor");
  if (a.vpip - b.vpip > 15) diffs.push(b.label + " plays tighter - steal equity increases significantly");
  if (b.bluffFreq - a.bluffFreq > 12) diffs.push("Higher bluff frequency vs " + b.label + " - call down more");
  if (diffs.length === 0) diffs.push("Similar profiles - minor EV difference between these lines");
  return diffs.slice(0, 3);
}


// ================================================================
// REASONING ENGINE - State-Aware Validation Layer
// ================================================================

// Forward-looking phrases invalid at terminal nodes
// (river, hero last to act - no future action possible)
const TERMINAL_INVALID_PHRASES = [
  "let them bluff",
  "invite aggression",
  "trap line",
  "induce",
  "invites aggression",
  "let them build",
  "free card",
  "future streets",
  "check-raise opportunity",
  "balance your checking range",
];

const TERMINAL_INVALID_TAGS = [
  "Trap Line",
  "Bluff Catch",    // only invalid if hero is last to act (no more action)
  "Check (trap)",
  "Check (induce)",
];

// Terminal node: river AND hero is last to act (IP, or villain already checked)
function isTerminalNode(state) {
  const { str, heroIsIP, vilAction, board } = state;
  if (!str || str !== "river") return false;
  // IP hero is ALWAYS last to act on the river  -  no future action possible
  // regardless of what villain did (check, bet, raise, call)
  if (heroIsIP) return true;
  // OOP hero: terminal only if villain has no more action (e.g. villain called/folded)
  const lastVilAct = vilAction && vilAction.length > 0
    ? vilAction[vilAction.length - 1].type
    : null;
  // OOP hero acts first  -  villain can still act after, so NOT terminal
  // Exception: if villain has already called (no more action), it IS terminal
  if (lastVilAct === "call" || lastVilAct === "fold") return true;
  return false;
}

// Replace invalid terminal bullets with valid alternatives
function sanitizeTerminalBullets(bullets, action) {
  return bullets.map(b => {
    const lower = b.toLowerCase();
    // "induce" / "trap" language
    if (lower.includes("let them bluff") || lower.includes("invite aggression") ||
        lower.includes("invites aggression") || lower.includes("let them build")) {
      return action === "Check"
        ? "Check back to preserve showdown value - no future streets remain"
        : "Bet for value - this is the last opportunity to extract chips";
    }
    if (lower.includes("trap")) {
      return "Check back locks in showdown value - bluffing has no fold equity here";
    }
    if (lower.includes("free card")) {
      return "Board is complete - all equity is realized at showdown";
    }
    if (lower.includes("future")) {
      return "River is the final decision point - all value must be captured now";
    }
    return b;
  });
}

// Sanitize a tag for terminal node context
function sanitizeTerminalTag(tag, action) {
  if (!tag) return tag;
  if (tag === "Trap Line") return action === "Check" ? "Showdown Value" : "Thin Value";
  if (tag === "Check (trap)") return "Showdown Check";
  if (tag === "Check (induce)") return "Pot Control";
  return tag;
}

// Sanitize altLines for terminal node context
function sanitizeTerminalAltLines(altLines) {
  return (altLines || []).filter(alt => {
    const lower = alt.toLowerCase();
    return !TERMINAL_INVALID_PHRASES.some(phrase => lower.includes(phrase));
  });
}

// MAIN VALIDATION FUNCTION
// Call this on the output of recommend() before rendering
function validateReasoningOutput(result, state) {
  if (!result) return result;
  const terminal = isTerminalNode(state);

  if (!terminal) return result; // non-terminal: no changes needed

  // Terminal node - sanitize all forward-looking language
  const sanitized = { ...result };

  if (sanitized.bullets) {
    sanitized.bullets = sanitizeTerminalBullets(sanitized.bullets, result.action);
  }
  if (sanitized.tag) {
    sanitized.tag = sanitizeTerminalTag(sanitized.tag, result.action);
  }
  if (sanitized.altLines) {
    sanitized.altLines = sanitizeTerminalAltLines(sanitized.altLines);
    // Ensure at least one alt line on river
    if (sanitized.altLines.length === 0) {
      sanitized.altLines = result.action === "Check"
        ? ["Thin value bet (strong hand only)"]
        : ["Check back (showdown value)"];
    }
  }
  return sanitized;
}

// State-aware reasoning enrichment for non-terminal nodes
// Adds context-appropriate framing to bullets based on street/position
function enrichReasoningWithContext(result, state) {
  if (!result || !result.bullets) return result;
  const { str, heroIsIP } = state;
  const enriched = { ...result };

  // Add street-specific framing to the last bullet if it's generic
  const lastBullet = enriched.bullets[enriched.bullets.length - 1] || "";
  if (str === "flop" && !heroIsIP && !lastBullet.toLowerCase().includes("oop")) {
    enriched.bullets = [...enriched.bullets.slice(0, -1),
      "Out of position - build pot now or accept reduced equity on later streets"];
  } else if (str === "turn" && heroIsIP && enriched.action === "Bet") {
    enriched.bullets = [...enriched.bullets.slice(0, -1),
      "Turn barrel in position applies maximum pressure before river"];
  }
  return enriched;
}


// ================================================================
// DECISION CONSISTENCY ENGINE
// Gatekeeper layer between logic output and UI rendering
// ================================================================

// Legal actions per node situation
const LEGAL_ACTIONS_BY_SITUATION = {
  facing_bet:    ["Call", "Raise", "Fold"],
  facing_raise:  ["Call", "Raise", "Fold"],
  unopened:      ["Bet", "Check", "Fold"],
  checked_to:    ["Bet", "Check"],
  preflop_first: ["Open Raise","Overlimp","Fold"],
  preflop_limper:["Isolate Raise","Overlimp","Fold"],
  preflop_raise: ["Flat Call","3-Bet","Fold"],
  preflop_squeeze:["Squeeze","Flat Call","Fold"],
};

// Valid action-classification pairings
const VALID_ACTION_TAGS = {
  Bet:   ["Value Realization","Thin Value","Protection","Board-Miss Bluff","Positional Probe","Standard Value","Relentless Value","Fold Equity Steal","Iso Value","Iso Steal","Semi-Bluff","Value + Protection","Semi-Bluff Value"],
  Raise: ["Value Raise","Value Realization","Protection","3-Bet Value","3-Bet Squeeze","Squeeze Value","Squeeze Bluff / Semi-Bluff"],
  Check: ["Pot Control","Bluff Catch","Trap Line","Showdown Value","Showdown Check","Check Behind"],
  Call:  ["Bluff Catch","Pot Control","Speculative Call","Flat Call"],
  Fold:  ["Fold","Fold to Pressure","Below Open Range","Below Iso Range","Below Calling Range","Fold to Squeeze Pressure","Fold equity"],
};

function getCurrentNodeSituation(street, vilAction, heroIsIP) {
  // Determine what situation hero is in based on action history
  if (street === "preflop") {
    const sit = vilAction && vilAction.length > 0 ? vilAction[vilAction.length-1].type : null;
    if (sit === "raise" && vilAction.filter(a=>a.type==="call").length > 0) return "preflop_squeeze";
    if (sit === "raise") return "preflop_raise";
    if (sit === "bet")   return "preflop_raise";
    if (sit === "call")  return "preflop_limper";
    return "preflop_first";
  }
  const lastVil = vilAction && vilAction.length > 0
    ? vilAction.filter(a => a.street === street).pop()
    : null;
  if (!lastVil) return heroIsIP ? "unopened" : "checked_to";
  if (lastVil.type === "bet" || lastVil.type === "raise") return "facing_bet";
  if (lastVil.type === "check") return "checked_to";
  if (lastVil.type === "call")  return "unopened";
  return "unopened";
}

function isBoardComplete(board, street) {
  if (!street || street === "preflop") return true;
  const required = { flop:3, turn:4, river:5 };
  const needed = required[street];
  if (!needed) return true;
  return board && board.length >= needed;
}

function validateDecisionConsistency(result, state) {
  const { street, heroIsIP, vilAction, board, heroCards, potSize } = state;
  const errors = [];
  const warnings = [];
  let validated_action = result ? result.action : null;
  let validated_classification = result ? result.tag : null;
  let is_valid = true;

  // - LAYER 1: Node Legality -
  if (!result) {
    errors.push("No recommendation generated");
    return { is_valid:false, validated_action:null, validated_classification:null, errors, warnings };
  }

  const nodeSituation = getCurrentNodeSituation(street, vilAction, heroIsIP);
  const legalActions = LEGAL_ACTIONS_BY_SITUATION[nodeSituation] || [];

  // Rule 1: No check when facing a bet
  if (result.action === "Check" && nodeSituation === "facing_bet") {
    errors.push("Check is not a legal action when facing a bet - must Call, Raise, or Fold");
    validated_action = "Call";
    is_valid = false;
  }

  // Rule: No bet when facing a bet (should be raise)
  if (result.action === "Bet" && nodeSituation === "facing_bet") {
    warnings.push("Action 'Bet' corrected to 'Raise' - facing a bet at this node");
    validated_action = "Raise";
  }

  // - LAYER 2: Structural Coherence -
  // Rule: River check-raise not possible if villain already checked
  if (street === "river" && result.action === "Raise" && nodeSituation === "checked_to") {
    warnings.push("Raise without bet to raise - corrected to Bet");
    validated_action = "Bet";
  }

  // - LAYER 3: Strategic Coherence -
  // Rule 5: Action must match classification
  const validTags = VALID_ACTION_TAGS[validated_action || result.action] || [];
  if (validated_action && validTags.length > 0 && result.tag &&
      !validTags.some(t => result.tag.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(result.tag.toLowerCase()))) {
    warnings.push("Classification '"+result.tag+"' inconsistent with action '"+validated_action+"' - using action-appropriate tag");
    validated_classification = validTags[0] || result.tag;
  }

  // Rule 2: No induce logic on terminal nodes (already handled by Reasoning Engine)
  // Rule 3: Multiway spots  -  heads-up templates still valid for primary villain focus
  // (multiway handled at preflop engine level)

  // - LAYER 4: Data Completeness -
  // Rule 4: Incomplete board blocks recommendation
  if (!isBoardComplete(board, street)) {
    errors.push("Board is incomplete for "+street+" - add remaining cards before analyzing");
    is_valid = false;
    validated_action = null;
    validated_classification = null;
  }

  // Hero cards check
  if (!heroCards || !heroCards[0] || !heroCards[1]) {
    errors.push("Hero hand is incomplete - select both hole cards");
    is_valid = false;
    validated_action = null;
    validated_classification = null;
  }

  // Pot size sanity
  if (potSize <= 0) {
    warnings.push("Pot size is zero - defaulting to 1bb");
  }

  // Rule: Action requiring size must have size
  const actionsNeedingSize = ["Bet","Raise","Open Raise","Isolate Raise","Squeeze","3-Bet","Open"];
  if (actionsNeedingSize.includes(result.action) && !result.sizing && !result.size_dollars) {
    errors.push("Missing sizing data for "+result.action+" - recommendation blocked");
    is_valid = false;
    validated_action = null;
    validated_classification = null;
  }

  return {
    is_valid,
    validated_action:    validated_action || result.action,
    validated_classification: validated_classification || result.tag,
    errors,
    warnings,
  };
}

// Apply DCE corrections to a result object
function applyConsistencyCorrections(result, state) {
  if (!result) return result;
  const dceResult = validateDecisionConsistency(result, state);
  if (dceResult.errors.length === 0 && dceResult.warnings.length === 0) return result;

  // Apply corrections silently for warnings, flag for errors
  const corrected = { ...result };
  if (dceResult.validated_action !== result.action) {
    corrected.action = dceResult.validated_action;
    corrected._corrected = true;
  }
  if (dceResult.validated_classification !== result.tag) {
    corrected.tag = dceResult.validated_classification;
  }
  if (!dceResult.is_valid) {
    corrected._invalid = true;
    corrected._errors = dceResult.errors;
  }
  if (dceResult.warnings.length > 0) {
    corrected._warnings = dceResult.warnings;
  }
  return corrected;
}


// ================================================================
// STREET PROGRESS BAR
// Visual progression control: Preflop -> Flop -> Turn -> River
// ================================================================
function StreetProgressBar({ street, decisions, board, onStreetClick }) {
  const streets = ["preflop","flop","turn","river"];
  const currentIdx = streets.indexOf(street);
  const boardNeeded = { preflop:0, flop:3, turn:4, river:5 };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.07)", overflow:"hidden" }}>
      {streets.map((s, i) => {
        const isCurrent  = s === street;
        const isPast     = i < currentIdx;
        const hasDecision= decisions && decisions[s];
        const isReachable= i <= currentIdx + 1;
        const boardOk    = board.length >= (boardNeeded[s] || 0);
        const col = isCurrent ? C.purple : isPast && hasDecision ? C.green : C.disabled;
        return (
          <button key={s}
            onClick={() => isReachable && onStreetClick && onStreetClick(s)}
            style={{
              flex:1, padding:"8px 4px", border:"none", borderRight: i<3?"1px solid rgba(255,255,255,0.06)":undefined,
              background: isCurrent ? C.purple+"22" : isPast && hasDecision ? C.green+"11" : "transparent",
              cursor: isReachable ? "pointer" : "not-allowed",
              display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              opacity: isReachable ? 1 : 0.35, transition:"all 0.15s",
            }}>
            <div style={{ fontSize:9, fontWeight:700, color:col, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s}</div>
            <div style={{ display:"flex", gap:2, alignItems:"center" }}>
              {isPast && hasDecision && (
                <span style={{ fontSize:8, fontWeight:700, color:C.green, padding:"1px 4px", borderRadius:3, background:C.green+"18" }}>
                  {decisions[s].action}
                </span>
              )}
              {isCurrent && (
                <div style={{ width:6, height:6, borderRadius:"50%", background:C.purple }}/>
              )}
              {!isCurrent && !hasDecision && (
                <div style={{ width:4, height:4, borderRadius:"50%", background:"rgba(255,255,255,0.15)" }}/>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ================================================================
// SHOWDOWN PANEL
// Post-river: villain action, hand reveal, outcome evaluation
// ================================================================
function ShowdownPanel({ rec, heroCards, board, archetype, potSize, gameSize, onClose, onSave }) {
  const [vilHand,   setVilHand]   = React.useState([null,null]);
  const [outcome,   setOutcome]   = React.useState(null);
  const [skipShowdown, setSkipShowdown] = React.useState(false);

  const p = ARCHETYPES[archetype] || {};
  const bb = gameSize ? gameSize.bb : 3;
  const potDollars = "$" + Math.round(potSize * bb);

  function evalOutcome(hand) {
    const heroEval   = evaluateHand(heroCards, board);
    const villainEval= hand[0] && hand[1] ? evaluateHand(hand, board) : null;
    if (!heroEval) return null;
    if (!villainEval) return { result:"SHOWDOWN", label:"Enter Villain's Cards", desc:"Add both cards to see the result.", color:C.amber, quality:"?", qualityColor:C.amber, qualityContext:null };
    const heroWins = heroEval.pct <= villainEval.pct;

    // Quality is based on the RESULT, not the line - because the user followed our recommendations.
    // RangeIQ owns the recommended line. If the user followed it, the decision was correct
    // regardless of outcome. We don't second-guess our own advice.
    let quality, qualityColor, qualityContext;
    if (heroWins) {
      quality = "Well Played";
      qualityColor = C.green;
      qualityContext = "You followed the recommended line and won the hand. Good decisions lead to good results over time.";
    } else {
      quality = "Unlucky";
      qualityColor = C.blue;
      qualityContext = "You followed the correct line but lost this hand. In poker, good decisions sometimes lose in the short run. Over hundreds of hands, this line is profitable.";
    }

    return {
      result: heroWins ? "WIN" : "LOSS",
      label:  heroWins ? "You Win!" : "Villain Wins",
      desc:   heroEval.description + " vs " + villainEval.description,
      color:  heroWins ? C.green : C.red,
      quality, qualityColor, qualityContext,
      heroPct: heroEval.pct, villainPct: villainEval.pct,
      heroHand: heroEval.description, villainHand: villainEval.description,
      heroBestFive: heroEval.bestFive||[], villainBestFive: villainEval.bestFive||[],
    };
  }

  function onVilCard(i, card) {
    const newHand = [...vilHand];
    newHand[i] = card;
    setVilHand(newHand);
    const res = evalOutcome(newHand);
    setOutcome(res);
  }

  return (
    <div style={{ marginTop:12, background:C.card, borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden", animation:"fadeUp 0.25s ease" }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color:C.gold }}>Showdown</span>
          <span style={{ fontSize:10, color:C.disabled }}>Pot: {potDollars}</span>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:C.disabled, cursor:"pointer", fontSize:16 }}>&#x2715;</button>
      </div>

      <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {!skipShowdown ? (
          <>
            {/* Villain Hand Input */}
            <div>
              <div style={{ fontSize:10, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Villain's Hole Cards</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Enter villain's cards to see who won the hand.</div>
              <CardSelector
                cards={vilHand}
                onCardChange={hand => { setVilHand(hand); setOutcome(evalOutcome(hand)); }}
                maxCards={2}
                usedKeys={[...heroCards.filter(Boolean).map(c=>c.rank+c.suit), ...board.map(c=>c.rank+c.suit)]}
                slotSize={44}
              />
            </div>

            {/* Outcome */}
            {outcome && outcome.result !== "SHOWDOWN" && (
              <div style={{ padding:"12px 14px", borderRadius:8, background:outcome.color+"11", border:"1px solid "+outcome.color+"33", animation:"fadeUp 0.2s ease" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:16, fontWeight:800, color:outcome.color }}>{outcome.label}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                    background:(outcome.qualityColor||C.amber)+"22",
                    color:outcome.qualityColor||C.amber,
                    border:"1px solid "+(outcome.qualityColor||C.amber)+"44",
                  }}>{outcome.quality}</span>
                </div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>{outcome.desc}</div>
                {outcome.qualityContext && (
                  <div style={{ fontSize:11, color:C.disabled, lineHeight:1.5, fontStyle:"italic" }}>{outcome.qualityContext}</div>
                )}
                {outcome.heroPct && outcome.villainPct && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
                    <div style={{ padding:"8px 10px", borderRadius:6, background:"rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:2 }}>{outcome.heroHand||"Hero hand"}</div>
                      <div style={{ fontSize:9, color:C.disabled }}>Hero - Top {outcome.heroPct}%</div>
                    </div>
                    <div style={{ padding:"8px 10px", borderRadius:6, background:"rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:2 }}>{outcome.villainHand||"Villain hand"}</div>
                      <div style={{ fontSize:9, color:C.disabled }}>Villain - Top {outcome.villainPct}%</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skip option */}
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="secondary" onClick={onSave} style={{ flex:1, fontSize:12 }}>Save Hand</Btn>
              <button onClick={()=>setSkipShowdown(true)} style={{
                flex:1, padding:"8px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                background:"transparent", border:"1px solid "+C.border, color:C.disabled,
              }}>Skip (no villain cards)</button>
            </div>
          </>
        ) : (
          <div style={{ textAlign:"center", padding:"12px 0" }}>
            <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>Hand saved without showdown result.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <Btn variant="secondary" onClick={onSave} style={{ fontSize:12 }}>Save Hand</Btn>
              <Btn variant="ghost" onClick={onClose} style={{ fontSize:12 }}>Close</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// GLOBAL CSS
// ================================================================
const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
  @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin     { to{transform:rotate(360deg)} }
  @keyframes toastIn  { from{opacity:0;transform:translate(-50%,12px)} to{opacity:1;transform:translate(-50%,0)} }
  @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes slideInLeft { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
  * { box-sizing:border-box; }
  body,html { margin:0; padding:0; background:#0B0F14; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:#0B0F14; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
  input,select,button,textarea { font-family:'Inter',sans-serif; }
  button:focus,input:focus,select:focus { outline:none; }
  @media(max-width:768px) {
    .riq-main-grid { grid-template-columns:1fr !important; }
    .riq-builder-grid { grid-template-columns:1fr !important; }
    .riq-edit-drawer { width:100% !important; max-width:100% !important; }
  }
`;

// ================================================================
// LOGO COMPONENT  -  from uploaded image spec
// ================================================================
function RangeIQLogo({ size }) {
  const s = size || 26;
  const cell = Math.round(s * 0.22);
  const gap  = Math.round(s * 0.06);
  // 3x3 grid, top-right cell is gold
  const cells = [
    [false,false,true ],
    [false,false,false],
    [false,false,false],
  ];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:Math.round(s*0.32) }}>
      {/* Icon grid */}
      <div style={{ display:"grid", gridTemplateColumns:`repeat(3,${cell}px)`, gap:gap }}>
        {cells.map((row,ri) => row.map((gold,ci) => (
          <div key={ri+"-"+ci} style={{
            width:cell, height:cell, borderRadius:Math.round(cell*0.18),
            background: gold
              ? "linear-gradient(135deg,#F4D47A,#E6C566)"
              : "rgba(255,255,255,0.18)",
            boxShadow: gold ? "0 0 8px #E6C56688" : "none",
          }}/>
        )))}
      </div>
      {/* Wordmark */}
      <div style={{ display:"flex", alignItems:"baseline", gap:1 }}>
        <span style={{ fontSize:Math.round(s*0.72), fontWeight:700, color:"#E5E7EB", letterSpacing:"-0.3px", fontFamily:"'Inter',sans-serif", lineHeight:1 }}>Range</span>
        <span style={{ fontSize:Math.round(s*0.72), fontWeight:700, color:"#E6C566", letterSpacing:"-0.3px", fontFamily:"'Inter',sans-serif", lineHeight:1 }}>IQ</span>
      </div>
    </div>
  );
}

// ================================================================
// COMPONENTS
// ================================================================

// --- Btn ---
function Btn({ children, variant, onClick, disabled, loading, style }) {
  const base = {
    padding:"10px 16px", borderRadius:6, fontSize:13, fontWeight:600,
    cursor: disabled||loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition:"all 0.15s", border:"none", display:"flex", alignItems:"center",
    justifyContent:"center", gap:8, fontFamily:"'Inter',sans-serif",
  };
  const variants = {
    primary: { background: disabled||loading ? C.goldAct : C.gold, color:"#111827",
      boxShadow: disabled||loading ? "none" : "0 2px 12px "+C.gold+"33" },
    secondary: { background:"transparent", border:"1px solid "+C.borderHi, color:C.text },
    ghost: { background:"transparent", border:"none", color:C.muted },
    danger: { background:"transparent", border:"1px solid "+C.red+"55", color:C.red+"cc" },
  };
  const v = variants[variant||"secondary"];
  return (
    <button disabled={disabled||loading} onClick={onClick}
      style={{ ...base, ...v, ...style }}
      onMouseEnter={e=>{ if(!disabled&&!loading&&variant==="primary") e.currentTarget.style.background=C.goldHov; }}
      onMouseLeave={e=>{ if(!disabled&&!loading&&variant==="primary") e.currentTarget.style.background=C.gold; }}>
      {loading && <span style={{ width:13,height:13,border:"2px solid rgba(0,0,0,0.3)",borderTopColor:"#000",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0 }}/>}
      {children}
    </button>
  );
}

// --- Card ---
function Card({ children, style, highlight }) {
  return (
    <div style={{
      background:C.card, borderRadius:10,
      border: highlight ? "1px solid "+highlight+"44" : "1px solid "+C.border,
      padding:"18px 20px",
      boxShadow: highlight ? "0 0 18px "+highlight+"0e" : "none",
      ...style,
    }}>
      {children}
    </div>
  );
}

// --- Section Label ---
function SectionLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{children}</div>;
}

// --- Tag / Pill ---
function Tag({ children, color, active }) {
  return (
    <span style={{
      padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:500,
      background: active ? C.gold : "rgba(255,255,255,0.06)",
      color: active ? "#111827" : color || C.muted,
      border: color && !active ? "1px solid "+color+"33" : "none",
      letterSpacing:"0.03em",
    }}>{children}</span>
  );
}

// --- Progress Bar ---
function ProgressBar({ value, max, color, label, showValue }) {
  const pct = Math.min(100, Math.round((value / (max||100)) * 100));
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
        <span style={{ color:C.muted, fontWeight:500 }}>{label}</span>
        {showValue!==false && <span style={{ color, fontWeight:700 }}>{value}%</span>}
      </div>
      <div style={{ height:7, background:"rgba(255,255,255,0.08)", borderRadius:999 }}>
        <div style={{ height:"100%", borderRadius:999, background:color, width:pct+"%",
          transition:"width 0.4s ease", boxShadow:"0 0 6px "+color+"66" }}/>
      </div>
    </div>
  );
}

// --- Ghost Slider ---
function GhostSlider({ label, value, baseline, min, max, onChange, color }) {
  const pct=v=>Math.max(0,Math.min(100,((v-min)/(max-min))*100));
  const fillPct=pct(value), ghostPct=pct(baseline), T=14;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
        <span style={{ color:C.muted, fontWeight:500 }}>{label}</span>
        <span style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ color:C.disabled, fontSize:11 }}>avg: {baseline}%</span>
          <span style={{ color, fontWeight:700 }}>{value}%</span>
        </span>
      </div>
      <div style={{ position:"relative", height:22, display:"flex", alignItems:"center" }}>
        <div style={{ position:"absolute",left:0,right:0,height:6,background:"rgba(255,255,255,0.08)",borderRadius:999 }}/>
        <div style={{ position:"absolute",left:0,height:6,width:fillPct+"%",background:color,borderRadius:999,boxShadow:"0 0 6px "+color+"66",transition:"width 0.2s ease",pointerEvents:"none" }}/>
        <div style={{ position:"absolute",left:"calc("+ghostPct+"% - 5px)",width:10,height:10,borderRadius:"50%",background:C.card,border:"2px solid rgba(255,255,255,0.3)",pointerEvents:"none",zIndex:2,transition:"left 0.2s ease" }}/>
        <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}
          style={{ position:"absolute",left:0,right:0,width:"100%",opacity:0,cursor:"pointer",height:"100%",zIndex:3,margin:0,padding:0 }}/>
        <div style={{ position:"absolute",left:"calc("+fillPct+"% - "+(T/2)+"px)",width:T,height:T,borderRadius:"50%",background:color,border:"2px solid "+C.bg,boxShadow:"0 0 6px "+color+"77",pointerEvents:"none",zIndex:4,transition:"left 0.1s ease" }}/>
      </div>
    </div>
  );
}

// --- Card Token ---
function CardToken({ card, size, onClick, dim }) {
  const s=size||44;
  if (!card) return (
    <div onClick={onClick} style={{ width:s,height:Math.round(s*1.38),borderRadius:7,
      border:"1.5px dashed rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",
      color:C.disabled,fontSize:18,cursor:onClick?"pointer":"default",background:C.surface,flexShrink:0 }}>?</div>
  );
  return (
    <div onClick={onClick} style={{ width:s,height:Math.round(s*1.38),borderRadius:7,flexShrink:0,
      background:"linear-gradient(145deg,#1e293b,#0f172a)",
      border:"1.5px solid "+SUIT_COL[card.suit]+(dim?"22":"55"),
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
      color:SUIT_COL[card.suit],cursor:onClick?"pointer":"default",opacity:dim?0.4:1,
      boxShadow:"0 0 6px "+SUIT_COL[card.suit]+"12",transition:"all 0.15s",
    }}
    onMouseEnter={e=>{ if(onClick) e.currentTarget.style.borderColor=SUIT_COL[card.suit]+"99"; }}
    onMouseLeave={e=>{ if(onClick) e.currentTarget.style.borderColor=SUIT_COL[card.suit]+(dim?"22":"55"); }}>
      <span style={{ fontSize:Math.round(s*0.30),fontWeight:900,lineHeight:1 }}>{card.rank}</span>
      <span style={{ fontSize:Math.round(s*0.26),lineHeight:1 }}>{SUIT_SYM[card.suit]}</span>
    </div>
  );
}

// --- Card Picker Grid ---
function CardPickerGrid({ onPick, usedKeys, title }) {
  return (
    <div style={{ background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:16 }}>
      <SectionLabel>{title||"Select Card"}</SectionLabel>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(13,1fr)",gap:3 }}>
        {SUITS.flatMap(suit => RANKS.map(rank => {
          const key=rank+suit, used=(usedKeys||[]).includes(key);
          return (
            <button key={key} disabled={used} onClick={()=>!used&&onPick({rank,suit})} style={{
              padding:"4px 2px",borderRadius:4,fontSize:9,fontWeight:700,lineHeight:1.4,
              border:"1px solid "+(used?"rgba(255,255,255,0.05)":SUIT_COL[suit]+"33"),
              background:used?"transparent":"rgba(255,255,255,0.04)",
              color:used?"rgba(255,255,255,0.1)":SUIT_COL[suit],
              cursor:used?"not-allowed":"pointer",transition:"all 0.1s",
            }}
            onMouseEnter={e=>{ if(!used) e.currentTarget.style.background="rgba(255,255,255,0.1)"; }}
            onMouseLeave={e=>{ if(!used) e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}>
              {rank}<br/>{SUIT_SYM[suit]}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

// --- Range Heatmap ---
function RangeHeatmap({ range, hoveredHand, onHover }) {
  const vals=Object.values(range||{}), maxW=vals.length?Math.max(...vals,0.001):0.001;
  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(13,1fr)",gap:2 }}>
        {HAND_GRID.map((row,i)=>row.map((hand,j)=>{
          const w=(range||{})[hand]||0, intensity=w/maxW;
          const isPair=i===j, isSuited=i<j;
          const rgb=isPair?"248,113,113":isSuited?"59,130,246":"16,185,129";
          const isHov=hoveredHand===hand;
          return (
            <div key={hand} title={hand+": "+(w*100).toFixed(0)+"%"}
              onMouseEnter={()=>onHover&&onHover(hand)}
              onMouseLeave={()=>onHover&&onHover(null)}
              style={{
                paddingBottom:"100%",position:"relative",borderRadius:2,
                background:"rgba("+rgb+","+(0.06+intensity*0.86)+")",
                border:isHov?"2px solid rgba(255,255,255,0.9)":"1px solid "+(intensity>0.5?"rgba("+rgb+",0.35)":"transparent"),
                transition:"all 0.1s",cursor:"crosshair",
                boxShadow:isHov?"0 0 8px rgba("+rgb+",0.8)":"none",
              }}>
              <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:7,fontWeight:700,color:intensity>0.4||isHov?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.15)",fontFamily:"monospace" }}>
                {hand}
              </div>
            </div>
          );
        }))}
      </div>
      <div style={{ display:"flex",gap:16,marginTop:8,fontSize:11,color:C.muted }}>
        {[["Pairs","#F87171"],["Suited","#3B82F6"],["Offsuit","#10B981"]].map(([l,col])=>(
          <span key={l} style={{ display:"flex",alignItems:"center",gap:5 }}>
            <span style={{ width:8,height:8,borderRadius:2,background:col,display:"inline-block" }}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Range Storyline ---
function RangeStoryline({ snapshots, hoveredHand, onHover }) {
  const [active,setActive]=useState(0);
  if (!snapshots||!snapshots.length) return null;
  const snap=snapshots[active];
  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
        <SectionLabel>Villain's Range Storyline</SectionLabel>
        <div style={{ display:"flex",gap:12,fontSize:11 }}>
          <span style={{ color:C.muted }}>Range: <span style={{ color:C.purple,fontWeight:700 }}>{snap.pct}%</span></span>
          <span style={{ color:C.muted }}>Combos: <span style={{ color:C.gold,fontWeight:700 }}>{snap.combos}</span></span>
        </div>
      </div>
      <div style={{ display:"flex",gap:0,marginBottom:12,borderRadius:8,overflow:"hidden",border:"1px solid "+C.border }}>
        {snapshots.map((s,i)=>{
          const reduction=i>0?snapshots[i-1].pct-s.pct:0;
          return (
            <button key={s.label} onClick={()=>setActive(i)} style={{
              flex:1,padding:"9px 4px",border:"none",cursor:"pointer",
              background:active===i?C.purple+"33":C.card,
              borderRight:i<snapshots.length-1?"1px solid "+C.border:"none",transition:"all 0.15s",
            }}>
              <div style={{ fontSize:9,color:active===i?C.purple:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:2 }}>{s.label}</div>
              <div style={{ fontSize:13,fontWeight:700,color:active===i?C.purple:C.text }}>{s.pct}%</div>
              <div style={{ fontSize:9,color:C.disabled }}>{s.combos}</div>
              {reduction>0&&<div style={{ fontSize:9,color:C.red }}>-{reduction}%</div>}
            </button>
          );
        })}
      </div>
      <RangeHeatmap range={snap.range} hoveredHand={hoveredHand} onHover={onHover}/>
    </div>
  );
}

// --- Cat Bars ---
const CAT_COL={"Overpairs":"#F87171","Top Pair":"#F97316","Middle Pair":"#FBBF24","Sets":"#EC4899","Flush Draws":"#3B82F6","Straight Draws":"#14B8A6","Air":"#374151"};
function CatBars({ cats }) {
  const sorted=Object.entries(cats||{}).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
      {sorted.map(([cat,pct])=>(
        <div key={cat}>
          <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3 }}>
            <span style={{ color:C.muted,fontWeight:500 }}>{cat}</span>
            <span style={{ color:CAT_COL[cat]||C.text,fontWeight:700 }}>{pct}%</span>
          </div>
          <div style={{ height:6,background:"rgba(255,255,255,0.08)",borderRadius:999 }}>
            <div style={{ height:"100%",borderRadius:999,background:CAT_COL[cat]||C.purple,
              width:pct+"%",transition:"width 0.5s ease",boxShadow:"0 0 4px "+(CAT_COL[cat]||C.purple)+"44" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Toast ---
function Toast({ msg, onDone, onViewVault }) {
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[onDone]);
  return (
    <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:999,
      background:"#0d2318",border:"1px solid "+C.green,borderRadius:8,padding:"11px 18px",
      color:C.green,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:12,
      boxShadow:"0 0 24px "+C.green+"33",animation:"toastIn 0.3s ease",whiteSpace:"nowrap" }}>
      <span>&#10003;</span><span>{msg}</span>
      <button onClick={onViewVault} style={{ background:"none",border:"none",color:C.gold,cursor:"pointer",fontSize:12,fontWeight:700,textDecoration:"underline",padding:0 }}>View Vault</button>
    </div>
  );
}

// --- Confirm Modal ---
function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:C.card,border:"1px solid "+C.red+"44",borderRadius:12,padding:28,maxWidth:360,width:"100%" }}>
        <h3 style={{ margin:"0 0 10px",color:C.text,fontSize:16,fontWeight:700,fontFamily:"'Inter',sans-serif" }}>Reset the entire hand?</h3>
        <p style={{ color:C.muted,fontSize:13,margin:"0 0 24px",lineHeight:1.6 }}>This will remove all inputs and analysis. This cannot be undone.</p>
        <div style={{ display:"flex",gap:10 }}>
          <Btn variant="secondary" onClick={onCancel} style={{ flex:1 }}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm} style={{ flex:1 }}>Reset Hand</Btn>
        </div>
      </div>
    </div>
  );
}

// --- History Dropdown ---
function HistoryDropdown({ history, onSelect, onClose }) {
  if (!history.length) return (
    <div style={{ position:"absolute",top:"100%",right:0,zIndex:200,background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:16,minWidth:260,marginTop:4,boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
      <p style={{ color:C.muted,fontSize:12,margin:0 }}>No recent hands yet.</p>
    </div>
  );
  return (
    <div style={{ position:"absolute",top:"100%",right:0,zIndex:200,background:C.card,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",marginTop:4,minWidth:300,boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
      <div style={{ padding:"8px 14px 6px",fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:2,borderBottom:"1px solid "+C.border,fontWeight:600 }}>Recent Hands</div>
      {history.slice(0,5).map((h,i)=>(
        <button key={h.id} onClick={()=>{onSelect(h);onClose();}} style={{
          width:"100%",padding:"11px 14px",textAlign:"left",
          background:i%2===0?C.card:C.surface,
          border:"none",borderBottom:"1px solid "+C.border,cursor:"pointer",
          display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.1s",
        }}
        onMouseEnter={e=>e.currentTarget.style.background=C.purple+"22"}
        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.card:C.surface}>
          <div>
            <div style={{ fontSize:12,color:C.gold,fontWeight:700,marginBottom:2 }}>
              {h.heroCards.filter(Boolean).map(c=>c.rank+SUIT_SYM[c.suit]).join(" ")}
              {h.board.length>0?" | "+h.board.map(c=>c.rank+SUIT_SYM[c.suit]).join(" "):""}
            </div>
            <div style={{ fontSize:11,color:C.muted }}>{ARCHETYPES[h.archetype]&&ARCHETYPES[h.archetype].label} - {h.street} - {h.ts}</div>
          </div>
          <span style={{ color:C.border,fontSize:14 }}>&#8594;</span>
        </button>
      ))}
    </div>
  );
}

// --- Play The Spot ---
function PlayTheSpot({ rec, onClose }) {
  const [chosen,setChosen]=useState(null);
  const [revealed,setRevealed]=useState(false);
  const options=["Fold","Check","Call","Bet 25%","Bet 33%","Bet 50%","Bet 75%","Raise","Jam"];
  const isCorrect=chosen&&(chosen.toLowerCase().includes(rec.action.toLowerCase())||(rec.sizing&&chosen.includes(rec.sizing.replace("%",""))));
  // Deterministic EV loss: based on rec.score (higher score = bigger loss for wrong answer)
  const evDiff=chosen&&!isCorrect?Math.max(2, Math.round((100 - (rec.score||70)) / 8 + (rec.score||70) / 20)):0;
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:28,maxWidth:480,width:"100%" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
          <span style={{ fontSize:15,fontWeight:700,color:C.gold,fontFamily:"'Inter',sans-serif" }}>Play This Spot</span>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20 }}>&#x2715;</button>
        </div>
        <p style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>{"What is the highest-EV action in this spot?"}</p>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:20 }}>
          {options.map(opt=>(
            <button key={opt} onClick={()=>{setChosen(opt);setRevealed(false);}} style={{
              padding:"8px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
              background:chosen===opt?C.purple+"33":C.surface,
              border:"1px solid "+(chosen===opt?C.purple:C.border),
              color:C.text,transition:"all 0.12s",
            }}>{opt}</button>
          ))}
        </div>
        {chosen&&!revealed&&(
          <Btn variant="primary" onClick={()=>setRevealed(true)} style={{ width:"100%" }}>Evaluate Decision</Btn>
        )}
        {revealed&&chosen&&(
          <div style={{ borderRadius:8,padding:16,background:isCorrect?C.green+"14":C.red+"14",border:"1px solid "+(isCorrect?C.green:C.red),marginTop:8 }}>
            <div style={{ fontSize:14,fontWeight:700,color:isCorrect?C.green:C.red,marginBottom:8 }}>
              {isCorrect?"Correct - optimal line":"Suboptimal - EV loss ~"+evDiff+"bb/100"}
            </div>
            <div style={{ fontSize:12,color:C.muted,marginBottom:10 }}>
              Optimal: <span style={{ color:C.gold,fontWeight:700 }}>{rec.action} {rec.sizing||""}</span> | {rec.tag}
            </div>
            {(rec.bullets||[]).slice(0,2).map((b,i)=>(
              <div key={i} style={{ display:"flex",gap:8,alignItems:"flex-start",marginBottom:4 }}>
                <span style={{ color:isCorrect?C.green:C.amber,fontSize:10,marginTop:3,flexShrink:0 }}>&#9679;</span>
                <span style={{ fontSize:12,color:C.muted,lineHeight:1.5 }}>{b}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// PRACTICE SCREEN
// ================================================================
// ================================================================
// DAILY DRILLS  -  Auto Spot Generator + Full Drill System
// ================================================================

const DRILL_TEMPLATES = [
  // -- PREFLOP (8 drills) -----------------------------------------
  { id:1,  heroPos:"BTN", villainPos:"BB",  street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"s"},{rank:"K",suit:"h"}],
    archetype:"station", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"Premium Open - BTN", diff:"Beginner",
    desc:"AK on the button vs calling station - standard open" },

  { id:2,  heroPos:"CO",  villainPos:"BB",  street:"preflop",
    board:[], heroCards:[{rank:"7",suit:"s"},{rank:"7",suit:"h"}],
    archetype:"nit", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"Small Pair Open", diff:"Beginner",
    desc:"77 from CO - open for value, nit will fold or call with better" },

  { id:3,  heroPos:"BB",  villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"Q",suit:"d"},{rank:"J",suit:"s"}],
    archetype:"lag", potSize:6, stackBB:100,
    correctAction:"Call", tag:"BB Defense vs LAG", diff:"Intermediate",
    desc:"QJo in BB vs BTN open - too strong to fold vs wide range" },

  { id:4,  heroPos:"SB",  villainPos:"BB",  street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"h"},{rank:"5",suit:"h"}],
    archetype:"rec", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"SB Isolation", diff:"Intermediate",
    desc:"A5s from SB heads-up - raise for value and fold equity" },

  { id:5,  heroPos:"UTG", villainPos:"BB",  street:"preflop",
    board:[], heroCards:[{rank:"J",suit:"c"},{rank:"T",suit:"d"}],
    archetype:"tag", potSize:3, stackBB:100,
    correctAction:"Fold", tag:"UTG Range Discipline", diff:"Intermediate",
    desc:"JTo UTG - outside open range, fold vs likely strong callers" },

  { id:6,  heroPos:"BTN", villainPos:"BB",  street:"preflop",
    board:[], heroCards:[{rank:"K",suit:"d"},{rank:"9",suit:"d"}],
    archetype:"loose_passive", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"BTN Steal vs Passive", diff:"Beginner",
    desc:"K9s on BTN - steal vs passive BB, hand has good equity" },

  { id:7,  heroPos:"BB",  villainPos:"UTG", street:"preflop",
    board:[], heroCards:[{rank:"5",suit:"s"},{rank:"5",suit:"d"}],
    archetype:"nit", potSize:7, stackBB:100,
    correctAction:"Call", tag:"Set Mine vs UTG", diff:"Intermediate",
    desc:"55 in BB vs UTG raise - correct price to set mine" },

  { id:8,  heroPos:"CO",  villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"c"},{rank:"Q",suit:"c"}],
    archetype:"lag", potSize:7, stackBB:100,
    correctAction:"3-Bet", tag:"3-Bet Value vs LAG BTN", diff:"Advanced",
    desc:"AQs facing BTN open from LAG - 3-bet for value and isolation" },

  // -- FLOP IP - VALUE SPOTS (8 drills) ---------------------------
  { id:9,  heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"T",suit:"s"},{rank:"8",suit:"d"},{rank:"7",suit:"c"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"J",suit:"s"}],
    archetype:"station", potSize:8, stackBB:100,
    correctAction:"Bet 33%", tag:"Overcards + Backdoor Draw", diff:"Beginner",
    desc:"Two overcards on wet board vs station - bet for fold equity" },

  { id:10, heroPos:"CO",  villainPos:"BB",  street:"flop",
    board:[{rank:"K",suit:"h"},{rank:"4",suit:"d"},{rank:"2",suit:"c"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"Q",suit:"d"}],
    archetype:"nit", potSize:7, stackBB:100,
    correctAction:"Bet 50%", tag:"Overpair Dry Board", diff:"Intermediate",
    desc:"QQ on K42 rainbow - bet overpair vs nit calling range" },

  { id:11, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"9",suit:"d"},{rank:"7",suit:"d"},{rank:"8",suit:"d"}],
    heroCards:[{rank:"K",suit:"d"},{rank:"T",suit:"d"}],
    archetype:"maniac", potSize:12, stackBB:100,
    correctAction:"Bet 75%", tag:"Flush + Protection", diff:"Advanced",
    desc:"K-high flush on monotone board - bet for value and protection" },

  { id:12, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"A",suit:"s"},{rank:"9",suit:"h"},{rank:"3",suit:"c"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"K",suit:"d"}],
    archetype:"rec", potSize:9, stackBB:100,
    correctAction:"Bet 66%", tag:"Top Two vs Wide Range", diff:"Beginner",
    desc:"AAKK9 - top two pair vs wide recreational range" },

  { id:13, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"J",suit:"s"},{rank:"J",suit:"h"},{rank:"4",suit:"c"}],
    heroCards:[{rank:"J",suit:"d"},{rank:"7",suit:"d"}],
    archetype:"station", potSize:8, stackBB:100,
    correctAction:"Check", tag:"Trips - Slow Play Paired", diff:"Intermediate",
    desc:"Trips on paired board - check to induce action from station" },

  { id:14, heroPos:"CO",  villainPos:"BB",  street:"flop",
    board:[{rank:"8",suit:"s"},{rank:"8",suit:"d"},{rank:"3",suit:"h"}],
    heroCards:[{rank:"A",suit:"c"},{rank:"K",suit:"s"}],
    archetype:"nit", potSize:7, stackBB:100,
    correctAction:"Bet 33%", tag:"Range Advantage Probe", diff:"Advanced",
    desc:"AK on 883 - range advantage allows small probe vs nit" },

  { id:15, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"Q",suit:"s"},{rank:"J",suit:"h"},{rank:"T",suit:"d"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"K",suit:"s"}],
    archetype:"lag", potSize:10, stackBB:100,
    correctAction:"Bet 75%", tag:"Broadway Nut Straight", diff:"Beginner",
    desc:"Nut straight Broadway - bet big for value vs LAG wide range" },

  { id:16, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"6",suit:"s"},{rank:"5",suit:"h"},{rank:"4",suit:"c"}],
    heroCards:[{rank:"8",suit:"d"},{rank:"7",suit:"d"}],
    archetype:"station", potSize:8, stackBB:100,
    correctAction:"Bet 66%", tag:"Flopped Straight", diff:"Beginner",
    desc:"Flopped straight vs station - bet for value on dynamic board" },

  // -- FLOP OOP - TRAP & CONTROL SPOTS (5 drills) -----------------
  { id:17, heroPos:"BB",  villainPos:"BTN", street:"flop",
    board:[{rank:"A",suit:"s"},{rank:"Q",suit:"d"},{rank:"5",suit:"h"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"8",suit:"d"}],
    archetype:"maniac", potSize:12, stackBB:100,
    correctAction:"Check", tag:"Trap vs Maniac OOP", diff:"Advanced",
    desc:"Top pair OOP - check to trap aggressive maniac range" },

  { id:18, heroPos:"BB",  villainPos:"CO",  street:"flop",
    board:[{rank:"K",suit:"d"},{rank:"Q",suit:"d"},{rank:"J",suit:"d"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"T",suit:"c"}],
    archetype:"tag", potSize:11, stackBB:100,
    correctAction:"Check", tag:"Nut Flush Draw OOP Trap", diff:"Advanced",
    desc:"Nut flush draw + nut straight draw OOP - check-raise opportunity" },

  { id:19, heroPos:"SB",  villainPos:"BTN", street:"flop",
    board:[{rank:"7",suit:"s"},{rank:"5",suit:"h"},{rank:"2",suit:"c"}],
    heroCards:[{rank:"K",suit:"s"},{rank:"K",suit:"d"}],
    archetype:"lag", potSize:9, stackBB:100,
    correctAction:"Check", tag:"Overpair Dry OOP", diff:"Intermediate",
    desc:"KK on dry low board OOP - check-call to keep LAG bluffing" },

  { id:20, heroPos:"BB",  villainPos:"BTN", street:"flop",
    board:[{rank:"T",suit:"h"},{rank:"9",suit:"s"},{rank:"8",suit:"d"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"J",suit:"d"}],
    archetype:"station", potSize:10, stackBB:100,
    correctAction:"Check", tag:"Nut Straight OOP vs Station", diff:"Advanced",
    desc:"QJ on T98 = nut straight OOP - check-raise to build pot vs station" },

  { id:21, heroPos:"BB",  villainPos:"CO",  street:"flop",
    board:[{rank:"A",suit:"c"},{rank:"5",suit:"c"},{rank:"3",suit:"d"}],
    heroCards:[{rank:"6",suit:"c"},{rank:"4",suit:"c"}],
    archetype:"rec", potSize:9, stackBB:100,
    correctAction:"Check", tag:"Straight + Flush Draw OOP", diff:"Advanced",
    desc:"6-high straight plus flush draw OOP vs rec - check to pick line" },

  // -- FLOP DRAWS (4 drills) ---------------------------------------
  { id:22, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"K",suit:"h"},{rank:"T",suit:"h"},{rank:"4",suit:"c"}],
    heroCards:[{rank:"J",suit:"h"},{rank:"9",suit:"h"}],
    archetype:"station", potSize:8, stackBB:100,
    correctAction:"Bet 50%", tag:"Flush + Straight Draw Semi-Bluff", diff:"Intermediate",
    desc:"Combo draw vs station - semi-bluff with massive equity" },

  { id:23, heroPos:"CO",  villainPos:"BB",  street:"flop",
    board:[{rank:"9",suit:"s"},{rank:"6",suit:"d"},{rank:"2",suit:"h"}],
    heroCards:[{rank:"T",suit:"s"},{rank:"8",suit:"d"}],
    archetype:"nit", potSize:7, stackBB:100,
    correctAction:"Bet 33%", tag:"OESD Probe vs Nit", diff:"Intermediate",
    desc:"OESD on dry board - probe bet vs nit to pick up fold equity" },

  { id:24, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"A",suit:"s"},{rank:"6",suit:"s"},{rank:"2",suit:"d"}],
    heroCards:[{rank:"8",suit:"s"},{rank:"7",suit:"s"}],
    archetype:"lag", potSize:9, stackBB:100,
    correctAction:"Bet 33%", tag:"Backdoor Draw + Position", diff:"Advanced",
    desc:"Backdoor flush + straight draw IP vs LAG - probe with equity" },

  { id:25, heroPos:"BB",  villainPos:"BTN", street:"flop",
    board:[{rank:"J",suit:"h"},{rank:"8",suit:"h"},{rank:"4",suit:"s"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"K",suit:"h"}],
    archetype:"rec", potSize:9, stackBB:100,
    correctAction:"Check", tag:"Nut Flush Draw OOP Check-Raise", diff:"Advanced",
    desc:"Nut flush draw OOP - check to check-raise vs wide recreational bets" },

  // -- TURN SPOTS (8 drills) ---------------------------------------
  { id:26, heroPos:"BTN", villainPos:"BB",  street:"turn",
    board:[{rank:"A",suit:"h"},{rank:"K",suit:"s"},{rank:"7",suit:"d"},{rank:"2",suit:"c"}],
    heroCards:[{rank:"Q",suit:"s"},{rank:"J",suit:"s"}],
    archetype:"nit", potSize:22, stackBB:80,
    correctAction:"Bet 33%", tag:"Double Barrel Brick Turn", diff:"Intermediate",
    desc:"Double barrel on blank turn vs nit fold equity" },

  { id:27, heroPos:"CO",  villainPos:"BB",  street:"turn",
    board:[{rank:"K",suit:"s"},{rank:"Q",suit:"h"},{rank:"9",suit:"d"},{rank:"T",suit:"c"}],
    heroCards:[{rank:"J",suit:"s"},{rank:"J",suit:"h"}],
    archetype:"station", potSize:18, stackBB:85,
    correctAction:"Bet 66%", tag:"Made Straight vs Station", diff:"Beginner",
    desc:"JJ completing KQJT9 straight - bet for value vs station calling range" },

  { id:28, heroPos:"BTN", villainPos:"BB",  street:"turn",
    board:[{rank:"8",suit:"h"},{rank:"7",suit:"h"},{rank:"6",suit:"s"},{rank:"K",suit:"h"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"5",suit:"h"}],
    archetype:"lag", potSize:20, stackBB:75,
    correctAction:"Bet 75%", tag:"Nut Flush Turn", diff:"Intermediate",
    desc:"Nut flush on paired board - charge draws and value on monotone turn" },

  { id:29, heroPos:"BB",  villainPos:"BTN", street:"turn",
    board:[{rank:"A",suit:"c"},{rank:"J",suit:"s"},{rank:"7",suit:"d"},{rank:"3",suit:"c"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"J",suit:"c"}],
    archetype:"maniac", potSize:16, stackBB:90,
    correctAction:"Check", tag:"Top Two OOP vs Maniac Turn", diff:"Advanced",
    desc:"Top two pair OOP vs maniac - check-call line on turn" },

  { id:30, heroPos:"BTN", villainPos:"BB",  street:"turn",
    board:[{rank:"Q",suit:"d"},{rank:"Q",suit:"h"},{rank:"5",suit:"s"},{rank:"9",suit:"c"}],
    heroCards:[{rank:"K",suit:"s"},{rank:"K",suit:"d"}],
    archetype:"station", potSize:14, stackBB:80,
    correctAction:"Bet 50%", tag:"Overpair on Paired Turn", diff:"Intermediate",
    desc:"KK vs QQ5 paired board - bet for value vs station still calling" },

  { id:31, heroPos:"CO",  villainPos:"BTN", street:"turn",
    board:[{rank:"T",suit:"s"},{rank:"9",suit:"h"},{rank:"8",suit:"c"},{rank:"A",suit:"d"}],
    heroCards:[{rank:"J",suit:"s"},{rank:"7",suit:"d"}],
    archetype:"nit", potSize:19, stackBB:75,
    correctAction:"Bet 66%", tag:"Straight on Dangerous Turn", diff:"Intermediate",
    desc:"Flopped straight still good on A turn - value bet before equity dries" },

  { id:32, heroPos:"BB",  villainPos:"CO",  street:"turn",
    board:[{rank:"6",suit:"s"},{rank:"5",suit:"d"},{rank:"4",suit:"h"},{rank:"K",suit:"c"}],
    heroCards:[{rank:"7",suit:"c"},{rank:"7",suit:"s"}],
    archetype:"tag", potSize:15, stackBB:85,
    correctAction:"Check", tag:"Middle Pair Pot Control OOP", diff:"Intermediate",
    desc:"77 on 6547K OOP vs TAG - no reason to bloat pot, check-call" },

  { id:33, heroPos:"BTN", villainPos:"BB",  street:"turn",
    board:[{rank:"J",suit:"c"},{rank:"9",suit:"c"},{rank:"3",suit:"s"},{rank:"5",suit:"c"}],
    heroCards:[{rank:"K",suit:"c"},{rank:"T",suit:"c"}],
    archetype:"rec", potSize:18, stackBB:80,
    correctAction:"Bet 75%", tag:"Flush Turn vs Rec", diff:"Beginner",
    desc:"K-high flush on turn - max value vs wide recreational calling range" },

  // -- RIVER SPOTS (9 drills) --------------------------------------
  { id:34, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"A",suit:"s"},{rank:"K",suit:"h"},{rank:"7",suit:"d"},{rank:"2",suit:"c"},{rank:"J",suit:"s"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"K",suit:"s"}],
    archetype:"station", potSize:30, stackBB:60,
    correctAction:"Bet 75%", tag:"Top Two River Value", diff:"Beginner",
    desc:"AAKK7 vs station - top two pair river value bet on dry runout" },

  { id:35, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"Q",suit:"h"},{rank:"J",suit:"h"},{rank:"T",suit:"d"},{rank:"9",suit:"c"},{rank:"8",suit:"s"}],
    heroCards:[{rank:"K",suit:"s"},{rank:"7",suit:"d"}],
    archetype:"loose_passive", potSize:24, stackBB:65,
    correctAction:"Check", tag:"Board Pairs All - Check Back", diff:"Advanced",
    desc:"Board runs out 5-card straight - check back with K-high straight" },

  { id:36, heroPos:"BB",  villainPos:"BTN", street:"river",
    board:[{rank:"A",suit:"d"},{rank:"A",suit:"s"},{rank:"K",suit:"h"},{rank:"7",suit:"c"},{rank:"3",suit:"d"}],
    heroCards:[{rank:"K",suit:"d"},{rank:"Q",suit:"s"}],
    archetype:"maniac", potSize:26, stackBB:55,
    correctAction:"Call", tag:"Bluff Catch River vs Maniac", diff:"Advanced",
    desc:"KQ on AAKK7 board - bluff catch facing maniac river bet" },

  { id:37, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"T",suit:"d"},{rank:"T",suit:"h"},{rank:"5",suit:"s"},{rank:"3",suit:"c"},{rank:"2",suit:"d"}],
    heroCards:[{rank:"K",suit:"s"},{rank:"K",suit:"h"}],
    archetype:"nit", potSize:20, stackBB:70,
    correctAction:"Bet 33%", tag:"Showdown Value Thin Bet", diff:"Advanced",
    desc:"KK on board with Tens - thin value bet to extract from nit" },

  { id:38, heroPos:"CO",  villainPos:"BB",  street:"river",
    board:[{rank:"9",suit:"s"},{rank:"8",suit:"h"},{rank:"7",suit:"d"},{rank:"6",suit:"c"},{rank:"2",suit:"s"}],
    heroCards:[{rank:"T",suit:"s"},{rank:"T",suit:"c"}],
    archetype:"rec", potSize:22, stackBB:65,
    correctAction:"Bet 66%", tag:"Straight River vs Rec", diff:"Beginner",
    desc:"T-high straight IP vs rec - value bet full straight on river" },

  { id:39, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"K",suit:"h"},{rank:"Q",suit:"d"},{rank:"J",suit:"s"},{rank:"9",suit:"h"},{rank:"4",suit:"c"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"T",suit:"s"}],
    archetype:"lag", potSize:28, stackBB:55,
    correctAction:"Bet 75%", tag:"Nut Straight River Bet", diff:"Beginner",
    desc:"Nut Broadway straight - large river bet vs LAG drawing range" },

  { id:40, heroPos:"BB",  villainPos:"BTN", street:"river",
    board:[{rank:"J",suit:"s"},{rank:"9",suit:"s"},{rank:"5",suit:"d"},{rank:"3",suit:"c"},{rank:"J",suit:"c"}],
    heroCards:[{rank:"J",suit:"h"},{rank:"8",suit:"h"}],
    archetype:"station", potSize:24, stackBB:60,
    correctAction:"Check", tag:"Trips OOP - Induce River", diff:"Intermediate",
    desc:"Trips on JJ board OOP vs station - check-call to induce bluff" },

  { id:41, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"A",suit:"s"},{rank:"7",suit:"h"},{rank:"5",suit:"d"},{rank:"2",suit:"c"},{rank:"K",suit:"s"}],
    heroCards:[{rank:"Q",suit:"s"},{rank:"J",suit:"h"}],
    archetype:"loose_passive", potSize:18, stackBB:70,
    correctAction:"Bet 33%", tag:"Blocker Bluff River", diff:"Advanced",
    desc:"Air with K blocker on AK board - small bluff vs passive range" },

  { id:42, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"8",suit:"d"},{rank:"8",suit:"s"},{rank:"4",suit:"h"},{rank:"2",suit:"c"},{rank:"8",suit:"c"}],
    heroCards:[{rank:"A",suit:"c"},{rank:"A",suit:"s"}],
    archetype:"rec", potSize:20, stackBB:65,
    correctAction:"Bet 50%", tag:"Full House vs Quads Board", diff:"Advanced",
    desc:"AA on 8884 board - value bet full house, unlikely villain has quads" },

  // -- MULTIWAY & SPECIAL (5 drills) ------------------------------
  { id:43, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"A",suit:"h"},{rank:"K",suit:"d"},{rank:"Q",suit:"c"}],
    heroCards:[{rank:"J",suit:"s"},{rank:"T",suit:"d"}],
    archetype:"station", potSize:12, stackBB:100,
    correctAction:"Bet 75%", tag:"Nut Straight High-Card Board", diff:"Beginner",
    desc:"Flopped Broadway straight on AKQ - bet big for value immediately" },

  { id:44, heroPos:"HJ",  villainPos:"CO",  street:"flop",
    board:[{rank:"9",suit:"s"},{rank:"8",suit:"h"},{rank:"6",suit:"c"}],
    heroCards:[{rank:"T",suit:"s"},{rank:"T",suit:"d"}],
    archetype:"lag", potSize:14, stackBB:100,
    correctAction:"Raise", tag:"Overpair Protection Wet Board", diff:"Advanced",
    desc:"TT on 986 - must raise to protect equity vs LAG draw-heavy range" },

  { id:45, heroPos:"CO",  villainPos:"BB",  street:"flop",
    board:[{rank:"5",suit:"h"},{rank:"5",suit:"d"},{rank:"3",suit:"c"}],
    heroCards:[{rank:"A",suit:"c"},{rank:"K",suit:"d"}],
    archetype:"loose_passive", potSize:9, stackBB:100,
    correctAction:"Bet 75%", tag:"Paired Board Range Advantage", diff:"Intermediate",
    desc:"Dry paired board - AK has range advantage, large c-bet" },

  { id:46, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"A",suit:"h"},{rank:"A",suit:"d"},{rank:"9",suit:"s"}],
    heroCards:[{rank:"9",suit:"h"},{rank:"9",suit:"d"}],
    archetype:"maniac", potSize:10, stackBB:100,
    correctAction:"Check", tag:"Flopped Boat Trap vs Maniac", diff:"Advanced",
    desc:"99 full house on AA9 - slow play to let maniac bet into you" },

  { id:47, heroPos:"BB",  villainPos:"SB",  street:"flop",
    board:[{rank:"K",suit:"s"},{rank:"K",suit:"d"},{rank:"7",suit:"h"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"Q",suit:"c"}],
    archetype:"tag", potSize:6, stackBB:100,
    correctAction:"Check", tag:"Trips OOP Slow Play", diff:"Intermediate",
    desc:"Trip kings OOP vs TAG - check to trap, villain c-bets frequently" },

  // -- SHORT STACK & SPR SPOTS (5 drills) -------------------------
  { id:48, heroPos:"BTN", villainPos:"BB",  street:"flop",
    board:[{rank:"A",suit:"s"},{rank:"6",suit:"h"},{rank:"2",suit:"d"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"Q",suit:"s"}],
    archetype:"station", potSize:14, stackBB:25,
    correctAction:"Bet 66%", tag:"Short Stack Value Push", diff:"Intermediate",
    desc:"TPTK short stack - get it in on the flop vs station" },

  { id:49, heroPos:"CO",  villainPos:"BB",  street:"turn",
    board:[{rank:"Q",suit:"s"},{rank:"T",suit:"h"},{rank:"7",suit:"d"},{rank:"4",suit:"c"}],
    heroCards:[{rank:"Q",suit:"d"},{rank:"J",suit:"s"}],
    archetype:"nit", potSize:20, stackBB:30,
    correctAction:"Bet 66%", tag:"Low SPR Commitment Turn", diff:"Intermediate",
    desc:"Top pair top kicker with low SPR - commit now vs nit" },

  { id:50, heroPos:"BTN", villainPos:"BB",  street:"river",
    board:[{rank:"7",suit:"c"},{rank:"6",suit:"s"},{rank:"5",suit:"d"},{rank:"4",suit:"h"},{rank:"3",suit:"c"}],
    heroCards:[{rank:"8",suit:"h"},{rank:"8",suit:"d"}],
    archetype:"rec", potSize:28, stackBB:45,
    correctAction:"Bet 50%", tag:"Straight on Dangerous Board", diff:"Advanced",
    desc:"88 making 34567 straight - bet river carefully vs rec, board scary" },

  // -- PREFLOP (ids 51-66) --------------------------------------------------
  { id:51, heroPos:"BTN", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"s"},{rank:"K",suit:"h"}],
    archetype:"station", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"Premium BTN Open vs Station", diff:"Beginner",
    desc:"AKo on BTN - open raise vs calling station, build the pot" },

  { id:52, heroPos:"UTG", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"7",suit:"s"},{rank:"2",suit:"c"}],
    archetype:"nit", potSize:3, stackBB:100,
    correctAction:"Fold", tag:"UTG Trash Fold", diff:"Beginner",
    desc:"72o UTG - fold even vs nit, no equity or position" },

  { id:53, heroPos:"CO", villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"h"},{rank:"J",suit:"d"}],
    archetype:"lag", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"AJo CO Open vs LAG", diff:"Beginner",
    desc:"AJo from CO - open raise, AJ plays well heads-up" },

  { id:54, heroPos:"SB", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"K",suit:"s"},{rank:"5",suit:"s"}],
    archetype:"loose_passive", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"SB Steal vs Loose Passive", diff:"Beginner",
    desc:"K5s SB vs loose passive BB - steal with suited king, position is favorable" },

  { id:55, heroPos:"BB", villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"9",suit:"d"},{rank:"7",suit:"d"}],
    archetype:"tag", potSize:6, stackBB:100,
    correctAction:"Call", tag:"BB Defense vs BTN Raise", diff:"Beginner",
    desc:"97s BB vs BTN open by TAG - defend, suited connectors have implied odds" },

  { id:56, heroPos:"BTN", villainPos:"SB", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"c"},{rank:"A",suit:"d"}],
    archetype:"maniac", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"Aces BTN vs Maniac SB", diff:"Beginner",
    desc:"AA on BTN - standard open, maniac will 3-bet wide so 4-bet/call big pot" },

  { id:57, heroPos:"HJ", villainPos:"CO", street:"preflop",
    board:[], heroCards:[{rank:"Q",suit:"h"},{rank:"T",suit:"h"}],
    archetype:"station", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"QTh HJ Open", diff:"Intermediate",
    desc:"QTh from HJ - open, connected broadway suits well vs calling station" },

  { id:58, heroPos:"UTG", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"J",suit:"s"},{rank:"J",suit:"c"}],
    archetype:"lag", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"JJ UTG vs LAG", diff:"Intermediate",
    desc:"JJ UTG - open raise standard, be prepared to 4-bet vs LAG 3-bet" },

  { id:59, heroPos:"CO", villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"5",suit:"h"},{rank:"5",suit:"d"}],
    archetype:"rec", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"55 CO Open", diff:"Intermediate",
    desc:"55 from CO - open for set value, rec players call too wide postflop" },

  { id:60, heroPos:"BTN", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"K",suit:"d"},{rank:"Q",suit:"s"}],
    archetype:"nit", potSize:7, stackBB:100,
    correctAction:"Call", tag:"KQo Facing 3-Bet from Nit", diff:"Intermediate",
    desc:"BTN opens KQo, nit 3-bets from BB - call in position, nit range is narrow" },

  { id:61, heroPos:"SB", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"s"},{rank:"4",suit:"s"}],
    archetype:"loose_passive", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"A4s SB vs Loose Passive", diff:"Intermediate",
    desc:"A4s SB - open raise, nut flush potential and ace blocker vs calling station BB" },

  { id:62, heroPos:"BB", villainPos:"CO", street:"preflop",
    board:[], heroCards:[{rank:"T",suit:"c"},{rank:"8",suit:"c"}],
    archetype:"tag", potSize:9, stackBB:100,
    correctAction:"Call", tag:"T8s BB vs CO TAG", diff:"Intermediate",
    desc:"T8s BB facing CO open by TAG - defend with suited connector, good implied odds" },

  { id:63, heroPos:"UTG", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"h"},{rank:"Q",suit:"d"}],
    archetype:"maniac", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"AQo UTG vs Maniac", diff:"Advanced",
    desc:"AQo UTG - open, but be cautious: maniac may 3-bet wide, 4-bet/fold or flat in position" },

  { id:64, heroPos:"BTN", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"9",suit:"s"},{rank:"8",suit:"s"}],
    archetype:"station", potSize:7, stackBB:100,
    correctAction:"Call", tag:"98s BTN vs Station 3-Bet", diff:"Advanced",
    desc:"BTN opens 98s, station 3-bets - call in position, speculative hand with implied odds" },

  { id:65, heroPos:"HJ", villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"A",suit:"d"},{rank:"K",suit:"s"}],
    archetype:"lag", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"AKo HJ vs LAG BTN", diff:"Advanced",
    desc:"AKo HJ - open, plan to 4-bet if LAG 3-bets from BTN - premium blocker hand" },

  { id:66, heroPos:"CO", villainPos:"BTN", street:"preflop",
    board:[], heroCards:[{rank:"K",suit:"c"},{rank:"K",suit:"h"}],
    archetype:"rec", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"KK CO vs Rec BTN", diff:"Beginner",
    desc:"KK from CO - open raise, rec players call or shove preflop too wide" },

  // -- FLOP - under-represented archetypes (ids 67-76) ---------------------
  { id:67, heroPos:"BTN", villainPos:"BB", street:"flop",
    board:[{rank:"A",suit:"h"},{rank:"7",suit:"s"},{rank:"2",suit:"d"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"J",suit:"c"}],
    archetype:"loose_passive", potSize:10, stackBB:100,
    correctAction:"Bet 50%", tag:"Top Pair vs Loose Passive", diff:"Beginner",
    desc:"TPTK on dry board - bet for value, loose passive calls too wide to bluff" },

  { id:68, heroPos:"CO", villainPos:"BB", street:"flop",
    board:[{rank:"K",suit:"s"},{rank:"Q",suit:"h"},{rank:"J",suit:"d"}],
    heroCards:[{rank:"T",suit:"h"},{rank:"9",suit:"h"}],
    archetype:"tag", potSize:12, stackBB:100,
    correctAction:"Bet 66%", tag:"Flopped Straight vs TAG", diff:"Beginner",
    desc:"Flopped the nuts - bet for value vs TAG who can have two pair or set" },

  { id:69, heroPos:"BTN", villainPos:"BB", street:"flop",
    board:[{rank:"8",suit:"d"},{rank:"6",suit:"c"},{rank:"3",suit:"h"}],
    heroCards:[{rank:"Q",suit:"s"},{rank:"Q",suit:"d"}],
    archetype:"loose_passive", potSize:9, stackBB:100,
    correctAction:"Bet 50%", tag:"Overpair Dry Board vs LP", diff:"Beginner",
    desc:"QQ on 863 rainbow - bet, LP calls with any pair or draw, value bet wide" },

  { id:70, heroPos:"BB", villainPos:"BTN", street:"flop",
    board:[{rank:"9",suit:"s"},{rank:"5",suit:"h"},{rank:"2",suit:"c"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"9",suit:"d"}],
    archetype:"tag", potSize:11, stackBB:100,
    correctAction:"Check", tag:"OOP Top Pair vs TAG Check", diff:"Intermediate",
    desc:"Top pair OOP vs TAG - check to induce, TAG cbets wide, raise to build pot" },

  { id:71, heroPos:"BTN", villainPos:"SB", street:"flop",
    board:[{rank:"J",suit:"h"},{rank:"T",suit:"d"},{rank:"4",suit:"s"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"J",suit:"s"}],
    archetype:"loose_passive", potSize:14, stackBB:100,
    correctAction:"Bet 33%", tag:"TPTK Wet Board vs LP", diff:"Intermediate",
    desc:"AJ on JT4 wet board - bet small to charge draws, LP will call with any pair or draw" },

  { id:72, heroPos:"CO", villainPos:"BTN", street:"flop",
    board:[{rank:"A",suit:"s"},{rank:"A",suit:"d"},{rank:"5",suit:"h"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"Q",suit:"c"}],
    archetype:"tag", potSize:10, stackBB:100,
    correctAction:"Check", tag:"Whiffed on Ace Board vs TAG", diff:"Intermediate",
    desc:"KQo whiffed, board is AAxxx - check back OOP, TAG checks behind with weak hands" },

  { id:73, heroPos:"BTN", villainPos:"BB", street:"flop",
    board:[{rank:"6",suit:"h"},{rank:"5",suit:"h"},{rank:"4",suit:"h"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"T",suit:"c"}],
    archetype:"loose_passive", potSize:13, stackBB:100,
    correctAction:"Bet 66%", tag:"Flush on Monotone Board vs LP", diff:"Intermediate",
    desc:"Flopped flush on monotone board - bet big, LP won't fold pairs or lower flushes" },

  { id:74, heroPos:"BB", villainPos:"CO", street:"flop",
    board:[{rank:"Q",suit:"s"},{rank:"J",suit:"c"},{rank:"9",suit:"d"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"8",suit:"h"}],
    archetype:"tag", potSize:15, stackBB:100,
    correctAction:"Check", tag:"Top Pair Wet OOP Check-Raise vs TAG", diff:"Advanced",
    desc:"Qh8h on QJ9 - check to set up check-raise vs TAG cbet, protect and build pot" },

  { id:75, heroPos:"BTN", villainPos:"BB", street:"flop",
    board:[{rank:"T",suit:"c"},{rank:"8",suit:"c"},{rank:"2",suit:"s"}],
    heroCards:[{rank:"A",suit:"c"},{rank:"K",suit:"c"}],
    archetype:"loose_passive", potSize:12, stackBB:100,
    correctAction:"Bet 33%", tag:"Nut Flush Draw Bet vs LP", diff:"Advanced",
    desc:"AKcc on T82cc - bet small to build pot with nut flush draw, LP calling range is wide" },

  { id:76, heroPos:"CO", villainPos:"BB", street:"flop",
    board:[{rank:"A",suit:"d"},{rank:"K",suit:"s"},{rank:"7",suit:"h"}],
    heroCards:[{rank:"7",suit:"s"},{rank:"7",suit:"c"}],
    archetype:"tag", potSize:11, stackBB:100,
    correctAction:"Bet 50%", tag:"Bottom Set vs TAG", diff:"Advanced",
    desc:"77 on AK7 - bet, protect against broadway draws, TAG range has AK, AQ heavily" },

  // -- TURN - expanded coverage (ids 77-89) ---------------------------------
  { id:77, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"K",suit:"h"},{rank:"9",suit:"s"},{rank:"3",suit:"d"},{rank:"2",suit:"c"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"K",suit:"s"}],
    archetype:"station", potSize:18, stackBB:100,
    correctAction:"Bet 66%", tag:"Top Two Pair Turn vs Station", diff:"Beginner",
    desc:"AK on K932 turn - bet big, station calls two pair and top pair easily" },

  { id:78, heroPos:"CO", villainPos:"BB", street:"turn",
    board:[{rank:"7",suit:"h"},{rank:"6",suit:"s"},{rank:"5",suit:"d"},{rank:"8",suit:"h"}],
    heroCards:[{rank:"9",suit:"s"},{rank:"9",suit:"c"}],
    archetype:"nit", potSize:20, stackBB:100,
    correctAction:"Bet 66%", tag:"Straight on Turn vs Nit", diff:"Beginner",
    desc:"99 making 56789 - bet turn, even nit can't fold two pair or sets easily here" },

  { id:79, heroPos:"BTN", villainPos:"SB", street:"turn",
    board:[{rank:"A",suit:"c"},{rank:"Q",suit:"h"},{rank:"J",suit:"s"},{rank:"4",suit:"d"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"T",suit:"d"}],
    archetype:"loose_passive", potSize:22, stackBB:100,
    correctAction:"Bet 50%", tag:"Broadway Straight Turn vs LP", diff:"Beginner",
    desc:"KT with AKJQ board making straight - bet, loose passive calls with two pair or worse" },

  { id:80, heroPos:"BB", villainPos:"BTN", street:"turn",
    board:[{rank:"T",suit:"s"},{rank:"8",suit:"h"},{rank:"6",suit:"d"},{rank:"Q",suit:"s"}],
    heroCards:[{rank:"T",suit:"h"},{rank:"T",suit:"d"}],
    archetype:"tag", potSize:16, stackBB:100,
    correctAction:"Check", tag:"Set OOP Turn Trap vs TAG", diff:"Intermediate",
    desc:"TTT on T86Q - check to induce TAG bet, set is very strong here, trap" },

  { id:81, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"J",suit:"d"},{rank:"9",suit:"c"},{rank:"2",suit:"h"},{rank:"K",suit:"d"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"Q",suit:"d"}],
    archetype:"rec", potSize:19, stackBB:100,
    correctAction:"Bet 50%", tag:"Nut Flush Draw Turn vs Rec", diff:"Intermediate",
    desc:"AdQd with nut flush draw on KJ92dd - semi-bluff, rec players call wide enough" },

  { id:82, heroPos:"CO", villainPos:"BTN", street:"turn",
    board:[{rank:"8",suit:"s"},{rank:"7",suit:"h"},{rank:"6",suit:"c"},{rank:"A",suit:"d"}],
    heroCards:[{rank:"9",suit:"h"},{rank:"5",suit:"h"}],
    archetype:"station", potSize:25, stackBB:100,
    correctAction:"Bet 75%", tag:"Straight Turn Overbet vs Station", diff:"Intermediate",
    desc:"95 flopped straight, ace hits turn - bet big, station calls with any pair" },

  { id:83, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"Q",suit:"h"},{rank:"J",suit:"h"},{rank:"T",suit:"s"},{rank:"7",suit:"d"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"9",suit:"h"}],
    archetype:"lag", potSize:21, stackBB:100,
    correctAction:"Bet 66%", tag:"Royal Draw + Flush Draw Turn vs LAG", diff:"Advanced",
    desc:"KhQh board - combo draw with flush+straight+royal potential, bet to put LAG in tough spot" },

  { id:84, heroPos:"BB", villainPos:"CO", street:"turn",
    board:[{rank:"5",suit:"s"},{rank:"4",suit:"s"},{rank:"3",suit:"c"},{rank:"K",suit:"h"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"2",suit:"s"}],
    archetype:"nit", potSize:17, stackBB:100,
    correctAction:"Check", tag:"Wheel Straight + Nut Flush OOP vs Nit", diff:"Advanced",
    desc:"A2ss with A2345 and nut spade flush draw - slow play vs nit to keep their range in" },

  { id:85, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"K",suit:"c"},{rank:"K",suit:"d"},{rank:"8",suit:"h"},{rank:"3",suit:"s"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"Q",suit:"c"}],
    archetype:"loose_passive", potSize:15, stackBB:100,
    correctAction:"Bet 33%", tag:"Overpair on Paired Board Turn vs LP", diff:"Intermediate",
    desc:"QQ on KK83 - bet small for value, LP floats too wide, K is on board so QQ still good" },

  { id:86, heroPos:"CO", villainPos:"BB", street:"turn",
    board:[{rank:"A",suit:"h"},{rank:"5",suit:"h"},{rank:"2",suit:"d"},{rank:"9",suit:"c"}],
    heroCards:[{rank:"J",suit:"h"},{rank:"T",suit:"h"}],
    archetype:"tag", potSize:20, stackBB:100,
    correctAction:"Check", tag:"Flush Draw Missed Turn vs TAG", diff:"Advanced",
    desc:"JThh with A52r board - missed top pair, flush draw still live, check behind to see river" },

  { id:87, heroPos:"BTN", villainPos:"SB", street:"turn",
    board:[{rank:"6",suit:"c"},{rank:"6",suit:"h"},{rank:"2",suit:"s"},{rank:"T",suit:"d"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"6",suit:"d"}],
    archetype:"maniac", potSize:18, stackBB:100,
    correctAction:"Bet 50%", tag:"Trips Turn vs Maniac", diff:"Intermediate",
    desc:"A6 with trips on 662T - bet vs maniac, they call/raise with anything, extract value" },

  { id:88, heroPos:"BB", villainPos:"BTN", street:"turn",
    board:[{rank:"K",suit:"s"},{rank:"Q",suit:"d"},{rank:"J",suit:"c"},{rank:"T",suit:"h"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"9",suit:"d"}],
    archetype:"rec", potSize:24, stackBB:100,
    correctAction:"Bet 75%", tag:"Broadway Straight OOP vs Rec", diff:"Beginner",
    desc:"A9 with AKQJT board - bet big OOP, rec players call straights but won't fold" },

  { id:89, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"J",suit:"s"},{rank:"J",suit:"h"},{rank:"3",suit:"d"},{rank:"3",suit:"c"}],
    heroCards:[{rank:"K",suit:"h"},{rank:"K",suit:"s"}],
    archetype:"station", potSize:19, stackBB:100,
    correctAction:"Bet 50%", tag:"Boat on Double Paired Board vs Station", diff:"Advanced",
    desc:"KK full house on JJ33 - bet, station won't fold Jx or 3x, extract max from full house" },

  // -- RIVER - expanded coverage (ids 90-97) -------------------------------
  { id:90, heroPos:"BTN", villainPos:"BB", street:"river",
    board:[{rank:"A",suit:"s"},{rank:"K",suit:"d"},{rank:"Q",suit:"c"},{rank:"J",suit:"h"},{rank:"2",suit:"s"}],
    heroCards:[{rank:"T",suit:"h"},{rank:"9",suit:"d"}],
    archetype:"loose_passive", potSize:30, stackBB:40,
    correctAction:"Bet 75%", tag:"Straight River Jam vs LP", diff:"Beginner",
    desc:"T9 with Broadway straight - jam or overbet vs LP who calls with worse straights and two pair" },

  { id:91, heroPos:"BB", villainPos:"BTN", street:"river",
    board:[{rank:"9",suit:"h"},{rank:"8",suit:"h"},{rank:"7",suit:"h"},{rank:"6",suit:"d"},{rank:"A",suit:"s"}],
    heroCards:[{rank:"J",suit:"h"},{rank:"T",suit:"c"}],
    archetype:"tag", potSize:26, stackBB:60,
    correctAction:"Bet 50%", tag:"Straight River OOP vs TAG", diff:"Intermediate",
    desc:"JT with 6789 straight, flush on board - bet for value, TAG can have worse straights" },

  { id:92, heroPos:"BTN", villainPos:"SB", street:"river",
    board:[{rank:"K",suit:"s"},{rank:"K",suit:"c"},{rank:"K",suit:"h"},{rank:"7",suit:"d"},{rank:"2",suit:"s"}],
    heroCards:[{rank:"A",suit:"h"},{rank:"K",suit:"d"}],
    archetype:"rec", potSize:22, stackBB:80,
    correctAction:"Bet 33%", tag:"Quads River Small Bet vs Rec", diff:"Intermediate",
    desc:"AK with KKKK quads - thin value bet small, rec players call with any pair, induce calls" },

  { id:93, heroPos:"CO", villainPos:"BB", street:"river",
    board:[{rank:"Q",suit:"d"},{rank:"T",suit:"d"},{rank:"9",suit:"s"},{rank:"3",suit:"h"},{rank:"K",suit:"d"}],
    heroCards:[{rank:"J",suit:"d"},{rank:"8",suit:"d"}],
    archetype:"station", potSize:35, stackBB:50,
    correctAction:"Bet 75%", tag:"Flush + Straight River vs Station", diff:"Beginner",
    desc:"JdXd with nut flush AND straight - jam vs station, they call any hand they hit" },

  { id:94, heroPos:"BTN", villainPos:"BB", street:"river",
    board:[{rank:"A",suit:"c"},{rank:"Q",suit:"s"},{rank:"8",suit:"h"},{rank:"4",suit:"d"},{rank:"7",suit:"c"}],
    heroCards:[{rank:"A",suit:"d"},{rank:"8",suit:"s"}],
    archetype:"nit", potSize:28, stackBB:70,
    correctAction:"Bet 50%", tag:"Two Pair River vs Nit", diff:"Intermediate",
    desc:"A8 on AQ847 - bet river, two pair beats nit's top pair, sized correctly vs tight range" },

  { id:95, heroPos:"BB", villainPos:"BTN", street:"river",
    board:[{rank:"T",suit:"h"},{rank:"T",suit:"s"},{rank:"6",suit:"d"},{rank:"5",suit:"c"},{rank:"2",suit:"h"}],
    heroCards:[{rank:"T",suit:"d"},{rank:"7",suit:"h"}],
    archetype:"loose_passive", potSize:32, stackBB:55,
    correctAction:"Bet 50%", tag:"Trips River OOP vs LP", diff:"Intermediate",
    desc:"T7 with trips on TT652 - bet OOP, LP calls too wide, medium sizing extracts value" },

  { id:96, heroPos:"BTN", villainPos:"BB", street:"river",
    board:[{rank:"8",suit:"d"},{rank:"7",suit:"s"},{rank:"6",suit:"h"},{rank:"5",suit:"c"},{rank:"J",suit:"d"}],
    heroCards:[{rank:"9",suit:"h"},{rank:"4",suit:"h"}],
    archetype:"lag", potSize:38, stackBB:45,
    correctAction:"Bet 75%", tag:"Straight River vs LAG", diff:"Advanced",
    desc:"94 flopping open-ender, river straight - overbet vs LAG who semi-bluffs wide" },

  { id:97, heroPos:"CO", villainPos:"BTN", street:"river",
    board:[{rank:"A",suit:"h"},{rank:"A",suit:"d"},{rank:"Q",suit:"s"},{rank:"3",suit:"c"},{rank:"3",suit:"h"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"Q",suit:"d"}],
    archetype:"tag", potSize:29, stackBB:65,
    correctAction:"Bet 33%", tag:"Full House on Paired Board vs TAG", diff:"Advanced",
    desc:"QQQ full house on AAQ33 board - thin value only vs TAG, they fold Ax if you overbet" },

  // -- MIXED / EDGE CASES (ids 98-100) -------------------------------------
  { id:98, heroPos:"BTN", villainPos:"BB", street:"flop",
    board:[{rank:"2",suit:"s"},{rank:"2",suit:"h"},{rank:"7",suit:"d"}],
    heroCards:[{rank:"A",suit:"s"},{rank:"A",suit:"h"}],
    archetype:"maniac", potSize:10, stackBB:100,
    correctAction:"Bet 33%", tag:"Aces on Paired Low Board vs Maniac", diff:"Intermediate",
    desc:"AA on 227 - bet small vs maniac to keep their bluffs in, they raise air frequently" },

  { id:99, heroPos:"SB", villainPos:"BB", street:"preflop",
    board:[], heroCards:[{rank:"K",suit:"h"},{rank:"J",suit:"h"}],
    archetype:"rec", potSize:3, stackBB:100,
    correctAction:"Open Raise", tag:"KJh SB vs Rec BB", diff:"Beginner",
    desc:"KJh in SB - open raise vs rec, suited broadway plays well postflop in position" },

  { id:100, heroPos:"BTN", villainPos:"BB", street:"turn",
    board:[{rank:"Q",suit:"s"},{rank:"Q",suit:"c"},{rank:"5",suit:"h"},{rank:"A",suit:"d"}],
    heroCards:[{rank:"Q",suit:"h"},{rank:"Q",suit:"d"}],
    archetype:"station", potSize:24, stackBB:100,
    correctAction:"Bet 50%", tag:"Quads Turn vs Station", diff:"Advanced",
    desc:"QQQQ on QQ5A - bet for value, station calls with Ax and worse, quads need no protection" },
];

function generateDrills(gameSize, count) {
  // Date-seeded deterministic shuffle across all 100 templates
  const seed = new Date().toDateString().split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const shuffled = [...DRILL_TEMPLATES].sort((a,b) => {
    const ha = (seed * 1664525 + a.id * 1013904223) & 0x7fffffff;
    const hb = (seed * 1664525 + b.id * 1013904223) & 0x7fffffff;
    return ha - hb;
  });
  return shuffled.slice(0, count||5).map((d,i) => ({ ...d, id:i+1, gameSize }));
}

function evaluateDrillAnswer(userAction, drill) {
  const correct = drill.correctAction.toLowerCase();
  const user    = userAction.toLowerCase();
  if (user === correct) return true;
  if (correct.includes("bet") && user.includes("bet")) {
    const cp = parseInt(correct)||0, up = parseInt(user)||0;
    return Math.abs(cp-up) <= 17;
  }
  return correct.includes(user.split(" ")[0]);
}

function getDrillExplanation(drill, isCorrect) {
  const pop = buildPopulationProfile(
    drill.gameSize ? drill.gameSize.bb : 3,
    drill.archetype, drill.board, drill.street, []
  );
  const rec = recommend({
    heroCards: drill.heroCards, archetype: drill.archetype,
    heroIsIP: getPositionStatus(drill.heroPos, drill.villainPos),
    board: drill.board, potSize: drill.potSize, stackBB: drill.stackBB,
  });
  const tex = analyzeBoard(drill.board);
  return {
    reasoning: (rec.bullets||[]).slice(0,2),
    populationInsight: pop.insights ? pop.insights[0] : null,
    exploitEdge: rec.score,
    boardTexture: tex ? tex.label : null,
    decisionType: rec.tag,
    implication: isCorrect
      ? "Correct line maximizes EV against this opponent profile."
      : "The optimal line was "+drill.correctAction+" - "+(rec.bullets?rec.bullets[0]:""),
  };
}

function PracticeScreen({ onBack, initialGameSize }) {
  const [gameSize, setGameSize]  = useState(initialGameSize || GAME_SIZES[1]);
  const [drills, setDrills]      = useState(() => generateDrills(initialGameSize||GAME_SIZES[1], 5));
  const [phase, setPhase]       = useState("dashboard");
  const [activeDrill, setActiveDrill]   = useState(null);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [results, setResults]           = useState([]);
  const [explanation, setExplanation]   = useState(null);
  const [streak, setStreak]             = useState(0);
  const evDefinedRef = React.useRef(false);

  const gs = gameSize;
  const bb = gs.bb || 3;
  const completed = results.length;
  const correct   = results.filter(r=>r.isCorrect).length;
  const pct       = completed>0 ? Math.round((correct/completed)*100) : 0;
  const isLast    = activeIdx >= drills.length-1;

  // Helper: bb to dollars
  function bbToD(v) { return "$"+Math.round(v*bb); }

  // Helper: get legal actions for a drill spot
  function getLegalActions(drill) {
    const isPreflop = drill.street === "preflop";
    const heroIP = getPositionStatus(drill.heroPos, drill.villainPos);
    // Determine if hero faces a bet (simplified: drills assume villain checked or hero acts first)
    // For drills, we infer from the correct action
    const correctLower = drill.correctAction.toLowerCase();
    const facingBet = correctLower.includes("call") || correctLower.includes("fold") || correctLower.includes("raise");
    const checkedTo = !facingBet;

    if (isPreflop) {
      return [
        { label:"Open Raise", action:"Open Raise" },
        { label:"Call", action:"Call" },
        { label:"Fold", action:"Fold" },
      ];
    }
    if (checkedTo) {
      // Hero can bet or check
      const pot = drill.potSize;
      return [
        { label:"Check", action:"Check" },
        { label:"Bet "+bbToD(pot*0.33)+" (33%)", action:"Bet 33%" },
        { label:"Bet "+bbToD(pot*0.50)+" (50%)", action:"Bet 50%" },
        { label:"Bet "+bbToD(pot*0.75)+" (75%)", action:"Bet 75%" },
      ];
    }
    // Facing a bet
    return [
      { label:"Fold", action:"Fold" },
      { label:"Call", action:"Call" },
      { label:"Raise", action:"Raise" },
    ];
  }

  function fmtEV(text) {
    if (!text || !text.includes("EV")) return text;
    if (!evDefinedRef.current) {
      evDefinedRef.current = true;
      let out = text;
      out = out.replace(/\+EV(?=\b|\s|$|[^a-zA-Z])/g, "+expected value (EV)");
      out = out.replace(/-EV(?=\b|\s|$|[^a-zA-Z])/g, "-expected value (EV)");
      out = out.replace(/high-EV(?=\b|\s|$|[^a-zA-Z])/g, "high expected value (EV)");
      out = out.replace(/(?<![a-zA-Z(])EV(?![a-zA-Z)])/g, "expected value (EV)");
      return out;
    }
    return text;
  }

  function startDrill(drill, idx) {
    setActiveDrill(drill); setActiveIdx(idx);
    setExplanation(null); setPhase("decision");
  }

  function submitAnswer(action) {
    const isCorrect = evaluateDrillAnswer(action, activeDrill);
    const exp = getDrillExplanation(activeDrill, isCorrect);
    setExplanation({ ...exp, isCorrect, userAction:action });
    setResults(prev=>[...prev,{ drillId:activeDrill.id, isCorrect, userAction:action }]);
    setStreak(prev => isCorrect ? prev+1 : 0);
    setPhase("reveal");
  }

  function goNext() {
    if (isLast) setPhase("progress");
    else startDrill(drills[activeIdx+1], activeIdx+1);
  }

  const p = activeDrill ? ARCHETYPES[activeDrill.archetype] : null;
  const diffCol = { Beginner:C.green, Intermediate:C.amber, Advanced:C.red };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter',sans-serif", color:C.text }}>
      <style>{BASE_CSS}</style>

      {/* Header */}
      <div style={{ borderBottom:"1px solid "+C.border, padding:"0 20px" }}>
        <div style={{ maxWidth:760, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Btn variant="ghost" onClick={()=>{
              if (phase==="dashboard") onBack();
              else setPhase("dashboard");
            }} style={{ padding:"4px 8px" }}>&#8592; {phase==="dashboard"?"Home":"Drills"}</Btn>
            <div style={{ width:1, height:24, background:C.border }}/>
            <span style={{ fontSize:16, fontWeight:700, color:C.text }}>Daily Drills</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* Game size selector */}
            {phase==="dashboard"&&(
              <div style={{ display:"flex", gap:3 }}>
                {GAME_SIZES.map(g=>(
                  <button key={g.label} onClick={()=>{
                    setGameSize(g);
                    setDrills(generateDrills(g, 5));
                    setResults([]); setActiveIdx(0); setActiveDrill(null); setStreak(0);
                  }} style={{
                    padding:"3px 8px", borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer",
                    background:gs.label===g.label?C.gold+"22":"transparent",
                    border:"1px solid "+(gs.label===g.label?C.gold:C.border),
                    color:gs.label===g.label?C.gold:C.disabled,
                  }}>{g.label}</button>
                ))}
              </div>
            )}
            {completed>0&&(
              <>
                <span style={{ fontSize:12, color:C.muted }}>{completed}/{drills.length}</span>
                <div style={{ width:80, height:5, background:C.surface, borderRadius:99 }}>
                  <div style={{ height:"100%", borderRadius:99, background:pct>=70?C.green:pct>=40?C.amber:C.red, width:(completed/drills.length*100)+"%", transition:"width 0.3s" }}/>
                </div>
                <span style={{ fontWeight:700, color:pct>=70?C.green:pct>=40?C.amber:C.red, fontSize:12 }}>{pct}%</span>
              </>
            )}
            {streak>=2&&(
              <span style={{ padding:"2px 10px", borderRadius:99, background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)", color:C.green, fontSize:11, fontWeight:700 }}>
                {streak} streak
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:760, margin:"0 auto", padding:"24px 16px" }}>

        {/* DASHBOARD */}
        {phase==="dashboard"&&(
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:4 }}>Today&#39;s Drills</div>
              <div style={{ fontSize:13, color:C.muted }}>{drills.length} spots across difficulty levels - calibrated for {gs.label} stakes</div>
            </div>

            {/* Start Session CTA */}
            {completed===0&&(
              <Btn variant="primary" onClick={()=>startDrill(drills[0],0)} style={{ width:"100%", padding:"14px", fontSize:15, fontWeight:700, marginBottom:16, borderRadius:10 }}>
                Start Session &#8594;
              </Btn>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
              {drills.map((drill,i) => {
                const res = results.find(r=>r.drillId===drill.id);
                const arch = ARCHETYPES[drill.archetype]||{};
                const dCol = diffCol[drill.diff]||C.amber;
                const tex = analyzeBoard(drill.board);
                const spr = drill.potSize>0 ? Math.round(drill.stackBB/drill.potSize*10)/10 : 15;
                return (
                  <div key={drill.id} onClick={()=>startDrill(drill,i)} style={{
                    background:C.card, border:"1px solid "+C.border, borderRadius:10,
                    padding:"14px 16px", cursor:"pointer", transition:"all 0.15s", position:"relative",
                    borderLeft:"3px solid "+dCol+"66",
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold+"44";e.currentTarget.style.borderLeftColor=dCol;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.borderLeftColor=dCol+"66";}}>
                    {res&&(
                      <div style={{ position:"absolute", top:12, right:12, width:22, height:22, borderRadius:"50%",
                        background:res.isCorrect?"rgba(16,185,129,0.9)":"rgba(239,68,68,0.9)",
                        display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff" }}>
                        {res.isCorrect?"v":"x"}
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
                        <span style={{ width:22, height:22, borderRadius:"50%", background:C.surface, border:"1px solid "+C.border,
                          color:C.muted, fontSize:11, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {i+1}
                        </span>
                        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{drill.desc}</span>
                      </div>
                      <Tag color={dCol}>{drill.diff}</Tag>
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                      {drill.heroCards.map((c,ci)=><CardToken key={ci} card={c} size={32}/>)}
                      <span style={{ color:"rgba(255,255,255,0.15)", margin:"0 2px", fontSize:12 }}>|</span>
                      {drill.board.map((c,ci)=><CardToken key={ci} card={c} size={32}/>)}
                      <span style={{ padding:"2px 8px", borderRadius:99, background:arch.color+"22", color:arch.color, fontSize:10, fontWeight:600 }}>
                        vs {arch.label}
                      </span>
                      {tex&&<span style={{ padding:"2px 7px", borderRadius:99, background:tex.col+"18", color:tex.col, fontSize:10, fontWeight:600 }}>{tex.label}</span>}
                      <span style={{ fontSize:10, color:C.disabled }}>{bbToD(drill.potSize)} pot</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {completed===drills.length&&(
              <Btn variant="primary" onClick={()=>setPhase("progress")} style={{ width:"100%", padding:"13px", fontSize:14, fontWeight:700 }}>
                See Final Results
              </Btn>
            )}
          </div>
        )}

        {/* DECISION */}
        {phase==="decision"&&activeDrill&&(
          <div style={{ animation:"fadeUp 0.2s ease" }}>
            {/* Progress */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ flex:1, height:4, background:C.surface, borderRadius:99 }}>
                <div style={{ height:"100%", borderRadius:99, background:C.purple, width:((activeIdx+1)/drills.length*100)+"%", transition:"width 0.3s" }}/>
              </div>
              <span style={{ fontSize:11, color:C.muted, flexShrink:0 }}>{activeIdx+1} / {drills.length}</span>
            </div>

            {/* Spot Card - enriched with dollar amounts, texture, SPR, villain action */}
            {(()=>{
              const tex = analyzeBoard(activeDrill.board);
              const spr = activeDrill.potSize > 0 ? Math.round(activeDrill.stackBB/activeDrill.potSize*10)/10 : 15;
              const heroIP = getPositionStatus(activeDrill.heroPos, activeDrill.villainPos);
              const correctLower = activeDrill.correctAction.toLowerCase();
              const vilChecked = !correctLower.includes("call") && !correctLower.includes("raise") && !correctLower.includes("fold");
              const vilAction = vilChecked ? "Villain checks to you" : "Villain bets";

              return (
                <Card style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }}>
                        {activeDrill.street.toUpperCase()} - {activeDrill.heroPos} vs {activeDrill.villainPos}
                        <span style={{ marginLeft:8, color:heroIP?C.green:C.red, fontWeight:600 }}>{heroIP?"IP":"OOP"}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{activeDrill.desc}</div>
                    </div>
                    <Tag color={diffCol[activeDrill.diff]}>{activeDrill.diff}</Tag>
                  </div>

                  {/* Cards */}
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
                    <span style={{ fontSize:10, color:C.muted }}>Hero</span>
                    {activeDrill.heroCards.map((c,i)=><CardToken key={i} card={c} size={42}/>)}
                    {activeDrill.board.length>0&&(
                      <>
                        <span style={{ color:"rgba(255,255,255,0.15)", margin:"0 4px", fontSize:18 }}>|</span>
                        <span style={{ fontSize:10, color:C.muted }}>Board</span>
                        {activeDrill.board.map((c,i)=><CardToken key={i} card={c} size={42}/>)}
                      </>
                    )}
                  </div>

                  {/* Context row: pot, stack, texture, villain, archetype */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", fontSize:11 }}>
                    <span style={{ color:C.muted }}>Pot: <span style={{ color:C.gold, fontWeight:700 }}>{bbToD(activeDrill.potSize)}</span></span>
                    <span style={{ color:C.muted }}>Stack: <span style={{ color:C.gold, fontWeight:700 }}>{bbToD(activeDrill.stackBB)}</span></span>
                    {tex&&<span style={{ padding:"2px 8px", borderRadius:99, background:tex.col+"18", border:"1px solid "+tex.col+"33", color:tex.col, fontSize:10, fontWeight:600 }}>
                      {tex.label} board{tex.wet>=3?" - many draws possible":tex.wet<=1?" - few draws":" - some draws"}
                    </span>}
                    <span style={{ padding:"2px 8px", borderRadius:99, background:p.color+"22", color:p.color, fontSize:10, fontWeight:600 }}>vs {p.label}</span>
                  </div>
                  {/* Stack depth context - plain English explanation */}
                  <div style={{ marginTop:6, padding:"5px 10px", borderRadius:5, fontSize:11, lineHeight:1.5,
                    background:spr<=3?"rgba(239,68,68,0.06)":spr<=8?"rgba(245,158,11,0.06)":"rgba(16,185,129,0.06)",
                    border:"1px solid "+(spr<=3?"rgba(239,68,68,0.15)":spr<=8?"rgba(245,158,11,0.15)":"rgba(16,185,129,0.15)"),
                    color:spr<=3?C.red:spr<=8?C.amber:C.green }}>
                    {spr<=3
                      ? "Stack is only "+spr+"x the pot - you are essentially committed. Strong hands should be willing to go all-in."
                      : spr<=8
                        ? "Stack is "+spr+"x the pot - medium depth. One or two bets can commit your stack, so choose your spots carefully."
                        : "Stack is "+spr+"x the pot - deep stacked. You have room to maneuver across multiple streets without committing."}
                  </div>

                  {/* Villain action context - prominent gold styling */}
                  {activeDrill.street!=="preflop"&&(
                    <div style={{ marginTop:8, padding:"7px 12px", borderRadius:6, background:"rgba(230,197,102,0.08)", border:"1px solid rgba(230,197,102,0.25)", fontSize:12, color:C.gold, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:14 }}>&#9654;</span>
                      {vilAction}
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* Action prompt + buttons */}
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:10, textAlign:"center" }}>What do you do?</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
              {getLegalActions(activeDrill).map(a => {
                const aColors={Fold:C.red,Check:C.amber,Call:C.blue,Raise:C.orange,"Open Raise":C.purple};
                const col = aColors[a.action.split(" ")[0]] || C.green;
                return (
                  <button key={a.action} onClick={()=>submitAnswer(a.action)} style={{
                    padding:"14px 12px", borderRadius:8, border:"1px solid "+col+"33",
                    background:"rgba(255,255,255,0.04)", color:C.text, cursor:"pointer",
                    fontSize:14, fontWeight:700, transition:"all 0.12s", minHeight:50,
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background=col+"18";e.currentTarget.style.borderColor=col+"77";e.currentTarget.style.color=col;}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor=col+"33";e.currentTarget.style.color=C.text;}}>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* REVEAL */}
        {phase==="reveal"&&activeDrill&&explanation&&(
          <div style={{ animation:"fadeUp 0.2s ease" }}>
            <div style={{
              textAlign:"center", padding:"18px", borderRadius:10, marginBottom:14,
              background:explanation.isCorrect?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
              border:"1px solid "+(explanation.isCorrect?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"),
            }}>
              <div style={{ fontSize:28, fontWeight:900, color:explanation.isCorrect?C.green:C.red, marginBottom:4 }}>
                {explanation.isCorrect?"Correct":"Suboptimal"}
              </div>
              {streak>=2&&explanation.isCorrect&&(
                <div style={{ fontSize:12, color:C.green, marginBottom:4 }}>{streak} in a row!</div>
              )}
              <div style={{ display:"flex", gap:16, justifyContent:"center", fontSize:13, flexWrap:"wrap" }}>
                <span style={{ color:C.muted }}>Your choice: <span style={{ color:C.text, fontWeight:700 }}>{explanation.userAction}</span></span>
                <span style={{ color:C.muted }}>Optimal: <span style={{ color:C.gold, fontWeight:700 }}>{activeDrill.correctAction}</span></span>
              </div>
            </div>
            <Card style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Why This Works</div>
              {explanation.reasoning.map((b,i)=>(
                <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:6 }}>
                  <span style={{ color:C.green, fontSize:8, marginTop:4, flexShrink:0 }}>&#9679;</span>
                  <span style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{fmtEV(b)}</span>
                </div>
              ))}
              {explanation.populationInsight&&(
                <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid "+C.border, display:"flex", gap:7, alignItems:"flex-start" }}>
                  <span style={{ color:C.purple, fontSize:8, marginTop:4, flexShrink:0 }}>&#9679;</span>
                  <span style={{ fontSize:12, color:C.muted, lineHeight:1.5, fontStyle:"italic" }}>{fmtEV(explanation.populationInsight)}</span>
                </div>
              )}
            </Card>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="ghost" onClick={()=>setPhase("dashboard")} style={{ fontSize:12, padding:"10px 16px" }}>Back to List</Btn>
              <Btn variant="primary" onClick={goNext} style={{ flex:1, fontSize:14, fontWeight:700, padding:"12px" }}>
                {isLast?"See Results":"Next Drill \u2192"}
              </Btn>
            </div>
          </div>
        )}

        {/* PROGRESS */}
        {phase==="progress"&&(
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Session Complete</div>
              <div style={{ fontSize:64, fontWeight:900, color:pct>=70?C.green:pct>=40?C.amber:C.red, lineHeight:1, marginBottom:4 }}>{pct}<span style={{ fontSize:24, opacity:0.6 }}>%</span></div>
              <div style={{ fontSize:15, color:C.muted, marginBottom:8 }}>{correct} / {completed} correct at {gs.label} stakes</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.6, maxWidth:340, margin:"0 auto" }}>
                {pct>=80?"Excellent session. Exploit reads are sharp."
                  :pct>=60?"Solid work. Focus on sizing and timing."
                  :"Review the optimal lines - population profiles are key."}
              </div>
            </div>

            {(()=>{
              const drillResults = results.map((r,i)=>({ ...r, drill: drills.find(d=>d.id===r.drillId)||drills[i] }));
              const misses = drillResults.filter(r=>!r.isCorrect);
              const weakest = misses.length > 0 ? misses[0] : null;
              const byDiff = { Beginner:{c:0,t:0}, Intermediate:{c:0,t:0}, Advanced:{c:0,t:0} };
              drillResults.forEach(r => {
                const diff = r.drill?.diff || "Intermediate";
                if (byDiff[diff]) { byDiff[diff].t++; if (r.isCorrect) byDiff[diff].c++; }
              });
              const byStreet = {};
              drillResults.forEach(r => {
                const st = r.drill?.street || "flop";
                if (!byStreet[st]) byStreet[st] = {c:0,t:0};
                byStreet[st].t++; if (r.isCorrect) byStreet[st].c++;
              });
              const worstStreet = Object.entries(byStreet)
                .filter(([,v])=>v.t>0)
                .sort((a,b)=>(a[1].c/a[1].t)-(b[1].c/b[1].t))[0];

              return (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                    {Object.entries(byDiff).map(([diff,{c,t}])=>(
                      <div key={diff} style={{ background:C.surface, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{diff}</div>
                        <div style={{ fontSize:18, fontWeight:700, color:t===0?C.disabled:c===t?C.green:c===0?C.red:C.amber }}>
                          {t===0?"--":c+"/"+t}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(worstStreet || weakest) && (
                    <div style={{ padding:"12px 14px", borderRadius:8, marginBottom:16,
                      background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.2)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.red, marginBottom:6 }}>Focus Area</div>
                      {worstStreet && worstStreet[1].c < worstStreet[1].t && (
                        <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>
                          <span style={{ color:C.text, fontWeight:600 }}>{worstStreet[0].charAt(0).toUpperCase()+worstStreet[0].slice(1)}</span>
                          {"  -  "}{worstStreet[1].c}/{worstStreet[1].t} correct. Review postflop exploitation on this street.
                        </div>
                      )}
                      {weakest && weakest.drill && (
                        <div style={{ fontSize:12, color:C.muted }}>
                          Missed: <span style={{ color:C.text }}>{weakest.drill.tag}</span>
                          {"  -  "}optimal was <span style={{ color:C.gold }}>{weakest.drill.correctAction}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Card style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Drill Results</div>
                    {drillResults.map((r,i) => (
                      <div key={i} style={{
                        display:"flex", justifyContent:"space-between", alignItems:"center",
                        padding:"8px 10px", borderRadius:7, marginBottom:6,
                        background:r.isCorrect?"rgba(16,185,129,0.07)":"rgba(239,68,68,0.06)",
                        border:"1px solid "+(r.isCorrect?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.18)"),
                      }}>
                        <div>
                          <span style={{ fontSize:10, color:C.disabled, textTransform:"uppercase", marginRight:8 }}>#{i+1}</span>
                          <span style={{ fontSize:12, color:C.text }}>{r.userAction}</span>
                          {!r.isCorrect&&r.drill&&<span style={{ fontSize:11, color:C.disabled }}> (opt: {r.drill.correctAction})</span>}
                          {r.drill&&<span style={{ fontSize:10, color:C.disabled, marginLeft:8 }}>{r.drill.street} / {r.drill.diff}</span>}
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:r.isCorrect?C.green:C.red }}>{r.isCorrect?"Correct":"Miss"}</span>
                      </div>
                    ))}
                  </Card>

                  <div style={{ display:"flex", gap:8 }}>
                    <Btn variant="secondary" onClick={()=>setPhase("dashboard")} style={{ fontSize:13, flex:1 }}>Review Drills</Btn>
                    <Btn variant="primary" onClick={onBack} style={{ fontSize:13, fontWeight:700, flex:1 }}>Back to Home</Btn>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}


// ================================================================
// MAIN APP
// ================================================================
export default function RangeIQ() {
  const [screen,setScreen]             = useState("home");
  const [heroCards,setHeroCards]       = useState([null,null]);
  const [heroPos,setHeroPos]           = useState("BTN");
  const [villainPos,setVillainPos]     = useState("BB");
  const [archetype,setArchetype]       = useState("unknown");
  // Assumptions Panel state
  const [isMultiway,setIsMultiway]         = useState(false);
  const [heroLastToAct,setHeroLastToAct]   = useState(null);
  const [villainStackBB,setVillainStackBB] = useState(100);
  const [heroStackCustom,setHeroStackCustom]     = useState(false);
  const [villainStackCustom,setVillainStackCustom] = useState(false);
  const [isInitialized,setIsInitialized] = useState(false);
  const [compareMode,setCompareMode]   = useState(false);
  const [compareB,setCompareB]         = useState("nit");
  const [slidersOpen,setSlidersOpen]   = useState(false);
  const [oppExpanded,setOppExpanded]   = useState(false);
  const [sizeOpen,setSizeOpen]         = useState(false);
  const [stackOpen,setStackOpen]       = useState(false);
  const [tableSettingsOpen,setTableSettingsOpen] = useState(false);
  const [gameSize,setGameSize]         = useState(GAME_SIZES[1]); // default $1/$3
  const [stackBB,setStackBB]           = useState(100);
  const [potSize,setPotSize]           = useState(Math.round((GAME_SIZES[1].totalBlinds / GAME_SIZES[1].bb) * 100) / 100); // $4 / $3 = 1.33bb
  const [board,setBoard]               = useState([]);
  const [street,setStreet]             = useState("preflop");
  const [tableType,setTableType]       = useState("standard");
  const [preflopSituation,setPreflopSituation] = useState("unopened");
  const [playersLeft,setPlayersLeft]   = useState("1");
  const [fieldStickiness,setFieldStickiness]   = useState("medium");
  const [vilAction,setVilAction]       = useState([]);
  const [vilBetAmount,setVilBetAmount] = useState("");  // Villain bet/raise $ amount
  // Validated villain bet setter: enforces minimum of 1 big blind
  const setVilBetValidated = useCallback((val) => {
    if (val === "" || val === null || val === undefined) { setVilBetAmount(""); return ""; }
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) { setVilBetAmount(""); return ""; }
    const minBet = gameSize ? gameSize.bb : 1;
    const clamped = Math.max(num, minBet);
    const final = String(clamped);
    setVilBetAmount(final);
    return final;
  }, [gameSize]);
  const [sliders,setSliders]           = useState(null);
  const [picker,setPicker]             = useState(null);
  const [kbInput,setKbInput]           = useState("");
  const [kbPartial,setKbPartial]       = useState(null);
  const [kbError,setKbError]           = useState(null);
  const [rec,setRec]                   = useState(null);
  const [range,setRange]               = useState(null);
  const [snapshots,setSnapshots]       = useState([]);
  const [cats,setCats]                 = useState(null);
  const [loading,setLoading]           = useState(false);
  const [hasRun,setHasRun]             = useState(false);
  // Production spec: per-street decision store + showdown
  const [decisions,setDecisions]       = useState({ preflop:null, flop:null, turn:null, river:null });
  const [showdown,setShowdown]         = useState(null);  // { villainAction, villainHand, outcome }
  const [showShowdown,setShowShowdown] = useState(false);
  const [vault,setVault]               = useState([]);
  // Persistent storage: load vault on mount, sync on every change (localStorage)
  const vaultLoadedRef = React.useRef(false);
  React.useEffect(() => {
    // Load vault from localStorage on first mount
    if (vaultLoadedRef.current) return;
    vaultLoadedRef.current = true;
    try {
      const raw = localStorage.getItem("rangeiq:vault");
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > 0) setVault(saved);
      }
    } catch(e) { /* corrupt storage, start fresh */ }
  }, []);
  React.useEffect(() => {
    // Sync vault to localStorage whenever it changes (after initial load)
    if (!vaultLoadedRef.current) return;
    try {
      localStorage.setItem("rangeiq:vault", JSON.stringify(vault));
    } catch(e) { /* storage full or unavailable */ }
  }, [vault]);
  const [history,setHistory]           = useState([]);
  const [toast,setToast]               = useState(null);
  const [saveState,setSaveState]       = useState("default");
  const [showConfirm,setShowConfirm]   = useState(false);
  const [showHistory,setShowHistory]   = useState(false);
  const [hoveredHand,setHoveredHand]   = useState(null);
  const [showPlaySpot,setShowPlaySpot] = useState(false);
  const [showAnalysis,setShowAnalysis]   = useState(false);
  const [drawerOpen,  setDrawerOpen]     = useState(false);
  const [rightTab,    setRightTab]       = useState("storyline");
  const histRef = useRef(null);
  const autoTimer = useRef(null);
  const pendingAnalysis = useRef(false);
  // Feedback system state
  const [showFeedback,setShowFeedback]   = useState(false);
  const [feedbackText,setFeedbackText]   = useState("");
  const [feedbackEmail,setFeedbackEmail] = useState("");
  const [feedbackSent,setFeedbackSent]   = useState(false);

  // Derive IP/OOP automatically from positions (no manual toggle)
  const heroIsIP = getPositionStatus(heroPos, villainPos);
  const samePosition = heroPos === villainPos;

  useEffect(()=>{
    const p=ARCHETYPES[archetype]||ARCHETYPES.unknown;
    setSliders({vpip:p.vpip,aggression:p.aggression,foldFlop:p.foldFlop,foldTurn:p.foldTurn,bluffFreq:p.bluffFreq});
  },[archetype]);

  // Auto-recompute stacks when gameSize changes (if not custom)
  useEffect(()=>{
    if (!heroStackCustom)   setStackBB(100);
    if (!villainStackCustom) setVillainStackBB(100);
  },[gameSize]);

  useEffect(()=>{
    function h(e){ if(histRef.current&&!histRef.current.contains(e.target)) setShowHistory(false); }
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Auto-update when inputs change (300ms debounce)  -  only after first run
  useEffect(()=>{
    if (!hasRun||!heroCards[0]||!heroCards[1]) return;
    clearTimeout(autoTimer.current);
    autoTimer.current=setTimeout(()=>{ runAnalysis(); },300);
    return()=>clearTimeout(autoTimer.current);
  },[archetype,sliders,heroPos,villainPos,stackBB,potSize,street,board,vilAction,heroCards,gameSize,tableType,preflopSituation,playersLeft,fieldStickiness,isMultiway,heroLastToAct,villainStackBB,vilBetAmount]);

  // Pending analysis: fires after React flushes setRec(null) from button clicks
  useEffect(()=>{
    if (pendingAnalysis.current && !rec && heroCards[0] && heroCards[1]) {
      pendingAnalysis.current = false;
      runAnalysis();
    }
  });

  const usedKeys=[...heroCards.filter(Boolean).map(c=>c.rank+c.suit),...board.map(c=>c.rank+c.suit)];
  const p=ARCHETYPES[archetype]||ARCHETYPES.unknown;
  const sl=sliders||{vpip:p.vpip,aggression:p.aggression,foldFlop:p.foldFlop,foldTurn:p.foldTurn,bluffFreq:p.bluffFreq};

  function runAnalysis() {
    if (!heroCards[0]||!heroCards[1]) return;
    setIsInitialized(true);
    try {
      let r=buildRange(archetype);
      // Proper combo count: pairs=6, suited=4, offsuit=12, weighted by frequency
      const countCombos = (rng, threshold) => {
        let total = 0;
        Object.entries(rng).forEach(([hand, w]) => {
          if (w < threshold) return;
          const isPair = hand.length === 2 || (hand.length === 3 && hand[0] === hand[1]);
          const isSuited = hand.endsWith("s");
          const isOffsuit = hand.endsWith("o");
          const baseCombos = isPair ? 6 : isSuited ? 4 : isOffsuit ? 12 : 6;
          total += Math.round(baseCombos * w);
        });
        return total;
      };
      const countHandsInRange = (rng, threshold) => {
        return Object.values(rng).filter(v => v >= threshold).length;
      };
      const RANGE_THRESHOLD = 0.1;
      const snaps=[{label:"Preflop",range:{...r},pct:Math.round(countHandsInRange(r, RANGE_THRESHOLD)/169*100),combos:countCombos(r, RANGE_THRESHOLD)}];
      vilAction.forEach(a=>{
        r=compressRange(r,a.type,archetype);
        const sl2=a.street.charAt(0).toUpperCase()+a.street.slice(1);
        if (!snaps.find(x=>x.label===sl2)) snaps.push({label:sl2,range:{...r},pct:Math.round(countHandsInRange(r, RANGE_THRESHOLD)/169*100),combos:countCombos(r, RANGE_THRESHOLD)});
      });
      // -- Phase 1: DSE  -  Build and validate game state -------------
      const dseState = buildDSEState({
        heroCards, heroPos, villainPos, board, street,
        vilAction, potSize, stackBB, heroIsIP,
        isMultiway, heroLastToAct, archetype, preflopSituation,
        heroHasActedPreflop: !!(decisions && decisions.preflop),
        heroStreetDecision: decisions && decisions[street],
      });
      const dseReadiness = dseReadinessCheck(dseState);

      // Block recommendation if DSE says state is incomplete
      if (!dseReadiness.is_ready) {
        // Distinguish: preflop closed (normal transition) vs missing data (error)
        const isClosedPreflop = dseReadiness.preflop_closed;
        const blockedResult = {
          action: null, sizing: null, bullets: [], tag: null, score: 0,
          _invalid: !isClosedPreflop,          // closure is NOT an error
          _preflop_closed: isClosedPreflop,
          _villain_folded: dseReadiness.villain_folded,
          _guidance: dseReadiness.guidance,
          _next_street: dseReadiness.next_street,
          _closure_reason: dseReadiness.closure_reason,
          _errors: isClosedPreflop ? [] : dseReadiness.errors,
          _flags: dseReadiness.flags,
          str: street,
        };
        setRec(blockedResult); setRange(r); setSnapshots(snaps); setCats(catRange(r));
        setSaveState("default"); setLoading(false); setHasRun(true);
        return;
      }

      // -- Gate: If Hero is IP and villain hasn't acted, wait --
      const vilPreflopActs = (vilAction||[]).filter(a=>a.street==="preflop" && a.actor==="Villain");
      const vilPostflopActs = (vilAction||[]).filter(a=>a.street===street && a.actor==="Villain");
      const heroIPWaitingPreflop = street==="preflop" && heroIsIP && vilPreflopActs.length===0;
      const heroIPWaitingPostflop = street!=="preflop" && heroIsIP && vilPostflopActs.length===0 && !(decisions && decisions[street]);
      // Also wait if villain bet/raised but no amount entered yet
      const lastVilPostflop = vilPostflopActs.length>0 ? vilPostflopActs[vilPostflopActs.length-1] : null;
      const vilBetNoAmount = lastVilPostflop && (lastVilPostflop.type==="bet"||lastVilPostflop.type==="raise") && !lastVilPostflop.amount;
      const lastVilPreflop = vilPreflopActs.length>0 ? vilPreflopActs[vilPreflopActs.length-1] : null;
      const vilPFBetNoAmount = lastVilPreflop && (lastVilPreflop.type==="bet"||lastVilPreflop.type==="raise") && !lastVilPreflop.amount;

      if (heroIPWaitingPreflop || heroIPWaitingPostflop || vilBetNoAmount || vilPFBetNoAmount) {
        const waitMsg = (vilBetNoAmount || vilPFBetNoAmount)
          ? "Enter Villain's bet amount to see your recommendation."
          : "Select Villain's action above (Fold, Call, or Raise) to see your recommendation.";
        const waitResult = {
          action: null, sizing: null, bullets: [], tag: null, score: 0,
          _invalid: false, _preflop_closed: false, _waiting_for_villain: true,
          _wait_message: waitMsg,
          str: street,
        };
        setRec(waitResult); setRange(r); setSnapshots(snaps); setCats(catRange(r));
        setSaveState("default"); setLoading(false); setHasRun(true);
        return;

      // -- Gate: BB in multiway pot - wait for opponent action indication --
      } else if (street === "preflop" && !heroIsIP && (heroPos === "BB" || heroPos === "bb") && parseInt(playersLeft) >= 2 && vilPreflopActs.length === 0) {
        const waitResult = {
          action: null, sizing: null, bullets: [], tag: null, score: 0,
          _invalid: false, _preflop_closed: false, _waiting_for_villain: true,
          _wait_message: "Select what opponents did above (All Limped, Raised, or All Fold).",
          str: street,
        };
        setRec(waitResult); setRange(r); setSnapshots(snaps); setCats(catRange(r));
        setSaveState("default"); setLoading(false); setHasRun(true);
        return;
      }

      // -- Phase 2: Raw recommendation from archetype engines --------
      const rawResult = street==="preflop"
        ? recommendPreflop({ heroCards, heroPos, bigBlind:gameSize.bb, tableType, preflopSituation, playersLeft, fieldStickiness, archetype, heroIsIP, isMultiway, heroLastToAct, heroHasActedPreflop: !!(decisions && decisions.preflop), vilAction })
        : recommend({heroCards,archetype,heroIsIP,board,potSize,stackBB:isMultiway&&heroLastToAct!==null?Math.min(stackBB,villainStackBB):stackBB,bigBlind:gameSize.bb,vilAction,playersLeft,isMultiway});

      // -- Phase 3: Reasoning Engine (terminal node sanitization) ----
      const reasoningState = { str: rawResult.str||street, heroIsIP, vilAction, board };
      const reasoningResult = validateReasoningOutput(enrichReasoningWithContext(rawResult, reasoningState), reasoningState);

      // -- Phase 4: DCE (action legality + structural coherence) -----
      const dceStateObj = { street, heroIsIP, vilAction, board, heroCards, potSize };
      const dceResult = applyConsistencyCorrections(reasoningResult, dceStateObj);

      // -- Phase 5: ACL (aggression calibration) ---------------------
      const hs = heroStrength(heroCards, board);
      const tex = analyzeBoard(board);
      const aclResult = street==="preflop" ? dceResult : runACL(dceResult, dseState, hs, tex);

      // -- Phase 6: ANE (Action Naming Engine) --------------------
      // Corrects action labels using full action history.
      // Runs last so it overrides any generic labels from earlier phases.
      // If hero already has a preflop decision, signal ANE that hero acted
      const anePfSit = (street === "preflop" && decisions && decisions.preflop)
        ? "heroActed"
        : preflopSituation;
      const result = applyANE(aclResult, vilAction, street, anePfSit);

      // -- Phase 6.5: Recompute size_dollars from final sizing ----------
      // ACL/DCE/ANE can change sizing without recomputing dollars.
      // This phase ensures size_dollars always matches the final sizing.
      if (result.sizing && potSize > 0 && !result._all_in) {
        const bb = gameSize.bb || 3;
        if (result.sizing.endsWith("%")) {
          const pct = parseFloat(result.sizing)/100;
          const rawBB = potSize * pct;
          result.size_bb = Math.round(rawBB * 10)/10;
          const rawD = rawBB * bb;
          result.size_dollars = rawD < 10 ? Math.round(rawD*2)/2 : Math.round(rawD);
          result.pot_percentage = parseFloat(result.sizing);
          result.sizingLabel = "$"+result.size_dollars+" ("+result.sizing+" pot)";
        } else if (result.sizing.endsWith("x")) {
          const mult = parseFloat(result.sizing);
          const vilRaise = (vilAction||[]).filter(a=>(a.type==="bet"||a.type==="raise")&&a.street===street).slice(-1)[0];
          const vilDollars = vilRaise && vilRaise.amount ? parseFloat(vilRaise.amount) : 0;
          let rawBB2;
          if (vilDollars > 0 && bb > 0) {
            rawBB2 = (vilDollars / bb) * mult;
          } else {
            rawBB2 = potSize * mult;
          }
          result.size_bb = Math.round(rawBB2 * 10)/10;
          const rawD2 = rawBB2 * bb;
          result.size_dollars = rawD2 < 10 ? Math.round(rawD2*2)/2 : Math.round(rawD2);
          result.sizingLabel = "$"+result.size_dollars+" ("+result.sizing+(vilDollars>0?" of $"+vilDollars:"")+")";
        }
      }

      // -- Phase 7: Spot Context (SPR, pot odds, board texture, effective stack) --
      const spotBB = gameSize.bb || 3;
      const effStackBB = isMultiway && heroLastToAct !== null ? Math.min(stackBB, villainStackBB) : Math.min(stackBB, villainStackBB);
      const spotSPR = potSize > 0 ? Math.round((effStackBB / potSize) * 10) / 10 : 0;
      const spotTex = street !== "preflop" && board.length >= 3 ? analyzeBoard(board) : null;
      // Pot odds: only when facing a villain bet
      const vilBetThisStreet = (vilAction||[]).filter(a=>a.street===street&&a.actor==="Villain"&&(a.type==="bet"||a.type==="raise")).slice(-1)[0];
      const vilBetDollar = vilBetThisStreet && vilBetThisStreet.amount ? parseFloat(vilBetThisStreet.amount) : 0;
      let spotPotOdds = null;
      if (vilBetDollar > 0) {
        const potDollars = potSize * spotBB;
        const totalPot = potDollars + vilBetDollar; // pot + villain's bet
        const odds = totalPot / vilBetDollar;
        const equityNeeded = Math.round((1 / (odds + 1)) * 100);
        spotPotOdds = { ratio: Math.round(odds * 10) / 10, equityNeeded, vilBet: vilBetDollar, totalPot: Math.round(totalPot) };
      }
      result._spot = {
        spr: spotSPR,
        effStack: Math.round(effStackBB * spotBB),
        effStackBB: Math.round(effStackBB),
        tex: spotTex,
        potOdds: spotPotOdds,
        potDollars: Math.round(potSize * spotBB),
        heroIsIP,
      };

      // -- Stack cap: ensure bet doesn't exceed hero's remaining stack --
      const heroStackDollars = Math.round(stackBB * gameSize.bb);
      if (heroStackDollars <= 0) {
        // Hero is already all-in from a previous street
        result.action = "All-In";
        result.size_dollars = 0;
        result.sizing = null;
        result.sizingLabel = null;
        result._all_in = true;
        result._already_all_in = true;
        result.bullets = [
          "You are already all-in from a previous street",
          "No further action is possible - wait for the runout",
        ];
        result.tag = "All-In";
        result.score = 85;
      } else if (result.size_dollars && result.size_dollars >= heroStackDollars * 0.9) {
        // Bet is >= 90% of remaining stack - commit all-in
        result.size_dollars = heroStackDollars;
        result.sizingLabel = "All-In $" + heroStackDollars;
        result.action = "All-In";
        result.sizing = "All-In";
        result._all_in = true;
        if (result.bullets && result.bullets.length >= 1) {
          result.bullets.push("Stack is committed at this pot size - going all-in maximizes fold equity and value");
        }
      } else if (result.size_dollars && result.size_dollars > heroStackDollars) {
        // Shouldn't happen after 90% check, but safety net
        result.size_dollars = heroStackDollars;
        result.sizingLabel = "All-In $" + heroStackDollars;
        result.action = "All-In";
        result.sizing = "All-In";
        result._all_in = true;
      }

      setRec(result); setRange(r); setSnapshots(snaps); setCats(catRange(r));
      // Store decision for this street
      setDecisions(prev => ({ ...prev, [street]: result }));
      setSaveState("default"); setLoading(false); setHasRun(true);
      const entry={id:Date.now(),heroCards:[...heroCards],archetype,board:[...board],street,ts:new Date().toLocaleTimeString(),vilAction:[...vilAction],stackBB,potSize,heroPos,villainPos};
      setHistory(prev=>[entry,...prev].slice(0,5));
    } catch(err) {
      console.error("runAnalysis error:", err);
      setRec({ action: "Error", sizing: null, bullets: [err.message || "Unknown error in analysis pipeline"], tag: "Error", score: 0, str: street });
      setLoading(false);
    }
  }

  function pickCard(card) {
    if (usedKeys.includes(card.rank+card.suit)) return;
    if (picker==="hero0") { setHeroCards(prev=>{const n=[...prev];n[0]=card;return n;}); setPicker(null); }
    else if (picker==="hero1") { setHeroCards(prev=>{const n=[...prev];n[1]=card;return n;}); setPicker(null); }
    else if (picker==="board") {
      const max=street==="flop"?3:street==="turn"?4:5;
      if (board.length<max) { const nb=[...board,card]; setBoard(nb); if(nb.length>=max) setPicker(null); }
    }
  }

  // handleKbInput removed - CardSelector handles its own advanced input internally

  function addAction(type) { setVilAction(prev=>[...prev,{type,street,actor:"Villain"}]); }

  // -- Street advance helper ------------------------------------------------
  // Single source of truth for advancing to a new street.
  // Clears all state that should not carry forward:
  //   - villain actions for the new street (avoid stale from prior hand)
  //   - decisions for new street AND all streets after it (CH-1, CH-3)
  //   - stale rec so no old CompletedStateCard flashes (CH-2)
  //   - board if advancing to flop (fresh board)
  const STREET_ORDER = ["preflop","flop","turn","river"];
  // Calculate pot growth from a completed street's actions
  // Preflop: each player in the hand matches the raise. Pot = players - raise amount.
  //   The starting pot (blinds) is replaced, not added to, since players in the blinds
  //   have their blind money included in their call.
  // Postflop: hero bets X, each caller adds X. Or villain bets X, hero calls adds X.
  function calcPotGrowth(streetName) {
    const bb = gameSize.bb || 3;
    const streetActions = (vilAction||[]).filter(a => a.street === streetName);
    const heroDecision = decisions && decisions[streetName];
    const numOpps = parseInt(playersLeft) || 1;

    if (streetName === "preflop") {
      // Preflop pot = (total players) - (raise amount)
      // The raise amount is the largest bet - hero's open or villain's raise
      let raiseAmount = 0;
      // Check hero's raise
      if (heroDecision) {
        if (heroDecision.size_dollars) raiseAmount = Math.max(raiseAmount, heroDecision.size_dollars);
        else if (heroDecision.sizing && typeof heroDecision.sizing === "string" && heroDecision.sizing.startsWith("$"))
          raiseAmount = Math.max(raiseAmount, parseFloat(heroDecision.sizing.replace("$","")) || 0);
      }
      // Check villain's raise/bet
      for (const act of streetActions) {
        if (act.actor === "Villain" && (act.type === "bet" || act.type === "raise") && act.amount)
          raiseAmount = Math.max(raiseAmount, parseFloat(act.amount) || 0);
      }

      if (raiseAmount > 0) {
        // Total players in = hero + opponents who called (not folded)
        const vilFolded = streetActions.some(a => a.actor === "Villain" && a.type === "fold");
        const playersIn = vilFolded ? 1 : (1 + numOpps);
        // Pot = players x raise amount (assume blinds are among the callers)
        const totalPot = playersIn * raiseAmount;
        // Growth = new pot minus the starting blinds pot (since we're replacing it)
        const currentPotDollars = potSize * bb;
        return Math.round(((totalPot - currentPotDollars) / bb) * 10) / 10;
      }
      // Limped pot: each limper put in 1bb
      const limpers = streetActions.filter(a => a.actor === "Villain" && a.type === "check").length;
      if (limpers > 0) {
        return limpers; // each limper adds 1bb
      }
      return 0;
    }

    // --- POSTFLOP ---
    // Simple: whoever bet, the caller(s) matched it
    let streetBetDollars = 0;
    let heroBetDollars = 0;
    let vilBetDollars = 0;

    // Find the bet/raise amount on this street
    if (heroDecision) {
      if (heroDecision.size_dollars) {
        heroBetDollars = heroDecision.size_dollars;
      } else if (heroDecision.sizing && typeof heroDecision.sizing === "string") {
        if (heroDecision.sizing.endsWith("%")) {
          heroBetDollars = Math.round(potSize * (parseFloat(heroDecision.sizing) / 100) * bb);
        } else if (heroDecision.sizing.startsWith("$")) {
          heroBetDollars = parseFloat(heroDecision.sizing.replace("$","")) || 0;
        }
      }
    }
    for (const act of streetActions) {
      if (act.actor === "Villain" && (act.type === "bet" || act.type === "raise") && act.amount)
        vilBetDollars = Math.max(vilBetDollars, parseFloat(act.amount) || 0);
    }

    // The bet to match is the larger of hero's bet or villain's bet
    streetBetDollars = Math.max(heroBetDollars, vilBetDollars);

    if (streetBetDollars <= 0) return 0; // checked through

    // Check for explicit caller count from multiway selector
    const vilActLast = streetActions.filter(a=>a.actor==="Villain").slice(-1)[0];
    const vilCalled = vilActLast && vilActLast.type === "call";
    const vilBet = vilActLast && (vilActLast.type === "bet" || vilActLast.type === "raise");
    const heroCalled = heroDecision && (heroDecision.action === "Call" || (heroDecision._hero_terminal && heroDecision.action === "Call"));
    const explicitCallers = vilActLast && vilActLast._callers !== undefined ? vilActLast._callers : null;

    let totalNew = 0;
    if (heroBetDollars > 0 && (vilCalled || (explicitCallers !== null && explicitCallers > 0))) {
      // Hero bet, some number of opponents called
      const callerCount = explicitCallers !== null ? explicitCallers : numOpps;
      totalNew = heroBetDollars + (heroBetDollars * callerCount); // hero + callers
    } else if (heroBetDollars > 0 && explicitCallers === 0) {
      // Hero bet, all folded - only hero's bet goes in (then returned)
      totalNew = 0; // pot doesn't grow, hero wins
    } else if (vilBetDollars > 0 && heroCalled) {
      // Villain bet, hero called
      totalNew = vilBetDollars + vilBetDollars; // villain + hero
    } else if (heroBetDollars > 0 && !vilCalled && explicitCallers === null) {
      // Hero bet, villain folded or hasn't acted
      totalNew = heroBetDollars; // just hero's bet (villain folded)
    } else if (vilBetDollars > 0 && !heroCalled) {
      // Villain bet, hero hasn't called yet
      totalNew = vilBetDollars; // just villain's bet
    }

    return Math.round((totalNew / bb) * 10) / 10;
  }

  function advanceToStreet(nextSt) {
    if (!nextSt) return;
    // Accumulate pot before advancing
    const growth = calcPotGrowth(street);
    if (growth > 0) setPotSize(prev => Math.round((prev + growth) * 10) / 10);

    // Reduce hero's stack by their bet/raise amount this street
    const heroDecision = decisions && decisions[street];
    if (heroDecision) {
      let heroBetDollars = 0;
      if (heroDecision.size_dollars) heroBetDollars = heroDecision.size_dollars;
      else if (heroDecision.sizing && typeof heroDecision.sizing === "string" && heroDecision.sizing.startsWith("$"))
        heroBetDollars = parseFloat(heroDecision.sizing.replace("$","")) || 0;
      else if (heroDecision.sizing && typeof heroDecision.sizing === "string" && heroDecision.sizing.endsWith("%"))
        heroBetDollars = Math.round(potSize * (parseFloat(heroDecision.sizing) / 100) * gameSize.bb);
      // Also if hero called a villain bet
      if (heroDecision.action === "Call" || (heroDecision._hero_terminal && heroDecision.action === "Call")) {
        const vilBet = (vilAction||[]).filter(a=>a.street===street&&a.actor==="Villain"&&(a.type==="bet"||a.type==="raise")).slice(-1)[0];
        if (vilBet && vilBet.amount) heroBetDollars = parseFloat(vilBet.amount) || 0;
      }
      if (heroBetDollars > 0) {
        const heroBetBB = heroBetDollars / gameSize.bb;
        setStackBB(prev => Math.max(0, Math.round((prev - heroBetBB) * 10) / 10));
      }
    }

    const nextIdx = STREET_ORDER.indexOf(nextSt);
    // Clear decisions for nextSt and all streets after it
    const decisionsToClear = STREET_ORDER.slice(nextIdx).reduce((acc, s) => {
      acc[s] = null; return acc;
    }, {});
    setDecisions(prev => ({ ...prev, ...decisionsToClear }));
    // Clear villain actions for the new street (keep prior streets for history)
    setVilAction(v => v.filter(a => a.street !== nextSt));
    // Do NOT setRec(null) - keep current rec visible as a loading placeholder.
    // Do NOT setBoard([]) - board cards are entered by user and must persist.
    // The useEffect auto-run fires on street change and replaces rec with fresh analysis.
    setStreet(nextSt);
  }

  // Variant used when flop cards are being added interactively via BoardSelector.
  // Does NOT clear the board - the user is actively building it card by card.
  // Does NOT clear rec - keeps CompletedStateCard visible until useEffect replaces it.
  function advanceToFlopKeepingBoard() {
    // Accumulate pot from preflop action
    const growth = calcPotGrowth("preflop");
    if (growth > 0) setPotSize(prev => Math.round((prev + growth) * 10) / 10);

    // Reduce hero's stack by their preflop raise
    const heroDecision = decisions && decisions.preflop;
    if (heroDecision && heroDecision.size_dollars) {
      const heroBetBB = heroDecision.size_dollars / gameSize.bb;
      setStackBB(prev => Math.max(0, Math.round((prev - heroBetBB) * 10) / 10));
    } else if (heroDecision && heroDecision.sizing && typeof heroDecision.sizing === "string" && heroDecision.sizing.startsWith("$")) {
      const heroBetBB = (parseFloat(heroDecision.sizing.replace("$","")) || 0) / gameSize.bb;
      setStackBB(prev => Math.max(0, Math.round((prev - heroBetBB) * 10) / 10));
    }

    const nextIdx = STREET_ORDER.indexOf("flop");
    const decisionsToClear = STREET_ORDER.slice(nextIdx).reduce((acc, s) => {
      acc[s] = null; return acc;
    }, {});
    setDecisions(prev => ({ ...prev, ...decisionsToClear }));
    setVilAction(v => v.filter(a => a.street !== "flop"));
    // NOTE: do NOT call setRec(null) - keep current rec so CompletedStateCard stays
    // visible. The useEffect auto-run will fire on street change and replace rec.
    // NOTE: do NOT call setBoard([]) here - board cards are being added by user
    setStreet("flop");
  }

  function saveHand() {
    if (!rec) return;
    setSaveState("saving");
    setTimeout(()=>{
      // When a CompletedStateCard is showing, rec.action is null.
      // Derive a display label from the closure reason for the vault card.
      const closureActionLabel = rec._preflop_closed ? (
        rec._villain_folded || rec._closure_reason === "villain_fold_postflop" ? "Villain Folded"
        : rec._closure_reason === "hero_folded" ? "Hero Folded"
        : rec._closure_reason === "hero_raise_villain_call" ? "Open Raise"
        : rec._closure_reason === "villain_called_hero_bet" ? "Bet"
        : rec._closure_reason === "both_checked" ? "Check"
        : rec._closure_reason === "hero_called_villain_raise" ? "Call"
        : "Street Closed"
      ) : null;
      const saveRec = {
        ...rec,
        action: rec.action || closureActionLabel || "--",
      };
      // Dedup: skip if vault already has an entry with same cards+board+street
      const cardKey = heroCards.filter(Boolean).map(c=>c.rank+c.suit).sort().join("");
      const boardKey = board.map(c=>c.rank+c.suit).join("");
      const isDupe = prev => prev.some(h => {
        const hKey = h.heroCards.filter(Boolean).map(c=>c.rank+c.suit).sort().join("");
        const hBoard = (h.board||[]).map(c=>c.rank+c.suit).join("");
        return hKey === cardKey && hBoard === boardKey && h.street === street;
      });
      setVault(prev => {
        if (isDupe(prev)) return prev; // already saved this exact spot
        return [{id:Date.now(),heroCards:[...heroCards],archetype,board:[...board],street,
          heroPos,villainPos,vilAction:[...vilAction],rec:saveRec,ts:new Date().toLocaleTimeString()},...prev];
      });
      setSaveState("saved");
      setToast("Saved to Study Vault");
      setTimeout(()=>setSaveState("default"),2800);
    },600);
  }

  function doReset() {
    setHeroCards([null,null]); setBoard([]); setVilAction([]);
    setRec(null); setRange(null); setSnapshots([]); setCats(null);
    setStreet("preflop"); setPotSize(Math.round((gameSize.totalBlinds / gameSize.bb) * 100) / 100); setKbInput(""); setKbPartial(null); setKbError(null);
    setSaveState("default"); setShowConfirm(false); setShowPlaySpot(false); setHasRun(false);
    setDecisions({ preflop:null, flop:null, turn:null, river:null });
    setPreflopSituation("unopened");
    setIsMultiway(false);
    setHeroLastToAct(null);
    setStackBB(100);
    setVillainStackBB(100);
    setHeroStackCustom(false);
    setVillainStackCustom(false);
    setVilBetAmount("");
    setShowShowdown(false);
    setIsInitialized(false);
    setDrawerOpen(true);
  }

  function loadHistory(h) {
    setHeroCards(h.heroCards); setArchetype(h.archetype); setBoard(h.board);
    setStreet(h.street); setVilAction(h.vilAction||[]); setStackBB(h.stackBB);
    setPotSize(h.potSize); setHeroPos(h.heroPos); setVillainPos(h.villainPos);
    setRec(null); setRange(null); setSnapshots([]); setCats(null); setHasRun(false);
  }

  function loadVaultHand(h) {
    // Restore full hand state from vault entry, navigate to analyze screen
    setHeroCards(h.heroCards || [null,null]);
    setArchetype(h.archetype || "station");
    setBoard(h.board || []);
    setStreet(h.street || "preflop");
    setVilAction(h.vilAction || []);
    setHeroPos(h.heroPos || "BTN");
    setVillainPos(h.villainPos || "BB");
    // Reset derived state cleanly
    setDecisions({ preflop:null, flop:null, turn:null, river:null });
    setPreflopSituation("unopened");
    setIsMultiway(false);
    setHeroLastToAct(null);
    setRec(null); setRange(null); setSnapshots([]); setCats(null);
    setSaveState("default"); setHasRun(false);
    // Navigate to analyze and run
    setScreen("analyze");
    setTimeout(() => runAnalysis(), 100);
  }

  const REC_COLORS={Bet:C.green,Raise:C.orange,Call:C.blue,Check:C.amber,Fold:C.red,Jam:"#EC4899"};
  const recColor=rec?(REC_COLORS[rec.action]||C.purple):C.purple;
  const band=rec?scoreBand(rec.score):{col:C.muted,label:"--"};

  // Keyboard shortcuts (home screen only)
  React.useEffect(() => {
    if (screen !== "home") return;
    function handleKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "a") setScreen("analyze");
      else if (k === "d") setScreen("practice");
      else if (k === "r") setScreen("ranges");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [screen]);

  // -- HOME ----------------------------------------------------
  if (screen==="home") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter',sans-serif",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"48px 24px",
      backgroundImage:"radial-gradient(ellipse 90% 60% at 50% -5%, #1c1040 0%, "+C.bg+" 60%)" }}>
      <style>{BASE_CSS}</style>

      {/* Logo + tagline */}
      <div style={{ textAlign:"center", marginBottom:20, animation:"fadeUp 0.5s ease" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
          <RangeIQLogo size={42}/>
        </div>
        <h1 style={{ margin:"0 0 10px", fontSize:32, fontWeight:800, color:C.text, letterSpacing:"-0.5px", lineHeight:1.15 }}>
          EXPLOIT EVERY SPOT. WIN MORE.
        </h1>
        <p style={{ margin:"0 0 28px", fontSize:12, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase" }}>
          Turn player tendencies into a real edge.
        </p>
        <button onClick={()=>{ setScreen("analyze"); setDrawerOpen(true); }} style={{
          height:52, padding:"0 52px", borderRadius:10, fontSize:15, fontWeight:700,
          background:"linear-gradient(135deg, #D9B95B 0%, #c9a440 100%)",
          border:"none", color:"#111827", cursor:"pointer", letterSpacing:"0.06em",
          textTransform:"uppercase", boxShadow:"0 4px 24px rgba(217,185,91,0.35)",
          transition:"all 0.2s",
        }}
        onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 32px rgba(217,185,91,0.5)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 4px 24px rgba(217,185,91,0.35)"; }}>
          Analyze a Hand &#8594;
        </button>
      </div>

      {/* Feature cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, width:"100%", maxWidth:820, marginBottom:44, animation:"fadeUp 0.7s ease" }}>
        {[
          { key:"analyze",  title:"Exploit Analyzer",
            desc:"Find the highest EV exploit instantly.",
            icon:"&#x1F50D;", accent:C.gold,   border:"rgba(217,185,91,0.45)", primary:true },
          { key:"practice", title:"Exploit Drills",
            desc:"Train to spot and punish exploits in real-time.",
            icon:"&#x1F3AF;", accent:"#6366F1", border:"rgba(99,102,241,0.35)", primary:false },
          { key:"ranges",   title:"Dynamic Range Lab",
            desc:"Build ranges that adapt to position and tendencies.",
            icon:"&#x25A6;",  accent:C.gold,   border:"rgba(217,185,91,0.35)", primary:false },
        ].map(({key,title,desc,icon,accent,border,primary})=>(
          <button key={key} onClick={()=>{ setScreen(key); if(key==="analyze") setDrawerOpen(true); }} style={{
            background: primary ? "rgba(217,185,91,0.06)" : "#0F172A",
            border:"1px solid "+(primary ? "rgba(217,185,91,0.55)" : border),
            borderRadius:12, padding:"22px 22px", cursor:"pointer",
            textAlign:"left", color:C.text, transition:"all 0.2s",
            fontFamily:"'Inter',sans-serif", display:"flex", alignItems:"flex-start", gap:16,
            boxShadow: primary ? "0 0 28px rgba(217,185,91,0.12)" : "none",
          }}
          onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=primary?"0 16px 40px rgba(217,185,91,0.2)":"0 12px 32px rgba(0,0,0,0.5)"; e.currentTarget.style.borderColor=accent+(primary?"88":"66"); }}
          onMouseLeave={e=>{ e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow=primary?"0 0 28px rgba(217,185,91,0.12)":"none"; e.currentTarget.style.borderColor=primary?"rgba(217,185,91,0.55)":border; }}>
            <div style={{ width:52, height:52, borderRadius:99,
              background: primary ? "rgba(217,185,91,0.12)" : "rgba(255,255,255,0.05)",
              border:"1px solid "+(primary ? "rgba(217,185,91,0.3)" : "rgba(255,255,255,0.08)"),
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}
              dangerouslySetInnerHTML={{__html: icon}}>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:6, color:accent }}>{title}</div>
              <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Stats row - all gold numbers, grey labels */}
      <div style={{ display:"flex", gap:48, animation:"fadeUp 0.9s ease" }}>
        {[
          ["8",     "Target Profiles", "Know exactly who you're playing against."],
          ["100",   "Drill Scenarios",  "Preflop to river across all archetypes."],
          ["1,326", "Combos",           "All starting hand combinations covered."],
        ].map(([v,l,sub])=>(
          <div key={l} style={{ textAlign:"center" }}>
            <div style={{ fontSize:28, fontWeight:800, color:C.gold, lineHeight:1 }}>{v}</div>
            <div style={{ fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{l}</div>
            <div style={{ fontSize:10, color:C.disabled, marginTop:3, maxWidth:140 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
  if (screen==="practice") return <PracticeScreen onBack={()=>setScreen("home")} initialGameSize={gameSize}/>;
  if (screen==="ranges")   return <RangeBuilderScreen onBack={()=>setScreen("home")} initialGameSize={gameSize}/>;

  // -- VAULT --------------------------------------------------
  if (screen==="vault") return (
    <div style={{ minHeight:"100vh",background:C.bg,fontFamily:"'Inter',sans-serif",padding:24,color:C.text }}>
      <style>{BASE_CSS}</style>
      <div style={{ maxWidth:700,margin:"0 auto" }}>
        <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:24 }}>
          <Btn variant="ghost" onClick={()=>setScreen("analyze")}>&#8592; Back to Analyzer</Btn>
          <span style={{ fontSize:18,fontWeight:700,color:C.text }}>Study Vault</span>
          <span style={{ fontSize:13,color:C.muted }}>{vault.length > 0 ? vault.length+" hand"+(vault.length!==1?"s":"") : ""}</span>
          <div style={{ flex:1 }}/>
          {vault.length > 0 && (
            <button onClick={()=>{ if(window.confirm("Clear all saved hands?")) setVault([]); }}
              style={{ padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                background:"transparent",border:"1px solid rgba(239,68,68,0.3)",color:C.red+"99" }}>
              Clear All
            </button>
          )}
        </div>

                {vault.length===0?(
          <div style={{ textAlign:"center",color:C.muted,padding:80 }}>
            <div style={{ fontSize:44,marginBottom:14,opacity:0.2 }}>{SUIT_SYM.s}</div>
            <p style={{ fontSize:15 }}>No saved hands yet.</p>
            <p style={{ fontSize:13 }}>Analyze a hand and save it to build your vault.</p>
          </div>
        ):vault.map(h=>(
          <Card key={h.id} style={{ marginBottom:10,animation:"fadeUp 0.3s ease" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                {h.heroCards.filter(Boolean).map((c,i)=><CardToken key={i} card={c} size={34}/>)}
                <div>
                  <span style={{ color:C.muted,fontSize:13 }}>vs {ARCHETYPES[h.archetype]&&ARCHETYPES[h.archetype].label}</span>
                  {(h.heroPos||h.street) && (
                    <div style={{ fontSize:11,color:C.disabled,marginTop:2 }}>
                      {[h.heroPos, h.villainPos && "vs "+h.villainPos, h.street && h.street.charAt(0).toUpperCase()+h.street.slice(1)].filter(Boolean).join(" | ")}
                    </div>
                  )}
                </div>
              </div>
              <span style={{ fontSize:11,color:C.disabled }}>{h.ts}</span>
            </div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
              <Tag color={REC_COLORS[h.rec.action]||C.purple}>{h.rec.action}{h.rec.sizing?" "+h.rec.sizing:""}</Tag>
              {h.rec.score>0&&<Tag>Edge {h.rec.score}</Tag>}
              {h.board.length>0&&<Tag>{h.board.map(c=>c.rank+SUIT_SYM[c.suit]).join(" ")}</Tag>}
            </div>
            {/* Action row */}
            <div style={{ display:"flex",gap:8,borderTop:"1px solid "+C.border,paddingTop:10 }}>
              <button
                onClick={()=>loadVaultHand(h)}
                style={{ flex:1,padding:"8px 0",borderRadius:7,fontSize:12,fontWeight:700,
                  cursor:"pointer",background:"rgba(230,197,102,0.12)",
                  border:"1px solid rgba(230,197,102,0.35)",color:C.gold,
                  transition:"all 0.12s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(230,197,102,0.22)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(230,197,102,0.12)"}>
                &#9654; Load Hand
              </button>
              <button
                onClick={()=>setVault(v=>v.filter(x=>x.id!==h.id))}
                style={{ padding:"8px 14px",borderRadius:7,fontSize:12,fontWeight:600,
                  cursor:"pointer",background:"transparent",
                  border:"1px solid rgba(239,68,68,0.25)",color:C.red+"99",
                  transition:"all 0.12s" }}
                onMouseEnter={e=>{ e.currentTarget.style.background="rgba(239,68,68,0.1)"; e.currentTarget.style.color=C.red; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.color=C.red+"99"; }}>
                &#10005;
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  // -- ANALYZE --------------------------------------------------
  return (
    <div style={{ minHeight:"100vh",background:C.bg,fontFamily:"'Inter',sans-serif",color:C.text }}>
      <style>{BASE_CSS}</style>

      {showConfirm&&<ConfirmModal onConfirm={doReset} onCancel={()=>setShowConfirm(false)}/>}
      {showPlaySpot&&heroCards[0]&&heroCards[1]&&<PlayTheSpotSim heroCards={heroCards} archetype={archetype} heroIsIP={heroIsIP} board={board} potSize={potSize} stackBB={stackBB} bigBlind={gameSize.bb} onClose={()=>setShowPlaySpot(false)} onSaveToVault={saveHand}/>}
      {picker&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setPicker(null);}}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ maxWidth:500,width:"100%" }}>
            <CardPickerGrid onPick={pickCard} usedKeys={usedKeys} title={picker==="board"?"Select Board Card":"Select Hero Card"}/>
            <div style={{ marginTop:8 }}>
              <Btn variant="secondary" onClick={()=>setPicker(null)} style={{ width:"100%" }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* -- HEADER  -  logo top-left, controls top-right -- */}
      <div style={{ background:C.card,borderBottom:"1px solid "+C.border,padding:"14px 20px 10px",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ maxWidth:1340,margin:"0 auto" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
            {/* Logo - top-left, click returns home */}
            <button onClick={()=>setScreen("home")} style={{ background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center" }}>
              <RangeIQLogo size={26}/>
            </button>
            <div style={{ flex:1 }}/>
            <div ref={histRef} style={{ position:"relative" }}>
              <Btn variant="ghost" onClick={()=>setShowHistory(v=>!v)} style={{ fontSize:12 }}>
                History{history.length>0?" ("+history.length+")":""}
              </Btn>
              {showHistory&&<HistoryDropdown history={history} onSelect={loadHistory} onClose={()=>setShowHistory(false)}/>}
            </div>
            <Btn variant="ghost" onClick={()=>setScreen("vault")} style={{ fontSize:12 }}>
              Vault{vault.length>0?" ("+vault.length+")":""}
            </Btn>
            <Btn variant="danger" onClick={()=>{ if(heroCards[0]||board.length>0||rec) setShowConfirm(true); else doReset(); }} style={{ fontSize:12 }}>Reset</Btn>
          </div>
          {/* Context bar - empty state aware */}
          <div style={{ display:"flex",alignItems:"center",gap:14,flexWrap:"wrap" }}>
            {/* Hero cards */}
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Hero</span>
              {heroCards[0]||heroCards[1] ? (
                <>
                  <CardToken card={heroCards[0]} size={32}/>
                  <CardToken card={heroCards[1]} size={32}/>
                </>
              ) : (
                <span style={{ fontSize:12,color:C.disabled,fontStyle:"italic" }}>--</span>
              )}
            </div>
            <div style={{ width:1,height:34,background:C.border }}/>
            {/* Board - hidden on preflop with no cards */}
            {(street!=="preflop"||board.length>0)&&(
              <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                <span style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Board</span>
                {board.length>0
                  ? board.map((c,i)=>(
                      <div key={i} onClick={()=>setBoard(b=>b.filter((_,idx)=>idx!==i))} style={{ cursor:"pointer" }}>
                        <CardToken card={c} size={32}/>
                      </div>
                    ))
                  : [0,1,2].map(i=>(
                      <div key={i}>
                        <CardToken card={undefined} size={32}/>
                      </div>
                    ))
                }
              </div>
            )}
            <div style={{ width:1,height:34,background:C.border }}/>
            {/* Context stats - dollars only, no BB */}
            {[
              [isInitialized ? "$"+Math.round(potSize * gameSize.bb) : "--", "Pot"],
              [isInitialized ? bbToDollars(stackBB,gameSize.bb) : "--", "Stack"],
              [isInitialized ? (heroIsIP?"IP":"OOP") : "--", "Pos"],
              [isInitialized ? heroPos : "--", "Hero"],
              [isInitialized ? p.label : "--", parseInt(playersLeft)>=2?"Villain ("+playersLeft+")":"Villain"],
            ].map(([val,lbl])=>(
              <div key={lbl} style={{ textAlign:"center" }}>
                <div style={{ fontSize:13,fontWeight:700,color:isInitialized?C.gold:C.disabled,lineHeight:1 }}>{val}</div>
                <div style={{ fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>{lbl}</div>
              </div>
            ))}
            {/* River hand display - 5-card combo + classification */}
            {board.length===5&&heroCards[0]&&heroCards[1]&&(()=>{
              const result = evaluateHand(heroCards, board);
              if (!result) return null;
              const suitSym = { s:"-", h:"-", d:"-", c:"-" };
              const suitCol = { s:"#94A3B8", h:"#F87171", d:"#F87171", c:"#94A3B8" };
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.08em" }}>Hero's Hand</div>
                  <div style={{ padding:"5px 10px", borderRadius:6,
                    background:result.isStrong?"rgba(230,197,102,0.12)":"rgba(255,255,255,0.05)",
                    border:"1px solid "+(result.isStrong?"rgba(230,197,102,0.3)":"rgba(255,255,255,0.1)"),
                    maxWidth:220 }}>
                    {/* Line 1: exact 5-card combo */}
                    <div style={{ display:"flex", gap:3, alignItems:"center", marginBottom:2, flexWrap:"nowrap" }}>
                      {(result.bestFive||[]).map((c,i)=>(
                        <span key={i} style={{ fontSize:11, fontWeight:700, color:suitCol[c.suit]||C.muted, lineHeight:1 }}>
                          {c.rank}{suitSym[c.suit]||c.suit}
                        </span>
                      ))}
                    </div>
                    {/* Line 2: classification */}
                    <div style={{ fontSize:10, fontWeight:700, color:result.isStrong?C.gold:C.text, lineHeight:1 }}>
                      {result.description}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          {/* Timeline */}
          {vilAction.length>0&&(
            <div style={{ display:"flex",alignItems:"center",gap:4,marginTop:8,flexWrap:"wrap" }}>
              <span style={{ fontSize:9,color:C.disabled,textTransform:"uppercase",letterSpacing:"0.08em",marginRight:4 }}>Timeline:</span>
              {(()=>{
                // Build enriched timeline: group by street, show hero action + villain response
                const streets = ["preflop","flop","turn","river"];
                const pills = [];
                for (const st of streets) {
                  const heroAct = decisions && decisions[st];
                  const vilActs = vilAction.filter(a=>a.street===st && a.actor==="Villain");
                  if (!heroAct && vilActs.length===0) continue;
                  const heroLabel = heroAct ? heroAct.action||"" : "";
                  const heroSize = heroAct && heroAct.size_dollars ? " $"+heroAct.size_dollars : "";
                  const vilLabel = vilActs.length>0 ? vilActs[vilActs.length-1].type : "";
                  const vilAmt = vilActs.length>0 && vilActs[vilActs.length-1].amount ? " $"+vilActs[vilActs.length-1].amount : "";
                  let pillText = st + ": ";
                  if (heroLabel && vilLabel) pillText += heroLabel.toLowerCase() + heroSize + " / " + vilLabel + vilAmt;
                  else if (heroLabel) pillText += heroLabel.toLowerCase() + heroSize;
                  else if (vilLabel) pillText += vilLabel + vilAmt;
                  pills.push({ street:st, text:pillText });
                }
                return pills.map((p,i)=>(
                  <span key={i} style={{ display:"flex",alignItems:"center",gap:4 }}>
                    {i>0&&<span style={{ color:C.border,fontSize:10 }}>&#8594;</span>}
                    <span style={{ padding:"2px 8px",borderRadius:99,background:C.elevated,border:"1px solid "+C.border,color:C.teal,fontSize:10 }}>
                      {p.text}
                    </span>
                  </span>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* V3 LAYOUT - Decision-first, Progressive Disclosure */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 16px" }}>

        {/* - EDIT SPOT DRAWER - */}
        {drawerOpen&&(
          <div className="riq-edit-drawer" style={{
            position:"fixed", top:0, left:0, height:"100vh", width:320,
            background:C.card, borderRight:"1px solid "+C.border,
            zIndex:150, overflowY:"auto", display:"flex", flexDirection:"column",
            boxShadow:"4px 0 24px rgba(0,0,0,0.5)",
            animation:"slideInLeft 0.22s ease",
          }}>
            <div style={{ padding:"18px 20px", borderBottom:"1px solid "+C.border, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <span style={{ fontSize:14, fontWeight:700, color:C.text }}>Build Spot</span>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <button onClick={()=>{
                  setHeroCards([null,null]);
                  setBoard([]);
                  setStreet("preflop");
                  setVilAction([]);
                  setVilBetAmount("");
                  setHeroPos("BTN");
                  setVillainPos("BB");
                  setArchetype("unknown");
                  setPotSize(Math.round((gameSize.totalBlinds / gameSize.bb) * 100) / 100);
                  setStackBB(100);
                  setVillainStackBB(100);
                  setHeroStackCustom(false);
                  setVillainStackCustom(false);
                  setPreflopSituation("unopened");
                  setPlayersLeft("1");
                  setFieldStickiness("medium");
                  setIsMultiway(false);
                  setShowShowdown(false);
                  setIsInitialized(false);
                  setRec(null);
                  setRange(null);
                  setCats(null);
                }} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, color:C.muted, cursor:"pointer", fontSize:10, fontWeight:600, padding:"4px 10px", letterSpacing:"0.04em" }}>Clear</button>
                <button onClick={()=>setDrawerOpen(false)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:20, lineHeight:1 }}>&#x2715;</button>
              </div>
            </div>
            <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:0, overflowY:"auto", flex:1 }}>

              {/* GROUP 1: HAND SETUP - cards, positions, archetype */}
              <div style={{ paddingBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Hand Setup</div>
                {/* Cards row */}
                <div style={{ marginBottom:8 }}>
                  <CardSelector cards={heroCards} onCardChange={setHeroCards} maxCards={2} usedKeys={board.map(c=>c.rank+c.suit)} slotSize={48}/>
                </div>
                {/* Positions row */}
                <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:6 }}>
                  <select value={heroPos} onChange={e=>{ const newPos=e.target.value; if(newPos===villainPos) setVillainPos(heroPos); setHeroPos(newPos); }} style={{ flex:1, background:"#0F172A", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"6px 8px", color:C.text, fontSize:12, fontWeight:600, minWidth:0 }}>
                    {POSITIONS_FULL.map(pos=>(<option key={pos} value={pos}>{pos}</option>))}
                  </select>
                  <span style={{ fontSize:10, color:C.disabled, flexShrink:0 }}>vs</span>
                  <select value={villainPos} onChange={e=>{ const newPos=e.target.value; if(newPos===heroPos) setHeroPos(villainPos); setVillainPos(newPos); }} style={{ flex:1, background:"#0F172A", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"6px 8px", color:C.text, fontSize:12, fontWeight:600, minWidth:0 }}>
                    {POSITIONS_FULL.map(pos=>(<option key={pos} value={pos}>{pos}</option>))}
                  </select>
                  {!isMultiway&&(
                    <div style={{ padding:"4px 8px", borderRadius:5, fontSize:9, fontWeight:700, color:heroIsIP?C.green:C.red, background:heroIsIP?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.08)", border:"1px solid "+(heroIsIP?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.2)"), flexShrink:0, whiteSpace:"nowrap" }}>
                      {heroIsIP?"IP":"OOP"}
                    </div>
                  )}
                </div>
                {/* Archetype pills */}
                <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                  {Object.entries(ARCHETYPES).map(([key,prof])=>(
                    <button key={key} onClick={()=>setArchetype(key)} style={{ padding:"4px 8px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer", background:archetype===key?prof.color+"22":C.surface, border:"1px solid "+(archetype===key?prof.color:C.border), color:archetype===key?prof.color:C.muted }}>{prof.label}</button>
                  ))}
                </div>
                {/* Archetype detail - expandable */}
                <div style={{ marginTop:8, padding:"8px 10px", borderRadius:6, background:"rgba(255,255,255,0.03)", border:"1px solid "+ARCHETYPES[archetype].color+"22" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:ARCHETYPES[archetype].color }}>{ARCHETYPES[archetype].label}</span>
                    <button onClick={()=>setOppExpanded(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:9, color:C.disabled, padding:0 }}>
                      {oppExpanded?"Hide":"Stats"}
                    </button>
                  </div>
                  {oppExpanded&&(
                    <>
                      <div style={{ fontSize:10, color:C.muted, lineHeight:1.4, fontStyle:"italic", marginTop:4, marginBottom:6 }}>{ARCHETYPES[archetype].desc}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4, paddingTop:6, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                        {[["VPIP",ARCHETYPES[archetype].vpip+"%"],["Aggr",ARCHETYPES[archetype].aggression+"%"],["Fold",ARCHETYPES[archetype].foldFlop+"%"]].map(([lbl,val])=>(
                          <div key={lbl} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:13, fontWeight:700, color:ARCHETYPES[archetype].color }}>{val}</div>
                            <div style={{ fontSize:8, color:C.disabled, textTransform:"uppercase" }}>{lbl}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:10 }}>
                        {[["VPIP","vpip","Loose","Tight",0,80],["Aggression","aggression","Passive","Aggressive",0,100],["Fold to Bet","foldFlop","Sticky","Foldy",0,100]].map(([label,key,lo,hi,min,max])=>{
                          const sl2 = sliders || ARCHETYPES[archetype];
                          const val2 = sl2[key] ?? ARCHETYPES[archetype][key];
                          return (
                            <div key={key}>
                              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                                <span style={{ color:C.muted }}>{label}</span>
                                <span style={{ color:C.gold, fontWeight:700 }}>{val2}%</span>
                              </div>
                              <GhostSlider label="" value={val2} baseline={ARCHETYPES[archetype][key]} min={min} max={max} onChange={v=>setSliders(s=>({...(s||ARCHETYPES[archetype]),[key]:v}))} color={ARCHETYPES[archetype].color}/>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:14 }}/>

              {/* GROUP 2: STREET ACTION - situation + villain action + board */}
              <div style={{ paddingBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>
                  {street.charAt(0).toUpperCase()+street.slice(1)} Action
                </div>
                {/* Street tabs */}
                <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                  {["preflop","flop","turn","river"].map(s=>(
                    <button key={s} onClick={()=>{
                      const idx = STREET_ORDER.indexOf(s);
                      const futureStreets = STREET_ORDER.slice(idx);
                      const toClear = futureStreets.reduce((a,k)=>{a[k]=null;return a;},{});
                      setDecisions(prev=>({...prev,...toClear}));
                      setVilAction(v => v.filter(a => !futureStreets.includes(a.street)));
                      setRec(null);
                      if(s==="preflop") { setBoard([]); setPreflopSituation("unopened"); }
                      else if(s==="flop"&&board.length>3) setBoard(b=>b.slice(0,3));
                      else if(s==="turn"&&board.length>4) setBoard(b=>b.slice(0,4));
                      setStreet(s);
                    }} style={{ flex:1, padding:"5px 2px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer", background:street===s?C.purple+"33":C.surface, border:"1px solid "+(street===s?C.purple:C.border), color:street===s?C.purple:C.muted, textTransform:"capitalize" }}>{s}</button>
                  ))}
                </div>
                {/* Preflop: situation + opponents */}
                {street==="preflop"&&(
                  <>
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:9, color:C.disabled, marginBottom:4 }}>Opponents Left</div>
                      <div style={{ display:"flex", gap:3 }}>
                        {["1","2","3","4+"].map(n=>(<button key={n} onClick={()=>{ setPlayersLeft(n); setIsMultiway(parseInt(n)>=2); }} style={{ flex:1, padding:"6px 0", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer", background:playersLeft===n?C.amber+"22":C.surface, border:"1px solid "+(playersLeft===n?C.amber:C.border), color:playersLeft===n?C.amber:C.muted }}>{n}</button>))}
                      </div>
                    </div>
                  </>
                )}
                {/* Postflop: board */}
                {street!=="preflop"&&(
                  <div style={{ marginBottom:8 }}>
                    <BoardSelector board={board} onBoardChange={setBoard} street={street} usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}/>
                  </div>
                )}
              </div>

              <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:14 }}/>

              {/* GROUP 3: TABLE SETTINGS - collapsed by default */}
              <div style={{ paddingBottom:14 }}>
                <button onClick={()=>setTableSettingsOpen(v=>!v)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", padding:0 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>Table Settings</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:11, color:C.gold, fontWeight:600 }}>{gameSize.label}</span>
                    <span style={{ fontSize:9, color:C.disabled }}>&#183;</span>
                    <span style={{ fontSize:11, color:C.muted }}>${Math.round(stackBB*gameSize.bb)}</span>
                    <span style={{ fontSize:9, color:C.disabled }}>&#183;</span>
                    <span style={{ fontSize:11, color:C.muted }}>{playersLeft} opp</span>
                    <span style={{ fontSize:9, color:C.disabled, transform:tableSettingsOpen?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.15s", display:"inline-block" }}>&#9660;</span>
                  </div>
                </button>
                {tableSettingsOpen&&(
                  <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:10 }}>
                    {/* Game size */}
                    <div>
                      <div style={{ fontSize:9, color:C.disabled, marginBottom:4 }}>Game Size</div>
                      <div style={{ display:"flex", gap:3 }}>
                        {GAME_SIZES.map(gs=>(
                          <button key={gs.label} onClick={()=>setGameSize(gs)} style={{ flex:1, padding:"6px 2px", borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer", background:gameSize.label===gs.label?C.gold+"22":C.surface, border:"1px solid "+(gameSize.label===gs.label?C.gold:C.border), color:gameSize.label===gs.label?C.gold:C.muted }}>{gs.label}</button>
                        ))}
                      </div>
                    </div>
                    {/* Stacks */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div>
                        <div style={{ fontSize:9, color:C.disabled, marginBottom:4 }}>Hero Stack</div>
                        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
                          <button onClick={()=>{ setStackBB(v=>Math.max(1,v-5)); setHeroStackCustom(true); }} style={{ width:24,height:24,borderRadius:4,border:"1px solid "+C.border,background:C.surface,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700 }}>-</button>
                          <input type="number" value={stackBB} onChange={e=>{ setStackBB(Math.max(1,+e.target.value)); setHeroStackCustom(true); }} style={{ flex:1,background:"#0F172A",border:"1px solid rgba(255,255,255,0.10)",borderRadius:5,padding:"4px 6px",color:C.gold,fontSize:12,fontWeight:700,textAlign:"center",width:40 }}/>
                          <button onClick={()=>{ setStackBB(v=>v+5); setHeroStackCustom(true); }} style={{ width:24,height:24,borderRadius:4,border:"1px solid "+C.border,background:C.surface,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700 }}>+</button>
                        </div>
                        <div style={{ fontSize:8, color:C.disabled, textAlign:"center", marginTop:2 }}>{stackBB}bb = ${Math.round(stackBB*gameSize.bb)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:9, color:C.disabled, marginBottom:4 }}>Villain Stack</div>
                        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
                          <button onClick={()=>{ setVillainStackBB(v=>Math.max(1,v-5)); setVillainStackCustom(true); }} style={{ width:24,height:24,borderRadius:4,border:"1px solid "+C.border,background:C.surface,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700 }}>-</button>
                          <input type="number" value={villainStackBB} onChange={e=>{ setVillainStackBB(Math.max(1,+e.target.value)); setVillainStackCustom(true); }} style={{ flex:1,background:"#0F172A",border:"1px solid rgba(255,255,255,0.10)",borderRadius:5,padding:"4px 6px",color:C.gold,fontSize:12,fontWeight:700,textAlign:"center",width:40 }}/>
                          <button onClick={()=>{ setVillainStackBB(v=>v+5); setVillainStackCustom(true); }} style={{ width:24,height:24,borderRadius:4,border:"1px solid "+C.border,background:C.surface,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700 }}>+</button>
                        </div>
                        <div style={{ fontSize:8, color:C.disabled, textAlign:"center", marginTop:2 }}>{villainStackBB}bb = ${Math.round(villainStackBB*gameSize.bb)}</div>
                      </div>
                    </div>
                    {/* Pot size */}
                    <div>
                      <div style={{ fontSize:9, color:C.disabled, marginBottom:4 }}>Pot ($) - auto-updates as action progresses</div>
                      <div style={{ display:"flex", gap:3, alignItems:"center", marginBottom:4 }}>
                        <span style={{ fontSize:12, color:C.gold, fontWeight:700 }}>$</span>
                        <input type="number" value={Math.round(potSize * gameSize.bb)} onChange={e=>setPotSize(Math.max(1,+e.target.value) / gameSize.bb)} style={{ flex:1,background:"#0F172A",border:"1px solid rgba(255,255,255,0.10)",borderRadius:5,padding:"4px 6px",color:C.gold,fontSize:12,fontWeight:700,textAlign:"center" }}/>
                      </div>
                      <div style={{ display:"flex", gap:3 }}>
                        {(()=>{
                          const b = gameSize.bb;
                          const blindsDollars = gameSize.totalBlinds;
                          const presets = [
                            ["Blinds", blindsDollars],
                            ["Limped", blindsDollars + b * 2],
                            ["SRP", b * 7],
                            ["3-Bet", b * 22],
                          ];
                          return presets.map(([lbl,dollars])=>{
                            const bbVal = dollars / b;
                            const isActive = Math.abs(potSize - bbVal) < 1;
                            return (<button key={lbl} onClick={()=>setPotSize(bbVal)} style={{ flex:1,padding:"4px 0",borderRadius:4,fontSize:9,background:isActive?C.teal+"22":C.surface,border:"1px solid "+(isActive?C.teal:C.border),color:isActive?C.teal:C.muted,cursor:"pointer",fontWeight:600 }}>{lbl} ${dollars}</button>);
                          });
                        })()}
                      </div>
                    </div>
                    {/* Multiway */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:10, color:C.disabled }}>3+ Players?</span>
                      <div style={{ display:"flex", gap:3 }}>
                        {["No","Yes"].map(v=>(
                          <button key={v} onClick={()=>{ setIsMultiway(v==="Yes"); if(v==="No") setHeroLastToAct(null); }} style={{ padding:"3px 12px", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer", background:(isMultiway?(v==="Yes"):(v==="No"))?"rgba(139,92,246,0.2)":C.surface, border:"1px solid "+((isMultiway?(v==="Yes"):(v==="No"))?C.purple:C.border), color:(isMultiway?(v==="Yes"):(v==="No"))?C.purple:C.muted }}>{v}</button>
                        ))}
                      </div>
                    </div>
                    {isMultiway&&(
                      <div style={{ padding:"8px 10px", borderRadius:5, background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.15)" }}>
                        <div style={{ fontSize:10, color:C.purple, fontWeight:600, marginBottom:4 }}>Hero Last to Act?</div>
                        <div style={{ display:"flex", gap:3 }}>
                          {["Yes","No"].map(v=>(<button key={v} onClick={()=>setHeroLastToAct(v==="Yes")} style={{ flex:1, padding:"4px 0", borderRadius:4, fontSize:10, fontWeight:700, cursor:"pointer", background:heroLastToAct===(v==="Yes")?"rgba(139,92,246,0.25)":C.surface, border:"1px solid "+(heroLastToAct===(v==="Yes")?C.purple:C.border), color:heroLastToAct===(v==="Yes")?C.purple:C.muted }}>{v}</button>))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* GROUP 4: CTA - sticky at bottom */}
            <div style={{ padding:"12px 16px", borderTop:"1px solid "+C.border, flexShrink:0 }}>
              <Btn variant="primary" onClick={()=>{ runAnalysis(); setDrawerOpen(false); }} disabled={!heroCards[0]||!heroCards[1]} style={{ width:"100%", padding:"13px", fontSize:14, fontWeight:700, borderRadius:8 }}>
                {loading?"Analyzing...":"Get Recommendation"}
              </Btn>
            </div>
          </div>
        )}
        {/* Drawer backdrop */}
        {drawerOpen&&(
          <div onClick={()=>setDrawerOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:149 }}/>
        )}

        {/* STREET PROGRESS BAR */}
        <div style={{ marginBottom:16 }}>
          <StreetProgressBar
            street={street}
            decisions={decisions}
            board={board}
            onStreetClick={(s)=>{
              const idx = STREET_ORDER.indexOf(s);
              const futureStreets = STREET_ORDER.slice(idx);
              const toClear = futureStreets.reduce((a,k)=>{a[k]=null;return a;},{});
              setDecisions(prev=>({...prev,...toClear}));
              setVilAction(v => v.filter(a => !futureStreets.includes(a.street)));
              setRec(null);
              if(s==="preflop") setPreflopSituation("unopened");
              setStreet(s);
              setTimeout(()=>runAnalysis(),50);
            }}
          />
        </div>

        {/* V3 MAIN CONTENT */}
        <div className="riq-main-grid" style={{ display:"grid", gridTemplateColumns:rec?"1fr 380px":"1fr", gap:20, alignItems:"start" }}>

          {/* CENTER: DECISION CARD */}
          <div>
            
            {/* Street progression guidance - neutral, not error-toned */}
            {rec&&rec._invalid&&!rec._preflop_closed&&(
              <div style={{ marginBottom:12, padding:"14px 18px", borderRadius:8,
                background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)",
                animation:"fadeUp 0.2s ease" }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.purple, marginBottom:4 }}>
                  {(()=>{
                    const err = (rec._errors||[])[0]||"";
                    if(err.includes("turn"))   return "Add the Turn card to continue.";
                    if(err.includes("river"))  return "Add the River card to continue.";
                    if(err.includes("flop"))   return "Add the Flop cards to continue.";
                    return "Add the remaining board cards to continue.";
                  })()}
                </div>
                <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>
                  Your recommendation will automatically update once cards are added.
                </div>
                <BoardSelector
                  board={board}
                  onBoardChange={b => {
                    setBoard(b);
                    const needed = { preflop:0, flop:3, turn:4, river:5 };
                    if (b.length >= (needed[street]||0)) setTimeout(() => runAnalysis(), 50);
                  }}
                  street={street}
                  usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                />
              </div>
            )}
            {rec&&rec._warnings&&rec._warnings.length>0&&rec._warnings.some(w=>
              !w.includes("inconsistent with action") &&
              !w.includes("corrected to") &&
              !w.includes("facing a bet") &&
              !w.includes("facing a raise") &&
              !w.includes("at this node")
            )&&(
              <div style={{ marginBottom:8, padding:"10px 14px", borderRadius:6,
                background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)" }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.amber, marginBottom:4 }}>Auto-corrected</div>
                {rec._warnings.filter(w=>
                  !w.includes("inconsistent with action") &&
                  !w.includes("corrected to") &&
                  !w.includes("facing a bet") &&
                  !w.includes("facing a raise") &&
                  !w.includes("at this node")
                ).map((w,i)=>(
                  <div key={i} style={{ fontSize:11, color:"#FCD34D", lineHeight:1.5 }}>{w}</div>
                ))}
              </div>
            )}

            {/* Pre-analysis CTA */}
            {!rec&&!isInitialized&&(
              <div style={{ textAlign:"center", padding:"80px 20px", animation:"fadeUp 0.4s ease" }}>
                <div style={{ marginBottom:20, opacity:0.12 }}><RangeIQLogo size={52}/></div>
                <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:8 }}>Enter your hand to begin</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:28 }}>Set up the spot and get your highest-EV exploit</div>
                <Btn variant="primary" onClick={()=>setDrawerOpen(true)} style={{ fontSize:14, fontWeight:700, padding:"12px 28px" }}>
                  Get Started &#8594;
                </Btn>
              </div>
            )}

            {/* Mid-hand board input - rec is null because street advanced, board cards needed */}
            {!rec&&isInitialized&&(
              <div style={{ padding:"28px", animation:"fadeUp 0.3s ease" }}>
                {(()=>{
                  const needed = { preflop:0, flop:3, turn:4, river:5 };
                  const boardComplete = board.length >= (needed[street]||0) && street !== "preflop";
                  if (boardComplete) {
                    // Board is complete but rec hasn't populated yet - useEffect auto-run handles this.
                    // Show a manual button as fallback.
                    return (
                      <>
                        <div style={{ fontSize:16, fontWeight:700, color:C.purple, marginBottom:6 }}>
                          {street.charAt(0).toUpperCase()+street.slice(1)} board ready.
                        </div>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
                          Tap below if your recommendation doesn't appear automatically.
                        </div>
                        <button onClick={()=>{ setHasRun(true); runAnalysis(); }} style={{
                          padding:"10px 24px", borderRadius:8,
                          background:C.gold, border:"none", color:"#111827",
                          fontSize:13, fontWeight:700, cursor:"pointer",
                        }}>
                          Get {street.charAt(0).toUpperCase()+street.slice(1)} Recommendation
                        </button>
                      </>
                    );
                  }
                  return (
                    <>
                      <div style={{ fontSize:16, fontWeight:700, color:C.purple, marginBottom:6 }}>
                        {street==="flop"&&board.length<3 ? "Add "+(3-board.length)+" flop card"+(3-board.length!==1?"s":"")+" to continue."
                         : street==="turn"&&board.length<4 ? "Add the turn card to continue."
                         : street==="river"&&board.length<5 ? "Add the river card to continue."
                         : "Add board cards to continue."}
                      </div>
                      <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
                        Your recommendation will update automatically once the board is complete.
                      </div>
                      {street!=="preflop"&&(
                        <BoardSelector
                          board={board}
                          onBoardChange={b => {
                            setBoard(b);
                            if (b.length >= (needed[street]||0)) setTimeout(() => runAnalysis(), 50);
                          }}
                          street={street}
                          usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {rec&&(
              <div style={{ animation:"fadeUp 0.3s ease" }}>

                {/* VILLAIN ACTION SELECTOR  -  spec: VillainActionSelector */}
                {/* Full-width, above Decision Card, real-time trigger */}
                {(()=>{
                  // If hero is already all-in (stack = 0), no further action is possible
                  // Skip the entire villain action row - go straight to showdown
                  const heroStackZero = Math.round(stackBB * gameSize.bb) <= 0;
                  if (heroStackZero && street !== "preflop") {
                    return (
                      <div style={{ background:C.card, borderRadius:10, border:"1px solid rgba(245,158,11,0.3)",
                        padding:"16px 20px", marginBottom:12 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.amber, marginBottom:4 }}>All-In - No Further Action</div>
                        <div style={{ fontSize:12, color:C.muted }}>
                          All chips are in the pot. Add the remaining board cards and proceed to showdown.
                        </div>
                      </div>
                    );
                  }

                  const streetActs = (vilAction||[]).filter(a=>a.street===street);
                  const heroRaiseAct = streetActs.find(a=>a.actor==="hero_raise");
                  const vilOnlyActs = streetActs.filter(a=>a.actor!=="hero_raise");
                  const lastVilAct = vilOnlyActs.length > 0 ? vilOnlyActs[vilOnlyActs.length-1] : null;
                  const lastType   = lastVilAct ? lastVilAct.type : null;
                  const isFacingBet= lastType === "bet" || lastType === "raise";
                  const showAmtInput = lastType === "bet" || lastType === "raise";
                  // After hero raises, villain needs to respond
                  const heroRaised = !!heroRaiseAct;
                  const awaitingVilResponse = heroRaised && !streetActs.some(a=>a.actor==="Villain" && streetActs.indexOf(a) > streetActs.indexOf(heroRaiseAct));

                  // Hero legal actions based on villain action + position + street
                  let heroLegal;
                  if (street === "preflop") {
                    if (heroIsIP) {
                      // Hero IP: villain acted first (OOP)
                      if (!lastType) {
                        heroLegal = []; // waiting for villain to act
                      } else if (lastType === "raise") {
                        heroLegal = ["3-Bet","Call","Fold"]; // facing villain's open
                      } else if (lastType === "check") {
                        heroLegal = ["Open Raise","Call","Fold"]; // villain limped, hero can iso/open
                      } else if (lastType === "fold") {
                        heroLegal = []; // villain folded preflop - done
                      } else {
                        heroLegal = ["Open Raise","Call","Fold"];
                      }
                    } else {
                      // Hero OOP: hero acts first
                      if (!lastType) {
                        heroLegal = ["Open Raise","Call","Fold"]; // hero opens
                      } else if (lastType === "raise") {
                        heroLegal = ["4-Bet","Call","Fold"]; // villain re-raised hero's open
                      } else if (lastType === "call") {
                        heroLegal = ["Raise","Check","Fold"]; // villain called
                      } else if (lastType === "fold") {
                        heroLegal = []; // villain folded - done
                      } else {
                        heroLegal = ["Open Raise","Call","Fold"];
                      }
                    }
                  } else {
                    heroLegal = !lastType
                      ? (heroIsIP ? [] : ["Bet","Check"])
                      : isFacingBet
                        ? ["Fold","Call","Raise"]
                        : ["Bet","Check"];
                  }

                  function setVilAct(type) {
                    if (awaitingVilResponse) {
                      // Villain responding to hero's raise - append, don't replace
                      setVilAction(prev => [
                        ...prev,
                        { type, street, actor: "Villain",
                          amount: (type==="bet"||type==="raise") ? vilBetAmount : null }
                      ]);
                    } else {
                      setVilAction(prev => [
                        ...prev.filter(a => a.street !== street),
                        { type, street, actor: "Villain",
                          amount: (type==="bet"||type==="raise") ? vilBetAmount : null }
                      ]);
                    }
                    if (type !== "bet" && type !== "raise") setVilBetAmount("");
                    // Sync preflopSituation based on position + villain action
                    if (street === "preflop") {
                      if (heroIsIP) {
                        // Villain acted first (OOP)
                        if (type === "raise" || type === "bet") {
                          // Villain opened/bet - hero is now FACING A RAISE -> 3-Bet/Call/Fold
                          setPreflopSituation("raise");
                        } else if (type === "check") {
                          // Villain limped/checked - treat as one_limper so hero gets Iso Raise rec
                          setPreflopSituation("one_limper");
                        } else if (type === "fold") {
                          // Villain folded before hero - DSE will fire villain_fold closure
                          setPreflopSituation("unopened");
                        }
                      } else {
                        // Hero acted first (OOP); villain is responding to hero's action
                        if (type === "raise") {
                          // Villain 3-bet or iso-raised hero - hero is now FACING A RAISE
                          // Set to "raise" so recommendPreflop gives 4-Bet/Call/Fold rec
                          setPreflopSituation("raise");
                        } else if (type === "call") {
                          // Villain called hero's open - mark hero as having acted
                          // so DSE closure fires (hero_raise_villain_call)
                          setDecisions(prev => ({
                            ...prev,
                            preflop: prev.preflop || { action: "Open Raise", _auto: true }
                          }));
                        }
                        // fold: DSE villain_fold closure will handle it
                      }
                      setTimeout(() => runAnalysis(), 80);
                    }
                  }

                  const streetLabel = street.charAt(0).toUpperCase() + street.slice(1);
                  const actColors = { check:"#F59E0B", bet:"#10B981", raise:"#8B5CF6", fold:"#EF4444" };
                  const selBg = "#D9B95B"; const selText = "#111827";

                  return (
                    <div style={{ marginBottom:12 }}>
                      {/* Container per spec: #111827, border #1F2937, radius 12px */}
                      <div style={{
                        background:"#111827", border:"1px solid #1F2937",
                        borderRadius:12, padding:"16px 20px",
                        marginBottom:0,
                      }}>
                        {/* Section title per spec */}
                        <div style={{ fontSize:12, fontWeight:600, color:"#9CA3AF",
                          letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12,
                          fontFamily:"Inter,sans-serif" }}>
                          {streetLabel} Action
                        </div>

                        {/* Villain action row */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                          <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:500, minWidth:52 }}>{parseInt(playersLeft)>=2?"Opponents:":"Villain:"}</span>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                            {(()=>{
                              // Villain buttons driven by POSITION + action state
                              const allActsThisStreet = (vilAction||[]).filter(a => a.street === street);
                              const heroRaisedThisStreet = allActsThisStreet.some(a => a.actor === "hero_raise");

                              // If hero just raised, villain responds: Fold / Call / Raise
                              if (heroRaisedThisStreet && awaitingVilResponse) {
                                const respButtons = ["fold","call","raise"];
                                const respShowAmt = lastType === "raise";
                                return (<>
                                  {respButtons.map(a => {
                                    const isSelected = lastType === a;
                                    return (<button key={a} onClick={()=>setVilAct(a)} style={{ height:36, padding:"0 14px", borderRadius:8, fontSize:14, fontWeight:500, fontFamily:"Inter,sans-serif", cursor:"pointer", background: isSelected ? selBg : "#1F2937", color: isSelected ? selText : "#D1D5DB", border: "1px solid " + (isSelected ? "#D9B95B" : "#374151"), transition:"all 0.12s" }}>{a.charAt(0).toUpperCase()+a.slice(1)}</button>);
                                  })}
                                  {respShowAmt && (
                                    <input type="number" placeholder="$" value={vilBetAmount}
                                      onChange={e => {
                                        setVilBetAmount(e.target.value);
                                        setVilAction(prev => [
                                          ...prev.filter(a => !(a.street === street && a.actor === "Villain" && (a.type === "raise" || a.type === "call" || a.type === "fold"))),
                                          { type: "raise", street, actor:"Villain", amount: e.target.value }
                                        ]);
                                      }}
                                      onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }} style={{ width:80, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:14, padding:"0 10px", fontFamily:"Inter,sans-serif" }}
                                    />
                                  )}
                                  {lastType && (
                                    <button onClick={() => {
                                      setVilAction(v => v.filter(a => !(a.street === street && a.actor === "Villain")));
                                      setVilBetAmount("");
                                    }}
                                      style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>
                                      Clear
                                    </button>
                                  )}
                                </>);
                              }

                              if (street === "preflop") {
                                const heroHasActed = decisions && decisions.preflop;
                                const numOppsLocal = parseInt(playersLeft) || 1;

                                // Multiway preflop caller selector when hero has RAISED (not checked)
                                const heroRaisedPreflop = heroHasActed && heroHasActed.action &&
                                  (heroHasActed.action === "Open Raise" || heroHasActed.action === "Isolate Raise" ||
                                   heroHasActed.action === "3-Bet" || heroHasActed.action === "4-Bet" ||
                                   heroHasActed.action === "Raise");
                                if (heroRaisedPreflop && numOppsLocal >= 2) {
                                  // Frame as "how many folded?" - remainder called
                                  const foldOpts = [];
                                  foldOpts.push({ label: "All Call", type: "call", callers: numOppsLocal, folds: 0 });
                                  for (let f = 1; f < numOppsLocal; f++) {
                                    const callers = numOppsLocal - f;
                                    foldOpts.push({ label: f + " Folded", type: "call", callers, folds: f });
                                  }
                                  foldOpts.push({ label: "All Fold", type: "fold", callers: 0, folds: numOppsLocal });
                                  const existVil = allActsThisStreet.filter(a=>a.actor==="Villain").slice(-1)[0];
                                  const selCallers = existVil ? (existVil._callers !== undefined ? existVil._callers : (existVil.type==="fold"?0:-1)) : -1;
                                  const isRaiseSel = existVil && existVil.type === "raise";

                                  return (<>
                                    {foldOpts.map(opt => {
                                      const isAct = selCallers === opt.callers && !isRaiseSel;
                                      return (
                                        <button key={opt.label}
                                          onClick={() => {
                                            setVilAction(prev => [
                                              ...prev.filter(a => a.street !== street || a.actor !== "Villain"),
                                              { type: opt.type, street, actor: "Villain", _callers: opt.callers, amount: null }
                                            ]);
                                            setVilBetAmount("");
                                            if (opt.callers < numOppsLocal && opt.callers > 0) {
                                              setPlayersLeft(String(opt.callers));
                                              setIsMultiway(opt.callers >= 2);
                                            }
                                          }}
                                          style={{
                                            height:36, padding:"0 12px", borderRadius:8,
                                            fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif", cursor:"pointer",
                                            background: isAct ? (opt.type==="fold"?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)") : "#1F2937",
                                            color: isAct ? (opt.type==="fold"?"#F87171":"#10B981") : "#D1D5DB",
                                            border: "1px solid " + (isAct ? (opt.type==="fold"?"#F87171":"#10B981") : "#374151"),
                                            transition:"all 0.12s",
                                          }}>
                                          {opt.label}
                                        </button>
                                      );
                                    })}
                                    <button
                                      onClick={() => {
                                        setVilAction(prev => [
                                          ...prev.filter(a => a.street !== street || a.actor !== "Villain"),
                                          { type: "raise", street, actor: "Villain", _callers: 0, amount: vilBetAmount || "" }
                                        ]);
                                      }}
                                      style={{
                                        height:36, padding:"0 12px", borderRadius:8,
                                        fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif", cursor:"pointer",
                                        background: isRaiseSel ? "rgba(245,158,11,0.15)" : "#1F2937",
                                        color: isRaiseSel ? "#F59E0B" : "#D1D5DB",
                                        border: "1px solid " + (isRaiseSel ? "#F59E0B" : "#374151"),
                                        transition:"all 0.12s",
                                      }}>
                                      Raised
                                    </button>
                                    {isRaiseSel && (
                                      <input type="number" placeholder="$" value={vilBetAmount}
                                        onChange={e => {
                                          setVilBetAmount(e.target.value);
                                          setVilAction(prev => [
                                            ...prev.filter(a => a.street !== street || a.actor !== "Villain"),
                                            { type: "raise", street, actor:"Villain", _callers: 0, amount: e.target.value }
                                          ]);
                                        }}
                                        style={{ width:70, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:13, padding:"0 8px", fontFamily:"Inter,sans-serif" }}
                                        onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }}
                                      />
                                    )}
                                    {(selCallers >= 0 || isRaiseSel) && (
                                      <button onClick={() => { setVilAction(v => v.filter(a => a.street !== street || a.actor !== "Villain")); setVilBetAmount(""); }}
                                        style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>
                                        Clear
                                      </button>
                                    )}
                                  </>);
                                }

                                let pfButtons;
                                if (heroHasActed) {
                                  // If hero checked (BB checking option), no opponent response needed
                                  const heroChecked = heroHasActed.action === "Check";
                                  if (heroChecked) {
                                    // Everyone limped, BB checked - auto-close preflop, go to flop
                                    return (<span style={{ fontSize:12, color:C.muted }}>All players limped - proceed to the flop.</span>);
                                  }
                                  pfButtons = ["fold","call","raise"];
                                } else if (heroIsIP) {
                                  pfButtons = ["check","bet","fold"];
                                } else {
                                  // OOP hero hasn't acted yet
                                  const isBBPos = heroPos === "BB" || heroPos === "bb";
                                  if (isBBPos && numOppsLocal >= 2) {
                                    // BB with multiple opponents - need to know what they did
                                    const existVilBB = allActsThisStreet.filter(a=>a.actor==="Villain").slice(-1)[0];
                                    const vilTypeBB = existVilBB ? existVilBB.type : null;
                                    return (<>
                                      {["limped","raised","fold"].map(a => {
                                        const label = a === "limped" ? "All Limped" : a === "raised" ? "Raised" : "All Fold";
                                        const isSelected = (a === "limped" && vilTypeBB === "check") || (a === "raised" && vilTypeBB === "raise") || (a === "fold" && vilTypeBB === "fold");
                                        return (<button key={a} onClick={() => {
                                          if (a === "limped") {
                                            setVilAction(prev => [...prev.filter(x=>x.street!==street), { type:"check", street, actor:"Villain", _callers: numOppsLocal }]);
                                            setPreflopSituation("one_limper");
                                            setVilBetAmount("");
                                          } else if (a === "raised") {
                                            setVilAction(prev => [...prev.filter(x=>x.street!==street), { type:"raise", street, actor:"Villain", amount: vilBetAmount || "" }]);
                                            setPreflopSituation("raise");
                                          } else {
                                            setVilAction(prev => [...prev.filter(x=>x.street!==street), { type:"fold", street, actor:"Villain" }]);
                                            setPreflopSituation("unopened");
                                            setVilBetAmount("");
                                          }
                                        }} style={{ height:36, padding:"0 14px", borderRadius:8, fontSize:14, fontWeight:500, fontFamily:"Inter,sans-serif", cursor:"pointer", background: isSelected ? selBg : "#1F2937", color: isSelected ? selText : "#D1D5DB", border: "1px solid " + (isSelected ? "#D9B95B" : "#374151"), transition:"all 0.12s" }}>{label}</button>);
                                      })}
                                      {vilTypeBB === "raise" && (
                                        <input type="number" placeholder="$" value={vilBetAmount}
                                          onChange={e => {
                                            setVilBetAmount(e.target.value);
                                            setVilAction(prev => [...prev.filter(x=>x.street!==street), { type:"raise", street, actor:"Villain", amount: e.target.value }]);
                                          }}
                                          onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }} style={{ width:80, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:14, padding:"0 10px", fontFamily:"Inter,sans-serif" }}
                                        />
                                      )}
                                      {vilTypeBB && (
                                        <button onClick={() => { setVilAction(v=>v.filter(a=>a.street!==street)); setVilBetAmount(""); setPreflopSituation("unopened"); }}
                                          style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>Clear</button>
                                      )}
                                    </>);
                                  }
                                  pfButtons = ["fold","call","raise"];
                                }
                                const pfShowAmt = lastType === "bet" || lastType === "raise";
                                return (<>
                                  {pfButtons.map(a => {
                                    const isSelected = lastType === a;
                                    return (<button key={a} onClick={()=>setVilAct(a)} style={{ height:36, padding:"0 14px", borderRadius:8, fontSize:14, fontWeight:500, fontFamily:"Inter,sans-serif", cursor:"pointer", background: isSelected ? selBg : "#1F2937", color: isSelected ? selText : "#D1D5DB", border: "1px solid " + (isSelected ? "#D9B95B" : "#374151"), transition:"all 0.12s" }}>{a.charAt(0).toUpperCase()+a.slice(1)}</button>);
                                  })}
                                  {pfShowAmt && (
                                    <input type="number" placeholder="$" value={vilBetAmount}
                                      onChange={e => {
                                        setVilBetAmount(e.target.value);
                                        setVilAction(prev => [
                                          ...prev.filter(a => a.street !== street),
                                          { type: lastType, street, actor:"Villain", amount: e.target.value }
                                        ]);
                                      }}
                                      onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }} style={{ width:80, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:14, padding:"0 10px", fontFamily:"Inter,sans-serif" }}
                                    />
                                  )}
                                  {lastType && (
                                    <button onClick={() => {
                                      setVilAction(v => v.filter(a => a.street !== street));
                                      setVilBetAmount("");
                                      setPreflopSituation("unopened");
                                      setDecisions(prev => ({ ...prev, preflop: null }));
                                    }}
                                      style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>
                                      Clear
                                    </button>
                                  )}
                                </>);
                              }

                              // --- POSTFLOP ---
                              const heroDecisionThisStreet = decisions && decisions[street] && decisions[street].action &&
                                 (decisions[street].action === "Bet" || decisions[street].action === "Raise" ||
                                  decisions[street].action === "Re-Raise" || decisions[street].action === "All-In");
                              const heroBetInHistory = allActsThisStreet.some(a => a.actor === "Hero" &&
                                (a.type === "bet" || a.type === "raise"));
                              const heroAllIn = rec && (rec._all_in || rec._already_all_in || rec.action === "All-In");

                              if (rec && rec._already_all_in) {
                                return null; // no buttons - straight to showdown
                              }

                              const heroBetted = heroDecisionThisStreet || heroBetInHistory || heroAllIn;
                              const numOpps = parseInt(playersLeft) || 1;

                              // --- MULTIWAY CALLER SELECTOR ---
                              if (numOpps >= 2 && heroBetted && street !== "preflop") {
                                // Frame as "how many folded?" - remainder called
                                const foldOptions = [];
                                foldOptions.push({ label: "All Call", type: "call", callers: numOpps, folds: 0 });
                                for (let f = 1; f < numOpps; f++) {
                                  const callers = numOpps - f;
                                  foldOptions.push({ label: f + " Folded", type: "call", callers, folds: f });
                                }
                                foldOptions.push({ label: "All Fold", type: "fold", callers: 0, folds: numOpps });
                                const existingVilAct = allActsThisStreet.filter(a=>a.actor==="Villain").slice(-1)[0];
                                const selectedCallers = existingVilAct ? (existingVilAct._callers !== undefined ? existingVilAct._callers : (existingVilAct.type === "fold" ? 0 : -1)) : -1;
                                const isRaiseSelected = existingVilAct && existingVilAct.type === "raise";

                                return (<>
                                  {foldOptions.map(opt => {
                                    const isActive = selectedCallers === opt.callers && !isRaiseSelected;
                                    return (
                                      <button key={opt.label}
                                        onClick={() => {
                                          setVilAction(prev => [
                                            ...prev.filter(a => a.street !== street),
                                            { type: opt.type, street, actor: "Villain", _callers: opt.callers, amount: null }
                                          ]);
                                          setVilBetAmount("");
                                          if (opt.callers < numOpps && opt.callers > 0) {
                                            setPlayersLeft(String(opt.callers));
                                            setIsMultiway(opt.callers >= 2);
                                          }
                                        }}
                                        style={{
                                          height:36, padding:"0 12px", borderRadius:8,
                                          fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif", cursor:"pointer",
                                          background: isActive ? (opt.type==="fold"?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)") : "#1F2937",
                                          color: isActive ? (opt.type==="fold"?"#F87171":"#10B981") : "#D1D5DB",
                                          border: "1px solid " + (isActive ? (opt.type==="fold"?"#F87171":"#10B981") : "#374151"),
                                          transition:"all 0.12s",
                                        }}>
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                  <button
                                    onClick={() => {
                                      setVilAction(prev => [
                                        ...prev.filter(a => a.street !== street),
                                        { type: "raise", street, actor: "Villain", _callers: 0, amount: vilBetAmount || "" }
                                      ]);
                                    }}
                                    style={{
                                      height:36, padding:"0 12px", borderRadius:8,
                                      fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif", cursor:"pointer",
                                      background: isRaiseSelected ? "rgba(245,158,11,0.15)" : "#1F2937",
                                      color: isRaiseSelected ? "#F59E0B" : "#D1D5DB",
                                      border: "1px solid " + (isRaiseSelected ? "#F59E0B" : "#374151"),
                                      transition:"all 0.12s",
                                    }}>
                                    Raised
                                  </button>
                                  {isRaiseSelected && (
                                    <input type="number" placeholder="$" value={vilBetAmount}
                                      onChange={e => {
                                        setVilBetAmount(e.target.value);
                                        setVilAction(prev => [
                                          ...prev.filter(a => a.street !== street),
                                          { type: "raise", street, actor:"Villain", _callers: 0, amount: e.target.value }
                                        ]);
                                      }}
                                      style={{ width:70, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:13, padding:"0 8px", fontFamily:"Inter,sans-serif" }}
                                      onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }}
                                    />
                                  )}
                                  {(selectedCallers >= 0 || isRaiseSelected) && (
                                    <button onClick={() => { setVilAction(v => v.filter(a => a.street !== street)); setVilBetAmount(""); }}
                                      style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>
                                      Clear
                                    </button>
                                  )}
                                </>);
                              }

                              // --- STANDARD BUTTONS (heads-up or villain acting first) ---
                              const stdButtons = heroBetted ? ["fold","call","raise"] : (heroIsIP ? ["check","bet","fold"] : ["check","bet","fold"]);
                              const stdShowAmt = lastType === "bet" || lastType === "raise";
                              return (<>
                                {stdButtons.map(a => {
                                  const isSelected = lastType === a;
                                  return (
                                    <button key={a}
                                      onClick={() => setVilAct(a)}
                                      style={{
                                        height:36, padding:"0 14px", borderRadius:8,
                                        fontSize:14, fontWeight:500, fontFamily:"Inter,sans-serif", cursor:"pointer",
                                        background: isSelected ? selBg : "#1F2937",
                                        color: isSelected ? selText : "#D1D5DB",
                                        border: "1px solid " + (isSelected ? "#D9B95B" : "#374151"),
                                        transition:"all 0.12s",
                                      }}>
                                      {a.charAt(0).toUpperCase() + a.slice(1)}
                                    </button>
                                  );
                                })}
                                {stdShowAmt && (
                                  <input type="number" placeholder="$" value={vilBetAmount}
                                    onChange={e => {
                                      setVilBetAmount(e.target.value);
                                      setVilAction(prev => [
                                        ...prev.filter(a => a.street !== street),
                                        { type: lastType, street, actor:"Villain", amount: e.target.value }
                                      ]);
                                    }}
                                    onBlur={e => { const v = setVilBetValidated(e.target.value); if (v && v !== e.target.value) { setVilAction(prev => prev.map(a => (a.street === street && a.actor === "Villain" && a.amount) ? {...a, amount: v} : a)); } }} style={{ width:80, height:36, background:"#0F172A", border:"1px solid #374151", borderRadius:8, color:"#E5E7EB", fontSize:14, padding:"0 10px", fontFamily:"Inter,sans-serif" }}
                                  />
                                )}
                                {lastType && (
                                  <button onClick={() => {
                                    setVilAction(v => v.filter(a => a.street !== street));
                                    setVilBetAmount("");
                                    if (street === "preflop") { setPreflopSituation("unopened"); setDecisions(prev => ({ ...prev, preflop: null })); }
                                  }}
                                    style={{ height:36, padding:"0 10px", borderRadius:8, fontSize:12, cursor:"pointer", background:"transparent", border:"1px solid #374151", color:"#6B7280" }}>
                                    Clear
                                  </button>
                                )}
                              </>);
                            })()}
                          </div>
                        </div>

                        {/* Hero action display per spec */}
                        <div style={{ marginTop:10 }}>
                          <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:6 }}>
                            {!lastType && heroIsIP
                              ? (parseInt(playersLeft)>=2
                                ? "Opponents act first - select their action above. ("+playersLeft+"-way pot)"
                                : "Villain acts first - select their action above.")
                              : !lastType && !heroIsIP
                                ? (parseInt(playersLeft)>=2
                                  ? "You act first (out of position) in a "+playersLeft+"-way pot."
                                  : "You act first (out of position) - select your action, then Villain responds.")
                                : null}
                          </div>
                          {heroLegal.length > 0 && (() => {
                            const recAction = rec && rec.action;
                            const recMatches = recAction && heroLegal.some(a =>
                              a === recAction ||
                              (recAction.includes("3-Bet") && (a === "3-Bet" || a === "4-Bet")) ||
                              (recAction.includes("4-Bet") && (a === "4-Bet" || a === "3-Bet")) ||
                              (recAction.includes("Call") && a === "Call") ||
                              (recAction.includes("Fold") && a === "Fold") ||
                              (recAction.includes("Raise") && a === "Raise")
                            );
                            // Postflop: when hero faces a villain bet/raise, Fold and Call are
                            // terminal hero actions that close the street. Make them clickable
                            // so the DSE closure can fire.
                            const postflopFacingBet = street !== "preflop" && isFacingBet;
                            const heroStreetDec = decisions && decisions[street];

                            function handleHeroTerminalAction(a) {
                              // Hero Fold is ALWAYS terminal - hand is over regardless of street
                              if (a === "Fold") {
                                setDecisions(prev => ({
                                  ...prev,
                                  [street]: { action: "Fold", _hero_terminal: true }
                                }));
                                setTimeout(() => runAnalysis(), 80);
                                return;
                              }
                              // Call/Raise on postflop facing a bet
                              if (!postflopFacingBet) return;
                              if (a === "Call") {
                                // Terminal hero action - closes the street
                                setDecisions(prev => ({
                                  ...prev,
                                  [street]: { action: a, _hero_terminal: true }
                                }));
                                setTimeout(() => runAnalysis(), 80);
                              } else if (a === "Raise" || a === "Re-Raise") {
                                // Non-terminal: hero raises, villain needs to respond
                                // Record hero's raise as a non-terminal decision
                                setDecisions(prev => ({
                                  ...prev,
                                  [street]: { ...rec, action: rec.action || "Re-Raise" }
                                }));
                                // Add hero's raise to vilAction timeline so DSE sees it
                                // Then villain gets to respond (Fold/Call/Raise)
                                setVilAction(prev => [
                                  ...prev.filter(x => !(x.street === street && x.actor === "hero_raise")),
                                  { type: "raise", street, actor: "hero_raise",
                                    amount: rec.size_dollars || null }
                                ]);
                                setTimeout(() => runAnalysis(), 80);
                              }
                            }

                            return (
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:500, minWidth:52 }}>Hero:</span>
                                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                                  {heroLegal.map(a => {
                                    const isRec = recAction && (
                                      a === recAction ||
                                      (recAction.includes("3-Bet") && (a === "3-Bet" || a === "4-Bet")) ||
                                      (recAction.includes("4-Bet") && (a === "4-Bet" || a === "3-Bet")) ||
                                      (recAction.includes("Call") && a === "Call") ||
                                      (recAction.includes("Fold") && a === "Fold") ||
                                      (recAction.includes("Raise") && a === "Raise")
                                    );
                                    const isSelected = heroStreetDec && heroStreetDec._hero_terminal &&
                                      heroStreetDec.action === a;
                                    const isClickable = (a === "Fold") || (postflopFacingBet && (a === "Call" || a === "Raise" || a === "Re-Raise"));
                                    return (
                                      <span key={a}
                                        onClick={isClickable ? () => handleHeroTerminalAction(a) : undefined}
                                        style={{
                                          fontSize: (isRec || isSelected) ? 13 : 12,
                                          fontWeight: (isRec || isSelected) ? 700 : 400,
                                          padding: (isRec || isSelected) ? "5px 14px" : "4px 10px",
                                          borderRadius:99,
                                          background: isSelected ? "#10B98128"
                                            : isRec ? recColor+"28"
                                            : "rgba(255,255,255,0.03)",
                                          border:"1px solid "+(isSelected ? "#10B98188"
                                            : isRec ? recColor+"88"
                                            : "rgba(255,255,255,0.07)"),
                                          color: isSelected ? "#10B981"
                                            : isRec ? recColor
                                            : isClickable ? "#6B7280"
                                            : "#4B5563",
                                          cursor: isClickable ? "pointer" : "default",
                                          transition:"all 0.15s",
                                        }}>
                                        {a}
                                      </span>
                                    );
                                  })}
                                  {recMatches && !heroStreetDec?._hero_terminal && (
                                    <span style={{ fontSize:10, color:"#6B7280", fontStyle:"italic" }}>&#8592; recommended</span>
                                  )}
                                  {(postflopFacingBet || (recAction && recAction === "Fold")) && !heroStreetDec?._hero_terminal && (
                                    <span style={{ fontSize:10, color:"#4B5563", fontStyle:"italic" }}>click to continue</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SPOT CONTEXT BAR - SPR, pot odds, board texture, effective stack */}
                {rec && rec._spot && rec.action && !rec._preflop_closed && street !== "preflop" && (
                  <div style={{
                    display:"flex", alignItems:"center", gap:0, marginBottom:12,
                    background:C.card, borderRadius:10, border:"1px solid "+C.border,
                    overflow:"hidden", animation:"fadeUp 0.25s ease",
                  }}>
                    {/* SPR */}
                    <div style={{ flex:1, padding:"10px 14px", borderRight:"1px solid "+C.border, textAlign:"center" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>SPR</div>
                      <div style={{ fontSize:16, fontWeight:800, color:rec._spot.spr <= 3 ? C.red : rec._spot.spr <= 6 ? C.amber : C.green, lineHeight:1 }}>
                        {rec._spot.spr}
                      </div>
                      <div style={{ fontSize:8, color:C.disabled, marginTop:2 }}>
                        {rec._spot.spr <= 3 ? "Commit" : rec._spot.spr <= 6 ? "Medium" : "Deep"}
                      </div>
                    </div>
                    {/* Board Texture */}
                    {rec._spot.tex && (
                      <div style={{ flex:1, padding:"10px 14px", borderRight:"1px solid "+C.border, textAlign:"center" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>Board</div>
                        <div style={{ fontSize:14, fontWeight:800, color:rec._spot.tex.col, lineHeight:1 }}>
                          {rec._spot.tex.label}
                        </div>
                        <div style={{ fontSize:8, color:C.disabled, marginTop:2 }}>
                          {rec._spot.tex.mono ? "Monotone" : "Wet "+rec._spot.tex.wet}
                        </div>
                      </div>
                    )}
                    {/* Pot Odds (only when facing a bet) */}
                    {rec._spot.potOdds ? (
                      <div style={{ flex:1.2, padding:"10px 14px", borderRight:"1px solid "+C.border, textAlign:"center" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>Pot Odds</div>
                        <div style={{ fontSize:16, fontWeight:800, color:C.blue, lineHeight:1 }}>
                          {rec._spot.potOdds.ratio}:1
                        </div>
                        <div style={{ fontSize:8, color:C.blue, marginTop:2, opacity:0.8 }}>
                          Need {rec._spot.potOdds.equityNeeded}% equity
                        </div>
                      </div>
                    ) : (
                      <div style={{ flex:1, padding:"10px 14px", borderRight:"1px solid "+C.border, textAlign:"center" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>Pot</div>
                        <div style={{ fontSize:16, fontWeight:800, color:C.gold, lineHeight:1 }}>
                          ${rec._spot.potDollars}
                        </div>
                      </div>
                    )}
                    {/* Effective Stack */}
                    <div style={{ flex:1, padding:"10px 14px", textAlign:"center" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>Eff. Stack</div>
                      <div style={{ fontSize:16, fontWeight:800, color:C.text, lineHeight:1 }}>
                        ${rec._spot.effStack}
                      </div>
                      <div style={{ fontSize:8, color:C.disabled, marginTop:2 }}>
                        {rec._spot.effStackBB}bb
                      </div>
                    </div>
                  </div>
                )}

                {/* DECISION CARD - hidden when state is incomplete */}
                <div style={{
                  background:C.card, borderRadius:14,
                  border:"1px solid "+recColor+"33",
                  boxShadow:"0 0 40px "+recColor+"0d",
                  overflow:"hidden", marginBottom:16,
                  display:(rec&&rec._flags&&rec._flags.includes("missing_state"))?"none":"block",
                }}>
                  {/* COMPLETED STATE - spec: CompletedStateCard */}
                  {rec&&rec._preflop_closed ? (() => {
                    const closureReason = rec._closure_reason;
                    const isVilFold = rec._villain_folded || closureReason === "villain_fold_postflop";
                    const isHeroFold = closureReason === "hero_folded";
                    // Compute next street from current street state, not stale rec._next_street
                    const recStreet = rec.str || "preflop";
                    const streetLabel = recStreet.charAt(0).toUpperCase() + recStreet.slice(1);
                    const nextStMap = { preflop:"flop", flop:"turn", turn:"river", river:null };
                    const nextSt = nextStMap[recStreet] || null;
                    const nextLabel = nextSt ? nextSt.charAt(0).toUpperCase() + nextSt.slice(1) : null;
                    const mwLabel = parseInt(playersLeft) >= 2;
                    const vilNoun = mwLabel ? "Opponents" : "Villain";
                    const pillLabel = isVilFold ? vilNoun+" Folded"
                      : isHeroFold ? "Hero Folded"
                      : closureReason === "hero_raise_villain_call" ? vilNoun+" Called"
                      : closureReason === "villain_called_hero_bet" ? vilNoun+" Called"
                      : closureReason === "hero_called_villain_raise" ? "Hero Called"
                      : closureReason === "both_checked" ? "Checked Through"
                      : "Street Closed";

                    // Build action recap line: "Hero Bet $16 (66% pot) -> Villain Called"
                    const heroDecision = decisions && decisions[recStreet];
                    const lastVilActThis = (vilAction||[]).filter(a=>a.street===recStreet).slice(-1)[0];
                    const heroSizingStr = heroDecision
                      ? (heroDecision.sizingLabel || (heroDecision.size_dollars ? "$" + heroDecision.size_dollars : heroDecision.sizing) || "")
                      : "";
                    const heroActionStr = heroDecision && heroDecision.action
                      ? heroDecision.action + (heroSizingStr ? " " + heroSizingStr : "")
                      : null;
                    const vilActionStr = lastVilActThis
                      ? lastVilActThis.type.charAt(0).toUpperCase() + lastVilActThis.type.slice(1)
                        + (lastVilActThis.amount ? " $" + lastVilActThis.amount : "")
                      : null;
                    const vilNounRecap = parseInt(playersLeft) >= 2 ? "Villains" : "Villain";
                    const actionRecap = heroActionStr && vilActionStr
                      ? "Hero " + heroActionStr + " \u2192 " + vilNounRecap + " " + vilActionStr
                      : heroActionStr
                        ? "Hero " + heroActionStr
                        : vilActionStr
                          ? vilNounRecap + " " + vilActionStr
                          : null;

                    return (
                    <div style={{ padding:"28px 28px 24px", minHeight:360, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                      {/* Header */}
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:16 }}>
                          Street Complete
                        </div>
                        {/* Main headline */}
                        <div style={{ fontSize:44, fontWeight:700, color:"#A78BFA", lineHeight:1.1, marginBottom:16 }}>
                          {isVilFold ? "Villain Folded" : isHeroFold ? "Hero Folded" : streetLabel + " Complete"}
                        </div>
                        {/* Status pill */}
                        <div style={{ display:"inline-flex", alignItems:"center", height:28, padding:"0 12px", borderRadius:99,
                          background:"rgba(139,92,246,0.14)", border:"1px solid rgba(139,92,246,0.28)",
                          fontSize:13, fontWeight:600, color:"#A78BFA", marginBottom:actionRecap ? 12 : 24 }}>
                          {pillLabel}
                        </div>
                        {/* Action recap line */}
                        {actionRecap && (
                          <div style={{ fontSize:12, color:C.gold, fontWeight:600, fontFamily:"'JetBrains Mono',monospace",
                            background:"rgba(230,197,102,0.08)", border:"1px solid rgba(230,197,102,0.25)",
                            borderRadius:6, padding:"6px 12px", display:"inline-block", marginBottom:20 }}>
                            {actionRecap}
                          </div>
                        )}
                        {/* Guidance + next-street action */}
                        {!isVilFold && nextSt && (
                          <div>
                            <div style={{ fontSize:16, fontWeight:700, color:"#E5E7EB", marginBottom:12 }}>
                              {rec._guidance || (streetLabel + " complete - advance to the " + nextLabel + ".")}
                            </div>
                            {/* Show BoardSelector based on rec's street, not current street state */}
                            {recStreet === "preflop" && (
                              <div style={{ marginBottom:8 }}>
                                <BoardSelector
                                  board={board}
                                  onBoardChange={newBoard => {
                                    setBoard(newBoard);
                                    if (newBoard.length === 3) {
                                      advanceToFlopKeepingBoard();
                                    }
                                  }}
                                  street="flop"
                                  usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                                />
                                {board.length === 3 && (
                                  <button onClick={() => {
                                    if (street !== "flop") advanceToFlopKeepingBoard();
                                    pendingAnalysis.current = true;
                                    setRec(null);
                                  }} style={{
                                    marginTop:12, padding:"10px 24px", borderRadius:8,
                                    background:"#D9B95B", border:"none", color:"#111827",
                                    fontSize:13, fontWeight:700, cursor:"pointer",
                                  }}>
                                    Get Flop Recommendation
                                  </button>
                                )}
                              </div>
                            )}
                            {recStreet === "flop" && (
                              <div style={{ marginBottom:8 }}>
                                <BoardSelector
                                  board={board}
                                  onBoardChange={newBoard => {
                                    setBoard(newBoard);
                                    if (newBoard.length >= 4) {
                                      advanceToStreet("turn");
                                    }
                                  }}
                                  street="turn"
                                  usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                                />
                              </div>
                            )}
                            {recStreet === "turn" && (
                              <div style={{ marginBottom:8 }}>
                                <BoardSelector
                                  board={board}
                                  onBoardChange={newBoard => {
                                    setBoard(newBoard);
                                    if (newBoard.length >= 5) {
                                      advanceToStreet("river");
                                    }
                                  }}
                                  street="river"
                                  usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {(isVilFold || isHeroFold) && (
                          <div style={{ fontSize:18, fontWeight:700, color:"#E5E7EB" }}>
                            {isVilFold ? "Hand complete - hero wins the pot." : "Hand complete - hero folded."}
                          </div>
                        )}
                        {!isVilFold && !isHeroFold && !nextSt && (
                          <div style={{ fontSize:18, fontWeight:700, color:"#E5E7EB" }}>
                            River complete - enter showdown result below.
                          </div>
                        )}
                      </div>
                      {/* Progress row */}
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <span style={{ fontSize:13, color:"#9CA3AF" }}>Resolved: {streetLabel}</span>
                          {!isVilFold && !isHeroFold && nextLabel && (
                            <span style={{ fontSize:13, color:C.gold, fontWeight:600 }}>Next: {nextLabel}</span>
                          )}
                        </div>
                        <div style={{ height:2, background:C.gold, borderRadius:99, opacity:0.6, marginBottom:20 }}/>
                        {/* Footer buttons */}
                        <div style={{ display:"flex", gap:8 }}>
                          <button style={{ padding:"0 16px", height:48, borderRadius:8, fontSize:12, fontWeight:600,
                            background:C.surface, border:"1px solid "+C.border, color:C.muted, cursor:"pointer" }}>
                            Train This Spot
                          </button>
                          <button onClick={saveHand}
                            disabled={saveState==="saving"||saveState==="saved"}
                            style={{ padding:"0 16px", height:48, borderRadius:8, fontSize:12, fontWeight:600,
                            background:C.surface, border:"1px solid "+(saveState==="saved"?C.green+"66":C.border),
                            color:saveState==="saved"?C.green:C.muted, cursor:saveState==="saved"?"default":"pointer" }}>
                            {saveState==="saved"?"Saved!":saveState==="saving"?"Saving...":"Save"}
                          </button>
                          {!isVilFold && !isHeroFold && nextSt && (
                            <button
                              onClick={() => {
                                if (recStreet === "preflop") {
                                  if (street !== "flop") advanceToFlopKeepingBoard();
                                  if (board.length >= 3) {
                                    pendingAnalysis.current = true;
                                    setRec(null);
                                  }
                                } else {
                                  advanceToStreet(nextSt);
                                }
                              }}
                              style={{ flex:1, height:48, borderRadius:8, fontSize:14, fontWeight:700,
                                background:"#D9B95B", border:"none", color:"#111827", cursor:"pointer" }}>
                              {recStreet === "preflop" ? (board.length >= 3 ? "Get Flop Recommendation" : "Add Flop Cards") : "Go to " + nextLabel + " \u2192"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })() : (<>
                  <div style={{ padding:"28px 28px 0" }}>{/* Zone 1 - Action */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em" }}>
                          Recommended Action
                        </div>
                        {(isMultiway || parseInt(playersLeft)>=2) && (
                          <span style={{ padding:"2px 8px", borderRadius:99, fontSize:9, fontWeight:700,
                            background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.3)",
                            color:C.amber }}>
                            {parseInt(playersLeft)>=2 ? (parseInt(playersLeft)+1)+"-Way Pot" : "Multiway Pot"}
                          </span>
                        )}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {/* Persistent builder access - small pill button */}
                        <button onClick={()=>setDrawerOpen(true)} style={{
                          padding:"4px 10px", borderRadius:99, fontSize:10, fontWeight:600,
                          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)",
                          color:C.muted, cursor:"pointer", letterSpacing:"0.04em",
                          transition:"all 0.15s", flexShrink:0,
                        }}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(139,92,246,0.15)";e.currentTarget.style.borderColor="rgba(139,92,246,0.4)";e.currentTarget.style.color=C.purple;}}
                        onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.borderColor="rgba(255,255,255,0.12)";e.currentTarget.style.color=C.muted;}}>
                          &#9881; Builder
                        </button>
                        <div style={{ position:"relative" }}>
                        <select value={archetype} onChange={e=>setArchetype(e.target.value)} style={{
                          background:C.surface, border:"1px solid "+C.border,
                          borderRadius:6, padding:"4px 24px 4px 10px",
                          color:ARCHETYPES[archetype]?.color||C.muted,
                          fontSize:11, fontWeight:700, cursor:"pointer",
                          appearance:"none", WebkitAppearance:"none",
                        }}>
                          {Object.entries(ARCHETYPES).map(([key,prof])=>(
                            <option key={key} value={key}>vs {prof.label}</option>
                          ))}
                        </select>
                        <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", fontSize:9, color:C.disabled }}>&#9660;</span>
                        </div>
                      </div>
                    </div>
                    {/* Action + Dollar  -  same size/weight/color */}
                    {rec._already_all_in ? (
                    <div style={{ textAlign:"center", padding:"20px 0" }}>
                      <div style={{ fontSize:36, fontWeight:900, color:C.amber, lineHeight:1, marginBottom:8 }}>Already All-In</div>
                      <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>
                        You committed your entire stack on a previous street. No further action is possible - wait for the remaining board cards to be dealt.
                      </div>
                    </div>
                    ) : rec.action ? (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                        <span style={{ fontSize:48, fontWeight:900, color:recColor, lineHeight:1, letterSpacing:"-2px" }}>{rec.action}</span>
                        {rec.size_dollars > 0 && (
                          <span style={{ fontSize:48, fontWeight:900, color:recColor, lineHeight:1, letterSpacing:"-2px" }}>
                            {rec._all_in ? "$"+rec.size_dollars : (()=>{
                              const isPreflop = rec.str==="preflop";
                              return rec.size_dollars ? (isPreflop ? "to $"+rec.size_dollars : "$"+rec.size_dollars) : null;
                            })()}
                          </span>
                        )}
                        {!rec.size_dollars && rec.sizing && rec.sizing !== "All-In" && (()=>{
                          const dollarAmt = sizingToDollars(rec.sizing, potSize, gameSize.bb);
                          return dollarAmt ? (
                            <span style={{ fontSize:48, fontWeight:900, color:recColor, lineHeight:1, letterSpacing:"-2px" }}>{dollarAmt}</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Sizing context sub-label: pot %, into $X pot */}
                      {rec.action && rec.action !== "Check" && rec.action !== "Fold" && rec.action !== "Call" && rec.str !== "preflop" && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                          {rec.pot_percentage && (
                            <span style={{ fontSize:12, fontWeight:700, color:recColor, opacity:0.7 }}>
                              {rec.pot_percentage}% pot
                            </span>
                          )}
                          {rec.sizing && rec.sizing.endsWith("x") && (
                            <span style={{ fontSize:12, fontWeight:700, color:recColor, opacity:0.7 }}>
                              {rec.sizing} raise
                            </span>
                          )}
                          {rec._spot && rec._spot.potDollars > 0 && (
                            <span style={{ fontSize:11, color:C.disabled }}>
                              into ${rec._spot.potDollars} pot
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    ) : (
                    <div style={{ padding:"24px 0 16px", textAlign:"center" }}>
                      <div style={{ fontSize:16, fontWeight:700, color:C.gold, marginBottom:6 }}>
                        {rec._waiting_for_villain
                          ? (parseInt(playersLeft)>=2 ? "Opponents act first ("+playersLeft+"-way pot)" : "Villain acts first")
                          : "Waiting for action..."}
                      </div>
                      <div style={{ fontSize:13, color:C.muted }}>
                        {rec._wait_message
                          ? rec._wait_message
                          : rec._waiting_for_villain
                            ? "Select Villain's action above to see your recommendation."
                            : "Complete the action above to generate a recommendation."}
                      </div>
                    </div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                      {rec.actionType&&(
                        <span style={{ padding:"3px 10px", borderRadius:99, background:recColor+"18", border:"1px solid "+recColor+"33", color:recColor, fontSize:11, fontWeight:700 }}>
                          {rec.actionType}
                        </span>
                      )}
                      <span style={{ fontSize:13, color:C.muted, fontStyle:"italic" }}>
                        {(()=>{
                          // Position + action-aware context label
                          const isIP = heroIsIP;
                          const streetActs = (vilAction||[]).filter(a=>a.street===rec.str);
                          const lastVil = streetActs.length > 0 ? streetActs[streetActs.length-1] : null;
                          const vilBet = lastVil && (lastVil.type==="bet"||lastVil.type==="raise");
                          const vilCheck = !lastVil || lastVil.type==="check";
                          const isRiverIP = rec.str==="river" && isIP;

                          if (rec.populationContext) return rec.populationContext;

                          // Check-back on river in position  -  never a trap
                          if (rec.action==="Check" && isRiverIP && vilCheck)
                            return "Check back for showdown value - no further action possible";
                          // Check-back facing a bet is a call (already handled by legality engine)
                          if (rec.action==="Call" && vilBet)
                            return "Calling the bet - villain range includes many bluffs";
                          // Bet when villain checked and hero is IP on river
                          if (rec.action==="Bet" && isRiverIP && vilCheck)
                            return "Last action on river - bet for value or give up";
                          // Generic archetype fallbacks
                          const m={
                            station:"High-value exploit vs calling station",
                            nit:"Fold equity steal vs tight opponent",
                            maniac:vilBet?"Villain bet - call down or raise with strong hands":"Check back - let villain lead, no action remains",
                            lag:"Value raise - charge drawing equity",
                            loose_passive:"Relentless value vs passive caller",
                            tag:"Balanced exploit - positional advantage is key",
                            rec:"Population exploit vs recreational player",
                            unknown:"Standard exploit vs unknown opponent range",
                          };
                          return m[archetype]||"Best exploit vs this opponent";
                        })()}
                      </span>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                        <span style={{ fontSize:28, fontWeight:800, color:band.col, lineHeight:1 }}>{rec.score}%</span>
                        <span style={{ fontSize:28, fontWeight:800, color:band.col, lineHeight:1, opacity:0.85 }}>Confidence</span>
                      </div>
                      <div style={{ width:"100%", height:3, background:"rgba(255,255,255,0.08)", borderRadius:99, marginTop:5 }}>
                        <div style={{ height:"100%", borderRadius:99, background:band.col, width:rec.score+"%" }}/>
                      </div>
                    </div>
                  </div>

                  {/* Zone 2 - Reasoning bullets */}
                  <div style={{ padding:"0 28px 20px" }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                      {(rec.bullets||[]).slice(0,2).map((b,i)=>(
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                          <span style={{ color:recColor, fontSize:8, marginTop:5, flexShrink:0 }}>&#9679;</span>
                          <span style={{ fontSize:14, color:C.text, lineHeight:1.55 }}>{b}</span>
                        </div>
                      ))}
                    </div>
                    {/* Pot Odds Context - when facing a bet and action is Call or Fold */}
                    {rec._spot && rec._spot.potOdds && (rec.action === "Call" || rec.action === "Fold") && (
                      <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                        borderRadius:8, background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.15)" }}>
                        <span style={{ fontSize:16, fontWeight:800, color:C.blue }}>{rec._spot.potOdds.ratio}:1</span>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          {rec.action === "Call"
                            ? "You need "+rec._spot.potOdds.equityNeeded+"% equity to call $"+rec._spot.potOdds.vilBet+" into a $"+rec._spot.potOdds.totalPot+" pot. Your hand meets this threshold."
                            : "You need "+rec._spot.potOdds.equityNeeded+"% equity to call $"+rec._spot.potOdds.vilBet+" into a $"+rec._spot.potOdds.totalPot+" pot. Your hand falls short."}
                        </div>
                      </div>
                    )}
                    {/* SPR Commitment Zone Warning */}
                    {rec._spot && rec._spot.spr > 0 && rec._spot.spr <= 4 && street !== "preflop" && rec.action && rec.action !== "Fold" && (
                      <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
                        borderRadius:8, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)" }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>&#9888;</span>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          <span style={{ fontWeight:700, color:rec._spot.spr <= 2 ? C.red : C.amber }}>SPR {rec._spot.spr}</span>
                          {rec._spot.spr <= 2
                            ? " - You are in the commitment zone. Any bet commits your stack. If your hand is worth betting, it is worth going all-in."
                            : " - Low SPR. Be prepared to commit your stack if you bet or face a raise. Only enter the pot with hands you are willing to stack off with."}
                        </div>
                      </div>
                    )}
                    {(rec._multiway_note || ((isMultiway || parseInt(playersLeft)>=2) && rec.action)) && (
                      <div style={{ marginTop:10, borderRadius:8,
                        background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.15)",
                        padding:"10px 14px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.amber, marginBottom:2 }}>
                          Multiway Pot Detected ({parseInt(playersLeft)+1} Players)
                        </div>
                        <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Strategy adjusted for multiple opponents.</div>
                        <details>
                          <summary style={{ fontSize:11, color:C.text, cursor:"pointer", fontWeight:600, marginBottom:8, userSelect:"none" }}>
                            View multiway strategy details
                          </summary>
                          <div style={{ fontSize:11, color:C.muted, lineHeight:1.7 }}>
                            <div style={{ marginBottom:6 }}>
                              <span style={{ fontWeight:700, color:C.gold }}>Primary Villain Focus</span>
                              <div>Decisions target the opponent most likely to call your bets (your highest EV source).</div>
                            </div>
                            <div style={{ marginBottom:6 }}>
                              <span style={{ fontWeight:700, color:C.text }}>Multiway Adjustments</span>
                              <div style={{ paddingLeft:8 }}>
                                <div>&#8226; Tighter value range &#8594; bet strong hands only</div>
                                <div>&#8226; Larger bet sizes &#8594; charge multiple draws</div>
                                <div>&#8226; Fewer bluffs &#8594; someone usually has a hand</div>
                              </div>
                            </div>
                            <div style={{ marginBottom:6 }}>
                              <span style={{ fontWeight:700, color:C.text }}>Why one opponent?</span>
                              <div>The most profitable exploit comes from the weakest player. Other players are accounted for by requiring stronger hands to bet.</div>
                            </div>
                            <div>
                              <span style={{ fontWeight:700, color:C.text }}>How to use this</span>
                              <div>Select the player most likely to call (usually a Calling Station or Loose Passive). RangeIQ will maximize value while protecting against stronger players.</div>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                    {/* Limped Pot Context */}
                    {rec._limped_pot_context && rec.action && (
                      <div style={{ marginTop:10, borderRadius:8,
                        background:"rgba(20,184,166,0.06)", border:"1px solid rgba(20,184,166,0.15)",
                        padding:"10px 14px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.teal, marginBottom:2 }}>
                          Limped Pot
                        </div>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          {rec._limped_pot_context}
                        </div>
                      </div>
                    )}
                    {/* Sizing Tell */}
                    {rec._sizing_tell && rec.action && (
                      <div style={{ marginTop:10, borderRadius:8,
                        background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.15)",
                        padding:"10px 14px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.purple, marginBottom:2 }}>
                          Live Sizing Tell
                        </div>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          {rec._sizing_tell}
                        </div>
                      </div>
                    )}
                    {/* Position Tell (donk bet, IP probe) */}
                    {rec._position_tell && rec.action && !rec._sizing_tell && (
                      <div style={{ marginTop:10, borderRadius:8,
                        background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.15)",
                        padding:"10px 14px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.blue, marginBottom:2 }}>
                          Live Position Tell
                        </div>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          {rec._position_tell}
                        </div>
                      </div>
                    )}
                    {/* River Tell */}
                    {rec._river_tell && rec.action && !rec._sizing_tell && (
                      <div style={{ marginTop:10, borderRadius:8,
                        background:"rgba(251,146,60,0.06)", border:"1px solid rgba(251,146,60,0.15)",
                        padding:"10px 14px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.amber, marginBottom:2 }}>
                          River Pattern
                        </div>
                        <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                          {rec._river_tell}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Zone 3 - Insights */}
                  <div style={{ padding:"14px 28px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"rgba(255,255,255,0.02)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {(()=>{
                      const pop = buildPopulationProfile(gameSize.bb, archetype, board, rec.str, vilAction);
                      const ins = pop.insights?.[0];
                      return ins ? (
                        <div style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                          <span style={{ fontSize:13 }}>&#128161;</span>
                          <span style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{ins}</span>
                        </div>
                      ) : null;
                    })()}
                    {(()=>{
                      const d = computeExploitDelta(heroCards,archetype,heroIsIP,board,potSize,stackBB);
                      const edgeLvl = getExploitEdgeLevel(d.evGain);
                      return d.evGain > 0 ? (
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:10, color:C.disabled, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Exploit Edge</div>
                          <div style={{ fontSize:14, fontWeight:800, color:edgeLvl.color }}>{edgeLvl.label}</div>
                          <div style={{ fontSize:11, color:edgeLvl.color, opacity:0.8 }}>+{d.evGain} BB/100</div>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* Zone 4 - CTA row: compact Train/Save + contextual Next Street */}
                  <div style={{ padding:"14px 28px", borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>setShowPlaySpot(true)}
                        style={{ padding:"8px 12px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                          background:"rgba(139,92,246,0.12)", border:"1px solid rgba(139,92,246,0.3)", color:C.purple,
                          whiteSpace:"nowrap" }}>
                        Train
                      </button>
                      <button onClick={saveHand}
                        disabled={saveState==="saving"||saveState==="saved"}
                        style={{ padding:"8px 12px", borderRadius:6, fontSize:11, fontWeight:600, cursor:saveState==="saved"?"default":"pointer",
                          background:"transparent", border:"1px solid "+(saveState==="saved"?C.green+"66":C.border),
                          color:saveState==="saved"?C.green:C.muted }}>
                        {saveState==="saved"?"Saved":saveState==="saving"?"...":"Save"}
                      </button>
                    </div>
                    {(()=>{
                      // If rec is Fold, show hand complete
                      const heroFoldedOrRecFold = rec && (rec.action === "Fold" || rec._closure_reason === "hero_folded" || rec.hero_folded);
                      if (heroFoldedOrRecFold) {
                        return (
                          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
                            <button disabled style={{
                              width:"100%", padding:"11px", borderRadius:6, fontSize:13, fontWeight:700,
                              cursor:"default", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                              color:"#F87171", opacity:0.8 }}>
                              Hand Over - Hero Folded
                            </button>
                            <div style={{ fontSize:10, color:C.disabled, textAlign:"center" }}>Click Fold on the hero row above to confirm, or Reset to start a new hand</div>
                          </div>
                        );
                      }

                      const streetOrder=["preflop","flop","turn","river"];
                      const curIdx=streetOrder.indexOf(street);
                      const nextSt=streetOrder[curIdx+1];
                      const isRiver=street==="river";
                      const boardNeeded={preflop:0,flop:3,turn:4,river:5};
                      const boardOk=board.length>=(boardNeeded[street]||0);
                      const streetActionDone = street==="preflop"
                        ? !!(rec && rec._preflop_closed)
                        : !!(rec && rec._preflop_closed);
                      const canGo=!isRiver&&boardOk&&streetActionDone;
                      const disabledReason = isRiver ? null
                        : !boardOk ? "Add board cards to continue"
                        : !streetActionDone ? "Select Villain's response above (Fold, Call, or Raise) to complete this street"
                        : null;
                      return (
                        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
                          <button
                            disabled={!canGo}
                            onClick={()=>{ if(canGo) advanceToStreet(nextSt); }}
                            style={{
                              width:"100%", padding:"11px", borderRadius:6, fontSize:13, fontWeight:700,
                              cursor:canGo?"pointer":"not-allowed",
                              background:canGo?C.gold:isRiver?"rgba(16,185,129,0.1)":"#1F2937",
                              border:isRiver?"1px solid rgba(16,185,129,0.3)":"none",
                              color:canGo?"#111827":isRiver?C.green:"#4B5563",
                              opacity:canGo?1:isRiver?0.8:0.5, transition:"all 0.15s",
                              boxShadow:canGo?"0 2px 12px "+C.gold+"44":"none",
                            }}
                            onMouseEnter={e=>{ if(canGo) e.currentTarget.style.background=C.goldHov; }}
                            onMouseLeave={e=>{ if(canGo) e.currentTarget.style.background=C.gold; }}>
                            {isRiver?"Hand Complete":canGo?"Next Street ("+nextSt.charAt(0).toUpperCase()+nextSt.slice(1)+") &#8594;":"Waiting..."}
                          </button>
                          {disabledReason && !isRiver && (
                            <div style={{ fontSize:10, color:C.disabled, textAlign:"center" }}>{disabledReason}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Zone 5 - Street Progression Panel */}
                  {(()=>{
                    // Don't show board/next street prompts when hero folded or rec is Fold
                    const heroFolded = rec && (rec._closure_reason === "hero_folded" || rec.hero_folded);
                    const recIsFold = rec && rec.action === "Fold";
                    if (heroFolded || recIsFold) return null;

                    const needed={preflop:0,flop:3,turn:4,river:5};
                    const boardComplete = board.length>=(needed[street]||0);
                    const streetOrder=["preflop","flop","turn","river"];
                    const nextStreet=streetOrder[streetOrder.indexOf(street)+1];
                    // Only show if on a non-river street
                    if(street==="river"&&boardComplete) return null;
                    const msg = street==="preflop"
                      ? "Ready to see the flop? Add 3 board cards."
                      : street==="flop"&&board.length<3
                        ? "Add "+(3-board.length)+" more flop card"+(3-board.length!==1?"s":"")+" then get recommendation."
                        : street==="turn"&&board.length<4
                          ? "Add the turn card then get recommendation."
                          : street==="river"&&board.length<5
                            ? "Add the river card then get recommendation."
                            : nextStreet
                              ? "Advance to the "+nextStreet+" to continue."
                              : null;
                    return (
                      <div style={{ padding:"14px 20px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"rgba(139,92,246,0.04)" }}>
                        <div style={{ fontSize:14, color:C.purple, fontWeight:700, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>&#9654;</span>
                          <span>{msg}</span>
                        </div>
                        <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
                          <div style={{ flex:1, minWidth:200 }}>
                            <BoardSelector
                              board={board}
                              onBoardChange={b=>{
                                setBoard(b);
                                // useEffect auto-run detects board/street changes and fires runAnalysis
                                if(street==="preflop"&&b.length>=3) {
                                  advanceToFlopKeepingBoard();
                                }
                              }}
                              street={street==="preflop"?"flop":street}
                              usedKeys={heroCards.filter(Boolean).map(c=>c.rank+c.suit)}
                            />
                          </div>
                          {boardComplete&&nextStreet&&(
                            <button onClick={()=>advanceToStreet(nextStreet)}
                              style={{ padding:"8px 16px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer",
                                background:"rgba(139,92,246,0.15)", border:"1px solid "+C.purple+"55", color:C.purple }}>
                              Go to {nextStreet.charAt(0).toUpperCase()+nextStreet.slice(1)} &#8594;
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Zone 6 - Expandable Analysis */}
                  <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                    <button onClick={()=>setShowAnalysis(v=>!v)} style={{
                      width:"100%", padding:"12px 28px", background:"none", border:"none",
                      cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
                      color:C.muted, fontSize:12, fontWeight:500,
                    }}>
                      <span>{showAnalysis?"Hide Analysis":"Show Analysis & Alternatives"} &#8594;</span>
                      <span style={{ fontSize:10, color:C.disabled, transform:showAnalysis?"rotate(90deg)":"none", transition:"transform 0.2s" }}>&#9654;</span>
                    </button>
                    {showAnalysis&&(
                      <div style={{ padding:"0 28px 24px", animation:"fadeUp 0.2s ease" }}>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                          {[
                            ["Strategy", rec.tag, recColor],
                            rec.tex ? ["Board",rec.tex.label,rec.tex.col] : null,
                            ["Street", rec.str?rec.str.charAt(0).toUpperCase()+rec.str.slice(1):"", C.muted],
                          ].filter(Boolean).map(([label,value,color])=>(
                            <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                              <span style={{ fontSize:10,color:C.disabled,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",minWidth:48 }}>{label}:</span>
                              <span style={{ padding:"2px 9px",borderRadius:99,background:color+"18",color,fontSize:11,fontWeight:600,border:"1px solid "+color+"33" }}>{value}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                          <ProgressBar label="Hand Equity" value={Math.round((rec.hs||0.5)*100)} color={recColor}/>
                          <ProgressBar label="Fold Equity" value={Math.round(rec.foldEq||40)} color={C.teal}/>
                        </div>
                        {rec.altLines&&rec.altLines.length>0&&(
                          <div style={{ marginBottom:16 }}>
                            <div style={{ fontSize:10,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>Alternative Lines</div>
                            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                              {rec.altLines.map((alt,i)=>(
                                <span key={i} style={{ padding:"3px 10px",borderRadius:99,fontSize:12,background:"rgba(255,255,255,0.06)",color:C.muted }}>
                                  {i+2}nd: {alt}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <ExploitDeltaPanel heroCards={heroCards} archetype={archetype} heroIsIP={heroIsIP} board={board} potSize={potSize} stackBB={stackBB}/>
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </div>
                {/* COMPARE MODE */}
                {compareMode&&(
                  <div style={{ marginTop:16, animation:"fadeUp 0.3s ease" }}>
                    <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ padding:"2px 8px", borderRadius:99, background:C.purple+"22", border:"1px solid "+C.purple+"44", color:C.purple }}>Compare Mode</span>
                      <span>Side-by-Side Analysis</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      {[
                        { archetypeKey:archetype, label:"Profile A", accent:ARCHETYPES[archetype]?.color||C.gold },
                        { archetypeKey:compareB,  label:"Profile B", accent:ARCHETYPES[compareB]?.color||C.purple },
                      ].map(({ archetypeKey, label, accent })=>{
                        const cRaw = street==="preflop"
                          ? recommendPreflop({ heroCards, heroPos, bigBlind:gameSize.bb, tableType, preflopSituation, playersLeft, fieldStickiness, archetype:archetypeKey, heroIsIP, isMultiway, heroLastToAct })
                          : recommend({ heroCards, archetype:archetypeKey, heroIsIP, board, potSize, stackBB, bigBlind:gameSize.bb, vilAction });
                        const cValidated = validateReasoningOutput(cRaw, { str: cRaw.str||street, heroIsIP, vilAction, board });
                        const cRec = applyConsistencyCorrections(cValidated, { street, heroIsIP, vilAction, board, heroCards, potSize });
                        const cBand = scoreBand(cRec.score||70);
                        const cDollar = cRec.size_dollars ? "$"+cRec.size_dollars : sizingToDollars(cRec.sizing, potSize, gameSize.bb);
                        return (
                          <div key={archetypeKey} style={{
                            background:C.card, borderRadius:10,
                            border:"1px solid "+accent+"44",
                            boxShadow:"0 0 16px "+accent+"0d",
                            overflow:"hidden",
                          }}>
                            <div style={{ padding:"12px 16px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                <span style={{ fontSize:9, fontWeight:700, color:accent, textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</span>
                                <span style={{ padding:"2px 8px", borderRadius:99, background:accent+"18", border:"1px solid "+accent+"33", color:accent, fontSize:10, fontWeight:700 }}>
                                  {ARCHETYPES[archetypeKey]?.label}
                                </span>
                              </div>
                              <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:12 }}>
                                <span style={{ fontSize:32, fontWeight:900, color:accent, lineHeight:1, letterSpacing:"-1px" }}>{cRec.action}</span>
                                {cDollar&&<span style={{ fontSize:18, fontWeight:800, color:accent }}>
                                  {cRec.str==="preflop" ? "to "+cDollar : cDollar}
                                </span>}
                                {cRec.sizing&&<span style={{ fontSize:11, color:C.muted }}>
                                  {cRec.str==="preflop"
                                    ? (cRec.size_bb ? cRec.size_bb+"bb" : cRec.sizing)
                                    : (cRec.pot_percentage ? cRec.pot_percentage+"% pot" : cRec.sizing+" pot")}
                                </span>}
                              </div>
                            </div>
                            <div style={{ padding:"10px 16px 12px" }}>
                              <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:10 }}>
                                {(cRec.bullets||[]).slice(0,2).map((b,i)=>(
                                  <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                                    <span style={{ color:accent, fontSize:7, marginTop:4, flexShrink:0 }}>&#9679;</span>
                                    <span style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{b}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.08)", borderRadius:99 }}>
                                  <div style={{ height:"100%", borderRadius:99, background:cBand.col, width:(cRec.score||70)+"%" }}/>
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, color:cBand.col, flexShrink:0 }}>{cRec.score||70}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ background:C.card, borderRadius:8, padding:"12px 16px", border:"1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>What Changed</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        {getWhatChanged(archetype, compareB).map((diff,i)=>(
                          <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                            <span style={{ color:C.purple, fontSize:8, marginTop:4, flexShrink:0 }}>&#9679;</span>
                            <span style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>{diff}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {rec&&street==="river"&&board.length===5&&(()=>{
            // Showdown only happens when both players see all 5 cards:
            // - both_checked, villain_called_hero_bet, hero_called_villain_raise
            // Does NOT happen on: villain_fold_postflop, hero_folded, villain_fold (preflop)
            const noShowdownReasons = ["villain_fold_postflop","hero_folded","villain_fold","villain_fold_postflop"];
            const isHandOver = rec._preflop_closed &&
              noShowdownReasons.includes(rec._closure_reason);
            if (isHandOver) return null;
            const isShowdownReady = rec._preflop_closed; // street closed = showdown time
            return (
              <div style={{ marginTop:8 }}>
                {!showShowdown
                  ? <button onClick={()=>setShowShowdown(true)} style={{
                      width:"100%", padding: isShowdownReady ? "13px 14px" : "10px 14px",
                      borderRadius:7, fontSize: isShowdownReady ? 13 : 12, fontWeight:700,
                      background: isShowdownReady ? "rgba(230,197,102,0.15)" : "rgba(230,197,102,0.08)",
                      border:"1px solid rgba(230,197,102," + (isShowdownReady ? "0.5" : "0.25") + ")",
                      color:C.gold, cursor:"pointer",
                      boxShadow: isShowdownReady ? "0 0 16px rgba(230,197,102,0.15)" : "none",
                    }}>
                    {isShowdownReady ? "Enter Showdown Result \u2193" : "\u25B6 Enter Showdown Result"}
                  </button>
                  : <ShowdownPanel rec={rec} heroCards={heroCards} board={board} archetype={archetype} potSize={potSize} gameSize={gameSize} onClose={()=>setShowShowdown(false)} onSave={saveHand}/>
                }
              </div>
            );
          })()}

          {/* RIGHT: TABBED ANALYSIS */}
          {rec&&(
            <div style={{ animation:"fadeUp 0.4s ease" }}>
              <div style={{ display:"flex", gap:0, marginBottom:0, borderRadius:"10px 10px 0 0", overflow:"hidden", border:"1px solid "+C.border, borderBottom:"none" }}>
                {[
                  { key:"storyline", label:"Storyline" },
                  { key:"range",     label:"Range Grid" },
                  { key:"breakdown", label:"Breakdown" },
                ].map(tab=>(
                  <button key={tab.key} onClick={()=>setRightTab(tab.key)} style={{
                    flex:1, padding:"11px 8px", border:"none", cursor:"pointer",
                    background:rightTab===tab.key?C.card:"rgba(255,255,255,0.02)",
                    borderBottom:rightTab===tab.key?"2px solid "+C.purple:"2px solid transparent",
                    color:rightTab===tab.key?C.text:C.disabled,
                    fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em",
                    transition:"all 0.15s",
                  }}>{tab.label}</button>
                ))}
              </div>
              <div style={{ background:C.card, borderRadius:"0 0 10px 10px", border:"1px solid "+C.border, borderTop:"none", padding:16, minHeight:300 }}>
                {rightTab==="storyline"&&(
                  <RangeStorylinePanel snapshots={snapshots} hoveredHand={hoveredHand} onHover={setHoveredHand} archetype={archetype} bigBlind={gameSize.bb} board={board} vilAction={vilAction}/>
                )}
                {rightTab==="range"&&(
                  <div>
                    <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Villain Range</div>
                    {range ? <RangeHeatmap range={range} hoveredHand={hoveredHand} onHover={setHoveredHand}/> : <div style={{ fontSize:12, color:C.disabled, fontStyle:"italic" }}>Generate a recommendation to see the range.</div>}
                  </div>
                )}
                {rightTab==="breakdown"&&(
                  <div>
                    <div style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>Range Composition</div>
                    {cats ? (
                      <>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.5, fontStyle:"italic" }}>
                          {cats["Overpairs"]>20 ? "Villain is weighted toward premium pairs - avoid thin bluffs." :
                           cats["Flush Draws"]>18 ? "Villain is draw-heavy - charge draws now." :
                           cats["Air"]>40 ? "High air density - villain is bluff-heavy, call down." :
                           "Balanced range - standard exploit applies."}
                        </div>
                        <CatBars cats={cats}/>
                        <div style={{ marginTop:16 }}>
                          <PopulationInsightPanel bigBlind={gameSize.bb} archetype={archetype} board={board} street={rec.str} vilAction={vilAction}/>
                        </div>
                      </>
                    ) : <div style={{ fontSize:12, color:C.disabled, fontStyle:"italic" }}>Generate a recommendation to see breakdown.</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════ Share an Idea — Feedback Button ══════ */}
      {!showFeedback && (
        <div
          onClick={()=>setShowFeedback(true)}
          title="Share an idea"
          style={{
            position:"fixed", bottom:16, right:16, zIndex:800,
            background:C.card, border:`1px solid ${C.border}`,
            borderRadius:50, width:40, height:40,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", transition:"all 180ms ease",
            boxShadow:"0 4px 12px rgba(0,0,0,0.3)",
            opacity:0.7,
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.opacity="1";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.opacity="0.7";}}
        >
          <span style={{ fontSize:16, lineHeight:1 }}>💡</span>
        </div>
      )}
      {showFeedback && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:850, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e=>{if(e.target===e.currentTarget)setShowFeedback(false);}}>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:32, maxWidth:440, width:"100%", position:"relative" }}>
            <div onClick={()=>setShowFeedback(false)} style={{ position:"absolute", top:16, right:16, cursor:"pointer", color:C.muted, fontSize:18, lineHeight:1 }}>&times;</div>
            <div style={{ fontSize:13, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:C.gold, marginBottom:8 }}>Help Shape RangeIQ</div>
            <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>What would make this more useful?</div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:20, lineHeight:1.5 }}>Feature ideas, workflow suggestions, or anything that would improve your training experience.</div>
            {feedbackSent ? (
              <div style={{ textAlign:"center", padding:"24px 0" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✓</div>
                <div style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:4 }}>Thanks for the input.</div>
                <div style={{ fontSize:14, color:C.muted }}>We read every suggestion.</div>
              </div>
            ) : (
              <>
                <textarea
                  value={feedbackText}
                  onChange={e=>setFeedbackText(e.target.value)}
                  placeholder="What would you improve, add, or change?"
                  style={{
                    width:"100%", minHeight:120, padding:14, borderRadius:12,
                    background:C.bg, border:`1px solid ${C.border}`, color:C.text,
                    fontSize:15, fontFamily:"inherit", resize:"vertical", outline:"none",
                    lineHeight:1.6,
                  }}
                  onFocus={e=>e.target.style.borderColor=C.gold}
                  onBlur={e=>e.target.style.borderColor=C.border}
                />
                <input
                  type="email"
                  value={feedbackEmail}
                  onChange={e=>setFeedbackEmail(e.target.value)}
                  placeholder="Email (optional — if you want us to follow up)"
                  style={{
                    width:"100%", height:44, padding:"0 14px", borderRadius:12, marginTop:10,
                    background:C.bg, border:`1px solid ${C.border}`, color:C.text,
                    fontSize:14, fontFamily:"inherit", outline:"none",
                  }}
                  onFocus={e=>e.target.style.borderColor=C.gold}
                  onBlur={e=>e.target.style.borderColor=C.border}
                />
                <button
                  onClick={()=>{
                    if(!feedbackText.trim())return;
                    const body=`Feedback: ${feedbackText.trim()}${feedbackEmail?`\n\nFrom: ${feedbackEmail}`:''}`;
                    const mailLink=`mailto:support@rangeiqpoker.com?subject=${encodeURIComponent("RangeIQ Feedback")}&body=${encodeURIComponent(body)}`;
                    window.open(mailLink,'_blank');
                    setFeedbackSent(true);
                    setFeedbackText("");
                    setFeedbackEmail("");
                    setTimeout(()=>{setShowFeedback(false);setFeedbackSent(false);},2500);
                  }}
                  disabled={!feedbackText.trim()}
                  style={{
                    width:"100%", height:48, marginTop:14, borderRadius:12, border:"none",
                    background:feedbackText.trim()?C.gold:"#2A2A2A",
                    color:feedbackText.trim()?C.bg:C.disabled,
                    fontSize:15, fontWeight:600, fontFamily:"inherit", cursor:feedbackText.trim()?"pointer":"default",
                    transition:"all 180ms ease",
                  }}
                >
                  Send Feedback
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast} onDone={()=>setToast(null)} onViewVault={()=>{setToast(null);setScreen("vault");}}/>}
    </div>
  );
}
