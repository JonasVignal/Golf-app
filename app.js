// ═══════════════════════════════════════════════════════
//  GolfMate — Multi-device Firebase Realtime Scorecard
//  Clean rewrite: course DB, tee selection, WHS Playing HCP
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, off, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── Firebase Config ─────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDtMT8li6uMOujOQ1xb4Ill5BTInXT2-jM",
  authDomain:        "golfdanmark.firebaseapp.com",
  databaseURL:       "https://golfdanmark-default-rtdb.firebaseio.com",
  projectId:         "golfdanmark",
  storageBucket:     "golfdanmark.firebasestorage.app",
  messagingSenderId: "403752379611",
  appId:             "1:403752379611:web:b7eb566ebab9abe398d8fe"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// ═══════════════════════════════════════════════════════
//  COURSE DATABASE
// ═══════════════════════════════════════════════════════
const COURSES = {
  skyrup: {
    name: "Skyrup GK",
    location: "Sweden",
    par: 71,
    type: "Parkland (forest + lake holes)",
    // Hole-by-hole data: par and stroke index for each of the 18 holes
    pars: [4, 4, 3, 4, 4, 5, 3, 4, 4,  4, 3, 5, 4, 4, 3, 4, 5, 4],
    si:   [7,11,15, 3, 9,17, 5, 1,13,  8,16, 6, 2,10,18, 4,12,14],
    tees: {
      yellow: { label: "🟡 Yellow", length: 5860, rating: 70.9, slope: 129 },
      white:  { label: "⚪ White",  length: 6085, rating: 71.6, slope: 129 },
      blue:   { label: "🔵 Blue",   length: 5433, rating: 67.9, slope: 123 },
      red:    { label: "🔴 Red",    length: 5145, rating: 65.2, slope: 117 }
    }
  }
  // More courses can be added here
};

// Fallback for custom courses
const DEFAULT_PARS = [4,4,3,5,4,3,4,4,5, 4,3,4,5,4,3,4,4,5];
const DEFAULT_SI   = [7,11,15,3,9,17,5,1,13, 8,16,6,2,10,18,4,12,14];

// ─── WHS Playing Handicap Formula ────────────────────
// PH = HCP_index × (Slope / 113) + (CourseRating − Par)
function calcPlayingHCP(hcpIndex, slope, rating, par) {
  return Math.round(hcpIndex * (slope / 113) + (rating - par));
}

// ═══════════════════════════════════════════════════════
//  APP STATE
// ═══════════════════════════════════════════════════════
let currentUser = null;
let myRole      = null;   // "p1" or "p2"
let gameId      = null;
let gameRef     = null;
let gameData    = null;
let currentHole = 1;
let selectedTee = "yellow";

const $ = id => document.getElementById(id);
const screens = {
  login:     $("loginScreen"),
  lobby:     $("lobbyScreen"),
  waiting:   $("waitingScreen"),
  scorecard: $("scorecardScreen"),
  results:   $("resultsScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════
$("signInBtn").addEventListener("click", async () => {
  try {
    $("loginError").textContent = "";
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    console.error("Auth error:", e.code, e.message);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    const hints = {
      "auth/unauthorized-domain":    "Domain not authorized in Firebase. Add it in Authentication → Settings → Authorized domains.",
      "auth/operation-not-allowed":  "Google sign-in not enabled. Enable it in Firebase → Authentication → Sign-in method.",
      "auth/popup-blocked":          "Popup blocked. Please allow popups for this site.",
      "auth/network-request-failed": "Network error. Check your internet.",
    };
    $("loginError").textContent = hints[e.code] || `Error: ${e.code}`;
  }
});

$("lobbySignOut").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    // Check for saved in-progress game
    const savedId   = localStorage.getItem("golfmate_gameId");
    const savedRole = localStorage.getItem("golfmate_role");
    if (savedId && savedRole) {
      gameId  = savedId;
      myRole  = savedRole;
      gameRef = ref(db, `games/${gameId}`);
      attachGameListener();
      return;
    }
    showLobby(user);
  } else {
    cleanup();
    showScreen("login");
  }
});

