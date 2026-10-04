// Synthetic public data only; no real games, account names or client payloads.
export function historyFixture(gameId = 'sample-match-1') {
  return { status: 'ready', gameId, turn: 2,
    players: [{ index: 0, name: 'Sample A', isMe: true }, { index: 1, name: 'Sample CPU', isMe: false }],
    logs: [
      ...[0, 1].map(player => ({ index: player, type: 'STARTS_WITH', player, turn: null, toPlayer: null,
        cards: [{ name: 'Copper', count: 7 }, { name: 'Estate', count: 3 }] })),
      { index: 2, type: 'NEW_TURN', player: 0, turn: 1, toPlayer: null, cards: [] },
      { index: 3, type: 'BUY', player: 0, turn: 1, toPlayer: null, cards: [{ name: 'Silver', count: 1 }] },
      { index: 4, type: 'GAIN', player: 0, turn: 1, toPlayer: null, cards: [{ name: 'Silver', count: 1 }] },
      { index: 5, type: 'NEW_TURN', player: 0, turn: 2, toPlayer: null, cards: [] },
      { index: 6, type: 'TRASH', player: 0, turn: 2, toPlayer: null, cards: [{ name: 'Copper', count: 1 }] }
    ], metadata: Object.fromEntries([['Copper', '銅貨'], ['Estate', '屋敷'], ['Silver', '銀貨']].map(([name, ja]) => [name, { ja, cost: 0, types: [] }])),
    supply: [], ownZones: [] };
}
