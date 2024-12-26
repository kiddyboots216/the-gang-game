import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import * as deck from '@letele/playing-cards';
let socket;

const Card = ({ card }) => {
    if (!card) return null;
    
    // Convert our card format to the library's format
    const getCardComponent = (card) => {
        // Get first letter of suit (H, D, C, S)
        const suit = card.suit[0].toUpperCase();
        
        // Convert rank to library format (a, 2-10, j, q, k)
        const rank = card.rank === 'A' ? 'a' :
                    card.rank === 'K' ? 'k' :
                    card.rank === 'Q' ? 'q' :
                    card.rank === 'J' ? 'j' :
                    card.rank.toLowerCase();

        // Combine suit and rank (e.g., "H2", "Sa", "Dk")
        const componentName = suit + rank;
        
        console.log('Creating card component:', {
            originalCard: card,
            suit,
            rank,
            componentName,
            exists: !!deck[componentName]
        });
        
        return deck[componentName];
    };

    const CardComponent = getCardComponent(card);
    if (!CardComponent) {
        console.error('Invalid card:', card);
        return null;
    }

    return (
        <div className="card">
            <CardComponent style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

const ChipHistory = ({ history }) => {
    if (!history || history.length === 0) return null;

    const rounds = ['Initial', 'After Flop', 'After Turn', 'After River'];
    
    return (
        <div className="chip-history">
            <h3>Chip History</h3>
            <div className="history-grid">
                {history.map((round, index) => (
                    <div key={index} className="history-round">
                        <h4>{rounds[index]}</h4>
                        {Object.values(round).map(player => (
                            <div key={player.username}>
                                {player.username}: Chip {player.chip}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function Home() {
    const [username, setUsername] = useState('');
    const [roomName, setRoomName] = useState('');
    const [gameState, setGameState] = useState({
        currentPlayer: null,
        players: {},
        isGameStarted: false,
        communityCards: [],
        currentBettingRound: 0,
        chipHistory: [],
        isRevealed: false,
        gameResult: null
    });
    const [revealOrder, setRevealOrder] = useState([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        socketInitializer();
        return () => {
            if (socket) {
                socket.disconnect();
            }
        };
    }, []);

    const socketInitializer = async () => {
        try {
            await fetch('/api/socketio');
            
            if (!socket) {
                socket = io({
                    path: '/api/socketio',
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    transports: ['websocket', 'polling'],
                    upgrade: true,
                    forceNew: true
                });

                socket.on('connect', () => {
                    console.log('Socket connected with ID:', socket.id);
                    setConnected(true);
                    // Rejoin room if we have the info
                    if (roomName && username) {
                        console.log('Rejoining room:', roomName, 'as', username);
                        socket.emit('joinRoom', { roomName, username });
                    }
                });

                socket.on('connect_error', (err) => {
                    console.error('Socket connection error:', err);
                    setConnected(false);
                });

                socket.on('disconnect', (reason) => {
                    console.log('Socket disconnected:', reason);
                    setConnected(false);
                });

                socket.on('updateLobby', (players) => {
                    console.log('Lobby updated:', players);
                    setGameState(prev => ({
                        ...prev,
                        players,
                        // Maintain game started state if it was already started
                        isGameStarted: prev.isGameStarted
                    }));
                });

                socket.on('gameStarted', (newGameState) => {
                    console.log('Game started:', newGameState);
                    setGameState(prev => ({
                        ...prev,
                        ...newGameState,
                        currentPlayer: prev.currentPlayer,
                        isGameStarted: true
                    }));
                });

                socket.on('communityCardsDealt', ({ communityCards, currentBettingRound, chipHistory }) => {
                    console.log('Community cards dealt:', {
                        communityCards,
                        currentBettingRound,
                        chipHistory
                    });
                    setGameState(prev => ({
                        ...prev,
                        communityCards: [...communityCards],
                        currentBettingRound,
                        chipHistory,
                        isGameStarted: true // Ensure game stays started
                    }));
                });

                socket.on('gameStateUpdated', (newGameState) => {
                    console.log('Game state updated:', newGameState);
                    setGameState(prev => ({
                        ...prev,
                        ...newGameState,
                        currentPlayer: prev.currentPlayer,
                        isGameStarted: true
                    }));
                });

                socket.on('handsRevealed', ({ players, gameResult, revealOrder }) => {
                    console.log('Hands revealed:', { players, gameResult, revealOrder });
                    setGameState(prev => ({
                        ...prev,
                        players,
                        isRevealed: true,
                        gameResult,
                        isGameStarted: true
                    }));
                    setRevealOrder(revealOrder);
                });
            }
        } catch (error) {
            console.error('Socket initialization error:', error);
        }
    };

    const joinGame = () => {
        if (!username.trim()) {
            alert('Please enter a username');
            return;
        }
        if (!roomName.trim()) {
            alert('Please enter a room name');
            return;
        }
        setGameState(prev => ({
            ...prev,
            currentPlayer: username
        }));
        socket.emit('joinRoom', { roomName, username });
    };

    const dealCommunityCards = () => {
        socket.emit('dealCommunityCards');
    };

    const transferChip = (targetPlayerId) => {
        socket.emit('transferChip', { targetPlayerId });
    };

    const getCurrentPlayer = () => {
        const player = Object.values(gameState.players || {}).find(
            player => player?.username === gameState.currentPlayer
        );
        console.log('Current player state:', {
            username: gameState.currentPlayer,
            player,
            allPlayers: gameState.players
        });
        return player;
    };

    const getBettingRoundName = () => {
        switch (gameState.currentBettingRound) {
            case 0: return 'Pre-flop';
            case 1: return 'Flop';
            case 2: return 'Turn';
            case 3: return 'River';
            default: return '';
        }
    };

    const revealHands = () => {
        socket.emit('revealHands');
    };

    // Render login if not connected or no current player
    if (!connected || !gameState.currentPlayer) {
        return (
            <div className="container">
                <h1>The Gang Game</h1>
                <div className="login-section">
                    <div className="input-group">
                        <input 
                            type="text"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="Enter room name"
                        />
                        <input 
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                        />
                        <button onClick={joinGame}>Join Game</button>
                    </div>
                </div>
            </div>
        );
    }

    // Render lobby if game hasn't started
    if (!gameState.isGameStarted) {
        return (
            <div className="container">
                <h1>The Gang Game</h1>
                <div className="lobby-section">
                    <h2>Game Lobby - Room: {roomName}</h2>
                    <p>Players in lobby: {Object.keys(gameState.players).length}</p>
                    <div className="player-list">
                        {Object.values(gameState.players).map(player => (
                            <div key={player.username} className="player-item">
                                {player.username} {player.isHost && '(Host)'}
                            </div>
                        ))}
                    </div>
                    {getCurrentPlayer()?.isHost && (
                        <button 
                            disabled={Object.keys(gameState.players).length < 2}
                            onClick={() => socket.emit('startGame')}
                        >
                            Start Game
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Render game
    return (
        <div className="container">
            <h1>The Gang Game</h1>
            <div className="game-section">
                <div className="betting-round">
                    <h3>{getBettingRoundName()} Round</h3>
                </div>

                {/* Current Player's Hand */}
                <div className="player-hand">
                    <h3>Your Hand</h3>
                    <div className="cards">
                        {getCurrentPlayer()?.hand?.map((card, index) => (
                            <Card key={index} card={card} />
                        ))}
                    </div>
                    <p>Your Chip: {getCurrentPlayer()?.chip}</p>
                </div>

                {/* Community Cards */}
                <div className="community-cards">
                    <h3>Community Cards</h3>
                    <div className="cards">
                        {gameState.communityCards?.map((card, index) => (
                            <Card key={index} card={card} />
                        ))}
                    </div>
                </div>

                {/* Chip History */}
                <ChipHistory history={gameState.chipHistory} />

                {/* Other Players */}
                <div className="other-players">
                    <h3>Other Players</h3>
                    {Object.entries(gameState.players || {})
                        .filter(([_, player]) => player && player.username && player.username !== gameState.currentPlayer)
                        .map(([playerId, player]) => (
                            <div key={playerId} className="player-item">
                                <span>{player.username} (Chip: {player.chip})</span>
                                {gameState.isRevealed && player.hand && (
                                    <div className="cards">
                                        {player.hand.map((card, index) => (
                                            <Card key={index} card={card} />
                                        ))}
                                    </div>
                                )}
                                {!gameState.isRevealed && (
                                    <button 
                                        onClick={() => transferChip(playerId)}
                                        disabled={!getCurrentPlayer()?.chip}
                                    >
                                        Transfer Chip
                                    </button>
                                )}
                            </div>
                        ))
                    }
                </div>

                {/* Game Controls */}
                {getCurrentPlayer()?.isHost && (
                    <div className="game-controls">
                        {gameState.currentBettingRound < 3 && (
                            <button 
                                onClick={dealCommunityCards}
                                disabled={gameState.currentBettingRound >= 3}
                            >
                                Deal {gameState.currentBettingRound === 0 ? 'Flop' : 
                                     gameState.currentBettingRound === 1 ? 'Turn' : 
                                     gameState.currentBettingRound === 2 ? 'River' : ''}
                            </button>
                        )}
                        {gameState.currentBettingRound === 3 && !gameState.isRevealed && (
                            <button onClick={revealHands}>
                                Reveal Hands
                            </button>
                        )}
                    </div>
                )}

                {/* Game Result */}
                {gameState.isRevealed && (
                    <div className="game-result">
                        <h2>Game Over - You {gameState.gameResult}!</h2>
                        <div className="reveal-order">
                            <h3>Hand Reveal Order:</h3>
                            {revealOrder?.map((player, index) => (
                                <div key={player.id} className="reveal-player">
                                    <p>{index + 1}. {player.username} (Chip {player.chip})</p>
                                    <div className="cards">
                                        {player.hand?.map((card, cardIndex) => (
                                            <Card key={cardIndex} card={card} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .login-section, .lobby-section, .game-section {
                    margin: 20px 0;
                }
                .input-group {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .player-list, .other-players {
                    margin: 10px 0;
                }
                .player-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px;
                    margin: 5px 0;
                    background: #f5f5f5;
                    border-radius: 4px;
                }
                .cards {
                    display: flex;
                    gap: 10px;
                    margin: 10px 0;
                }
                .card {
                    width: 100px;
                    height: 140px; /* 5:7 ratio */
                    padding: 5px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                button {
                    padding: 8px 16px;
                    background: #0070f3;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                input {
                    padding: 8px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    flex: 1;
                }
                .game-controls {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                }
                .chip-history {
                    margin: 20px 0;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .history-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                }
                .history-round {
                    padding: 10px;
                    background: white;
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .game-result {
                    margin-top: 30px;
                    padding: 20px;
                    background: #f0f8ff;
                    border-radius: 8px;
                    text-align: center;
                }
                .reveal-order {
                    margin-top: 20px;
                }
                .reveal-player {
                    margin: 10px 0;
                    padding: 10px;
                    background: white;
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}