function cleanup() {
  if (gameRef) off(gameRef);
  gameId = null; myRole = null; gameData = null;
  localStorage.removeItem("golfmate_gameId");
  localStorage.removeItem("golfmate_role");
}

// ═══════════════════════════════════════════════════════
//  LOBBY — Course / Tee UI
// ═══════════════════════════════════════════════════════
function showLobby(user) {
  $("lobbyPhoto").src = user.photoURL || "";
  $("lobbyName").textContent = user.displayName || user.email;
  updateCourseUI();
  showScreen("lobby");
}

// Tabs
["tabCreate", "tabJoin"].forEach(id => {
  $(id).addEventListener("click", () => {
    $("tabCreate").classList.toggle("active", id === "tabCreate");
    $("tabJoin").classList.toggle("active",   id === "tabJoin");
    $("createTab").classList.toggle("active", id === "tabCreate");
    $("joinTab").classList.toggle("active",   id === "tabJoin");
  });
});

// Course select
$("courseSelect").addEventListener("change", updateCourseUI);

function updateCourseUI() {
  const key     = $("courseSelect").value;
  const isKnown = key !== "custom";

  $("customCourseGroup").classList.toggle("hidden", isKnown);
  $("teeGroup").classList.toggle("hidden", !isKnown);
  $("courseInfoCard").style.display = isKnown ? "grid" : "none";

  if (isKnown) refreshCourseInfo(key, selectedTee);
}

function refreshCourseInfo(courseKey, tee) {
  const c = COURSES[courseKey];
  if (!c) return;
  const t = c.tees[tee];
  $("ciLength").textContent = t.length + " m";
  $("ciPar").textContent    = c.par;
  $("ciRating").textContent = t.rating;
  $("ciSlope").textContent  = t.slope;
}

// Tee buttons
document.querySelectorAll(".tee-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedTee = btn.dataset.tee;
    document.querySelectorAll(".tee-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    refreshCourseInfo($("courseSelect").value, selectedTee);
  });
});

// ═══════════════════════════════════════════════════════
//  CREATE GAME
// ═══════════════════════════════════════════════════════
$("createGameBtn").addEventListener("click", async () => {
  const hcpIndex = parseFloat($("myHCP").value) || 0;
  const scoring  = $("scoringSystem").value;
  const courseKey = $("courseSelect").value;

  let courseName, coursePars, courseSI, teeInfo = null;

  if (courseKey !== "custom" && COURSES[courseKey]) {
    const c = COURSES[courseKey];
    const t = c.tees[selectedTee];
    courseName = `${c.name} (${selectedTee})`;
    coursePars = c.pars;
    courseSI   = c.si;
    teeInfo = {
      key: selectedTee, label: t.label,
      length: t.length, rating: t.rating, slope: t.slope, par: c.par
    };
  } else {
    courseName = $("customCourseName").value.trim() || "Golf Course";
    coursePars = DEFAULT_PARS;
    courseSI   = DEFAULT_SI;
  }

  const ph = teeInfo
    ? calcPlayingHCP(hcpIndex, teeInfo.slope, teeInfo.rating, teeInfo.par)
    : Math.round(hcpIndex);

  gameId  = genCode();
  myRole  = "p1";
  gameRef = ref(db, `games/${gameId}`);

  const holes = {};
  for (let i = 0; i < 18; i++) {
    holes[i] = {
      par: coursePars[i], strokeIndex: courseSI[i],
      meters: null, p1Strokes: 0, p2Strokes: 0, saved: false
    };
  }

  await set(gameRef, {
    status: "waiting",
    courseName, scoringSystem: scoring, teeInfo,
    createdAt: serverTimestamp(),
    p1: {
      uid: currentUser.uid,
      name: currentUser.displayName || "Player 1",
      photo: currentUser.photoURL || "",
      hcp: hcpIndex, playingHCP: ph
    },
    p2: null,
    holes
  });

  localStorage.setItem("golfmate_gameId", gameId);
  localStorage.setItem("golfmate_role", "p1");
  showWaiting();
  attachGameListener();
});

