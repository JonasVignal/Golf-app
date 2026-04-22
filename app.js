// ═══════════════════════════════════════════════════════
//  GolfMate — 2-7 Player Multiplayer Scorecard
//  Firebase Realtime Database · WHS Playing Handicap
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, off, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── Firebase ────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDtMT8li6uMOujOQ1xb4Ill5BTInXT2-jM",
  authDomain: "golfdanmark.firebaseapp.com",
  databaseURL: "https://golfdanmark-default-rtdb.firebaseio.com",
  projectId: "golfdanmark",
  storageBucket: "golfdanmark.firebasestorage.app",
  messagingSenderId: "403752379611",
  appId: "1:403752379611:web:b7eb566ebab9abe398d8fe"
};
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getDatabase(fbApp);

// ─── Course Database ─────────────────────────────────
const COURSES = {
  skyrup: {
    name: "Skyrup GK", location: "Sweden", par: 71,
    pars: [4,4,3,4,4,5,3,4,4, 4,3,5,4,4,3,4,5,4],
    si:   [7,11,15,3,9,17,5,1,13, 8,16,6,2,10,18,4,12,14],
    tees: {
      yellow: { label:"🟡 Yellow", length:5860, rating:70.9, slope:129 },
      white:  { label:"⚪ White",  length:6085, rating:71.6, slope:129 },
      blue:   { label:"🔵 Blue",   length:5433, rating:67.9, slope:123 },
      red:    { label:"🔴 Red",    length:5145, rating:65.2, slope:117 },
    }
  }
};
const DEF_PARS = [4,4,3,5,4,3,4,4,5, 4,3,4,5,4,3,4,4,5];
const DEF_SI   = [7,11,15,3,9,17,5,1,13, 8,16,6,2,10,18,4,12,14];
const PLAYER_COLORS = ["#3dca7a","#5ba8ff","#e879f9","#fb923c","#f87171","#a78bfa","#34d399"];
const MAX_PLAYERS = 7;

function calcPH(hcpIdx, slope, rating, par) {
  return Math.round(hcpIdx * (slope / 113) + (rating - par));
}

// ─── State ───────────────────────────────────────────
let currentUser = null;
let myUid       = null;
let gameId      = null;
let gameRef     = null;
let gameData    = null;
let currentHole = 1;
let selectedTee = "yellow";

const $ = id => document.getElementById(id);
const screens = { login: $("loginScreen"), lobby: $("lobbyScreen"), waiting: $("waitingScreen"), scorecard: $("scorecardScreen"), results: $("resultsScreen") };
function show(name) { Object.values(screens).forEach(s => s.classList.remove("active")); screens[name].classList.add("active"); }

// Global error handlers for mobile debugging
window.addEventListener('error', (e) => {
  const errEl = $("loginError");
  if (errEl) errEl.textContent = `JS Error: ${e.message} at ${e.filename}:${e.lineno}`;
});
window.addEventListener('unhandledrejection', (e) => {
  const errEl = $("loginError");
  if (errEl) errEl.textContent = `Promise Error: ${e.reason}`;
});

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Explicitly handle redirect results so Firebase parses the login attempt correctly
getRedirectResult(auth).then((result) => {
  if (result) $("loginError").textContent = "Login completed!";
}).catch((e) => {
  $("loginError").textContent = `Login Error: ${e.message || e.code}`;
});

$("signInBtn").addEventListener("click", async () => {
  $("loginError").textContent = "Opening Google...";
  const provider = new GoogleAuthProvider();
  try {
    if (isMobile) {
      // Mobile Safari/Chrome blocks popups heavily; redirect is much more reliable
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
      $("loginError").textContent = "";
      return;
    }
    // Fallback if popup is blocked on desktop
    if (e.code === "auth/popup-blocked") {
      $("loginError").textContent = "Popup blocked. Try disabling popup blockers.";
      await signInWithRedirect(auth, provider).catch(err => {
        $("loginError").textContent = err.code;
      });
      return;
    }
    const msg = {
      "auth/unauthorized-domain": "Add this domain in Firebase → Auth → Settings → Authorized domains.",
      "auth/operation-not-allowed": "Enable Google sign-in in Firebase.",
      "auth/network-request-failed": "Network error — check your connection.",
    };
    $("loginError").textContent = msg[e.code] || `Error: ${e.code}`;
  }
});

