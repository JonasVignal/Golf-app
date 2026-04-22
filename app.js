// ═══════════════════════════════════════════════════
//  GolfMate — Multi-device Firebase Realtime Scorecard
//  Each player uses their own phone.
//  Scores sync live via Firebase Realtime Database.
// ═══════════════════════════════════════════════════

import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, off, serverTimestamp }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── Firebase Config ────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDtMT8li6uMOujOQ1xb4Ill5BTInXT2-jM",
  authDomain:        "golfdanmark.firebaseapp.com",
  databaseURL:       "https://golfdanmark-default-rtdb.firebaseio.com",
  projectId:         "golfdanmark",
  storageBucket:     "golfdanmark.firebasestorage.app",
  messagingSenderId: "403752379611",
  appId:             "1:403752379611:web:b7eb566ebab9abe398d8fe"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getDatabase(firebaseApp);

// ─── Default course data ─────────────────────────────
const DEFAULT_PARS = [4,4,3,5,4,3,4,4,5,  4,3,4,5,4,3,4,4,5];
const DEFAULT_SI   = [7,11,15,3,9,17,5,1,13, 8,16,6,2,10,18,4,12,14];

// ─── App state ───────────────────────────────────────
let currentUser  = null;    // Firebase Auth user on this device
let myRole       = null;    // 'p1' or 'p2'
let gameId       = null;    // 6-char game code
let gameRef      = null;    // DB ref to /games/{gameId}
let gameListener = null;    // onValue unsubscribe fn
let gameData     = null;    // latest snapshot of game from DB
let currentHole  = 1;       // locally tracked current hole (1-indexed)

// ─── DOM ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = {
  login:    $("loginScreen"),
  lobby:    $("lobbyScreen"),
  waiting:  $("waitingScreen"),
  scorecard:$("scorecardScreen"),
  results:  $("resultsScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════
$("signInBtn").addEventListener("click", async () => {
  try {
    $("loginError").textContent = "";
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") {
      $("loginError").textContent = "Sign-in failed. Please try again.";
    }
  }
});

$("lobbySignOut").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    // Restore in-progress game from localStorage
    const saved = localStorage.getItem("golfmate_gameId");
    const savedRole = localStorage.getItem("golfmate_role");
    if (saved && savedRole) {
      gameId  = saved;
      myRole  = savedRole;
      gameRef = ref(db, `games/${gameId}`);
      attachGameListener();
      return;
    }
    showLobby(user);
  } else {
    gameId = null; myRole = null;
    if (gameListener) { off(gameRef); gameListener = null; }
    localStorage.removeItem("golfmate_gameId");
    localStorage.removeItem("golfmate_role");
    showScreen("login");
  }
});

// ════════════════════════════════════════════════════
//  LOBBY
// ════════════════════════════════════════════════════
function showLobby(user) {
  $("lobbyPhoto").src  = user.photoURL || "";
  $("lobbyName").textContent = user.displayName || user.email;
  showScreen("lobby");
}

// Tabs
["tabCreate","tabJoin"].forEach(id => {
  $(id).addEventListener("click", () => {
    $("tabCreate").classList.toggle("active", id === "tabCreate");
    $("tabJoin").classList.toggle("active",   id === "tabJoin");
    $("createTab").classList.toggle("active", id === "tabCreate");
    $("joinTab").classList.toggle("active",   id === "tabJoin");
  });
});

// ── Create Game ──────────────────────────────────────
$("createGameBtn").addEventListener("click", async () => {
  const hcp = parseFloat($("myHCP").value) || 0;
  const course = $("courseName").value.trim() || "Golf Course";
  const scoring = $("scoringSystem").value;

  gameId  = generateGameId();
  myRole  = "p1";
  gameRef = ref(db, `games/${gameId}`);

  // Build initial 18-hole data
  const holesInit = {};
  for (let i = 0; i < 18; i++) {
    holesInit[i] = {
      par: DEFAULT_PARS[i], strokeIndex: DEFAULT_SI[i],
      meters: null, p1Strokes: 0, p2Strokes: 0, saved: false
    };
  }

  await set(gameRef, {
    status: "waiting",
    courseName: course,
    scoringSystem: scoring,
    createdAt: serverTimestamp(),
    p1: {
      uid: currentUser.uid,
      name: currentUser.displayName || "Player 1",
      photo: currentUser.photoURL || "",
      hcp: hcp
    },
    p2: null,
    holes: holesInit
  });

  localStorage.setItem("golfmate_gameId",  gameId);
  localStorage.setItem("golfmate_role",    "p1");

  showWaiting();
  attachGameListener();
});