// ═══════════════════════════════════════════════════════
//  JOIN GAME
// ═══════════════════════════════════════════════════════
$("joinGameBtn").addEventListener("click", async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  $("joinError").textContent = "";

  if (code.length !== 6) { $("joinError").textContent = "Enter the 6-character game code."; return; }

  const snap = await get(ref(db, `games/${code}`));
  if (!snap.exists())                { $("joinError").textContent = "Game not found."; return; }
  const data = snap.val();
  if (data.status !== "waiting")     { $("joinError").textContent = "Game already started or finished."; return; }
  if (data.p1?.uid === currentUser.uid) { $("joinError").textContent = "You created this game."; return; }

  const hcpIndex = parseFloat($("myHCP").value) || 0;
  const ti = data.teeInfo;
  const ph = ti ? calcPlayingHCP(hcpIndex, ti.slope, ti.rating, ti.par) : Math.round(hcpIndex);

  gameId  = code;
  myRole  = "p2";
  gameRef = ref(db, `games/${gameId}`);

  await update(gameRef, {
    p2: {
      uid: currentUser.uid,
      name: currentUser.displayName || "Player 2",
      photo: currentUser.photoURL || "",
      hcp: hcpIndex, playingHCP: ph
    },
    status: "active"
  });

  localStorage.setItem("golfmate_gameId", gameId);
  localStorage.setItem("golfmate_role", "p2");
  attachGameListener();
});

// ═══════════════════════════════════════════════════════
//  WAITING ROOM
// ═══════════════════════════════════════════════════════
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
  cleanup();
  showLobby(currentUser);
});

// ═══════════════════════════════════════════════════════
//  REALTIME LISTENER
// ═══════════════════════════════════════════════════════
function attachGameListener() {
  if (gameRef) off(gameRef);
  onValue(gameRef, snap => {
    if (!snap.exists()) return;
    gameData = snap.val();
    handleUpdate(gameData);
  });
}

function handleUpdate(d) {
  if (!d) return;

  if (d.status === "cancelled") {
    alert("Game was cancelled.");
    cleanup();
    showLobby(currentUser);
    return;
  }

  if (d.status === "waiting") {
    if (d.p2) {
      $("p2WaitCard").style.opacity = "1";
      $("p2WaitCard").classList.add("joined");
      $("w2Name").textContent = d.p2.name;
    }
    if (!screens.waiting.classList.contains("active")) showWaiting();
    return;
  }

  if (d.status === "active" || (d.status === "waiting" && d.p2)) {
    if (!screens.scorecard.classList.contains("active") && !screens.results.classList.contains("active")) {
      initScorecard(d);
    } else {
      refreshScorecard(d);
    }
    return;
  }

  if (d.status === "complete") {
    showResults(d);
  }
}

// ═══════════════════════════════════════════════════════
//  SCORING HELPERS
// ═══════════════════════════════════════════════════════
function getHCP(d, role) {
  return d[role]?.playingHCP ?? d[role]?.hcp ?? 0;
}

function extraStrokes(playHCP, si) {
  const base = Math.floor(playHCP / 18);
  const rem  = Math.round(playHCP % 18);
  return base + (si <= rem ? 1 : 0);
}

function netScore(gross, playHCP, si) {
  return gross - extraStrokes(playHCP, si);
}

function stableford(gross, par, playHCP, si) {
  if (!gross) return 0;
  return Math.max(0, par + 2 - netScore(gross, playHCP, si));
}

