const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // public 폴더의 파일을 화면에 보여줌

// 기사 클래스 스펙 (서버 검증용)
const CLASSES = {
    'Vanguard': { hp: 100, speed: 50 }, // 밸런스형
    'Guardian': { hp: 150, speed: 35 }, // 탱커형
    'Assassin': { hp: 70, speed: 70 }   // 암살자형
};

const players = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // 플레이어 접속
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname,
            classType: data.classType,
            x: 0, y: 10, z: 0,
            ry: 0, // 회전값
            hp: CLASSES[data.classType].hp,
            maxHp: CLASSES[data.classType].hp,
            isBlocking: false
        };
        // 본인에게 전체 유저 정보 전송, 남들에게는 내 정보 전송
        socket.emit('initPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // 움직임 및 상태 동기화
    socket.on('updateState', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            players[socket.id].isBlocking = data.isBlocking;
            socket.broadcast.emit('playerState', players[socket.id]);
        }
    });

    // 공격 판정 (타격)
    socket.on('hit', (targetId) => {
        const target = players[targetId];
        const attacker = players[socket.id];
        if (target && attacker && target.hp > 0) {
            // 방어 중이면 데미지 80% 감소
            const damage = target.isBlocking ? 2 : 10;
            target.hp -= damage;
            
            io.emit('hpUpdate', { id: targetId, hp: target.hp });
            
            if (target.hp <= 0) {
                io.emit('playerDied', { id: targetId, killer: attacker.nickname });
                // 3초 후 부활
                setTimeout(() => {
                    if(players[targetId]) {
                        players[targetId].hp = players[targetId].maxHp;
                        players[targetId].x = 0; players[targetId].y = 10; players[targetId].z = 0;
                        io.emit('respawn', players[targetId]);
                    }
                }, 3000);
            }
        }
    });

    // 스킬 사용 이펙트 전파
    socket.on('useSkill', () => {
        socket.broadcast.emit('skillEffect', socket.id);
    });

    // 접속 종료
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
});