// ── Join Game ────────────────────────────────────────
$("joinGameBtn").addEventListener("click", async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  $("joinError").textContent = "";

  if (code.length !== 6) {
    $("joinError").textContent = "Enter the 6-character game code.";
    return;
  }

  const snap = await get(ref(db, `games/${code}`));
  if (!snap.exists()) {
    $("joinError").textContent = "Game not found. Check the code and try again.";
    return;
  }
  const data = snap.val();
  if (data.status !== "waiting") {
    $("joinError").textContent = "This game has already started or finished.";
    return;
  }
  if (data.p1?.uid === currentUser.uid) {
    $("joinError").textContent = "You created this game — wait for your opponent.";
    return;
  }

  const hcp = parseFloat($("myHCP").value) || 0;
  gameId  = code;
  myRole  = "p2";
  gameRef = ref(db, `games/${gameId}`);

  await update(gameRef, {
    "p2": {
      uid: currentUser.uid,
      name: currentUser.displayName || "Player 2",
      photo: currentUser.photoURL || "",
      hcp: hcp
    },
    "status": "active"
  });

  localStorage.setItem("golfmate_gameId", gameId);
  localStorage.setItem("golfmate_role",   "p2");

  attachGameListener();
});

// ════════════════════════════════════════════════════
//  WAITING ROOM
// ════════════════════════════════════════════════════
function showWaiting() {
  $("displayGameCode").textContent = gameId;
  $("w1Photo").src = currentUser.photoURL || "";
  $("w1Name").textContent = currentUser.displayName || "You";
  showScreen("waiting");
}

$("copyCodeBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(gameId).then(() => {
    $("copyCodeBtn").textContent = "✓ Copied!";
    setTimeout(() => $("copyCodeBtn").textContent = "📋 Copy Code", 2000);
  });
});

$("cancelGameBtn").addEventListener("click", async () => {
  if (gameRef) await update(gameRef, { status: "cancelled" });
  localStorage.removeItem("golfmate_gameId");
  localStorage.removeItem("golfmate_role");
  gameId = null; myRole = null;
  if (gameListener) { off(gameRef); gameListener = null; }
  showLobby(currentUser);
});

// ════════════════════════════════════════════════════
//  REAL-TIME GAME LISTENER
// ════════════════════════════════════════════════════
function attachGameListener() {
  if (gameListener) off(gameRef);
  gameListener = onValue(gameRef, snap => {
    if (!snap.exists()) return;
    gameData = snap.val();
    handleGameUpdate(gameData);
  });
}

function handleGameUpdate(data) {
  if (!data) return;

  // Waiting → both players joined → start
  if (data.status === "waiting" && screens.waiting.classList.contains("active")) {
    // Show opponent joined indicator
    if (data.p2) {
      $("p2WaitCard").classList.add("joined");
      $("w2Name").textContent = data.p2.name;
    }
    return;
  }

  if (data.status === "active" || (data.status === "waiting" && data.p2)) {
    // Both players present — start the game
    if (!screens.scorecard.classList.contains("active") &&
        !screens.results.classList.contains("active")) {
      initScorecard(data);
    } else {
      refreshScorecard(data);
    }
    return;
  }

  if (data.status === "complete") {
    showResults(data);
    return;
  }

  if (data.status === "cancelled") {
    alert("The game was cancelled.");
    localStorage.removeItem("golfmate_gameId");
    localStorage.removeItem("golfmate_role");
    showLobby(currentUser);
    return;
  }
}

// ════════════════════════════════════════════════════
//  SCORECARD — INIT
// ════════════════════════════════════════════════════
function initScorecard(data) {
  const p1 = data.p1;
  const p2 = data.p2;
  const me  = myRole === "p1" ? p1 : p2;
  const opp = myRole === "p1" ? p2 : p1;

  // Header
  $("headerCourseName").textContent = data.courseName;
  $("roundDate").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });

  // Player chips
  $("hP1Photo").src            = p1.photo || "";
  $("hP1Name").textContent     = shortName(p1.name);
  $("hP1HCP").textContent      = `HCP ${p1.hcp}`;
  $("hP2Photo").src            = p2?.photo || "";
  $("hP2Name").textContent     = shortName(p2?.name || "P2");
  $("hP2HCP").textContent      = `HCP ${p2?.hcp ?? "?"}`;

  // My card
  $("myCardPhoto").src       = me.photo || "";
  $("myCardName").textContent  = shortName(me.name);

  // Opponent card
  $("oppCardPhoto").src      = opp?.photo || "";
  $("oppCardName").textContent = shortName(opp?.name || "Opponent");

  // Banner labels
  $("myBannerLabel").textContent  = shortName(me.name);
  $("oppBannerLabel").textContent = shortName(opp?.name || "Opponent");

  // Table headers
  $("thMyName").textContent  = shortName(me.name);
  $("thOppName").textContent = shortName(opp?.name || "Opp");

  // Hole navigator
  const nav = $("holeNav");
  nav.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const btn = document.createElement("button");
    btn.className = "hole-nav-btn";
    btn.id = `holeNavBtn${i}`;
    btn.textContent = i;
    btn.addEventListener("click", () => loadHole(i, data));
    nav.appendChild(btn);
  }

  // Stroke-index select
  const siSel = $("holeStrokeIndex");
  siSel.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = i;
    siSel.appendChild(opt);
  }

  showScreen("scorecard");
  currentHole = 1;
  loadHole(1, data);
}