$("lobbySignOut").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  currentUser = user;
  myUid = user?.uid || null;
  if (user) {
    const sid = localStorage.getItem("gm_gid");
    if (sid) { gameId = sid; gameRef = ref(db, `games/${gameId}`); attachListener(); return; }
    showLobby(user);
  } else { cleanup(); show("login"); }
});

function cleanup() {
  if (gameRef) off(gameRef);
  gameId = null; gameData = null;
  localStorage.removeItem("gm_gid");
}

// ═══════════════════════════════════════════════════════
//  LOBBY
// ═══════════════════════════════════════════════════════
function showLobby(user) {
  $("lobbyPhoto").src = user.photoURL || "";
  $("lobbyName").textContent = user.displayName || user.email;
  updateCourseUI();
  show("lobby");
}

["tabCreate","tabJoin"].forEach(id => {
  $(id).addEventListener("click", () => {
    $("tabCreate").classList.toggle("active", id === "tabCreate");
    $("tabJoin").classList.toggle("active", id === "tabJoin");
    $("createTab").classList.toggle("active", id === "tabCreate");
    $("joinTab").classList.toggle("active", id === "tabJoin");
  });
});

// Course / Tee UI
$("courseSelect").addEventListener("change", updateCourseUI);
function updateCourseUI() {
  const k = $("courseSelect").value, known = k !== "custom";
  $("customCourseGroup").classList.toggle("hidden", known);
  $("teeGroup").classList.toggle("hidden", !known);
  $("courseInfoCard").style.display = known ? "grid" : "none";
  if (known) refreshCI(k, selectedTee);
}
function refreshCI(ck, tee) {
  const c = COURSES[ck]; if (!c) return;
  const t = c.tees[tee];
  $("ciLength").textContent = t.length + " m";
  $("ciPar").textContent = c.par;
  $("ciRating").textContent = t.rating;
  $("ciSlope").textContent = t.slope;
}
document.querySelectorAll(".tee-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedTee = btn.dataset.tee;
    document.querySelectorAll(".tee-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    refreshCI($("courseSelect").value, selectedTee);
  });
});

// ═══════════════════════════════════════════════════════
//  CREATE GAME
// ═══════════════════════════════════════════════════════
$("createGameBtn").addEventListener("click", async () => {
  const hcpIdx = parseFloat($("myHCP").value) || 0;
  const scoring = $("scoringSystem").value;
  const ck = $("courseSelect").value;

  let courseName, pars, si, teeInfo = null;
  if (ck !== "custom" && COURSES[ck]) {
    const c = COURSES[ck], t = c.tees[selectedTee];
    courseName = `${c.name} (${selectedTee})`;
    pars = c.pars; si = c.si;
    teeInfo = { key: selectedTee, label: t.label, length: t.length, rating: t.rating, slope: t.slope, par: c.par };
  } else {
    courseName = $("customCourseName").value.trim() || "Golf Course";
    pars = DEF_PARS; si = DEF_SI;
  }
  const ph = teeInfo ? calcPH(hcpIdx, teeInfo.slope, teeInfo.rating, teeInfo.par) : Math.round(hcpIdx);

  gameId = genCode();
  gameRef = ref(db, `games/${gameId}`);

  const holes = {};
  for (let i = 0; i < 18; i++) holes[i] = { par: pars[i], strokeIndex: si[i], meters: null, strokes: {}, saved: false };

  const players = {};
  players[myUid] = {
    name: currentUser.displayName || "Player 1", photo: currentUser.photoURL || "",
    hcp: hcpIdx, playingHCP: ph, joinOrder: 1
  };

  await set(gameRef, {
    status: "waiting", courseName, scoringSystem: scoring, teeInfo,
    hostUid: myUid, createdAt: serverTimestamp(), players, holes
  });

  localStorage.setItem("gm_gid", gameId);
  showWaiting();
  attachListener();
});

