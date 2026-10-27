import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const socket = io();

// UI 요소
const uiLayer = document.getElementById('ui-layer');
const joinBtn = document.getElementById('join-btn');
const hud = document.getElementById('hud');
const hpBar = document.getElementById('hp-bar');
const statusText = document.getElementById('status-text');
const settingsMenu = document.getElementById('settings');
const killLog = document.getElementById('kill-log');

// 기사 클래스 스펙 (클라이언트)
const CLASSES = {
    'Vanguard': { hp: 100, speed: 50, color: 0x4287f5 },
    'Guardian': { hp: 150, speed: 35, color: 0x808080 },
    'Assassin': { hp: 70, speed: 70, color: 0x202020 }
};

let myClass = 'Vanguard';
let myHp = 100;
let myMaxHp = 100;

// Three.js 셋업
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 하늘색 배경
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 조명
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 1.5));

// 중세 배경 바닥 (초원)
const floorGeo = new THREE.PlaneGeometry(500, 500);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2d4c1e });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 플레이어 컨트롤 (FPS)
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

let sensitivity = 1.0;
document.getElementById('sens').addEventListener('input', (e) => {
    sensitivity = e.target.value;
    controls.pointerSpeed = sensitivity;
});

// 조작 상태
const moveState = { forward: false, backward: false, left: false, right: false };
let isRunning = false;
let isCrouching = false;
let isBlocking = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// 다른 플레이어 렌더링을 위한 딕셔너리
const otherPlayers = {};

// 접속 버튼 클릭
joinBtn.addEventListener('click', () => {
    const nickname = document.getElementById('nickname').value || '무명기사';
    myClass = document.getElementById('class-select').value;
    myMaxHp = CLASSES[myClass].hp;
    myHp = myMaxHp;
    
    socket.emit('join', { nickname, classType: myClass });
    
    uiLayer.style.display = 'none';
    hud.style.display = 'block';
    controls.lock();
    updateHUD();
});

// 키보드 입력 처리
document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'ShiftLeft': isRunning = true; break;
        case 'ControlLeft': case 'KeyC':
            isCrouching = true; 
            camera.position.y = 5; // 앉으면 시야 낮아짐
            break;
        case 'KeyE': useSkill(); break; // 스킬 사용
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
        case 'ShiftLeft': isRunning = false; break;
        case 'ControlLeft': case 'KeyC':
            isCrouching = false; 
            camera.position.y = 10; // 다시 일어남
            break;
    }
});

// 마우스 클릭 (공격, 방어)
document.addEventListener('mousedown', (event) => {
    if(!controls.isLocked) return;
    if (event.button === 0) { // 좌클릭 (공격)
        attack();
    } else if (event.button === 2) { // 우클릭 (방어)
        isBlocking = true;
        updateHUD();
    }
});
document.addEventListener('mouseup', (event) => {
    if (event.button === 2) {
        isBlocking = false;
        updateHUD();
    }
});

// 우클릭 메뉴 방지
document.addEventListener('contextmenu', e => e.preventDefault());

// 설정 창 열기 (ESC)
controls.addEventListener('unlock', () => {
    if(uiLayer.style.display === 'none') {
        settingsMenu.style.display = 'block';
    }
});
document.getElementById('close-settings').addEventListener('click', () => {
    settingsMenu.style.display = 'none';
    controls.lock();
});

// 공격 (Raycaster)
const raycaster = new THREE.Raycaster();
function attack() {
    if (isBlocking) return; // 막기 중엔 공격 불가
    
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const intersects = raycaster.intersectObjects(Object.values(otherPlayers).map(p => p.mesh));
    
    if (intersects.length > 0) {
        // 거리 제한 (근접 공격)
        if(intersects[0].distance < 20) {
            const hitMesh = intersects[0].object;
            socket.emit('hit', hitMesh.userData.id);
        }
    }
    
    // 공격 모션 (화면 흔들림)
    camera.rotation.z = 0.1;
    setTimeout(() => camera.rotation.z = 0, 100);
}

