import Pusher from 'pusher';

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }

    const { action, roomName, username, socketId } = req.body;

    switch (action) {
        case 'join': {
            let gameState = gameStates.get(roomName);
            if (!gameState) {
                gameState = createGameState();
                gameStates.set(roomName, gameState);
            }

            if (Object.keys(gameState.players).length === 0) {
                gameState.hostId = socketId;
            }

            gameState.players[socketId] = {
                username,
                hand: [],
                chip: null,
                isHost: socketId === gameState.hostId
            };

            await pusher.trigger(roomName, 'updateLobby', gameState.players);
            res.json(gameState.players);
            break;
        }

        // Add other cases for game actions...

        default:
            res.status(400).json({ message: 'Invalid action' });
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
}; 