// ═══════════════════════════════════════════════════════
//  JOIN GAME
// ═══════════════════════════════════════════════════════
$("joinGameBtn").addEventListener("click", async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  $("joinError").textContent = "";
  if (code.length !== 6) { $("joinError").textContent = "Enter a 6-character code."; return; }

  const snap = await get(ref(db, `games/${code}`));
  if (!snap.exists()) { $("joinError").textContent = "Game not found."; return; }
  const d = snap.val();
  if (d.status !== "waiting") { $("joinError").textContent = "Game already started."; return; }
  const pCount = d.players ? Object.keys(d.players).length : 0;
  if (pCount >= MAX_PLAYERS) { $("joinError").textContent = "Game is full (7 players max)."; return; }
  if (d.players && d.players[myUid]) { $("joinError").textContent = "You're already in this game."; return; }

  const hcpIdx = parseFloat($("myHCP").value) || 0;
  const ti = d.teeInfo;
  const ph = ti ? calcPH(hcpIdx, ti.slope, ti.rating, ti.par) : Math.round(hcpIdx);

  gameId = code;
  gameRef = ref(db, `games/${gameId}`);

  await update(ref(db, `games/${gameId}/players/${myUid}`), {
    name: currentUser.displayName || "Player", photo: currentUser.photoURL || "",
    hcp: hcpIdx, playingHCP: ph, joinOrder: pCount + 1
  });

  localStorage.setItem("gm_gid", gameId);
  attachListener();
});

// ═══════════════════════════════════════════════════════
//  WAITING ROOM
// ═══════════════════════════════════════════════════════
function showWaiting() {
  $("displayGameCode").textContent = gameId;
  show("waiting");
}

$("copyCodeBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(gameId).then(() => {
    $("copyCodeBtn").textContent = "✓ Copied!";
    setTimeout(() => $("copyCodeBtn").textContent = "📋 Copy Code", 2000);
  });
});

$("cancelGameBtn").addEventListener("click", async () => {
  if (gameRef) await update(gameRef, { status: "cancelled" });
  cleanup(); showLobby(currentUser);
});

$("startRoundBtn").addEventListener("click", async () => {
  if (gameRef) await update(gameRef, { status: "active" });
});

function renderWaiting(d) {
  const players = d.players ? Object.entries(d.players) : [];
  const sorted = players.sort((a,b) => a[1].joinOrder - b[1].joinOrder);
  $("playerCount").textContent = `${sorted.length} / ${MAX_PLAYERS} players`;

  const slots = $("playerSlots"); slots.innerHTML = "";
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const div = document.createElement("div");
    div.className = "player-slot";
    if (i < sorted.length) {
      const [uid, p] = sorted[i];
      div.classList.add("filled");
      if (uid === d.hostUid) div.classList.add("host-slot");
      div.innerHTML = `
        <img src="${p.photo||""}" alt="" class="slot-photo" style="border-color:${PLAYER_COLORS[i]}"/>
        <div class="slot-info">
          <div class="slot-name">${p.name}${uid === d.hostUid ? " 👑" : ""}</div>
          <div class="slot-detail">HCP ${p.hcp} → PH ${p.playingHCP}</div>
        </div>`;
    } else {
      div.innerHTML = `<div class="slot-placeholder">${i+1}</div><div class="slot-info"><div class="slot-name" style="color:var(--tx-d)">Open slot</div></div>`;
    }
    slots.appendChild(div);
  }

  // Start button: only host sees it, and only when 2+ players
  const isHost = myUid === d.hostUid;
  const canStart = sorted.length >= 2;
  $("startRoundBtn").classList.toggle("hidden", !isHost || !canStart);
  $("startHint").textContent = isHost
    ? (canStart ? "" : "Need at least 2 players to start")
    : "Waiting for host to start the round…";
}