// ═══════════════════════════════════════════════════════
//  SCORECARD INIT
// ═══════════════════════════════════════════════════════
function initScorecard(d) {
  const p1 = d.p1, p2 = d.p2;
  const me  = myRole === "p1" ? p1 : p2;
  const opp = myRole === "p1" ? p2 : p1;

  $("headerCourseName").textContent = d.courseName;
  $("roundDate").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });

  $("hP1Photo").src = p1.photo || ""; $("hP1Name").textContent = short(p1.name);
  $("hP1HCP").textContent = `PH ${getHCP(d,"p1")}`;
  $("hP2Photo").src = p2?.photo || ""; $("hP2Name").textContent = short(p2?.name || "P2");
  $("hP2HCP").textContent = `PH ${getHCP(d,"p2")}`;

  $("myCardPhoto").src = me.photo || ""; $("myCardName").textContent = short(me.name);
  $("oppCardPhoto").src = opp?.photo || ""; $("oppCardName").textContent = short(opp?.name || "Opponent");
  $("myBannerLabel").textContent = short(me.name);
  $("oppBannerLabel").textContent = short(opp?.name || "Opponent");
  $("thMyName").textContent = short(me.name);
  $("thOppName").textContent = short(opp?.name || "Opp");

  // Build hole nav
  const nav = $("holeNav"); nav.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const btn = document.createElement("button");
    btn.className = "hole-nav-btn"; btn.id = `hn${i}`; btn.textContent = i;
    btn.addEventListener("click", () => loadHole(i));
    nav.appendChild(btn);
  }

  // SI dropdown
  const sel = $("holeSI"); sel.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const o = document.createElement("option"); o.value = i; o.textContent = i; sel.appendChild(o);
  }

  showScreen("scorecard");
  currentHole = 1;
  loadHole(1, d);
}

// ═══════════════════════════════════════════════════════
//  LOAD / REFRESH HOLE
// ═══════════════════════════════════════════════════════
function loadHole(n, d) {
  d = d || gameData; if (!d) return;
  currentHole = n;
  const h = d.holes[n - 1];
  const opp = myRole === "p1" ? "p2" : "p1";

  $("currentHoleTitle").textContent = `Hole ${n}`;
  $("holePar").value   = h.par;
  $("holeSI").value    = h.strokeIndex;
  $("holeMeters").value = h.meters || "";

  $("myStrokesVal").textContent  = h[`${myRole}Strokes`] || 0;
  $("oppStrokesVal").textContent = h[`${opp}Strokes`] || "—";

  updateBreakdown(d, n);
  updateNav(d);
  updateBanner(d);
  renderTable(d);
}

function refreshScorecard(d) {
  if (!screens.scorecard.classList.contains("active")) return;
  loadHole(currentHole, d);
}

// ═══════════════════════════════════════════════════════
//  HOLE BREAKDOWN
// ═══════════════════════════════════════════════════════
function updateBreakdown(d, n) {
  d = d || gameData; n = n || currentHole;
  if (!d) return;
  const h   = d.holes[n - 1];
  const par = parseInt($("holePar").value);
  const si  = parseInt($("holeSI").value);
  const opp = myRole === "p1" ? "p2" : "p1";
  const myH = getHCP(d, myRole), oppH = getHCP(d, opp);
  const mg  = h[`${myRole}Strokes`] || 0;
  const og  = h[`${opp}Strokes`]    || 0;

  $("myNetScore").textContent  = mg ? netScore(mg, myH, si)            : "—";
  $("oppNetScore").textContent = og ? netScore(og, oppH, si)           : "—";
  $("myPtsScore").textContent  = mg ? stableford(mg, par, myH, si) + " pts" : "—";
  $("oppPtsScore").textContent = og ? stableford(og, par, oppH, si) + " pts" : "—";
}

// ═══════════════════════════════════════════════════════
//  SCORE BANNER
// ═══════════════════════════════════════════════════════
function updateBanner(d) {
  d = d || gameData; if (!d) return;
  const opp = myRole === "p1" ? "p2" : "p1";
  const myH = getHCP(d, myRole), oppH = getHCP(d, opp);

  let mS=0, oS=0, mN=0, oN=0, mP=0, oP=0;
  Object.values(d.holes).forEach(h => {
    if (!h.saved) return;
    const mg = h[`${myRole}Strokes`] || 0, og = h[`${opp}Strokes`] || 0;
    mS += mg; oS += og;
    mN += netScore(mg, myH, h.strokeIndex);
    oN += netScore(og, oppH, h.strokeIndex);
    mP += stableford(mg, h.par, myH, h.strokeIndex);
    oP += stableford(og, h.par, oppH, h.strokeIndex);
  });

  $("myTotalStrokes").textContent = mS; $("oppTotalStrokes").textContent = oS;
  $("myTotalNet").textContent = mN; $("oppTotalNet").textContent = oN;
  $("myTotalPts").textContent = mP; $("oppTotalPts").textContent = oP;

  const saved = Object.values(d.holes).filter(h => h.saved).length;
  if (!saved)       $("leadBadge").textContent = "🏌️ Playing";
  else if (mP > oP) $("leadBadge").textContent = "🏆 You lead!";
  else if (oP > mP) $("leadBadge").textContent = `🏆 ${short(d[opp]?.name || "Opp")} leads`;
  else              $("leadBadge").textContent = "⚖️ All Square";
}

