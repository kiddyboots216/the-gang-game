import { Server } from 'socket.io';

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

const SocketHandler = (req, res) => {
    if (res.socket.server.io) {
        console.log('Socket is already running');
        res.end();
        return;
    }

    const io = new Server(res.socket.server);
    res.socket.server.io = io;

    const gameState = {
        players: {},
        isGameStarted: false,
        deck: [],
        communityCards: [],
        currentBettingRound: 0, // 0: pre-flop, 1: flop, 2: turn, 3: river
        hostId: null
    };

    io.on('connection', (socket) => {
        console.log('New client connected');

        socket.on('joinGame', (username) => {
            // Set first player as host
            if (Object.keys(gameState.players).length === 0) {
                gameState.hostId = socket.id;
            }

            gameState.players[socket.id] = {
                username,
                hand: [],
                chip: null,
                isHost: socket.id === gameState.hostId
            };
            
            io.emit('updateLobby', gameState.players);
        });

        socket.on('startGame', () => {
            if (socket.id !== gameState.hostId) return;
            
            const playerCount = Object.keys(gameState.players).length;
            if (playerCount < 2) return;

            // Initialize game
            gameState.isGameStarted = true;
            gameState.deck = createDeck();
            gameState.communityCards = [];
            gameState.currentBettingRound = 0;

            // Deal cards to players
            Object.keys(gameState.players).forEach((playerId, index) => {
                gameState.players[playerId].hand = [
                    gameState.deck.pop(),
                    gameState.deck.pop()
                ];
                gameState.players[playerId].chip = index + 1;
            });

            // Send game state to each player individually
            Object.keys(gameState.players).forEach(playerId => {
                const playerView = {
                    ...gameState,
                    players: Object.fromEntries(
                        Object.entries(gameState.players).map(([id, player]) => [
                            id,
                            id === playerId ? player : { ...player, hand: [] }
                        ])
                    )
                };
                io.to(playerId).emit('gameStarted', playerView);
            });
        });

        socket.on('dealCommunityCards', () => {
            if (socket.id !== gameState.hostId) return;
            
            switch (gameState.currentBettingRound) {
                case 0: // Deal flop
                    gameState.communityCards = [
                        gameState.deck.pop(),
                        gameState.deck.pop(),
                        gameState.deck.pop()
                    ];
                    gameState.currentBettingRound = 1;
                    break;
                case 1: // Deal turn
                    gameState.communityCards.push(gameState.deck.pop());
                    gameState.currentBettingRound = 2;
                    break;
                case 2: // Deal river
                    gameState.communityCards.push(gameState.deck.pop());
                    gameState.currentBettingRound = 3;
                    break;
            }

            io.emit('communityCardsDealt', {
                communityCards: gameState.communityCards,
                currentBettingRound: gameState.currentBettingRound
            });
        });

        socket.on('transferChip', ({ targetPlayerId }) => {
            const sourcePlayer = gameState.players[socket.id];
            const targetPlayer = gameState.players[targetPlayerId];

            if (!sourcePlayer || !targetPlayer) return;
            if (sourcePlayer.chip === null) return;

            const tempChip = sourcePlayer.chip;
            sourcePlayer.chip = targetPlayer.chip;
            targetPlayer.chip = tempChip;

            Object.keys(gameState.players).forEach(playerId => {
                const playerView = {
                    ...gameState,
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
            delete gameState.players[socket.id];
            
            // If host disconnects, assign new host
            if (socket.id === gameState.hostId) {
                const remainingPlayers = Object.keys(gameState.players);
                if (remainingPlayers.length > 0) {
                    gameState.hostId = remainingPlayers[0];
                    gameState.players[gameState.hostId].isHost = true;
                }
            }
            
            io.emit('updateLobby', gameState.players);
        });
    });

    res.end();
};

export default SocketHandler;