// ═══════════════════════════════════════════════════════
//  REALTIME LISTENER
// ═══════════════════════════════════════════════════════
function attachListener() {
  if (gameRef) off(gameRef);
  onValue(gameRef, snap => { if (!snap.exists()) return; gameData = snap.val(); handleUpdate(gameData); });
}

function handleUpdate(d) {
  if (d.status === "cancelled") { alert("Game cancelled."); cleanup(); showLobby(currentUser); return; }
  if (d.status === "waiting") {
    if (!screens.waiting.classList.contains("active")) showWaiting();
    renderWaiting(d);
    return;
  }
  if (d.status === "active") {
    if (!screens.scorecard.classList.contains("active") && !screens.results.classList.contains("active")) initScorecard(d);
    else refreshScorecard(d);
    return;
  }
  if (d.status === "complete") showResults(d);
}

// ═══════════════════════════════════════════════════════
//  SCORING HELPERS
// ═══════════════════════════════════════════════════════
function getPlayers(d) {
  return Object.entries(d.players || {}).sort((a,b) => a[1].joinOrder - b[1].joinOrder);
}
function ph(d, uid) { return d.players?.[uid]?.playingHCP ?? d.players?.[uid]?.hcp ?? 0; }
function xtra(phcp, si) { const b = Math.floor(phcp/18), r = Math.round(phcp%18); return b + (si<=r?1:0); }
function net(gross, phcp, si) { return gross - xtra(phcp, si); }
function stab(gross, par, phcp, si) { return gross ? Math.max(0, par+2 - net(gross,phcp,si)) : 0; }

function totals(d, uid) {
  const h = ph(d, uid); let s=0, n=0, p=0;
  Object.values(d.holes).forEach(hole => {
    if (!hole.saved) return;
    const g = hole.strokes?.[uid] || 0;
    s += g; n += net(g, h, hole.strokeIndex); p += stab(g, hole.par, h, hole.strokeIndex);
  });
  return { strokes: s, net: n, pts: p };
}

// ═══════════════════════════════════════════════════════
//  SCORECARD INIT
// ═══════════════════════════════════════════════════════
function initScorecard(d) {
  $("headerCourseName").textContent = d.courseName;
  $("roundDate").textContent = new Date().toLocaleDateString("en-GB", { weekday:"short", year:"numeric", month:"short", day:"numeric" });

  // Header chips
  const chips = $("headerChips"); chips.innerHTML = "";
  getPlayers(d).forEach(([uid, p], i) => {
    chips.innerHTML += `<div class="chip" style="border-color:${PLAYER_COLORS[i]}"><img src="${p.photo||""}" class="chip-photo"/><span>${short(p.name)}</span><span class="chip-hcp">PH ${ph(d,uid)}</span></div>`;
  });

  // My card
  const me = d.players[myUid];
  $("myCardPhoto").src = me?.photo || ""; $("myCardName").textContent = short(me?.name || "You");

  // Hole nav
  const nav = $("holeNav"); nav.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const btn = document.createElement("button");
    btn.className = "hole-nav-btn"; btn.id = `hn${i}`; btn.textContent = i;
    btn.addEventListener("click", () => loadHole(i));
    nav.appendChild(btn);
  }
  // SI dropdown
  const sel = $("holeSI"); sel.innerHTML = "";
  for (let i = 1; i <= 18; i++) { const o = document.createElement("option"); o.value=i; o.textContent=i; sel.appendChild(o); }

  show("scorecard");
  currentHole = 1;
  loadHole(1, d);
}