// ═══════════════════════════════════════════════════════
//  STROKE COUNTERS
// ═══════════════════════════════════════════════════════
$("myPlus").addEventListener("click", () => adj(1));
$("myMinus").addEventListener("click", () => adj(-1));

async function adj(delta) {
  if (!gameData) return;
  const h = gameData.holes[currentHole - 1];
  const k = `${myRole}Strokes`;
  const next = Math.max(0, (h[k] || 0) + delta);
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { [k]: next });
}

// Hole meta changes
$("holePar").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { par: parseInt($("holePar").value) });
});
$("holeSI").addEventListener("change", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { strokeIndex: parseInt($("holeSI").value) });
});
$("holeMeters").addEventListener("change", async () => {
  const m = $("holeMeters").value;
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { meters: m ? parseInt(m) : null });
});

// ═══════════════════════════════════════════════════════
//  SAVE HOLE / NAV
// ═══════════════════════════════════════════════════════
$("saveHoleBtn").addEventListener("click", async () => {
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { saved: true });
  if (currentHole < 18) { currentHole++; loadHole(currentHole); }
  else await update(gameRef, { status: "complete" });
});

$("prevHole").addEventListener("click", () => { if (currentHole > 1) loadHole(currentHole - 1); });
$("nextHole").addEventListener("click", () => { if (currentHole < 18) loadHole(currentHole + 1); });
$("endRoundBtn").addEventListener("click", async () => {
  if (confirm("End the round now?")) await update(gameRef, { status: "complete" });
});

function updateNav(d) {
  d = d || gameData;
  for (let i = 1; i <= 18; i++) {
    const btn = $(`hn${i}`); if (!btn) continue;
    const h = d?.holes?.[i - 1];
    btn.className = "hole-nav-btn" + (h?.saved ? " saved" : "") + (i === currentHole ? " active" : "");
  }
  $("prevHole").disabled = currentHole === 1;
  $("nextHole").disabled = currentHole === 18;
}

// ═══════════════════════════════════════════════════════
//  SCORECARD TABLE
// ═══════════════════════════════════════════════════════
function badge(gross, par, hcp, si) {
  if (!gross) return `<span class="par-score no-score">—</span>`;
  const diff = netScore(gross, hcp, si) - par;
  let c = "par-score";
  if (diff <= -2)     c += " eagle";
  else if (diff === -1) c += " birdie";
  else if (diff === 0)  { /* par, no extra class */ }
  else if (diff === 1)  c += " bogey";
  else if (diff === 2)  c += " double-bogey";
  else                  c += " triple-plus";
  return `<span class="${c}">${gross}</span>`;
}

