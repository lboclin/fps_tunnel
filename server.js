const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

const players = {};
let currentMap = 'Arena';

const SPAWNS = {
    'Arena': [
        { x: 40, z: 0 }, { x: -40, z: 0 }, { x: 0, z: 40 }, { x: 0, z: -40 }
    ],
    'CloseQuarters': [
        { x: 35, z: 35 }, { x: -35, z: -35 }, { x: 35, z: -35 }, { x: -35, z: 35 }
    ],
    'Towers': [
        { x: 0, z: -40 }, // Tower 1
        { x: 0, z: 40 },  // Tower 2
        { x: 20, z: 0 },
        { x: -20, z: 0 }
    ]
};

// Game Loop State
let gameState = 'PLAYING'; // 'PLAYING' | 'VOTING'
let timeLeft = 240; // 4 minutes
let nextMapOptions = [];
let votes = {}; // socketId -> mapName
const MAP_NAMES = ['Arena', 'CloseQuarters', 'Towers'];

// Game Loop
setInterval(() => {
    if (gameState === 'PLAYING') {
        timeLeft--;
        if (timeLeft <= 0) {
            startVoting();
        }
    } else if (gameState === 'VOTING') {
        timeLeft--;
        if (timeLeft <= 0) {
            endVoting();
        }
    }

    io.emit('matchUpdate', {
        gameState: gameState,
        timeLeft: timeLeft
    });
}, 1000);

function startVoting() {
    gameState = 'VOTING';
    timeLeft = 15;
    votes = {};

    // Select 2 random maps excluding current
    const available = MAP_NAMES.filter(m => m !== currentMap);
    // Shuffle
    available.sort(() => Math.random() - 0.5);
    nextMapOptions = available.slice(0, 2);

    io.emit('startVoting', {
        options: nextMapOptions
    });
}

function endVoting() {
    // Count votes
    const counts = {};
    nextMapOptions.forEach(m => counts[m] = 0);
    Object.values(votes).forEach(vote => {
        if (counts[vote] !== undefined) counts[vote]++;
    });

    // Find winner
    let winner = nextMapOptions[0];
    let maxVotes = -1;
    nextMapOptions.forEach(m => {
        if (counts[m] > maxVotes) {
            maxVotes = counts[m];
            winner = m;
        }
    });

    // Change Map
    currentMap = winner;
    gameState = 'PLAYING';
    timeLeft = 240;

    // Reset players (kills, health)
    Object.values(players).forEach(p => {
        p.kills = 0;
        p.health = 100;
    });

    io.emit('mapChange', {
        map: currentMap
    });

    // Send updated leaderboard (cleared)
    io.emit('leaderboardUpdate', Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        kills: p.kills,
        isMe: false
    })));
}