// ═══════════════════════════════════════════════════════
//  LOAD HOLE
// ═══════════════════════════════════════════════════════
function loadHole(n, d) {
  d = d || gameData; if (!d) return;
  currentHole = n;
  const h = d.holes[n-1];

  $("currentHoleTitle").textContent = `Hole ${n}`;
  $("holePar").value = h.par;
  $("holeSI").value = h.strokeIndex;
  $("holeMeters").value = h.meters || "";

  // My strokes
  $("myStrokesVal").textContent = h.strokes?.[myUid] || 0;
  updateMyBreakdown(d, n);

  // Others grid
  const grid = $("othersGrid"); grid.innerHTML = "";
  const players = getPlayers(d);
  players.forEach(([uid, p], i) => {
    if (uid === myUid) return;
    const g = h.strokes?.[uid] || 0;
    const hcp = ph(d, uid);
    const si = h.strokeIndex, par = h.par;
    const nv = g ? net(g, hcp, si) : "—";
    const pv = g ? stab(g, par, hcp, si) : "—";
    const div = document.createElement("div");
    div.className = "other-card";
    div.style.borderTop = `3px solid ${PLAYER_COLORS[i]}`;
    div.innerHTML = `<img src="${p.photo||""}" class="other-photo" style="border-color:${PLAYER_COLORS[i]}"/>
      <div class="other-name">${short(p.name)}</div>
      <div class="other-strokes">${g || "—"}</div>
      <div class="other-detail">Net ${nv} · Pts ${pv}</div>`;
    grid.appendChild(div);
  });

  updateNav(d);
  updateLeaderboard(d);
  renderTable(d);
}

function refreshScorecard(d) {
  if (!screens.scorecard.classList.contains("active")) return;
  loadHole(currentHole, d);
}

function updateMyBreakdown(d, n) {
  const h = d.holes[n-1];
  const g = h.strokes?.[myUid] || 0;
  const hcp = ph(d, myUid), si = h.strokeIndex, par = h.par;
  $("myNetScore").textContent = g ? net(g, hcp, si) : "—";
  $("myPtsScore").textContent = g ? stab(g, par, hcp, si) + " pts" : "—";
}