// ════════════════════════════════════════════════════
//  SCORECARD — LOAD/REFRESH
// ════════════════════════════════════════════════════
function loadHole(n, data) {
  data = data || gameData;
  if (!data) return;
  currentHole = n;
  const h = data.holes[n - 1];

  $("currentHoleTitle").textContent = `Hole ${n}`;
  $("holePar").value          = h.par;
  $("holeStrokeIndex").value  = h.strokeIndex;
  $("holeMeters").value       = h.meters || "";

  const myStrokes  = h[`${myRole}Strokes`]  || 0;
  const oppRole    = myRole === "p1" ? "p2" : "p1";
  const oppStrokes = h[`${oppRole}Strokes`] || 0;

  $("myStrokesVal").textContent  = myStrokes;
  $("oppStrokesVal").textContent = oppStrokes || "—";

  updateHoleBreakdown(data, n);
  updateNavButtons(data);
  updateScoreBanner(data);
}

function refreshScorecard(data) {
  if (!screens.scorecard.classList.contains("active")) return;
  loadHole(currentHole, data);
  renderScorecardTable(data);
}

// ════════════════════════════════════════════════════
//  SCORE CALCULATIONS
// ════════════════════════════════════════════════════
function extraStrokes(playerHCP, holeStrokeIndex) {
  const base = Math.floor(playerHCP / 18);
  const rem  = Math.round(playerHCP % 18);
  return base + (holeStrokeIndex <= rem ? 1 : 0);
}

function netScore(gross, hcp, si) {
  return gross - extraStrokes(hcp, si);
}

function stablefordPoints(gross, par, hcp, si) {
  if (!gross) return 0;
  return Math.max(0, par + 2 - netScore(gross, hcp, si));
}

function updateHoleBreakdown(data, n) {
  n = n || currentHole;
  data = data || gameData;
  if (!data) return;

  const h   = data.holes[n - 1];
  const par = parseInt($("holePar").value);
  const si  = parseInt($("holeStrokeIndex").value);

  const myHCP  = data[myRole].hcp;
  const oppKey = myRole === "p1" ? "p2" : "p1";
  const oppHCP = data[oppKey]?.hcp || 0;

  const myG  = h[`${myRole}Strokes`]  || 0;
  const oppG = h[`${oppKey}Strokes`] || 0;

  $("myNetScore").textContent      = myG  ? netScore(myG, myHCP, si)             : "—";
  $("oppNetScore").textContent     = oppG ? netScore(oppG, oppHCP, si)            : "—";
  $("myStablefordScore").textContent  = myG  ? stablefordPoints(myG, par, myHCP, si) + " pts" : "—";
  $("oppStablefordScore").textContent = oppG ? stablefordPoints(oppG, par, oppHCP, si) + " pts" : "—";
}