io.on('connection', (socket) => {
    console.log('a user connected: ' + socket.id);

    // Player joined, wait for joinGame to fully initialize properties (name/color)
    // But we need a basic object for tracking if they disconnect before joining
    players[socket.id] = {
        id: socket.id,
        x: 0,
        y: 1,
        z: 40, // Safe spawn (T Spawn area) instead of 0,0 (Mid Block)
        rotation: 0,
        color: 0xffffff, // Default
        health: 100,
        kills: 0,
        name: "Player"
    };

    // Handle Join Game
    socket.on('joinGame', (data) => {
        if (players[socket.id]) {
            players[socket.id].name = data.name.substring(0, 15); // Server side validation
            players[socket.id].color = data.color;

            // Move to a safe spawn immediately to avoid "first spawn bug" at 0,0,0
            const spawnPoints = SPAWNS[currentMap] || SPAWNS['Arena'];
            const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

            players[socket.id].x = spawn.x + (Math.random() - 0.5) * 5;
            players[socket.id].z = spawn.z + (Math.random() - 0.5) * 5;

            // Custom height for Towers to spawn on platforms if unlucky, but safe y=20 usually works.
            // However, for Towers, platforms are at y=15. y=20 is safe.
            players[socket.id].y = 20;

            // Emit initial position to the player so they don't start at 0,0,0
            socket.emit('initPosition', {
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                map: currentMap
            });

            // Send current players to the new player
            socket.emit('currentPlayers', players);

            // Broadcast the new player to everyone else
            socket.broadcast.emit('newPlayer', players[socket.id]);
        }
    });

    // Handle player movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;

            // Emit to other players
            // socket.broadcast.emit('playerMoved', players[socket.id]);
            // Optimization: volatile for movement
            socket.broadcast.volatile.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle shooting (visual only)
    socket.on('shoot', (data) => {
        io.emit('playerShoots', { id: socket.id, weapon: data ? data.weapon : 'revolver' });
    });

    // Handle hit
    socket.on('shootHit', (data) => {
        // Data: { id, part, weapon }
        const targetId = data.id;
        const part = data.part || 'body';
        const weapon = data.weapon || 'revolver';

        if (players[targetId] && players[targetId].health > 0) {
            let damage = 0;

            // Calculate distance
            let dist = 100; // default far
            if (players[socket.id] && players[targetId]) {
                const dx = players[socket.id].x - players[targetId].x;
                const dy = players[socket.id].y - players[targetId].y;
                const dz = players[socket.id].z - players[targetId].z;
                dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            }

            // Damage Logic
            if (weapon === 'ak47') {
                damage = (part === 'head') ? 50 : 30;
            } else if (weapon === 'smg') {
                if (part === 'head') {
                    damage = (dist < 20) ? 35 : 15; // Buff close range headshot
                } else {
                    damage = (dist < 20) ? 12 : 8; // Slight body buff close range
                }
            } else if (weapon === 'revolver' || weapon === 'pistol') {
                damage = (part === 'head') ? 100 : 50;
            } else if (weapon === 'knife') {
                damage = (part === 'head') ? 100 : 35;
            } else if (weapon === 'sniper') {
                damage = 100; // Hit kill anywhere
            } else if (weapon === 'laser') {
                damage = (part === 'head') ? 15 : 5;
            } else {
                damage = 20; // Fallback
            }

            players[targetId].health -= damage;

            // Confirm hit to shooter
            io.to(socket.id).emit('registerHit');

            io.emit('healthUpdate', { id: targetId, health: players[targetId].health });

            if (players[targetId].health <= 0) {
                io.to(targetId).emit('playerDied');
                io.emit('playerKilled', targetId); // Let everyone know to hide mesh

                // Update kills & Heal for shooter
                if (players[socket.id]) {
                    players[socket.id].kills += 1;
                    // Heal 35 on kill, max 100
                    players[socket.id].health = Math.min(100, players[socket.id].health + 35);
                    io.emit('healthUpdate', { id: socket.id, health: players[socket.id].health });

                    // Chance to get Super Laser (1%)
                    if (weapon !== 'super_laser') {
                         const roll = Math.floor(Math.random() * 100);
                         if (roll === 0) { // 1 in 100
                             io.to(socket.id).emit('forceWeapon', 'super_laser');
                         }
                    }
                }

                // Emit Kill Feed with Names
                io.emit('killMessage', {
                    killerId: socket.id,
                    victimId: targetId,
                    killerName: players[socket.id] ? players[socket.id].name : "Unknown",
                    victimName: players[targetId] ? players[targetId].name : "Unknown",
                    weapon: weapon
                });

                // Broadcast new leaderboard
                io.emit('leaderboardUpdate', Object.values(players).map(p => ({
                    id: p.id,
                    name: p.name,
                    kills: p.kills,
                    isMe: false // client will check
                })));
            }
        }
    });

    // Handle Vote
    socket.on('voteMap', (mapName) => {
        if (gameState === 'VOTING' && nextMapOptions.includes(mapName)) {
            votes[socket.id] = mapName;
        }
    });

    // Handle Chat
    socket.on('chatMessage', (message) => {
        // Basic validation
        if (!message || message.length > 100) return;

        // Admin/Game Commands
        if (message === '/random') {
            io.emit('updateGameRules', { weaponMenuEnabled: false });
            io.emit('chatMessage', { id: 'SYSTEM', name: 'SYSTEM', message: 'Weapon selection disabled (/random mode)' });
            return;
        }
        if (message === '/select') {
            io.emit('updateGameRules', { weaponMenuEnabled: true });
            io.emit('chatMessage', { id: 'SYSTEM', name: 'SYSTEM', message: 'Weapon selection enabled (/select mode)' });
            return;
        }

        if (message === '/suicide') {
            if (players[socket.id] && players[socket.id].health > 0) {
                players[socket.id].health = 0;
                io.emit('healthUpdate', { id: socket.id, health: 0 });
                io.to(socket.id).emit('playerDied');
                io.emit('playerKilled', socket.id);

                const name = players[socket.id].name;
                io.emit('killMessage', {
                    killerId: socket.id,
                    victimId: socket.id,
                    killerName: name,
                    victimName: name
                });
            }
            return;
        }

        const name = (players[socket.id]) ? players[socket.id].name : "Unknown";

        io.emit('chatMessage', {
            id: socket.id,
            name: name,
            message: message
        });
    });

    // Handle respawn
    socket.on('requestRespawn', () => {
        if (players[socket.id]) {
            players[socket.id].health = 100;

            const spawnPoints = SPAWNS[currentMap] || SPAWNS['Arena'];
            const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

            players[socket.id].x = spawn.x + (Math.random() - 0.5) * 5;
            players[socket.id].z = spawn.z + (Math.random() - 0.5) * 5;
            players[socket.id].y = 25; // Higher drop to be safe

            io.emit('playerRespawned', players[socket.id]);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('user disconnected: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnectPlayer', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
