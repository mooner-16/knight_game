const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public 폴더의 정적 파일(index.html 등)을 제공
app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    console.log('유저 접속:', socket.id);

    // 유저가 게임(로비)에 입장했을 때
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            knightClass: data.knightClass,
            color: data.color,
            x: Math.random() * 10 - 5, 
            y: 1, 
            z: Math.random() * 10 - 5,
            hp: data.hp,
            maxHp: data.hp,
            isBlocking: false,
            isCrouching: false
        };
        // 모든 유저에게 현재 접속자 목록 업데이트
        io.emit('updatePlayers', players);
    });

    // 유저의 움직임 및 액션(앉기, 막기 등) 동기화
    socket.on('playerStateUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].isBlocking = data.isBlocking;
            players[socket.id].isCrouching = data.isCrouching;
            // 다른 사람들에게 내 위치 전송 (broadcast)
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 스킬 사용 이벤트 중계
    socket.on('useSkill', (data) => {
        io.emit('skillUsed', { id: socket.id, skillName: data.skillName });
    });

    // 접속 종료 시
    socket.on('disconnect', () => {
        console.log('유저 접속 종료:', socket.id);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});