function updateScoreBanner(data) {
  data = data || gameData;
  if (!data) return;

  const oppKey = myRole === "p1" ? "p2" : "p1";
  const myHCP  = data[myRole]?.hcp  || 0;
  const oppHCP = data[oppKey]?.hcp  || 0;

  let myStrokes = 0, oppStrokes = 0;
  let myNet = 0, oppNet = 0;
  let myPts = 0, oppPts = 0;

  Object.values(data.holes).forEach(h => {
    if (!h.saved) return;
    const mg = h[`${myRole}Strokes`]  || 0;
    const og = h[`${oppKey}Strokes`]  || 0;
    myStrokes  += mg; oppStrokes += og;
    myNet      += netScore(mg, myHCP, h.strokeIndex);
    oppNet     += netScore(og, oppHCP, h.strokeIndex);
    myPts      += stablefordPoints(mg, h.par, myHCP, h.strokeIndex);
    oppPts     += stablefordPoints(og, h.par, oppHCP, h.strokeIndex);
  });

  $("myTotalStrokes").textContent    = myStrokes;
  $("oppTotalStrokes").textContent   = oppStrokes;
  $("myTotalNet").textContent        = myNet;
  $("oppTotalNet").textContent       = oppNet;
  $("myTotalStableford").textContent = myPts;
  $("oppTotalStableford").textContent= oppPts;

  const saved = Object.values(data.holes).filter(h => h.saved).length;
  if (saved === 0) {
    $("leadBadge").textContent = "🏌️ Playing";
  } else if (myPts > oppPts) {
    $("leadBadge").textContent = "🏆 You lead!";
  } else if (oppPts > myPts) {
    $("leadBadge").textContent = `🏆 ${shortName(data[oppKey]?.name || "Opp")} leads`;
  } else {
    $("leadBadge").textContent = "⚖️ All Square";
  }
}

// ════════════════════════════════════════════════════
//  STROKE COUNTERS — write to DB on every tap
// ════════════════════════════════════════════════════
$("myPlus").addEventListener("click", () => adjustMyStrokes(1));
$("myMinus").addEventListener("click", () => adjustMyStrokes(-1));

async function adjustMyStrokes(delta) {
  if (!gameData) return;
  const h = gameData.holes[currentHole - 1];
  const key = `${myRole}Strokes`;
  const current = h[key] || 0;
  const next = Math.max(0, current + delta);
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { [key]: next });
}

// Hole metadata changes → write only if you're p1 (host manages course layout)
// Either player can adjust par/SI/meters for flexibility
$("holePar").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), {
    par: parseInt($("holePar").value)
  });
});
$("holeStrokeIndex").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), {
    strokeIndex: parseInt($("holeStrokeIndex").value)
  });
});
$("holeMeters").addEventListener("change", async () => {
  const m = $("holeMeters").value;
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), {
    meters: m ? parseInt(m) : null
  });
});

// ════════════════════════════════════════════════════
//  SAVE HOLE
// ════════════════════════════════════════════════════
$("saveHoleBtn").addEventListener("click", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { saved: true });

  if (currentHole < 18) {
    currentHole++;
    loadHole(currentHole);
  } else {
    // Mark game complete
    await update(gameRef, { status: "complete" });
  }
});

// Navigation arrows
$("prevHole").addEventListener("click", () => { if (currentHole > 1)  loadHole(currentHole - 1); });
$("nextHole").addEventListener("click", () => { if (currentHole < 18) loadHole(currentHole + 1); });
$("endRoundBtn").addEventListener("click", async () => {
  if (confirm("End the round now and see results?")) {
    await update(gameRef, { status: "complete" });
  }
});

function updateNavButtons(data) {
  data = data || gameData;
  for (let i = 1; i <= 18; i++) {
    const btn = $(`holeNavBtn${i}`);
    if (!btn) continue;
    const h = data?.holes?.[i - 1];
    btn.className = "hole-nav-btn" +
      (h?.saved ? " saved" : "") +
      (i === currentHole ? " active" : "");
  }
  $("prevHole").disabled = currentHole === 1;
  $("nextHole").disabled = currentHole === 18;
}

// ════════════════════════════════════════════════════
//  SCORECARD TABLE
// ════════════════════════════════════════════════════
function scoreBadge(gross, par, hcp, si) {
  if (!gross) return `<span class="par-score no-score">—</span>`;
  const diff = netScore(gross, hcp, si) - par;
  let cls = "par-score";
  if      (diff <= -2) cls += " eagle";
  else if (diff === -1) cls += " birdie";
  else if (diff === 0)  cls += " par";
  else if (diff === 1)  cls += " bogey";
  else if (diff === 2)  cls += " double-bogey";
  else                  cls += " triple-plus";
  return `<span class="${cls}">${gross}</span>`;
}

