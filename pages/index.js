import { useEffect, useState } from 'react';
import io from 'socket.io-client';
let socket;

const Card = ({ card }) => {
    if (!card) return null;
    return (
        <div className="card">
            {card.rank} of {card.suit}
        </div>
    );
};

export default function Home() {
    const [username, setUsername] = useState('');
    const [gameState, setGameState] = useState({
        currentPlayer: null,
        players: {},
        isGameStarted: false,
        communityCards: [],
        currentBettingRound: 0
    });
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        socketInitializer();
    }, []);

    const socketInitializer = async () => {
        await fetch('/api/socket');
        socket = io();

        socket.on('connect', () => {
            setConnected(true);
        });

        socket.on('updateLobby', (players) => {
            setGameState(prev => ({...prev, players}));
        });

        socket.on('gameStarted', (newGameState) => {
            setGameState(newGameState);
        });

        socket.on('communityCardsDealt', ({ communityCards, currentBettingRound }) => {
            setGameState(prev => ({
                ...prev,
                communityCards,
                currentBettingRound
            }));
        });

        socket.on('gameStateUpdated', (newGameState) => {
            setGameState(newGameState);
        });
    };

    const joinGame = () => {
        if (!username.trim()) {
            alert('Please enter a username');
            return;
        }
        socket.emit('joinGame', username);
        setGameState(prev => ({...prev, currentPlayer: username}));
    };

    const dealCommunityCards = () => {
        socket.emit('dealCommunityCards');
    };

    const transferChip = (targetPlayerId) => {
        socket.emit('transferChip', { targetPlayerId });
    };

    const getCurrentPlayer = () => {
        return Object.values(gameState.players).find(
            player => player.username === gameState.currentPlayer
        );
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

    return (
        <div className="container">
            <h1>The Gang Game</h1>
            
            {/* Login Section */}
            {!gameState.currentPlayer && (
                <div className="login-section">
                    <input 
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                    />
                    <button onClick={joinGame}>Join Game</button>
                </div>
            )}

            {/* Lobby Section */}
            {gameState.currentPlayer && !gameState.isGameStarted && (
                <div className="lobby-section">
                    <h2>Game Lobby</h2>
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
            )}

            {/* Game Section */}
            {gameState.isGameStarted && (
                <div className="game-section">
                    <div className="betting-round">
                        <h3>{getBettingRoundName()} Round</h3>
                    </div>

                    {/* Current Player's Hand */}
                    <div className="player-hand">
                        <h3>Your Hand</h3>
                        <div className="cards">
                            {getCurrentPlayer()?.hand.map((card, index) => (
                                <Card key={index} card={card} />
                            ))}
                        </div>
                        <p>Your Chip: {getCurrentPlayer()?.chip}</p>
                    </div>

                    {/* Community Cards */}
                    <div className="community-cards">
                        <h3>Community Cards</h3>
                        <div className="cards">
                            {gameState.communityCards.map((card, index) => (
                                <Card key={index} card={card} />
                            ))}
                        </div>
                    </div>

                    {/* Other Players */}
                    <div className="other-players">
                        <h3>Other Players</h3>
                        {Object.entries(gameState.players)
                            .filter(([_, player]) => player.username !== gameState.currentPlayer)
                            .map(([playerId, player]) => (
                                <div key={playerId} className="player-item">
                                    <span>{player.username} (Chip: {player.chip})</span>
                                    <button 
                                        onClick={() => transferChip(playerId)}
                                        disabled={getCurrentPlayer()?.chip === null}
                                    >
                                        Transfer Chip
                                    </button>
                                </div>
                            ))
                        }
                    </div>

                    {/* Game Controls */}
                    {getCurrentPlayer()?.isHost && (
                        <div className="game-controls">
                            <button 
                                onClick={dealCommunityCards}
                                disabled={gameState.currentBettingRound >= 3}
                            >
                                Deal {gameState.currentBettingRound === 0 ? 'Flop' : 
                                     gameState.currentBettingRound === 1 ? 'Turn' : 
                                     gameState.currentBettingRound === 2 ? 'River' : ''}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .login-section, .lobby-section, .game-section {
                    margin: 20px 0;
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
                    padding: 10px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background: white;
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
                    margin-right: 10px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                .game-controls {
                    margin-top: 20px;
                }
            `}</style>
        </div>
    );
}