// 스킬 기능
let skillCooldown = false;
function useSkill() {
    if(skillCooldown) return;
    socket.emit('useSkill');
    skillCooldown = true;
    setTimeout(() => skillCooldown = false, 5000); // 5초 쿨타임
    
    if (myClass === 'Vanguard') {
        // 대쉬
        velocity.z -= 500; 
    } else if (myClass === 'Guardian') {
        // 자힐
        myHp = Math.min(myMaxHp, myHp + 30);
        updateHUD();
    } else if (myClass === 'Assassin') {
        // 암살자 이펙트 (화면 반전)
        scene.background = new THREE.Color(0x111111);
        setTimeout(() => scene.background = new THREE.Color(0x87ceeb), 2000);
    }
}

// 다른 유저 시각화 생성
function createPlayerMesh(playerData) {
    const geo = new THREE.BoxGeometry(6, 12, 6);
    const mat = new THREE.MeshLambertMaterial({ color: CLASSES[playerData.classType].color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(playerData.x, playerData.y, playerData.z);
    mesh.userData = { id: playerData.id };
    scene.add(mesh);
    
    otherPlayers[playerData.id] = { mesh, data: playerData };
}

// 소켓 이벤트 처리
socket.on('initPlayers', (serverPlayers) => {
    for (let id in serverPlayers) {
        if (id !== socket.id) createPlayerMesh(serverPlayers[id]);
    }
});

socket.on('newPlayer', (playerData) => {
    createPlayerMesh(playerData);
});

socket.on('playerState', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].mesh.position.set(data.x, data.y - 5, data.z);
        otherPlayers[data.id].mesh.rotation.y = data.ry;
        // 상대방이 방어중이면 반투명해짐 (시각적 피드백)
        otherPlayers[data.id].mesh.material.opacity = data.isBlocking ? 0.5 : 1;
        otherPlayers[data.id].mesh.material.transparent = data.isBlocking;
    }
});

socket.on('hpUpdate', (data) => {
    if (data.id === socket.id) {
        myHp = data.hp;
        updateHUD();
        // 맞았을 때 빨간 화면 깜빡임
        document.body.style.backgroundColor = "red";
        setTimeout(() => document.body.style.backgroundColor = "black", 100);
    }
});

socket.on('playerDied', (data) => {
    showLog(`${data.killer}님이 누군가를 쓰러뜨렸습니다!`);
    if(data.id === socket.id) {
        statusText.innerHTML = "사망했습니다... 3초 후 부활합니다.";
        controls.unlock();
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].mesh.visible = false;
    }
});

socket.on('respawn', (data) => {
    if(data.id === socket.id) {
        myHp = myMaxHp;
        controls.getObject().position.set(0, 10, 0);
        updateHUD();
        controls.lock();
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].mesh.visible = true;
    }
});

socket.on('playerLeft', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].mesh);
        delete otherPlayers[id];
    }
});

function updateHUD() {
    hpBar.style.width = Math.max(0, (myHp / myMaxHp) * 100) + '%';
    let blockText = isBlocking ? " [방어 중🛡️]" : "";
    let crouchText = isCrouching ? " [앉음]" : "";
    statusText.innerHTML = `HP: ${myHp} / ${myMaxHp} | 직업: ${myClass} ${blockText} ${crouchText}`;
}

function showLog(msg) {
    killLog.innerHTML = msg;
    setTimeout(() => killLog.innerHTML = "", 3000);
}

// 게임 메인 루프
let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    
    if (controls.isLocked) {
        const delta = (time - prevTime) / 1000;
        
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize();

        // 스펙에 따른 속도 + 달리기/앉기 보정
        let baseSpeed = CLASSES[myClass].speed;
        if (isRunning && !isCrouching && !isBlocking) baseSpeed *= 1.8;
        if (isCrouching) baseSpeed *= 0.5;
        if (isBlocking) baseSpeed *= 0.3; // 방어 중 느려짐

        if (moveState.forward || moveState.backward) velocity.z -= direction.z * baseSpeed * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * baseSpeed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        // 카메라 높이 고정 (점프 제거, FPS 바닥 고정용)
        const camObj = controls.getObject();
        if(!isCrouching) camObj.position.y = 10;
        
        // 서버에 내 위치 전송 (네트워크 부하를 줄이기 위해 값이 변할 때만 전송하면 더 좋지만 예제라 매 프레임 송신)
        socket.emit('updateState', {
            x: camObj.position.x,
            y: camObj.position.y,
            z: camObj.position.z,
            ry: camObj.rotation.y,
            isBlocking: isBlocking
        });
    }
    prevTime = time;
    renderer.render(scene, camera);
}
animate();