function renderTable(d) {
  d = d || gameData; if (!d) return;
  const opp = myRole === "p1" ? "p2" : "p1";
  const myH = getHCP(d, myRole), oppH = getHCP(d, opp);

  const tbody = $("scorecardBody"); tbody.innerHTML = "";
  let tP=0, mS=0, oS=0, mN=0, oN=0, mPt=0, oPt=0;

  Object.values(d.holes).forEach((h, i) => {
    const mg = h[`${myRole}Strokes`] || 0, og = h[`${opp}Strokes`] || 0;
    const mn = mg ? netScore(mg, myH, h.strokeIndex) : "—";
    const on = og ? netScore(og, oppH, h.strokeIndex) : "—";
    const mp = mg ? stableford(mg, h.par, myH, h.strokeIndex) : "—";
    const op = og ? stableford(og, h.par, oppH, h.strokeIndex) : "—";

    if (h.saved) {
      tP += h.par; mS += mg; oS += og;
      if (typeof mn === "number") mN += mn;
      if (typeof on === "number") oN += on;
      if (typeof mp === "number") mPt += mp;
      if (typeof op === "number") oPt += op;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${i+1}</strong></td><td>${h.par}</td><td>${h.strokeIndex}</td><td>${h.meters?h.meters+"m":"—"}</td>
      <td>${badge(mg,h.par,myH,h.strokeIndex)}</td><td>${typeof mn==="number"?mn:"—"}</td><td>${typeof mp==="number"?mp:"—"}</td>
      <td>${badge(og,h.par,oppH,h.strokeIndex)}</td><td>${typeof on==="number"?on:"—"}</td><td>${typeof op==="number"?op:"—"}</td>`;
    tbody.appendChild(tr);
  });

  const saved = Object.values(d.holes).filter(h => h.saved).length;
  $("scorecardFoot").innerHTML = saved ? `<tr>
    <td>Total</td><td>${tP}</td><td>—</td><td>—</td>
    <td>${mS}</td><td>${mN}</td><td><strong style="color:var(--gold)">${mPt} pts</strong></td>
    <td>${oS}</td><td>${oN}</td><td><strong style="color:var(--gold)">${oPt} pts</strong></td>
  </tr>` : "";
}

// ═══════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════
function showResults(d) {
  d = d || gameData; if (!d) return;
  const p1 = d.p1, p2 = d.p2 || {};
  const h1 = getHCP(d, "p1"), h2 = getHCP(d, "p2");

  let s1=0,s2=0,n1=0,n2=0,pt1=0,pt2=0;
  Object.values(d.holes).forEach(h => {
    if (!h.saved) return;
    const g1 = h.p1Strokes||0, g2 = h.p2Strokes||0;
    s1+=g1; s2+=g2;
    n1+=netScore(g1,h1,h.strokeIndex); n2+=netScore(g2,h2,h.strokeIndex);
    pt1+=stableford(g1,h.par,h1,h.strokeIndex); pt2+=stableford(g2,h.par,h2,h.strokeIndex);
  });

  $("resultsCourse").textContent = d.courseName;
  $("resultsDate").textContent = new Date().toLocaleDateString("en-GB", {weekday:"long",year:"numeric",month:"long",day:"numeric"});

  if (pt1 > pt2)      $("winnerBanner").textContent = `🏆 ${p1.name} wins with ${pt1} pts!`;
  else if (pt2 > pt1) $("winnerBanner").textContent = `🏆 ${p2.name||"P2"} wins with ${pt2} pts!`;
  else                $("winnerBanner").textContent = "⚖️ It's a tie!";

  $("rP1Photo").src = p1.photo||""; $("rP1Name").textContent = p1.name;
  $("rP1HCPIdx").textContent = p1.hcp; $("rP1PlayHCP").textContent = p1.playingHCP ?? p1.hcp;
  $("rP1Strokes").textContent = s1; $("rP1Net").textContent = n1; $("rP1Pts").textContent = pt1 + " pts";

  $("rP2Photo").src = p2.photo||""; $("rP2Name").textContent = p2.name||"Player 2";
  $("rP2HCPIdx").textContent = p2.hcp??0; $("rP2PlayHCP").textContent = p2.playingHCP ?? p2.hcp ?? 0;
  $("rP2Strokes").textContent = s2; $("rP2Net").textContent = n2; $("rP2Pts").textContent = pt2 + " pts";

  showScreen("results");
}

$("playAgainBtn").addEventListener("click", () => {
  cleanup();
  currentHole = 1;
  showLobby(currentUser);
});

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function genCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6}, () => c[Math.floor(Math.random()*c.length)]).join("");
}

function short(name) {
  if (!name) return "Player";
  const p = name.trim().split(" ");
  return p.length >= 2 ? p[0] + " " + p[1][0] + "." : p[0];
}

// Init course UI on load
updateCourseUI();
