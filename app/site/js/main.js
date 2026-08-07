const CONFIG = {
    arriveDelay: 0.8,
    voiceDelay: 0.4,
    crossfadeDuration: 0.8,
    particleCount: 280,
};

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const truckWrap = document.getElementById('truck-wrap');
const logoWrap = document.getElementById('logo-wrap');
let W, H;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ============================================================
//  STARS
// ============================================================
class Star {
    constructor() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.size = Math.random() * 2 + 0.3;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.speed = 0.01 + Math.random() * 0.03;
        this.offset = Math.random() * 100;
    }
    update(t) {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < -5) this.x = W + 5;
        if (this.x > W + 5) this.x = -5;
        if (this.y < -5) this.y = H + 5;
        if (this.y > H + 5) this.y = -5;
        this.alpha = this.opacity * (0.6 + 0.4 * Math.sin(t * this.speed + this.offset));
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${this.alpha})`;
        ctx.fill();
    }
}

const stars = Array.from({ length: CONFIG.particleCount }, () => new Star());

// ============================================================
//  AUDIO
// ============================================================
let audioCtx = null;
let engineNodes = null;

function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
document.addEventListener('pointerdown', ensureAudio, { once: true });

function startEngineSound() {
    ensureAudio();
    if (!audioCtx || audioCtx.state === 'suspended') return;

    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 72;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 250;
    filter.Q.value = 0.5;

    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    gain.gain.linearRampToValueAtTime(0.08, now + 0.5);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    engineNodes = { osc1, osc2, lfo, gain, filter, lfoGain };
}

function stopEngineSound(callback) {
    if (!engineNodes || !audioCtx) {
        if (callback) callback();
        return;
    }
    const now = audioCtx.currentTime;
    engineNodes.gain.gain.linearRampToValueAtTime(0, now + 0.5);
    setTimeout(() => {
        try {
            engineNodes.osc1.stop();
            engineNodes.osc2.stop();
            engineNodes.lfo.stop();
        } catch (e) { /* ignore */ }
        engineNodes = null;
        if (callback) callback();
    }, 600);
}

function speakVoice() {
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(
            'Cargo Stats, seu aplicativo em tempo real'
        );
        utterance.lang = 'pt-BR';
        utterance.rate = 0.85;
        utterance.pitch = 0.7;

        const setVoice = () => {
            const voices = speechSynthesis.getVoices();
            const ptVoice = voices.find(v => v.lang.startsWith('pt') && v.name.includes('Male'))
                         || voices.find(v => v.lang.startsWith('pt'));
            if (ptVoice) utterance.voice = ptVoice;
        };
        setVoice();
        speechSynthesis.addEventListener('voiceschanged', setVoice, { once: true });

        utterance.onend = resolve;
        utterance.onerror = resolve;
        speechSynthesis.speak(utterance);
    });
}

// ============================================================
//  INTRO SEQUENCE
// ============================================================
let introState = 'idle';
let introTimer = 0;

function startIntro() {
    introState = 'driving';
    truckWrap.classList.add('go');
    introTimer = 0;
    startEngineSound();
}

async function onTruckArrived() {
    introState = 'voicing';

    await new Promise(r => setTimeout(r, CONFIG.voiceDelay * 1000));

    await speakVoice();

    introState = 'fading';
    truckWrap.classList.add('fade-out');
    logoWrap.classList.add('show');
    stopEngineSound();

    await new Promise(r => setTimeout(r, CONFIG.crossfadeDuration * 1000));
    introState = 'done';
}

setTimeout(startIntro, 200);

// ============================================================
//  MAIN LOOP
// ============================================================
let time = 0;

function animate() {
    time += 1 / 60;

    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, '#0f0f1a');
    grad.addColorStop(1, '#050508');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
        s.update(time);
        s.draw();
    }

    if (introState === 'driving') {
        introTimer += 1 / 60;
        if (introTimer >= CONFIG.arriveDelay) {
            introState = 'arrived';
            introTimer = 0;
            onTruckArrived();
        }
    }

    requestAnimationFrame(animate);
}

animate();