// ═══════════════════════════════════════════════════════
//  LEADERBOARD BAR
// ═══════════════════════════════════════════════════════
function updateLeaderboard(d) {
  const bar = $("leaderboardBar"); bar.innerHTML = "";
  const players = getPlayers(d);
  const ranked = players.map(([uid, p], i) => ({ uid, ...p, idx: i, ...totals(d, uid) }))
    .sort((a, b) => b.pts - a.pts || a.net - b.net);

  ranked.forEach((p, rank) => {
    const div = document.createElement("div");
    div.className = "lb-card" + (p.uid === myUid ? " is-me" : "");
    div.style.borderTop = `3px solid ${PLAYER_COLORS[p.idx]}`;
    const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank+1}`;
    div.innerHTML = `<div class="lb-rank">${medal}</div>
      <div class="lb-name">${short(p.name)}</div>
      <div class="lb-pts">${p.pts}</div>
      <div class="lb-lbl">pts · ${p.strokes} strokes</div>`;
    bar.appendChild(div);
  });
}

// ═══════════════════════════════════════════════════════
//  STROKE COUNTER & HOLE META
// ═══════════════════════════════════════════════════════
$("myPlus").addEventListener("click", () => adj(1));
$("myMinus").addEventListener("click", () => adj(-1));

async function adj(delta) {
  if (!gameData) return;
  const h = gameData.holes[currentHole-1];
  const cur = h.strokes?.[myUid] || 0;
  await update(ref(db, `games/${gameId}/holes/${currentHole-1}/strokes`), { [myUid]: Math.max(0, cur+delta) });
}

$("holePar").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole-1}`), { par: parseInt($("holePar").value) });
});
$("holeSI").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole-1}`), { strokeIndex: parseInt($("holeSI").value) });
});
$("holeMeters").addEventListener("change", async () => {
  const m = $("holeMeters").value;
  await update(ref(db, `games/${gameId}/holes/${currentHole-1}`), { meters: m ? parseInt(m) : null });
});

// ═══════════════════════════════════════════════════════
//  SAVE HOLE / NAV
// ═══════════════════════════════════════════════════════
$('saveHoleBtn').addEventListener('click', async () => {
  const d = gameData;
  const h = d.holes[currentHole - 1];

  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { saved: true });

  // Golfkongerne: check for special rules
  if (d.scoringSystem === 'golfkongerne') {
    const players = getPlayers(d);

    // Rule 1: Hole-in-one (1 stroke) → "Giv en runde i klubhuset"
    const acePlayers = [];
    players.forEach(([uid, p]) => {
      const g = h.strokes?.[uid] || 0;
      if (g === 1) acePlayers.push(p.name);
    });
    if (acePlayers.length > 0) {
      showShotPopup(acePlayers, currentHole, 'ace');
    } else {
      // Rule 2: 4 pts → "Giv en makker et om slag"
      const birdiePlayers = [];
      // Rule 3: 3 pts → "Giv et shot til en makker"
      const shotPlayers = [];
      // Rule 4: 1 pt → "Drik en tår"
      const sipPlayers = [];
      // Rule 5: 0 pts (triple bogey net, +3) → "Dame Tee"
      const zeroPlayers = [];
      // Rule 6: 0 pts (+4, quad bogey net) → "Bund din øl"
      const chugPlayers = [];
      // Rule 7: 0 pts (+5 or worse) → "Bukserne nede"
      const pantsPlayers = [];
      players.forEach(([uid, p]) => {
        const g = h.strokes?.[uid] || 0;
        if (g > 0) {
          const pts = stab(g, h.par, ph(d, uid), h.strokeIndex);
          const nDiff = net(g, ph(d, uid), h.strokeIndex) - h.par;
          if (pts === 4) birdiePlayers.push(p.name);
          if (pts === 3) shotPlayers.push(p.name);
          if (pts === 1) sipPlayers.push(p.name);
          if (pts === 0 && nDiff >= 5) pantsPlayers.push(p.name);
          else if (pts === 0 && nDiff === 4) chugPlayers.push(p.name);
          else if (pts === 0 && nDiff === 3) zeroPlayers.push(p.name);
        }
      });
      if (birdiePlayers.length > 0) {
        showShotPopup(birdiePlayers, currentHole, 'birdie');
      } else if (shotPlayers.length > 0) {
        showShotPopup(shotPlayers, currentHole, 'shot');
      } else if (sipPlayers.length > 0) {
        showShotPopup(sipPlayers, currentHole, 'sip');
      } else if (pantsPlayers.length > 0) {
        showShotPopup(pantsPlayers, currentHole, 'pants');
      } else if (chugPlayers.length > 0) {
        showShotPopup(chugPlayers, currentHole, 'chug');
      } else if (zeroPlayers.length > 0) {
        showShotPopup(zeroPlayers, currentHole, 'zero');
      }
    }
  }

  if (currentHole < 18) { currentHole++; loadHole(currentHole); }
  else await update(gameRef, { status: 'complete' });
});

$("prevHole").addEventListener("click", () => { if (currentHole > 1) loadHole(currentHole-1); });
$("nextHole").addEventListener("click", () => { if (currentHole < 18) loadHole(currentHole+1); });
$("endRoundBtn").addEventListener("click", async () => { if (confirm("End round now?")) await update(gameRef, { status: "complete" }); });

function updateNav(d) {
  for (let i = 1; i <= 18; i++) {
    const btn = $(`hn${i}`); if (!btn) continue;
    btn.className = "hole-nav-btn" + (d.holes?.[i-1]?.saved ? " saved" : "") + (i === currentHole ? " active" : "");
  }
  $("prevHole").disabled = currentHole === 1;
  $("nextHole").disabled = currentHole === 18;
}

// ═══════════════════════════════════════════════════════
//  SCORECARD TABLE
// ═══════════════════════════════════════════════════════
function badge(g, par, hcp, si) {
  if (!g) return `<span class="no-score">—</span>`;
  const d = net(g, hcp, si) - par;
  let c = "par-score";
  if (d <= -2) c += " eagle"; else if (d === -1) c += " birdie";
  else if (d === 1) c += " bogey"; else if (d === 2) c += " double-bogey"; else if (d > 2) c += " triple-plus";
  return `<span class="${c}">${g}</span>`;
}

function renderTable(d) {
  if (!d) return;
  const players = getPlayers(d);

  // thead
  const thead = $("scorecardHead");
  thead.innerHTML = `<tr><th>Hole</th><th>Par</th><th>SI</th>${players.map(([,p]) => `<th>${short(p.name)}</th><th>Pts</th>`).join("")}</tr>`;

  // tbody
  const tbody = $("scorecardBody"); tbody.innerHTML = "";
  const totP = new Array(players.length).fill(0);
  const totS = new Array(players.length).fill(0);
  const totPts = new Array(players.length).fill(0);
  let parSum = 0;

  Object.values(d.holes).forEach((h, idx) => {
    let cells = `<td><strong>${idx+1}</strong></td><td>${h.par}</td><td>${h.strokeIndex}</td>`;
    players.forEach(([uid], pi) => {
      const g = h.strokes?.[uid] || 0;
      const hcp = ph(d, uid);
      const pts = g ? stab(g, h.par, hcp, h.strokeIndex) : 0;
      cells += `<td>${badge(g, h.par, hcp, h.strokeIndex)}</td><td>${g ? pts : "—"}</td>`;
      if (h.saved) { totS[pi] += g; totPts[pi] += pts; }
    });
    if (h.saved) parSum += h.par;
    const tr = document.createElement("tr"); tr.innerHTML = cells; tbody.appendChild(tr);
  });

  // tfoot
  const saved = Object.values(d.holes).filter(h => h.saved).length;
  $("scorecardFoot").innerHTML = saved ? `<tr><td>Total</td><td>${parSum}</td><td>—</td>${
    players.map((_, i) => `<td>${totS[i]}</td><td><strong style="color:var(--gold)">${totPts[i]}</strong></td>`).join("")
  }</tr>` : "";
}

// ═══════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════
function showResults(d) {
  if (!d) return;
  $("resultsCourse").textContent = d.courseName;
  $("resultsDate").textContent = new Date().toLocaleDateString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  const players = getPlayers(d);
  const ranked = players.map(([uid, p], i) => ({ uid, ...p, idx: i, ...totals(d, uid) }))
    .sort((a,b) => b.pts - a.pts || a.net - b.net);

  const winner = ranked[0];
  $("winnerBanner").textContent = ranked.length > 1 && ranked[0].pts > ranked[1].pts
    ? `🏆 ${winner.name} wins with ${winner.pts} points!`
    : ranked.length > 1 && ranked[0].pts === ranked[1].pts
      ? `⚖️ It's a tie at ${ranked[0].pts} points!`
      : `🏆 ${winner.name} — ${winner.pts} points`;

  const grid = $("resultsGrid"); grid.innerHTML = "";
  ranked.forEach((p, rank) => {
    const medal = rank === 0 ? "🥇 1st" : rank === 1 ? "🥈 2nd" : rank === 2 ? "🥉 3rd" : `${rank+1}th`;
    const div = document.createElement("div");
    div.className = "result-card" + (rank === 0 ? " winner" : "");
    div.style.borderTop = `3px solid ${PLAYER_COLORS[p.idx]}`;
    div.innerHTML = `
      <div class="result-rank">${medal}</div>
      <img src="${p.photo||""}" class="result-photo" style="border-color:${PLAYER_COLORS[p.idx]}"/>
      <h3>${p.name}</h3>
      <div class="result-stats">
        <div class="stat-row"><span>HCP Index</span><strong>${p.hcp}</strong></div>
        <div class="stat-row"><span>Playing HCP</span><strong>${p.playingHCP}</strong></div>
        <div class="stat-row"><span>Strokes</span><strong>${p.strokes}</strong></div>
        <div class="stat-row"><span>Net</span><strong>${p.net}</strong></div>
        <div class="stat-row highlight"><span>Stableford</span><strong>${p.pts} pts</strong></div>
      </div>`;
    grid.appendChild(div);
  });

  show("results");
}

