import * as THREE from 'three';

class SmoothBlockyWorld {
    constructor() {
        this.canvas = document.querySelector('#game-canvas');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });

        this.player = null;
        this.limbs = {};
        this.keys = {};
        this.walkSpeed = 0.15;
        this.runSpeed = 0.22;
        this.cameraAngle = 0;
        this.cameraPitch = 0.15;
        this.animPhase = 0;
        this.capeSwing = 0;
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gravity = -0.012;
        this.groundLevel = 0;
        this.landingAnim = 0;
        this.clock = new THREE.Clock();

        // Touch Control Vars
        this.camDist = 7;
        this.joystickPos = new THREE.Vector2(0, 0);
        this.isTouchingJoystick = false;
        this.isRunToggled = false;
        this.pinchStartDist = 0;
        this.pinchStartCamDist = 7;

        this.init();
    }

    init() {
        this.setupRenderer();
        this.setupAtmosphere();
        this.createEnvironment();
        this.createSmoothBlockyChar();

        // Start facing forward (away from camera)
        this.player.rotation.y = Math.PI;

        this.setupEventListeners();
        this.animate();

        setTimeout(() => {
            const loader = document.getElementById('loading-screen');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 500);
            }
        }, 800);
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.setClearColor(0xefefef); // Clean white/grey background
    }

    setupAtmosphere() {
        const hLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(hLight);

        const dLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dLight.position.set(10, 20, 10);
        dLight.castShadow = true;
        dLight.shadow.mapSize.width = 1024;
        dLight.shadow.mapSize.height = 1024;
        this.scene.add(dLight);
    }

    createEnvironment() {
        // Simple Flat Ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const grid = new THREE.GridHelper(100, 50, 0x000000, 0x888888);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    createSmoothBlockyChar() {
        this.player = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.5 });

        // LOWER TORSO / HIPS (The true root of R15)
        this.limbs.hips = new THREE.Group();
        this.limbs.hips.position.y = 1.0; // Start at waist height
        this.player.add(this.limbs.hips);

        // UPPER TORSO
        this.limbs.torso = new THREE.Group();
        const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.45), mat);
        torsoMesh.position.y = 0.45;
        torsoMesh.castShadow = true;
        this.limbs.torso.add(torsoMesh);
        this.limbs.torso.position.y = 0.1; // Offset from chips
        this.limbs.hips.add(this.limbs.torso);

        // HEAD
        this.limbs.head = new THREE.Group();
        const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
        headMesh.position.y = 0.25;
        headMesh.castShadow = true;
        this.limbs.head.add(headMesh);
        this.limbs.head.position.y = 0.9;
        this.limbs.torso.add(this.limbs.head);

        // --- JOINTED LIMBS FUNCTION ---
        const createJointedLimb = (w, h1, h2, d, x, y, parent) => {
            const upper = new THREE.Group();
            const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h1, d), mat);
            upperMesh.position.y = -h1 / 2;
            upperMesh.castShadow = true;
            upper.add(upperMesh);
            upper.position.set(x, y, 0);

            const lower = new THREE.Group();
            const lowerMesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, h2, d * 0.95), mat);
            lowerMesh.position.y = -h2 / 2;
            lowerMesh.castShadow = true;
            lower.add(lowerMesh);
            lower.position.y = -h1;
            upper.add(lower);

            parent.add(upper);
            return { upper, lower };
        };

        // ARMS (Attached to Upper Torso)
        this.limbs.L_Arm = createJointedLimb(0.32, 0.5, 0.45, 0.35, -0.6, 0.8, this.limbs.torso);
        this.limbs.R_Arm = createJointedLimb(0.32, 0.5, 0.45, 0.35, 0.6, 0.8, this.limbs.torso);

        // LEGS (Attached to Hips / Lower Torso)
        this.limbs.L_Leg = createJointedLimb(0.4, 0.5, 0.5, 0.42, -0.22, 0.0, this.limbs.hips);
        this.limbs.R_Leg = createJointedLimb(0.4, 0.5, 0.5, 0.42, 0.22, 0.0, this.limbs.hips);

        // KNIGHT SWORD
        this.limbs.sword = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.8, 0.06), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.2 }));
        blade.position.y = 1.4;
        this.limbs.sword.add(blade);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        this.limbs.sword.add(guard);

        this.limbs.sword.position.y = -0.45;
        this.limbs.sword.rotation.x = Math.PI / 1.7;
        this.limbs.R_Arm.lower.add(this.limbs.sword);

        // --- JOINTED CAPE ---
        const capeMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, roughness: 0.8, side: THREE.DoubleSide });
        this.limbs.capeSegments = [];
        let capeParent = this.limbs.torso;
        let cY = 0.9;

        for (let i = 0; i < 4; i++) {
            const seg = new THREE.Group();

            if (i < 3) {
                // Regular solid segments
                const segMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.05), capeMat);
                segMesh.position.y = -0.225;
                segMesh.position.z = -0.23;
                segMesh.castShadow = true;
                seg.add(segMesh);
            } else {
                // TATTERED BOTTOM SEGMENT (Contained within width)
                const stripCount = 8;
                const totalWidth = 1.1;
                const slotW = totalWidth / stripCount;
                for (let j = 0; j < stripCount; j++) {
                    const stripH = 0.2 + Math.random() * 0.4;
                    // Slightly wider than slot to prevent gaps, but centered
                    const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(slotW * 1.1, stripH, 0.05), capeMat);
                    stripMesh.position.x = -totalWidth / 2 + (j + 0.5) * slotW;
                    stripMesh.position.y = -stripH / 2;
                    stripMesh.position.z = -0.23;
                    stripMesh.castShadow = true;
                    seg.add(stripMesh);
                }
            }

            seg.position.set(0, cY, 0);
            capeParent.add(seg);
            this.limbs.capeSegments.push(seg);

            capeParent = seg;
            cY = (i < 3) ? -0.45 : -0.3;
        }

        this.scene.add(this.player);
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => this.keys[e.code.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code.toLowerCase()] = false);
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- MOBILE TOUCH CONTROLS ---
        const joystickBase = document.getElementById('joystick-base');
        const joystickHandle = document.getElementById('joystick-handle');
        const jumpBtn = document.getElementById('jump-button');
        const runBtn = document.getElementById('run-button');
        const joystickContainer = document.getElementById('joystick-container');

        const detectTouch = (e) => {
            joystickContainer.style.display = 'block';
            jumpBtn.style.display = 'flex';
            runBtn.style.display = 'flex';
            window.removeEventListener('touchstart', detectTouch);
        };
        window.addEventListener('touchstart', detectTouch);

        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['space'] = true;
        });
        jumpBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.keys['space'] = false;
        });

        runBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isRunToggled = !this.isRunToggled;
            runBtn.classList.toggle('active', this.isRunToggled);
            runBtn.innerText = this.isRunToggled ? 'RUN: ON' : 'RUN: OFF';
        });

        joystickBase.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isTouchingJoystick = true;
        });

        window.addEventListener('touchmove', (e) => {
            if (this.isTouchingJoystick && e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = joystickBase.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                let dx = touch.clientX - centerX;
                let dy = touch.clientY - centerY;

                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = rect.width / 2;

                if (dist > maxDist) {
                    dx = (dx / dist) * maxDist;
                    dy = (dy / dist) * maxDist;
                }

                this.joystickPos.set(dx / maxDist, dy / maxDist);
                joystickHandle.style.transform = `translate(${dx}px, ${dy}px)`;
            } else if (!this.isTouchingJoystick && e.touches.length === 1) {
                // Camera Rotation
                const touch = e.touches[0];
                if (this.lastTouchX !== undefined) {
                    const dx = touch.pageX - this.lastTouchX;
                    const dy = touch.pageY - this.lastTouchY;
                    this.cameraAngle -= dx * 0.005;
                    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - dy * 0.005, -0.4, 1.4);
                }
                this.lastTouchX = touch.pageX;
                this.lastTouchY = touch.pageY;
            }

            // Pinch Zoom Logic
            if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDist = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);

                if (this.pinchStartDist === 0) {
                    this.pinchStartDist = currentDist;
                    this.pinchStartCamDist = this.camDist;
                } else {
                    const delta = currentDist / this.pinchStartDist;
                    this.camDist = THREE.MathUtils.clamp(this.pinchStartCamDist / delta, 5, 30);
                }
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            this.lastTouchX = undefined;
            this.lastTouchY = undefined;
            if (e.touches.length < 2) {
                this.pinchStartDist = 0;
            }
            if (e.touches.length === 0) {
                this.isTouchingJoystick = false;
                this.joystickPos.set(0, 0);
                joystickHandle.style.transform = `translate(0px, 0px)`;
            }
        });
    }

    update() {
        const dt = this.clock.getDelta();

        // 1. Camera
        const rotationSpeed = 2.5;
        if (this.keys['arrowleft']) this.cameraAngle += rotationSpeed * dt;
        if (this.keys['arrowright']) this.cameraAngle -= rotationSpeed * dt;
        if (this.keys['arrowup']) this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + rotationSpeed * dt * 0.5, -0.4, 1.4);
        if (this.keys['arrowdown']) this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - rotationSpeed * dt * 0.5, -0.4, 1.4);

        // 2. Movement
        const move = new THREE.Vector3();
        if (this.keys['keyw']) move.z -= 1;
        if (this.keys['keys']) move.z += 1;
        if (this.keys['keya']) move.x -= 1;
        if (this.keys['keyd']) move.x += 1;

        // Add Joystick Input (negate x to fix inverted controls)
        if (this.joystickPos.length() > 0.1) {
            move.x = -this.joystickPos.x;
            move.z = this.joystickPos.y;
        }

        const isRunning = this.keys['shiftleft'] || this.keys['shiftright'] || this.isRunToggled;
        const currentSpeed = isRunning ? this.runSpeed : this.walkSpeed;

        let isMoving = false;
        if (move.length() > 0) {
            isMoving = true;
            move.normalize();
            const cos = Math.cos(this.cameraAngle), sin = Math.sin(this.cameraAngle);
            const worldMove = new THREE.Vector3(move.x * cos + move.z * sin, 0, -move.x * sin + move.z * cos);
            this.player.position.add(worldMove.multiplyScalar(currentSpeed));

            const targetRotation = Math.atan2(worldMove.x, worldMove.z);
            let diff = targetRotation - this.player.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.player.rotation.y += diff * 0.15;
        }

        // 2.5 Jumping & Falling Physics
        const bounds = 50;
        const isOnPlatform = Math.abs(this.player.position.x) <= bounds && Math.abs(this.player.position.z) <= bounds;

        // Space to jump
        if (this.keys['space'] && !this.isJumping && this.landingAnim <= 0 && isOnPlatform) {
            this.isJumping = true;
            this.jumpVelocity = 0.45;
            this.landingAnim = 0;
        }

        // Start falling if walking off platform
        if (!isOnPlatform && !this.isJumping && this.player.position.y >= this.groundLevel) {
            this.isJumping = true;
            this.jumpVelocity = 0;
        }

        if (this.isJumping) {
            this.player.position.y += this.jumpVelocity;
            this.jumpVelocity += this.gravity;

            // Only land if we are actually above the platform
            if (isOnPlatform && this.player.position.y <= this.groundLevel) {
                this.player.position.y = this.groundLevel;
                this.isJumping = false;
                this.jumpVelocity = 0;
                this.landingAnim = 0.25;
            }
        }

        // Respawn if fell into the void
        if (this.player.position.y < -50) {
            this.player.position.set(0, 0, 0);
            this.player.rotation.y = Math.PI; // Face away from camera again
            this.isJumping = false;
            this.jumpVelocity = 0;

            // Temporary freeze movement to avoid instant refall if holding keys
            this.landingAnim = 0.5;
        }

        if (this.landingAnim > 0) this.landingAnim -= dt;

        // 3. PRO ROBLOX KNIGHT RIGGING (R15 Style - Ultra Calm & Steady)
        if (this.isJumping) {
            // --- JUMP ANIMATION ---
            const jumpAirForce = this.jumpVelocity;

            // Legs tuck in air
            this.limbs.L_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.upper.rotation.x, -0.5, 0.1);
            this.limbs.L_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.lower.rotation.x, 0.8, 0.1);
            this.limbs.R_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.upper.rotation.x, 0.2, 0.1);
            this.limbs.R_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.lower.rotation.x, 0.5, 0.1);

            // Arms reach for balance
            this.limbs.L_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Arm.upper.rotation.x, -Math.PI / 3, 0.1);
            this.limbs.L_Arm.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.L_Arm.upper.rotation.z, -0.4, 0.1);

            this.limbs.R_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.x, 0.4, 0.1);
            this.limbs.R_Arm.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.lower.rotation.x, -0.8, 0.1);

            // Torso reacts to air velocity
            this.limbs.torso.rotation.x = THREE.MathUtils.lerp(this.limbs.torso.rotation.x, jumpAirForce * -0.5, 0.1);

            // Sword Ready in air
            if (this.limbs.sword) {
                this.limbs.sword.rotation.x = THREE.MathUtils.lerp(this.limbs.sword.rotation.x, Math.PI / 1.5, 0.1);
            }

        } else if (this.landingAnim > 0) {
            // --- LANDING IMPACT ANIMATION ---
            const impact = this.landingAnim * 4.0; // 1.0 -> 0.0

            // Squat down
            this.limbs.hips.position.y = THREE.MathUtils.lerp(this.limbs.hips.position.y, 1.0 - impact * 0.4, 0.2);

            // Knees bend on impact
            this.limbs.L_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.upper.rotation.x, -0.4, 0.2);
            this.limbs.L_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.lower.rotation.x, 0.9, 0.2);
            this.limbs.R_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.upper.rotation.x, -0.4, 0.2);
            this.limbs.R_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.lower.rotation.x, 0.9, 0.2);

            // Arms move out slightly for balance
            this.limbs.L_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Arm.upper.rotation.x, 0.4, 0.2);
            this.limbs.R_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.x, 0.4, 0.2);

            // Torso leans forward on impact
            this.limbs.torso.rotation.x = THREE.MathUtils.lerp(this.limbs.torso.rotation.x, impact * 0.2, 0.2);

            // Sword held steady
            if (this.limbs.sword) {
                this.limbs.sword.rotation.x = THREE.MathUtils.lerp(this.limbs.sword.rotation.x, Math.PI / 1.7, 0.1);
            }

        } else if (isMoving) {
            const freq = isRunning ? 6.8 : 6.8; // Match the new slower run speed
            this.animPhase += dt * freq;

            const pace = this.animPhase;
            const cycleX = Math.sin(pace);
            const cycleZ = Math.cos(pace);

            const amp = isRunning ? 0.7 : 0.45;
            // Posture = LURUS (0 or very slight forward lean for run)
            const proudLean = isRunning ? 0.1 : 0.0;

            // --- HIPS (Lower Torso) ---
            // Very subtle bobbing
            this.limbs.hips.position.y = 1.0 - Math.abs(cycleX) * (isRunning ? 0.15 : 0.08);
            this.limbs.hips.rotation.z = -cycleX * 0.08; // Minimal hip tilt
            this.limbs.hips.rotation.y = cycleX * 0.12; // Minimal twist

            // --- LEGS ---
            const legAmp = isRunning ? 1.2 : 0.6;
            const strideBase = cycleX * legAmp;

            this.limbs.L_Leg.upper.rotation.x = strideBase;
            this.limbs.R_Leg.upper.rotation.x = -strideBase;
            this.limbs.L_Leg.upper.rotation.z = Math.max(0, cycleX) * 0.05;
            this.limbs.R_Leg.upper.rotation.z = Math.min(0, cycleX) * 0.05;

            const calcKneeBend = (phase) => {
                if (phase > 0) {
                    return Math.sin(phase * Math.PI) * (isRunning ? 1.2 : 0.9);
                }
                return 0;
            };

            this.limbs.L_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.lower.rotation.x, calcKneeBend(cycleX), 0.2);
            this.limbs.R_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.lower.rotation.x, calcKneeBend(-cycleX), 0.2);

            // --- TORSO (Upper Torso - LURUS) ---
            this.limbs.torso.rotation.x = THREE.MathUtils.lerp(this.limbs.torso.rotation.x, proudLean, 0.1);
            this.limbs.torso.rotation.y = -this.limbs.hips.rotation.y * 0.6;
            this.limbs.torso.rotation.z = -this.limbs.hips.rotation.z * 0.6;

            // --- ARMS (Neutral position) ---
            // Left Arm: Subtle counter-swing
            this.limbs.L_Arm.upper.rotation.x = -cycleX * amp * 0.9;
            this.limbs.L_Arm.upper.rotation.z = -0.15;
            this.limbs.L_Arm.lower.rotation.x = -0.2 - Math.abs(cycleX) * 0.2;

            // Right Arm: Corrected Shoulder Carry (Pedang menyandar ke belakang)
            this.limbs.R_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.x, -1.5, 0.1);
            this.limbs.R_Arm.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.z, 0.6, 0.1); // Elbow slightly out
            this.limbs.R_Arm.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.lower.rotation.x, -2.2, 0.1); // Bend back to shoulder

            // SWORD: Pointing BACK and UP from the shoulder
            if (this.limbs.sword) {
                // Adjusting rotation so the blade points backwards over the shoulder
                this.limbs.sword.rotation.x = THREE.MathUtils.lerp(this.limbs.sword.rotation.x, Math.PI / 1.1, 0.1);
                this.limbs.sword.position.y = THREE.MathUtils.lerp(this.limbs.sword.position.y, -0.4, 0.1);
            }

            // --- HEAD ---
            this.limbs.head.rotation.x = THREE.MathUtils.lerp(this.limbs.head.rotation.x, 0, 0.1); // Head straight
            this.limbs.head.rotation.y = THREE.MathUtils.lerp(this.limbs.head.rotation.y, -this.limbs.torso.rotation.y * 0.5, 0.1);

        } else {
            // --- KNIGHT MODE IDLE (Resting Sword Pose) ---
            const t = Date.now() * 0.002;
            const breathe = Math.sin(t);

            // Lower core for "resting" feel (alert but stable)
            this.limbs.hips.position.y = THREE.MathUtils.lerp(this.limbs.hips.position.y, 0.88 + breathe * 0.02, 0.1);
            this.limbs.hips.rotation.y = THREE.MathUtils.lerp(this.limbs.hips.rotation.y, 0.3, 0.1);

            // LEGS: Stable wide rest (one forward, one back flare)
            const legLerp = 0.1;
            this.limbs.L_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.upper.rotation.x, -0.2, legLerp);
            this.limbs.L_Leg.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.L_Leg.upper.rotation.z, -0.3, legLerp);
            this.limbs.L_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Leg.lower.rotation.x, 0.4, legLerp);

            this.limbs.R_Leg.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.upper.rotation.x, 0.3, legLerp);
            this.limbs.R_Leg.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.R_Leg.upper.rotation.z, 0.3, legLerp);
            this.limbs.R_Leg.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Leg.lower.rotation.x, 0.4, legLerp);

            // TORSO: Lurus (Neutral/Breathing)
            this.limbs.torso.rotation.x = THREE.MathUtils.lerp(this.limbs.torso.rotation.x, 0.01 * breathe, 0.05);
            this.limbs.torso.rotation.y = THREE.MathUtils.lerp(this.limbs.torso.rotation.y, -0.1, 0.05);

            // LEFT ARM: Relaxed/Guarding
            this.limbs.L_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Arm.upper.rotation.x, 0.4, 0.1);
            this.limbs.L_Arm.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.L_Arm.upper.rotation.z, -0.3, 0.1);
            this.limbs.L_Arm.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.L_Arm.lower.rotation.x, -0.8, 0.1);

            // RIGHT ARM: Holding Sword STABBED into ground
            // Lower the arm to reach the grounded hilt naturally
            this.limbs.R_Arm.upper.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.x, 0.35, 0.1);
            this.limbs.R_Arm.upper.rotation.z = THREE.MathUtils.lerp(this.limbs.R_Arm.upper.rotation.z, 0.35, 0.1);
            this.limbs.R_Arm.lower.rotation.x = THREE.MathUtils.lerp(this.limbs.R_Arm.lower.rotation.x, -1.35, 0.1);

            // SWORD: STABBED VERTICAL (Blade down into ground)
            if (this.limbs.sword) {
                // Rotation Math.PI points the blade straight down from the hand
                this.limbs.sword.rotation.x = THREE.MathUtils.lerp(this.limbs.sword.rotation.x, Math.PI, 0.1);
                this.limbs.sword.position.y = THREE.MathUtils.lerp(this.limbs.sword.position.y, -0.3, 0.1);
            }

            // HEAD: Looking down with focus
            this.limbs.head.rotation.x = THREE.MathUtils.lerp(this.limbs.head.rotation.x, 0.15, 0.1);
            this.limbs.head.rotation.y = THREE.MathUtils.lerp(this.limbs.head.rotation.y, 0, 0.1);
        }

        // 4. Camera Follow
        const camDist = this.camDist;
        const camHeight = 3.5 + (this.cameraPitch * 7);
        const offset = new THREE.Vector3(Math.sin(this.cameraAngle) * camDist, camHeight, Math.cos(this.cameraAngle) * camDist);
        this.camera.position.lerp(this.player.position.clone().add(offset), 0.1);
        this.camera.lookAt(this.player.position.clone().add(new THREE.Vector3(0, 1.8, 0)));

        // 5. CAPE PHYSICS (Uniform Motion)
        if (this.limbs.capeSegments) {
            this.capeSwing += dt * 3; // Slower wind
            const airForce = this.isJumping ? this.jumpVelocity * 1.5 : 0;

            this.limbs.capeSegments.forEach((seg, i) => {
                // Calm wave - constant regardless of movement
                const wave = Math.sin(this.capeSwing - i * 0.6) * 0.08;

                // Uniform target rotation for a clean, stable look (same as idle)
                const targetX = 0.28 + wave - (airForce * 0.3);

                seg.rotation.x = THREE.MathUtils.lerp(seg.rotation.x, targetX, 0.1);
                seg.rotation.z = THREE.MathUtils.lerp(seg.rotation.z, 0, 0.1); // Always stable
            });
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => { new SmoothBlockyWorld(); });
