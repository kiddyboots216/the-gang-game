import { Server as ServerIO } from 'socket.io';

// Store game states globally since Vercel functions are stateless
const gameStates = new Map();

// Card utilities
const createDeck = () => {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    
    return shuffle(deck);
};

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// Hand evaluation utilities
const getHandRank = (hand, communityCards) => {
    const allCards = [...hand, ...communityCards];
    
    // Convert ranks to numeric values
    const values = allCards.map(card => {
        switch (card.rank) {
            case 'A': return 14;
            case 'K': return 13;
            case 'Q': return 12;
            case 'J': return 11;
            default: return parseInt(card.rank);
        }
    });

    // Count occurrences of each value
    const valueCounts = values.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
    }, {});

    // Get unique suits
    const suits = allCards.map(card => card.suit);
    const hasFlush = new Set(suits).size === 1;

    // Check for straight
    const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
    const hasStraight = uniqueValues.length >= 5 && 
        uniqueValues.some((val, i, arr) => 
            i <= arr.length - 5 && 
            arr.slice(i, i + 5).every((v, j) => j === 0 || v === arr[i + j - 1] + 1)
        );

    // Get the highest count of any value
    const maxCount = Math.max(...Object.values(valueCounts));
    
    // Calculate hand strength
    if (hasFlush && hasStraight) return 800 + Math.max(...values); // Straight flush
    if (maxCount === 4) return 700 + parseInt(Object.keys(valueCounts).find(key => valueCounts[key] === 4)); // Four of a kind
    if (maxCount === 3 && Object.keys(valueCounts).length === 2) return 600 + parseInt(Object.keys(valueCounts).find(key => valueCounts[key] === 3)); // Full house
    if (hasFlush) return 500 + Math.max(...values); // Flush
    if (hasStraight) return 400 + Math.max(...values); // Straight
    if (maxCount === 3) return 300 + parseInt(Object.keys(valueCounts).find(key => valueCounts[key] === 3)); // Three of a kind
    if (Object.values(valueCounts).filter(count => count === 2).length === 2) return 200 + Math.max(...values); // Two pair
    if (maxCount === 2) return 100 + parseInt(Object.keys(valueCounts).find(key => valueCounts[key] === 2)); // One pair
    return Math.max(...values); // High card
};

const createGameState = () => ({
    players: {},
    isGameStarted: false,
    deck: [],
    communityCards: [],
    currentBettingRound: 0,
    hostId: null,
    chipHistory: [],
    isRevealed: false,
    gameResult: null
});