function renderScorecardTable(data) {
  data = data || gameData;
  if (!data) return;

  const oppKey = myRole === "p1" ? "p2" : "p1";
  const myHCP  = data[myRole]?.hcp  || 0;
  const oppHCP = data[oppKey]?.hcp  || 0;

  const tbody = $("scorecardBody");
  const tfoot = $("scorecardFoot");
  tbody.innerHTML = "";

  let totPar=0, myS=0, oppS=0, myN=0, oppN=0, myP=0, oppP=0;

  Object.values(data.holes).forEach((h, idx) => {
    const mg  = h[`${myRole}Strokes`]  || 0;
    const og  = h[`${oppKey}Strokes`]  || 0;
    const mn  = mg  ? netScore(mg, myHCP, h.strokeIndex) : "—";
    const on  = og  ? netScore(og, oppHCP, h.strokeIndex) : "—";
    const mp  = mg  ? stablefordPoints(mg, h.par, myHCP, h.strokeIndex) : "—";
    const op  = og  ? stablefordPoints(og, h.par, oppHCP, h.strokeIndex) : "—";

    if (h.saved) {
      totPar += h.par;
      myS += mg; oppS += og;
      if (typeof mn === "number") myN += mn;
      if (typeof on === "number") oppN += on;
      if (typeof mp === "number") myP += mp;
      if (typeof op === "number") oppP += op;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td>${h.par}</td>
      <td>${h.strokeIndex}</td>
      <td>${h.meters ? h.meters + "m" : "—"}</td>
      <td>${scoreBadge(mg, h.par, myHCP,  h.strokeIndex)}</td>
      <td>${typeof mn === "number" ? mn : "—"}</td>
      <td>${typeof mp === "number" ? mp : "—"}</td>
      <td>${scoreBadge(og, h.par, oppHCP, h.strokeIndex)}</td>
      <td>${typeof on === "number" ? on : "—"}</td>
      <td>${typeof op === "number" ? op : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  const saved = Object.values(data.holes).filter(h => h.saved).length;
  tfoot.innerHTML = saved > 0 ? `
    <tr>
      <td>Total</td><td>${totPar}</td><td>—</td><td>—</td>
      <td>${myS}</td><td>${myN}</td><td><strong style="color:var(--gold)">${myP} pts</strong></td>
      <td>${oppS}</td><td>${oppN}</td><td><strong style="color:var(--gold)">${oppP} pts</strong></td>
    </tr>` : "";
}

// ════════════════════════════════════════════════════
//  RESULTS
// ════════════════════════════════════════════════════
function showResults(data) {
  data = data || gameData;
  if (!data) return;

  const p1 = data.p1; const p2 = data.p2;
  let p1S=0,p2S=0,p1N=0,p2N=0,p1P=0,p2P=0;

  Object.values(data.holes).forEach(h => {
    if (!h.saved) return;
    p1S += h.p1Strokes || 0; p2S += h.p2Strokes || 0;
    p1N += netScore(h.p1Strokes||0, p1.hcp, h.strokeIndex);
    p2N += netScore(h.p2Strokes||0, p2?.hcp||0, h.strokeIndex);
    p1P += stablefordPoints(h.p1Strokes||0, h.par, p1.hcp, h.strokeIndex);
    p2P += stablefordPoints(h.p2Strokes||0, h.par, p2?.hcp||0, h.strokeIndex);
  });

  $("resultsCourse").textContent = data.courseName;
  $("resultsDate").textContent   = new Date().toLocaleDateString("en-GB", {
    weekday:"long",year:"numeric",month:"long",day:"numeric"
  });

  let winner = "";
  if (p1P > p2P)      winner = `🏆 ${p1.name} wins with ${p1P} points!`;
  else if (p2P > p1P) winner = `🏆 ${p2?.name||"Player 2"} wins with ${p2P} points!`;
  else                winner = "⚖️ It's a tie! Great round!";
  $("winnerBanner").textContent = winner;

  $("rP1Photo").src = p1.photo||""; $("rP1Name").textContent = p1.name;
  $("rP1HCP").textContent = p1.hcp; $("rP1Strokes").textContent = p1S;
  $("rP1Net").textContent = p1N;    $("rP1Stableford").textContent = p1P + " pts";

  $("rP2Photo").src = p2?.photo||""; $("rP2Name").textContent = p2?.name||"P2";
  $("rP2HCP").textContent = p2?.hcp||0; $("rP2Strokes").textContent = p2S;
  $("rP2Net").textContent = p2N;        $("rP2Stableford").textContent = p2P + " pts";

  showScreen("results");
}

$("playAgainBtn").addEventListener("click", () => {
  localStorage.removeItem("golfmate_gameId");
  localStorage.removeItem("golfmate_role");
  if (gameRef && gameListener) { off(gameRef); gameListener = null; }
  gameId = null; myRole = null; gameData = null; currentHole = 1;
  showLobby(currentUser);
});

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function generateGameId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function shortName(name) {
  if (!name) return "Player";
  const p = name.trim().split(" ");
  return p.length >= 2 ? p[0] + " " + p[1][0] + "." : p[0];
}
