(function() {
  const canvas = document.getElementById('ghostCanvas');
  const ctx = canvas.getContext('2d');
  let w, h;
  let dpr = 1;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frameNumber = 0;
  const frameMs = 1000 / 60;
  let lastTimestamp = null;
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    const oldW = w, oldH = h;
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldW && oldH) {
      const scaleX = w / oldW, scaleY = h / oldH;
      for (const s of stars) {
        s.bx *= scaleX; s.by *= scaleY;
        if (s.x !== undefined) { s.x *= scaleX; s.y *= scaleY; }
      }
      for (const c of cats) {
        c.x *= scaleX; c.y *= scaleY;
        c.targetX *= scaleX; c.targetY *= scaleY;
        c.history = c.history.map(point => ({ x: point.x * scaleX, y: point.y * scaleY }));
      }
    }
  }

  // ==================== TINY STAR (drifting) ====================
  class TinyStar {
    constructor() {
      this.bx = Math.random()*w; this.by = Math.random()*h;
      this.size = Math.random()*1.4+0.2; this.alpha = Math.random()*0.5+0.1;
      this.speed = 0.005+Math.random()*0.015; this.phase = Math.random()*Math.PI*2;
      this.depth = 0.2+Math.random()*0.8;
      const driftAngle = Math.random()*Math.PI*2;
      const driftSpeed = 0.05 + Math.random()*0.15;
      this.vx = Math.cos(driftAngle) * driftSpeed;
      this.vy = Math.sin(driftAngle) * driftSpeed;
    }
    update(deltaFrames) {
      this.phase += this.speed * deltaFrames;
      this.bx += this.vx * deltaFrames; this.by += this.vy * deltaFrames;
      if (this.bx < -10) this.bx = w + 10;
      if (this.bx > w + 10) this.bx = -10;
      if (this.by < -10) this.by = h + 10;
      if (this.by > h + 10) this.by = -10;
      const m = mouse.x === -9999 ? { x: w/2, y: h/2 } : mouse;
      this.x = this.bx + (m.x - w/2) * 0.015 * this.depth;
      this.y = this.by + (m.y - h/2) * 0.015 * this.depth;
    }
    draw() {
      let a = this.alpha*(0.4+0.6*Math.sin(this.phase));
      let s = this.size;
      // Glow
      if (mouse.x !== -9999) {
        const dx = this.x - mouse.x, dy = this.y - mouse.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 200) { const f = 1-dist/200; a += f*0.4; s += f*2; }
      }
      ctx.beginPath(); ctx.arc(this.x, this.y, s, 0, Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${a})`; ctx.fill();
    }
  }

  // ==================== GHOST CAT ====================
  class GhostCat {
    constructor(personality) {
      this.x = Math.random()*w; this.y = Math.random()*h;
      this.targetX = this.x; this.targetY = this.y;
      this.eyeGap = 18 + Math.random()*12;
      this.eyeSize = 8 + Math.random()*10;
      this.depth = 0.3 + Math.random()*0.8;
      this.alpha = 0; this.maxAlpha = 0.18 + Math.random()*0.1;
      this.lookAngle = Math.random()*Math.PI*2;
      this.blinkPhase = Math.random()*Math.PI*2;
      this.blinkSpeed = 0.008 + Math.random()*0.006;
      const pals = [[0,200,190],[0,180,210],[100,70,200],[0,230,200]];
      this.color = pals[Math.floor(Math.random()*pals.length)];
      this.state = 'gone'; this.stateTimer = Math.random()*400+100; this.stateDuration = this.stateTimer;
      this.speed = 0; this.history = []; this.maxHistory = 20;
      this.personality = personality || 'watcher';
      this.pounceCount = 0; this.maxPounces = 2 + Math.floor(Math.random()*4);
      this.blinkCycles = 0; this.maxBlinkCycles = 3 + Math.floor(Math.random()*5);
    }
    setStateDuration(duration) {
      this.stateDuration = duration;
      this.stateTimer = duration;
    }
    fadeRemaining() {
      return this.stateDuration > 0 ? Math.max(0, Math.min(1, this.stateTimer / this.stateDuration)) : 0;
    }
    transition(state) {
      this.state = state;
      if (state === 'appear') { this.setStateDuration(40 + Math.random()*60); }
      else if (state === 'watch') {
        if (this.personality === 'blinker') { this.setStateDuration(400 + Math.random()*800); this.blinkCycles = 0; }
        else if (this.personality === 'zoomer') { this.setStateDuration(150 + Math.random()*300); }
        else if (this.personality === 'pouncer') { this.setStateDuration(200 + Math.random()*400); this.pounceCount = 0; }
        else { this.setStateDuration(300 + Math.random()*600); }
      }
      else if (state === 'blink_out') { this.setStateDuration(18 + Math.random()*10); }
      else if (state === 'gone') { this.setStateDuration(80 + Math.random()*220); this.x = Math.random()*w; this.y = Math.random()*h; this.history = []; }
      else if (state === 'blink_in') { this.setStateDuration(25 + Math.random()*15); }
      else if (state === 'dart') { this.targetX = this.x + (Math.random()-0.5)*w*0.6; this.targetY = this.y + (Math.random()-0.5)*h*0.4; this.setStateDuration(20 + Math.random()*35); this.speed = 0; }
      else if (state === 'pounce') {
        const dist = 80 + Math.random()*180, angle = Math.random()*Math.PI*2;
        this.targetX = Math.max(50, Math.min(w-50, this.x + Math.cos(angle)*dist));
        this.targetY = Math.max(50, Math.min(h-50, this.y + Math.sin(angle)*dist));
        this.setStateDuration(10 + Math.random()*15); this.speed = 0; this.pounceCount++;
      }
      else if (state === 'zoom') { this.targetX = Math.random()*w; this.targetY = Math.random()*h; this.setStateDuration(15 + Math.random()*20); this.speed = 0; }
      else if (state === 'blink_pause') { this.setStateDuration(30 + Math.random()*40); this.blinkCycles++; }
    }
    update(deltaFrames) {
      this.blinkPhase += this.blinkSpeed * deltaFrames; this.stateTimer -= deltaFrames;
      if (this.state === 'appear') {
        this.alpha = this.maxAlpha * (1 - this.fadeRemaining());
        if (this.stateTimer <= 0) this.transition('watch');
      } else if (this.state === 'watch') {
        this.alpha = this.maxAlpha;
        // Curious: lock on intensely
        if (mouse.x !== -9999) {
          const target = Math.atan2(mouse.y - this.y, mouse.x - this.x);
          this.lookAngle += (target - this.lookAngle) * (1 - Math.pow(1 - 0.08, deltaFrames));
        } else { this.lookAngle += Math.sin(this.blinkPhase*0.5)*0.01*deltaFrames; }
        this.x += Math.sin(this.blinkPhase*0.7)*0.15*deltaFrames;
        this.y += Math.cos(this.blinkPhase*0.5)*0.1*deltaFrames;
        if (this.stateTimer <= 0) {
          if (this.personality === 'zoomer') this.transition(Math.random() < 0.6 ? 'zoom' : 'blink_out');
          else if (this.personality === 'pouncer') this.transition(this.pounceCount < this.maxPounces ? 'pounce' : 'blink_out');
          else if (this.personality === 'blinker') this.transition(this.blinkCycles < this.maxBlinkCycles ? 'blink_pause' : (Math.random() < 0.55 ? 'dart' : 'blink_out'));
          else this.transition(Math.random() < 0.45 ? 'dart' : 'blink_out');
        }
        // Playful: spontaneous darts
        if (mouse.x !== -9999 && Math.random() < 1 - Math.pow(1 - 0.008, deltaFrames)) this.transition('dart');
      } else if (this.state === 'blink_out') {
        this.alpha = this.maxAlpha * this.fadeRemaining();
        if (this.stateTimer <= 0) this.transition('gone');
      } else if (this.state === 'gone') {
        this.alpha = 0;
        if (this.stateTimer <= 0) this.transition('blink_in');
      } else if (this.state === 'blink_in') {
        this.alpha = this.maxAlpha * (1 - this.fadeRemaining());
        if (this.stateTimer <= 0) this.transition('watch');
      } else if (this.state === 'dart' || this.state === 'zoom') {
        const topSpeed = this.state === 'zoom' ? 28 : 18;
        this.speed = Math.min(this.speed + (this.state === 'zoom' ? 2.5 : 1.2) * deltaFrames, topSpeed);
        const dx = this.targetX - this.x, dy = this.targetY - this.y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist > 1) { this.x += (dx/dist)*this.speed*deltaFrames; this.y += (dy/dist)*this.speed*deltaFrames; this.lookAngle = Math.atan2(dy, dx); }
        this.history.push({x:this.x, y:this.y});
        if (this.history.length > this.maxHistory) this.history.shift();
        this.alpha = this.maxAlpha * this.fadeRemaining();
        if (this.stateTimer <= 0) this.transition('gone');
      } else if (this.state === 'pounce') {
        this.speed = Math.min(this.speed + 3 * deltaFrames, 22);
        const dx = this.targetX - this.x, dy = this.targetY - this.y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist > 1) { this.x += (dx/dist)*this.speed*deltaFrames; this.y += (dy/dist)*this.speed*deltaFrames; this.lookAngle = Math.atan2(dy, dx); }
        this.history.push({x:this.x, y:this.y});
        if (this.history.length > this.maxHistory) this.history.shift();
        if (this.stateTimer <= 0) this.transition('watch');
      } else if (this.state === 'blink_pause') {
        this.alpha = this.maxAlpha;
        this.x += Math.sin(this.blinkPhase*0.7)*0.1*deltaFrames;
        this.y += Math.cos(this.blinkPhase*0.5)*0.08*deltaFrames;
        if (this.stateTimer <= 0) this.transition('watch');
      }
    }
    drawEye(ex, ey, blink) {
      const [r,g,b] = this.color;
      let a = this.alpha, s = this.eyeSize;
      // Glow
      if (mouse.x !== -9999) {
        const dx = ex-mouse.x, dy = ey-mouse.y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 200) { const f = 1-dist/200; a += f*0.15; s += f*4; }
      }
      // Curious: wider eyes near mouse
      if (mouse.x !== -9999) {
        const dx = ex-mouse.x, dy = ey-mouse.y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 300) { const f = 1-dist/300; a += f*0.1; s += f*5; }
      }
      const scaleY = 0.3 + 0.7*blink;
      const grad = ctx.createRadialGradient(ex,ey,0,ex,ey,s*1.5);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a*blink})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${a*0.4*blink})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.save(); ctx.translate(ex,ey); ctx.scale(1, scaleY); ctx.translate(-ex,-ey);
      ctx.beginPath(); ctx.arc(ex,ey,s*1.5,0,Math.PI*2); ctx.fillStyle = grad; ctx.fill();
      const px = ex + Math.cos(this.lookAngle)*s*0.15;
      const py = ey + Math.sin(this.lookAngle)*s*0.15;
      ctx.beginPath(); ctx.arc(px,py,s*0.3,0,Math.PI*2);
      ctx.fillStyle = `rgba(${r},${g},${b},${a*2.5*blink})`; ctx.fill();
      ctx.restore();
    }
    draw() {
      if (this.alpha < 0.005) return;
      const m = mouse.x === -9999 ? { x: w/2, y: h/2 } : mouse;
      const px = this.x + (m.x - w/2)*0.015*this.depth;
      const py = this.y + (m.y - h/2)*0.015*this.depth;
      if ((this.state === 'dart' || this.state === 'zoom' || this.state === 'pounce') && this.history.length > 2) {
        const [r,g,b] = this.color;
        for (let i = 1; i < this.history.length; i++) {
          const t = i/this.history.length;
          const hpx = this.history[i].x + (m.x-w/2)*0.015*this.depth;
          const hpy = this.history[i].y + (m.y-h/2)*0.015*this.depth;
          const hpx2 = this.history[i-1].x + (m.x-w/2)*0.015*this.depth;
          const hpy2 = this.history[i-1].y + (m.y-h/2)*0.015*this.depth;
          ctx.beginPath(); ctx.moveTo(hpx2,hpy2); ctx.lineTo(hpx,hpy);
          ctx.strokeStyle = `rgba(${r},${g},${b},${t*this.alpha*0.25})`;
          ctx.lineWidth = this.eyeSize*t*0.3; ctx.lineCap='round'; ctx.stroke();
        }
      }
      const blinkRaw = Math.sin(this.blinkPhase);
      let blink = 1;
      if (this.state === 'watch' && blinkRaw > 0.92) blink = 1-(blinkRaw-0.92)/0.08;
      if (this.state === 'blink_out') blink = this.fadeRemaining();
      if (this.state === 'blink_in') blink = 1-this.fadeRemaining();
      if (this.state === 'blink_pause') blink = 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(this.blinkPhase*8));
      blink = Math.max(0, Math.min(1, blink));
      this.drawEye(px - this.eyeGap/2, py, blink);
      this.drawEye(px + this.eyeGap/2, py, blink);
    }
  }

  let stars = [], cats = [];

  function init() {
    const starCount = Math.min(Math.floor(w*h/7000), 130);
    while (stars.length < starCount) stars.push(new TinyStar());
    if (stars.length > starCount) stars.length = starCount;
    const personalities = ['watcher','watcher','watcher','blinker','blinker','blinker','zoomer','zoomer','pouncer','pouncer','pouncer','watcher'];
    const catCount = prefersReducedMotion ? 12 : 18;
    while (cats.length < catCount) {
      const gc = new GhostCat(personalities[cats.length % personalities.length]);
      gc.stateTimer = Math.random()*300;
      gc.stateDuration = gc.stateTimer;
      cats.push(gc);
    }
    if (cats.length > catCount) cats.length = catCount;
  }

  function animate(timestamp) {
    const deltaFrames = lastTimestamp === null
      ? 1
      : Math.min(4, Math.max(0, (timestamp - lastTimestamp) / frameMs));
    lastTimestamp = timestamp;
    ctx.clearRect(0,0,w,h);
    try {
      if (!prefersReducedMotion || frameNumber % 2 === 0) {
        for (const s of stars) s.update(deltaFrames);
        for (const c of cats) c.update(deltaFrames);
      }
      for (const s of stars) s.draw();
      for (const c of cats) c.draw();
    } catch(e) { console.error('Animation error:', e); }
    frameNumber++;
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    const widthChanged = window.innerWidth !== w;
    const heightDelta = Math.abs(window.innerHeight - h);
    if (!widthChanged && heightDelta < 160) return;
    resize(); init();
  });
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener('touchmove', e => { if(e.touches.length) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; } }, { passive: true });
  window.addEventListener('touchend', () => { mouse.x = -9999; mouse.y = -9999; });

  resize(); init(); requestAnimationFrame(animate);
})();