export default async function handler(req, res) {
    if (!res.socket.server.io) {
        console.log('*First* Socket server initialization');
        const io = new ServerIO(res.socket.server, {
            path: '/api/socketio',
            addTrailingSlash: false,
        });
        
        res.socket.server.io = io;

        io.on('connection', (socket) => {
            console.log('New client connected:', socket.id);
            let currentRoom = null;

            socket.on('joinRoom', ({ roomName, username }) => {
                console.log(`${username} joining room: ${roomName}`);
                
                // Leave current room if in one
                if (currentRoom) {
                    socket.leave(currentRoom);
                    const gameState = gameStates.get(currentRoom);
                    if (gameState) {
                        delete gameState.players[socket.id];
                        if (Object.keys(gameState.players).length === 0) {
                            gameStates.delete(currentRoom);
                        } else if (socket.id === gameState.hostId) {
                            const newHostId = Object.keys(gameState.players)[0];
                            gameState.hostId = newHostId;
                            gameState.players[newHostId].isHost = true;
                        }
                        io.to(currentRoom).emit('updateLobby', gameState.players);
                    }
                }

                currentRoom = roomName;
                socket.join(currentRoom);

                let gameState = gameStates.get(currentRoom);
                if (!gameState) {
                    gameState = createGameState();
                    gameStates.set(currentRoom, gameState);
                }

                if (Object.keys(gameState.players).length === 0) {
                    gameState.hostId = socket.id;
                }

                gameState.players[socket.id] = {
                    username,
                    hand: [],
                    chip: null,
                    isHost: socket.id === gameState.hostId
                };

                io.to(currentRoom).emit('updateLobby', gameState.players);

                if (gameState.isGameStarted) {
                    socket.emit('gameStarted', {
                        isGameStarted: gameState.isGameStarted,
                        currentBettingRound: gameState.currentBettingRound,
                        communityCards: gameState.communityCards,
                        chipHistory: gameState.chipHistory,
                        isRevealed: gameState.isRevealed,
                        gameResult: gameState.gameResult,
                        players: gameState.players
                    });
                }
            });

            socket.on('startGame', () => {
                if (!currentRoom) return;
                
                const gameState = gameStates.get(currentRoom);
                if (!gameState || socket.id !== gameState.hostId) return;

                const playerCount = Object.keys(gameState.players).length;
                if (playerCount < 2) return;

                console.log('Starting game...');
                // Initialize game
                gameState.isGameStarted = true;
                gameState.deck = createDeck();
                gameState.communityCards = [];
                gameState.currentBettingRound = 0;
                gameState.chipHistory = [];
                gameState.isRevealed = false;
                gameState.gameResult = null;

                // Deal cards to players
                Object.keys(gameState.players).forEach((playerId, index) => {
                    const hand = [gameState.deck.pop(), gameState.deck.pop()];
                    console.log(`Dealing to ${gameState.players[playerId].username}:`, hand);
                    gameState.players[playerId].hand = hand;
                    gameState.players[playerId].chip = index + 1;
                });

                // Record initial chip state
                gameState.chipHistory.push(
                    Object.fromEntries(
                        Object.entries(gameState.players).map(([id, player]) => [
                            id,
                            { username: player.username, chip: player.chip }
                        ])
                    )
                );

                // Send game state to each player individually
                Object.keys(gameState.players).forEach(playerId => {
                    const playerView = {
                        isGameStarted: gameState.isGameStarted,
                        currentBettingRound: gameState.currentBettingRound,
                        communityCards: gameState.communityCards,
                        chipHistory: gameState.chipHistory,
                        isRevealed: gameState.isRevealed,
                        gameResult: gameState.gameResult,
                        players: Object.fromEntries(
                            Object.entries(gameState.players).map(([id, player]) => [
                                id,
                                id === playerId ? player : { ...player, hand: [] }
                            ])
                        )
                    };
                    console.log(`Sending game state to ${gameState.players[playerId].username}:`, playerView);
                    io.to(playerId).emit('gameStarted', playerView);
                });
            });

            socket.on('dealCommunityCards', () => {
                if (!currentRoom) return;
                
                const gameState = gameStates.get(currentRoom);
                if (!gameState || socket.id !== gameState.hostId) return;

                console.log('Dealing community cards...');
                let newCards = [];
                switch (gameState.currentBettingRound) {
                    case 0: // Deal flop
                        newCards = [
                            gameState.deck.pop(),
                            gameState.deck.pop(),
                            gameState.deck.pop()
                        ];
                        gameState.communityCards = newCards;
                        gameState.currentBettingRound = 1;
                        break;
                    case 1: // Deal turn
                        newCards = [gameState.deck.pop()];
                        gameState.communityCards.push(...newCards);
                        gameState.currentBettingRound = 2;
                        break;
                    case 2: // Deal river
                        newCards = [gameState.deck.pop()];
                        gameState.communityCards.push(...newCards);
                        gameState.currentBettingRound = 3;
                        break;
                }

                // Record chip state after each round
                gameState.chipHistory.push(
                    Object.fromEntries(
                        Object.entries(gameState.players).map(([id, player]) => [
                            id,
                            { username: player.username, chip: player.chip }
                        ])
                    )
                );

                console.log('New community cards:', newCards);
                console.log('All community cards:', gameState.communityCards);
                io.to(currentRoom).emit('communityCardsDealt', {
                    communityCards: gameState.communityCards,
                    currentBettingRound: gameState.currentBettingRound,
                    chipHistory: gameState.chipHistory
                });
            });

            socket.on('revealHands', () => {
                if (!currentRoom) return;
                
                const gameState = gameStates.get(currentRoom);
                if (!gameState || socket.id !== gameState.hostId) return;
                if (gameState.currentBettingRound < 3) return; // Must have all community cards

                // Calculate hand rankings
                const playerHandRankings = Object.entries(gameState.players).map(([id, player]) => ({
                    id,
                    username: player.username,
                    chip: player.chip,
                    hand: player.hand,
                    handRank: getHandRank(player.hand, gameState.communityCards)
                })).sort((a, b) => a.chip - b.chip);

                // Check if chips match hand strength
                const isCorrectOrder = playerHandRankings.every((player, index, array) => 
                    index === 0 || player.handRank > array[index - 1].handRank
                );

                gameState.isRevealed = true;
                gameState.gameResult = isCorrectOrder ? 'won' : 'lost';

                // Send final state to all players
                io.to(currentRoom).emit('handsRevealed', {
                    players: gameState.players,
                    gameResult: gameState.gameResult,
                    revealOrder: playerHandRankings
                });
            });

            socket.on('transferChip', ({ targetPlayerId }) => {
                if (!currentRoom) return;
                
                const gameState = gameStates.get(currentRoom);
                if (!gameState) return;

                const sourcePlayer = gameState.players[socket.id];
                const targetPlayer = gameState.players[targetPlayerId];

                if (!sourcePlayer || !targetPlayer) return;
                if (sourcePlayer.chip === null) return;

                console.log(`${sourcePlayer.username} transferring chip ${sourcePlayer.chip} to ${targetPlayer.username}`);
                const tempChip = sourcePlayer.chip;
                sourcePlayer.chip = targetPlayer.chip;
                targetPlayer.chip = tempChip;

                Object.keys(gameState.players).forEach(playerId => {
                    const playerView = {
                        isGameStarted: gameState.isGameStarted,
                        currentBettingRound: gameState.currentBettingRound,
                        communityCards: gameState.communityCards,
                        players: Object.fromEntries(
                            Object.entries(gameState.players).map(([id, player]) => [
                                id,
                                id === playerId ? player : { ...player, hand: [] }
                            ])
                        )
                    };
                    io.to(playerId).emit('gameStateUpdated', playerView);
                });
            });

            socket.on('disconnect', () => {
                console.log('a client disconnected:', socket.id);
                if (currentRoom) {
                    const gameState = gameStates.get(currentRoom);
                    if (gameState) {
                        console.log(`${gameState.players[socket.id]?.username} disconnected from room ${currentRoom}`);
                        delete gameState.players[socket.id];
                        
                        if (Object.keys(gameState.players).length === 0) {
                            console.log(`Deleting empty room: ${currentRoom}`);
                            gameStates.delete(currentRoom);
                        } else if (socket.id === gameState.hostId) {
                            // Assign new host if current host disconnected
                            const newHostId = Object.keys(gameState.players)[0];
                            gameState.hostId = newHostId;
                            gameState.players[newHostId].isHost = true;
                            console.log(`New host assigned in room ${currentRoom}: ${gameState.players[newHostId].username}`);
                        }
                        
                        io.to(currentRoom).emit('updateLobby', gameState.players);
                    }
                }
            });
        });

        console.log('Setting up socket');
        res.end();
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
}; 