$("playAgainBtn").addEventListener("click", () => { cleanup(); currentHole = 1; showLobby(currentUser); });

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function genCode() { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join(""); }
function short(n) { if (!n) return "Player"; const p=n.trim().split(" "); return p.length>=2 ? p[0]+" "+p[1][0]+"." : p[0]; }

// ═══════════════════════════════════════════════════════
//  GOLFKONGERNE — SHOT POPUP
// ═══════════════════════════════════════════════════════
function showShotPopup(playerNames, holeNum, type) {
  const names = playerNames.length === 1
    ? playerNames[0]
    : playerNames.slice(0, -1).join(", ") + " og " + playerNames[playerNames.length - 1];

  if (type === "ace") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "🏌️‍♂️🕳️";
    $("shotPopup").querySelector(".shot-title").textContent = "Giv en runde i klubhuset!";
    $("shotPlayerName").textContent = `🎯 ${names}`;
    $("shotDetail").textContent = `Hole-in-one på hul ${holeNum}! Det koster en runde!`;
    $("shotDismiss").textContent = "Skål! 🍺";
  } else if (type === "birdie") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "🦅";
    $("shotPopup").querySelector(".shot-title").textContent = "Giv en makker et omslag efter eget ønske!";
    $("shotPlayerName").textContent = `🔥 ${names}`;
    $("shotDetail").textContent = `4 point på hul ${holeNum} — birdie netto!`;
    $("shotDismiss").textContent = "Fedt! 🍻";
  } else if (type === "sip") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "😬";
    $("shotPopup").querySelector(".shot-title").textContent = "Uhh, 1 Point. Drik en tår!";
    $("shotPlayerName").textContent = `😅 ${names}`;
    $("shotDetail").textContent = `Kun 1 point på hul ${holeNum} — det koster en tår!`;
    $("shotDismiss").textContent = "Bund! 🍺";
  } else {
    $("shotPopup").querySelector(".shot-emoji").textContent = "🍻";
    $("shotPopup").querySelector(".shot-title").textContent = "Giv et shot til en makker!";
    $("shotPlayerName").textContent = `👑 ${names}`;
    $("shotDetail").textContent = `Scorede 3 point på hul ${holeNum} — par netto!`;
    $("shotDismiss").textContent = "Skål! 🥃";
  } else if (type === "zero") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "💩";
    $("shotPopup").querySelector(".shot-title").textContent = "Måske Dame Tee næste gang!";
    $("shotPlayerName").textContent = `🙈 ${names}`;
    $("shotDetail").textContent = `0 point på hul ${holeNum} — tag et shot!`;
    $("shotDismiss").textContent = "Skål! 🥃";
  } else if (type === "chug") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "💠";
    $("shotPopup").querySelector(".shot-title").textContent = "Bund din øl!";
    $("shotPlayerName").textContent = `😵 ${names}`;
    $("shotDetail").textContent = `0 point på hul ${holeNum} og en ekstra slag over — BUND!`;
    $("shotDismiss").textContent = "BUND! 🍺";
  } else if (type === "pants") {
    $("shotPopup").querySelector(".shot-emoji").textContent = "🧑‍🦲";
    $("shotPopup").querySelector(".shot-title").textContent = "Drive på næste hul med bukserne nede!";
    $("shotPlayerName").textContent = `👖 ${names}`;
    $("shotDetail").textContent = `0 point på hul ${holeNum} og helt ude — drop bukserne!`;
    $("shotDismiss").textContent = "Oh no! 😱";
  }

  $("shotPopup").classList.add("active");
}

$("shotDismiss").addEventListener("click", () => {
  $("shotPopup").classList.remove("active");
});

// Close popup on overlay click too
$("shotPopup").addEventListener("click", (e) => {
  if (e.target === $("shotPopup")) $("shotPopup").classList.remove("active");
});

// Init
updateCourseUI();
