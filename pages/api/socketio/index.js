import { Server as ServerIO } from 'socket.io';

const gameStates = new Map();

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

export default function handler(req, res) {
    if (!res.socket.server.io) {
        const io = new ServerIO(res.socket.server);
        res.socket.server.io = io;

        io.on('connection', socket => {
            console.log('New client connected');
            let currentRoom = null;

            socket.on('joinRoom', ({ roomName, username }) => {
                if (currentRoom) {
                    socket.leave(currentRoom);
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
            });

            // Rest of the event handlers stay the same...
        });
    }
    res.end();
}

export const config = {
    api: {
        bodyParser: false,
    },
}; 