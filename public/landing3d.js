// ScamShield AI — premium landing: full-site 3D background (cursor + scroll reactive),
// splash entrance, scroll reveal, 3D tilt cards. Uses global THREE from CDN; fails silently.
(function () {
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const finePointer = !!(window.matchMedia && window.matchMedia('(pointer:fine)').matches);

  // 5. splash name text-scramble
  function scramble(el, finalText, duration) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&@*0123456789';
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      const resolved = Math.floor(p * finalText.length);
      let out = '';
      for (let i = 0; i < finalText.length; i++) {
        if (i < resolved || finalText[i] === ' ') out += finalText[i];
        else out += chars[Math.floor(Math.random() * chars.length)];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    }
    requestAnimationFrame(frame);
  }
  const splashName = document.querySelector('.splash-name');
  if (splashName && !reduceMotion) scramble(splashName, splashName.textContent.trim(), 1300);

  // 7. scroll progress bar
  const prog = document.getElementById('progress');
  if (prog) {
    const upd = () => {
      const d = document.documentElement;
      const max = Math.max(1, d.scrollHeight - d.clientHeight);
      prog.style.transform = 'scaleX(' + Math.min(1, Math.max(0, d.scrollTop / max)) + ')';
    };
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }

  // 9. cursor glow (desktop, non-reduced-motion only)
  if (!reduceMotion && finePointer) {
    const cg = document.createElement('div');
    cg.className = 'cursor-glow';
    document.body.appendChild(cg);
    let gx = window.innerWidth / 2, gy = window.innerHeight / 2, tx = gx, ty = gy, on = false;
    document.addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!on) { on = true; cg.classList.add('on'); }
    }, { passive: true });
    (function follow() {
      gx += (tx - gx) * 0.13;
      gy += (ty - gy) * 0.13;
      cg.style.transform = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px)';
      requestAnimationFrame(follow);
    })();
  }

  // 6. magnetic primary buttons (desktop only)
  if (!reduceMotion && finePointer) {
    document.querySelectorAll('.btn-primary').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.16;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  // ---------- scroll reveal ----------
  const panels = document.querySelectorAll('.panel, .cards, .foot, .disclaimer');
  panels.forEach(p => p.classList.add('rv'));
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  panels.forEach(p => io.observe(p));

  // ---------- 3D tilt on quick cards + result ----------
  document.querySelectorAll('.qcard, .panel.result').forEach(card => {
    card.classList.add('tilt');
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-3px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });

  // ---------- splash entrance for hero content (after splash) ----------
  document.querySelectorAll('.hero > *').forEach((el, i) => {
    if (el.classList.contains('hidden')) return;   // paste-hint keeps its own animation, no stagger delay
    el.classList.add('anim');
    el.style.animationDelay = (i * 0.09) + 's';
  });

  // ---------- full-site 3D background ----------
  const canvas = document.getElementById('bg3d');
  if (!canvas || typeof THREE === 'undefined') return;

  const PURPLE = 0xa855f7, LIGHT = 0xc4b5fd, DEEP = 0x7c3aed;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06040b, 0.045);
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  cam.position.set(0, 0, 8);

  function size() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }

  // glowing wireframe shield (the "premium 3D image")
  const s = new THREE.Shape();
  s.moveTo(0, 1.55);
  s.lineTo(1.25, 1.0);
  s.lineTo(1.25, -0.25);
  s.quadraticCurveTo(1.15, -1.2, 0, -1.75);
  s.quadraticCurveTo(-1.15, -1.2, -1.25, -0.25);
  s.lineTo(-1.25, 1.0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 });
  geo.center();
  const solidMat = new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.08 });
  const wireMat = new THREE.LineBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.95 });
  const shield = new THREE.Group();
  shield.add(new THREE.Mesh(geo, solidMat));
  shield.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat));
  // checkmark inside
  const chk = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.44, -0.05, 0.26), new THREE.Vector3(-0.1, -0.4, 0.26), new THREE.Vector3(0.5, 0.34, 0.26)
    ]),
    new THREE.LineBasicMaterial({ color: LIGHT, transparent: true, opacity: 0.95 })
  );
  shield.add(chk);
  shield.position.set(0, 0.4, 0);
  shield.scale.setScalar(1.35);
  scene.add(shield);

  // orbit rings
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.014, 8, 120), new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.4 }));
  ringA.rotation.x = Math.PI / 2.1;
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.008, 8, 120), new THREE.MeshBasicMaterial({ color: DEEP, transparent: true, opacity: 0.3 }));
  ringB.rotation.x = Math.PI / 1.8;
  ringB.rotation.y = 0.4;
  scene.add(ringA, ringB);

  // cyber floor grid (flies under you as you scroll)
  const grid = new THREE.GridHelper(80, 80, PURPLE, DEEP);
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  grid.position.y = -3.4;
  scene.add(grid);

  // particle field
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
  }
  const pts = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ color: LIGHT, size: 0.05, transparent: true, opacity: 0.55 })
  );
  scene.add(pts);

  // cursor state (parallax)
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  if (!reduceMotion) {
    window.addEventListener('mousemove', e => {
      tmx = (e.clientX / window.innerWidth - 0.5);
      tmy = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (!e.touches[0]) return;
      tmx = (e.touches[0].clientX / window.innerWidth - 0.5);
      tmy = (e.touches[0].clientY / window.innerHeight - 0.5);
    }, { passive: true });
  }

  const splash = document.getElementById('splash');
  let t = 0, raf = null, pulseT = 0;
  // 8b. HIGH verdict → red pulse of the 3D shield (called from app.js render)
  window.ssShieldPulse = () => { pulseT = 1; };
  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (!reduceMotion) t += 0.01;   // autonomous motion stops for reduced-motion users; scroll/cursor stay user-driven

    const vh = window.innerHeight || 800;
    const sp = Math.min(2.5, window.scrollY / vh);          // 0 on splash → grows as you scroll
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    // splash fades + drifts as the user scrolls down
    if (splash) {
      const f = Math.max(0, 1 - window.scrollY / (vh * 0.75));
      splash.style.opacity = f;
      splash.style.filter = f < 0.999 ? `blur(${(1 - f) * 6}px)` : '';
    }

    // shield: spins faster + recedes with scroll, tilts with cursor
    shield.rotation.y = t * 0.35 + sp * 1.8 + mx * 0.9;
    shield.rotation.x = Math.sin(t * 0.6) * 0.1 - my * 0.5;
    shield.position.y = 0.4 + Math.sin(t) * 0.16 - sp * 1.1;
    shield.position.z = -sp * 5;
    const sc = 1.35 * (1 / (1 + sp * 0.55));
    shield.scale.setScalar(sc);
    chk.material.opacity = Math.max(0, 0.95 - sp * 0.6);
    // HIGH-verdict red flash, eases back to violet
    if (pulseT > 0) {
      pulseT = Math.max(0, pulseT - 0.018);
      wireMat.color.setHex(0xef4444);
      solidMat.color.setHex(0xef4444);
      solidMat.opacity = 0.08 + pulseT * 0.3;
      wireMat.opacity = 0.95 + pulseT * 0.05;
    } else if (wireMat.color.getHex() !== PURPLE) {
      wireMat.color.setHex(PURPLE);
      solidMat.color.setHex(PURPLE);
      solidMat.opacity = 0.08;
      wireMat.opacity = 0.95;
    }

    // rings
    ringA.rotation.z = t * 0.4;
    ringB.rotation.z = -t * 0.25;
    ringA.position.z = -sp * 4;
    ringB.position.z = -sp * 4;
    ringA.material.opacity = Math.max(0, 0.4 - sp * 0.22);
    ringB.material.opacity = Math.max(0, 0.3 - sp * 0.18);

    // floor flows toward you (speeds up with scroll)
    grid.position.z = (t * 1.6 + sp * 8) % 2;
    grid.position.y = -3.4 - Math.min(1.2, sp * 0.6);

    // particles drift + parallax with cursor
    pts.rotation.y = t * 0.02 + mx * 0.15;
    pts.rotation.x = my * 0.08;

    // camera: cursor parallax + gentle descent through the scene on scroll
    cam.position.x += (mx * 2.0 - cam.position.x) * 0.05;
    cam.position.y += (-my * 1.2 - sp * 1.4 - cam.position.y) * 0.05;
    cam.position.z = 8 + sp * 0.8;
    cam.lookAt(0, -sp * 0.8, -sp * 3);

    renderer.render(scene, cam);
  }
  size();
  window.addEventListener('resize', size);
  loop();
})();
