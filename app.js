// ═══════════════════════════════════════════════════════
//  GolfMate — 2-7 Player Multiplayer Scorecard
//  Firebase Realtime Database · WHS Playing Handicap
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, signInAnonymously, updateProfile, setPersistence, browserLocalPersistence }
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
const auth = getAuth(fbApp);
const db = getDatabase(fbApp);

// Force local persistence to help mobile browsers remember sessions after redirects
setPersistence(auth, browserLocalPersistence).catch(console.error);

// ─── Course Database ─────────────────────────────────
const COURSES = {
  skyrup: {
    name: "Skyrup GK", location: "Sweden", par: 71,
    pars: [4, 4, 3, 5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4, 5],
    si: [14, 4, 18, 10, 6, 8, 2, 12, 16, 9, 17, 1, 5, 13, 7, 15, 3, 11],
    tees: {
      yellow: { label: "🟡 59", length: 5696, rating: 70.9, slope: 129, lengths: [310, 345, 125, 465, 335, 135, 330, 380, 300, 465, 175, 375, 365, 140, 320, 315, 360, 460] },
      white: { label: "⚪ 53", length: 5100, rating: 71.6, slope: 129, lengths: [300, 320, 100, 440, 295, 125, 275, 330, 290, 415, 150, 330, 320, 120, 320, 280, 315, 400] },
      blue: { label: "🔵 47", length: 4548, rating: 67.9, slope: 123, lengths: [260, 265, 100, 395, 270, 100, 275, 280, 250, 365, 125, 280, 280, 110, 285, 280, 265, 365] }
    }
  },
  norreskov: {
    name: "Nørreskov GK (18 holes)", location: "Denmark", par: 70,
    pars: [4, 3, 4, 5, 3, 5, 4, 3, 4, 4, 3, 4, 5, 3, 5, 4, 3, 4],
    si: [7, 17, 1, 5, 9, 3, 11, 13, 15, 8, 18, 2, 6, 10, 4, 12, 14, 16],
    tees: {
      t58: { label: "⚫ 58", length: 5710, rating: 70.5, slope: 124, lengths: [357, 167, 397, 504, 168, 509, 328, 152, 273, 357, 167, 397, 504, 168, 509, 328, 152, 273] },
      t55: { label: "🟡 55", length: 5300, rating: 68.3, slope: 119, lengths: [336, 110, 348, 474, 159, 470, 328, 152, 273, 336, 110, 348, 474, 159, 470, 328, 152, 273] },
      t53: { label: "🔵 53", length: 5250, rating: 68.1, slope: 119, lengths: [336, 167, 348, 412, 159, 470, 328, 132, 273, 336, 167, 348, 412, 159, 470, 328, 132, 273] },
      t44: { label: "🔴 44", length: 4644, rating: 65.0, slope: 111, lengths: [294, 92, 297, 412, 124, 405, 308, 132, 258, 294, 92, 297, 412, 124, 405, 308, 132, 258] }
    }
  },
  huseso: {
    name: "Husesø GK (18 holes)", location: "Denmark", par: 70,
    pars: [4, 4, 5, 4, 4, 3, 4, 3, 4, 4, 4, 5, 4, 4, 4, 3, 4, 3],
    si: [15, 5, 13, 9, 3, 11, 7, 1, 17, 16, 6, 14, 10, 4, 12, 8, 2, 18],
    tees: {
      t58: { label: "⚫ 58", length: 6010, rating: 73.0, slope: 131, lengths: [344, 366, 456, 408, 391, 325, 191, 379, 145, 344, 366, 456, 408, 391, 325, 191, 379, 145] },
      t55: { label: "🟡 55", length: 5720, rating: 71.5, slope: 128, lengths: [297, 366, 456, 367, 334, 325, 191, 379, 145, 297, 366, 456, 367, 334, 325, 191, 379, 145] },
      t53: { label: "🔵 53", length: 5380, rating: 69.7, slope: 123, lengths: [255, 315, 456, 367, 334, 325, 164, 329, 145, 297, 366, 456, 367, 334, 325, 191, 379, 145] },
      t48: { label: "🔴 48", length: 4956, rating: 67.5, slope: 118, lengths: [255, 315, 395, 314, 291, 291, 164, 329, 124, 255, 315, 395, 314, 291, 291, 164, 329, 124] }
    }
  },
  ormehoj: {
    name: "Ormehøj GK (18 holes)", location: "Denmark", par: 70,
    pars: [5, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 3, 4, 5, 3, 4, 3, 4],
    si: [7, 3, 17, 1, 13, 11, 5, 15, 9, 8, 4, 18, 2, 14, 12, 6, 16, 10],
    tees: {
      t58: { label: "⚫ 58", length: 5688, rating: 70.3, slope: 129, lengths: [471, 336, 134, 422, 455, 134, 411, 150, 331, 471, 336, 134, 422, 455, 134, 411, 150, 331] },
      t55: { label: "🟡 55", length: 5504, rating: 69.4, slope: 127, lengths: [471, 336, 134, 387, 440, 134, 386, 133, 331, 471, 336, 134, 387, 440, 134, 386, 133, 331] },
      t53: { label: "🔵 53", length: 5184, rating: 67.7, slope: 123, lengths: [407, 336, 134, 387, 400, 134, 336, 133, 285, 407, 336, 134, 387, 400, 134, 336, 133, 285] },
      t48: { label: "🔴 48", length: 4732, rating: 65.3, slope: 117, lengths: [407, 289, 117, 331, 378, 122, 336, 101, 285, 407, 289, 117, 331, 378, 122, 336, 101, 285] }
    }
  },
  huseso_norreskov: {
    name: "Husesø/Nørreskov GK", location: "Denmark", par: 70, // 35 + 35
    pars: [4, 4, 5, 4, 4, 4, 3, 4, 3, 4, 3, 4, 5, 3, 5, 4, 3, 4],
    si: [15, 5, 13, 9, 3, 11, 7, 1, 17, 8, 18, 2, 6, 10, 4, 12, 14, 16],
    tees: {
      t58: { label: "⚫ 58", length: 5860, rating: 71.8, slope: 128, lengths: [344, 366, 456, 408, 391, 325, 191, 379, 145, 357, 167, 397, 504, 168, 509, 328, 152, 273] },
      t55: { label: "🟡 55", length: 5510, rating: 69.9, slope: 124, lengths: [297, 366, 456, 367, 334, 325, 191, 379, 145, 336, 110, 348, 474, 159, 470, 328, 152, 273] },
      t53: { label: "🔵 53", length: 5315, rating: 68.9, slope: 121, lengths: [255, 315, 456, 367, 334, 325, 164, 329, 145, 336, 167, 348, 412, 159, 470, 328, 132, 273] },
      t48_44: { label: "🔴 48", length: 4800, rating: 66.2, slope: 115, lengths: [255, 315, 395, 314, 291, 291, 164, 329, 124, 294, 92, 297, 412, 124, 405, 308, 132, 258] }
    }
  },
  norreskov_huseso: {
    name: "Nørreskov/Husesø GK", location: "Denmark", par: 70, // 35 + 35
    pars: [4, 3, 4, 5, 3, 5, 4, 3, 4, 4, 4, 5, 4, 4, 4, 3, 4, 3],
    si: [7, 17, 1, 5, 9, 3, 11, 13, 15, 16, 6, 14, 10, 4, 12, 8, 2, 18],
    tees: {
      t58: { label: "⚫ 58", length: 5860, rating: 71.7, slope: 128, lengths: [357, 167, 397, 504, 168, 509, 328, 152, 273, 344, 366, 456, 408, 391, 325, 191, 379, 145] },
      t55: { label: "🟡 55", length: 5510, rating: 69.9, slope: 124, lengths: [336, 110, 348, 474, 159, 470, 328, 152, 273, 297, 366, 456, 367, 334, 325, 191, 379, 145] },
      t53: { label: "🔵 53", length: 5315, rating: 68.9, slope: 121, lengths: [336, 167, 348, 412, 159, 470, 328, 132, 273, 255, 315, 456, 367, 334, 325, 164, 329, 145] },
      t44_48: { label: "🔴 48", length: 4800, rating: 66.2, slope: 115, lengths: [294, 92, 297, 412, 124, 405, 308, 132, 258, 255, 315, 395, 314, 291, 291, 164, 329, 124] }
    }
  },
  huseso_ormehoj: {
    name: "Husesø/Ormehøj GK", location: "Denmark", par: 70, // 35 + 35
    pars: [4, 4, 5, 4, 4, 4, 3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 3, 4],
    si: [15, 5, 13, 9, 3, 11, 7, 1, 17, 8, 4, 18, 2, 14, 12, 6, 16, 10],
    tees: {
      t58: { label: "⚫ 58", length: 5849, rating: 71.7, slope: 130, lengths: [344, 366, 456, 408, 391, 325, 191, 379, 145, 471, 336, 134, 422, 455, 134, 411, 150, 331] },
      t55: { label: "🟡 55", length: 5612, rating: 70.4, slope: 128, lengths: [297, 366, 456, 367, 334, 325, 191, 379, 145, 471, 336, 134, 387, 440, 134, 386, 133, 331] },
      t53: { label: "🔵 53", length: 5282, rating: 68.7, slope: 123, lengths: [255, 315, 456, 367, 334, 325, 164, 329, 145, 407, 336, 134, 387, 400, 134, 336, 133, 285] },
      t48: { label: "🔴 48", length: 4844, rating: 66.4, slope: 117, lengths: [255, 315, 395, 314, 291, 291, 164, 329, 124, 407, 289, 117, 331, 378, 122, 336, 101, 285] }
    }
  },
  norreskov_ormehoj: {
    name: "Nørreskov/Ormehøj GK", location: "Denmark", par: 70, // 35 + 35
    pars: [4, 3, 4, 5, 3, 5, 4, 3, 4, 5, 4, 3, 4, 5, 3, 4, 3, 4],
    si: [7, 17, 1, 5, 9, 3, 11, 13, 15, 8, 4, 18, 2, 14, 12, 6, 16, 10],
    tees: {
      t58: { label: "⚫ 58", length: 5699, rating: 70.4, slope: 127, lengths: [357, 167, 397, 504, 168, 509, 328, 152, 273, 471, 336, 134, 422, 455, 134, 411, 150, 331] },
      t55: { label: "🟡 55", length: 5402, rating: 68.9, slope: 124, lengths: [336, 110, 348, 474, 159, 470, 328, 152, 273, 471, 336, 134, 387, 440, 134, 386, 133, 331] },
      t53: { label: "🔵 53", length: 5217, rating: 67.9, slope: 121, lengths: [336, 167, 348, 412, 159, 470, 328, 132, 273, 407, 336, 134, 387, 400, 134, 336, 133, 285] },
      t44_48: { label: "🔴 48", length: 4688, rating: 65.2, slope: 114, lengths: [294, 92, 297, 412, 124, 405, 308, 132, 258, 407, 289, 117, 331, 378, 122, 336, 101, 285] }
    }
  },
  ormehoj_huseso: {
    name: "Ormehøj/Husesø GK", location: "Denmark", par: 70, // 35 + 35
    pars: [5, 4, 3, 4, 5, 3, 4, 3, 4, 4, 4, 5, 4, 4, 3, 4, 3, 4],
    si: [7, 3, 17, 1, 13, 11, 5, 15, 9, 16, 6, 14, 10, 4, 12, 8, 2, 18],
    tees: {
      t58: { label: "⚫ 58", length: 5849, rating: 71.7, slope: 130, lengths: [471, 336, 134, 422, 455, 134, 411, 150, 331, 344, 366, 456, 408, 391, 325, 191, 379, 145] },
      t55: { label: "🟡 55", length: 5612, rating: 70.4, slope: 128, lengths: [471, 336, 134, 387, 440, 134, 386, 133, 331, 297, 366, 456, 367, 334, 325, 191, 379, 145] },
      t53: { label: "🔵 53", length: 5282, rating: 68.7, slope: 123, lengths: [407, 336, 134, 387, 400, 134, 336, 133, 285, 255, 315, 456, 367, 334, 325, 164, 329, 145] },
      t48: { label: "🔴 48", length: 4844, rating: 66.4, slope: 117, lengths: [407, 289, 117, 331, 378, 122, 336, 101, 285, 255, 315, 395, 314, 291, 291, 164, 329, 124] }
    }
  },
  ormehoj_norreskov: {
    name: "Ormehøj/Nørreskov GK", location: "Denmark", par: 70, // 35 + 35
    pars: [5, 4, 3, 4, 5, 3, 4, 3, 4, 4, 3, 4, 5, 3, 5, 4, 3, 4],
    si: [7, 3, 17, 1, 13, 11, 5, 15, 9, 8, 18, 2, 6, 10, 4, 12, 14, 16],
    tees: {
      t58: { label: "⚫ 58", length: 5699, rating: 70.4, slope: 127, lengths: [471, 336, 134, 422, 455, 134, 411, 150, 331, 357, 167, 397, 504, 168, 509, 328, 152, 273] },
      t55: { label: "🟡 55", length: 5402, rating: 68.9, slope: 124, lengths: [471, 336, 134, 387, 440, 134, 386, 133, 331, 336, 110, 348, 474, 159, 470, 328, 152, 273] },
      t53: { label: "🔵 53", length: 5217, rating: 67.9, slope: 121, lengths: [407, 336, 134, 387, 400, 134, 336, 133, 285, 336, 167, 348, 412, 159, 470, 328, 132, 273] },
      t44_48: { label: "🔴 48", length: 4688, rating: 65.2, slope: 114, lengths: [407, 289, 117, 331, 378, 122, 336, 101, 285, 294, 92, 297, 412, 124, 405, 308, 132, 258] }
    }
  },
  smorum_intermediate: {
    name: "Smørum Intermediate GK",
    location: "Denmark",
    par: 66,
    pars: [3, 4, 4, 4, 3, 5, 3, 3, 4, 3, 4, 4, 4, 3, 5, 3, 3, 4],
    si: [15, 9, 5, 7, 13, 1, 11, 17, 3, 16, 10, 6, 8, 14, 2, 12, 18, 4],
    tees: {
      t38: { label: "⚫ 38", length: 3808, rating: 60.7, slope: 97, lengths: [95, 231, 241, 233, 132, 435, 155, 106, 276, 95, 231, 241, 233, 132, 435, 155, 106, 276] },
      t32: { label: "🟡 32", length: 3226, rating: 57.7, slope: 90, lengths: [95, 195, 187, 198, 122, 345, 145, 100, 226, 95, 195, 187, 198, 122, 345, 145, 100, 226] }
    }
  },
  albertslund: {
    name: "Albertslund GK (18 holes)",
    location: "Denmark", par: 66,
    pars: [3, 3, 4, 5, 4, 3, 4, 3, 4, 3, 3, 4, 5, 4, 3, 4, 3, 4],
    si: [15, 7, 3, 1, 11, 17, 13, 9, 5, 16, 8, 4, 2, 12, 18, 14, 10, 6],
    tees: {
      t42: { label: "🟡 42", length: 4166, rating: 63.8, slope: 113, lengths: [110, 220, 240, 230, 130, 430, 150, 100, 270, 110, 220, 240, 230, 130, 430, 150, 100, 270] }
    }
  },
};

const DEF_PARS = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 5, 4, 3, 4, 4, 5];
const DEF_SI = [7, 11, 15, 3, 9, 17, 5, 1, 13, 8, 16, 6, 2, 10, 18, 4, 12, 14];
const PLAYER_COLORS = ["#3dca7a", "#5ba8ff", "#e879f9", "#fb923c", "#f87171", "#a78bfa", "#34d399"];
const MAX_PLAYERS = 7;

function calcPH(hcpIdx, slope, rating, par) {
  return Math.round(hcpIdx * (slope / 113) + (rating - par));
}


// ─── State ───────────────────────────────────────────
let currentUser = null;
let myUid = null;
let gameId = null;
let gameRef = null;
let gameData = null;
let currentHole = 1;
let selectedTee = "yellow";
let seenSavedHoles = null;
let seenMapHoles = new Set();

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
// Explicitly handle redirect results. On mobile, this is often necessary to "catch" the login state
getRedirectResult(auth).then((result) => {
  if (result && result.user) {
    console.log("Redirect sign-in successful:", result.user.displayName);
    // showLobby will be handled by onAuthStateChanged, but we can nudge it here
    hideLoginError();
  }
}).catch((e) => {
  console.error("Redirect Result Error:", e);
  handleAuthError(e);
});

function hideLoginError() {
  const el = $("loginError");
  if (el) el.textContent = "";
}

function handleAuthError(e) {
  const msg = {
    "auth/unauthorized-domain": "Unauthorized Domain: Add this URL in Firebase -> Auth -> Settings -> Authorized domains.",
    "auth/operation-not-allowed": "Google sign-in is disabled in Firebase console.",
    "auth/network-request-failed": "Network error — check your connection.",
    "auth/popup-blocked": "Popup blocked! Redirecting instead...",
    "auth/cancelled-popup-request": "",
    "auth/popup-closed-by-user": ""
  };
  const errEl = $("loginError");
  if (errEl) errEl.textContent = msg[e.code] || `Error: ${e.code}`;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

$("signInBtn").addEventListener("click", () => {
  const errorNote = $("loginError");
  errorNote.textContent = "Opening Google...";
  
  // Mobile browsers (especially Safari/iOS) and in-app browsers (IG/FB) 
  // work MUCH better with Redirect than Popup.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isInApp = /FBAN|FBAV|Instagram|LBBROWSER|Line/i.test(navigator.userAgent);

  if (isMobile || isInApp) {
    if (isInApp) errorNote.textContent = "Redirecting... (Note: In-app browsers like Instagram suggest 'Open in Safari' if this fails)";
    signInWithRedirect(auth, googleProvider).catch(handleAuthError);
  } else {
    signInWithPopup(auth, googleProvider)
      .then(() => hideLoginError())
      .catch((e) => {
        if (e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request") {
          errorNote.textContent = "Popup blocked! Redirecting...";
          signInWithRedirect(auth, googleProvider).catch(handleAuthError);
        } else {
          handleAuthError(e);
        }
      });
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
  seenSavedHoles = null;
  seenMapHoles.clear();
  localStorage.removeItem("gm_gid");
}

// ═══════════════════════════════════════════════════════
//  LOBBY
// ═══════════════════════════════════════════════════════
function showLobby(user) {
  $("lobbyPhoto").src = user.photoURL || "";
  $("lobbyName").textContent = user.displayName || user.email;

  const savedHcp = localStorage.getItem("gm_hcp");
  if (savedHcp) $("myHCP").value = savedHcp;

  updateCourseUI();
  show("lobby");
}

["tabCreate", "tabJoin"].forEach(id => {
  $(id).addEventListener("click", () => {
    $("tabCreate").classList.toggle("active", id === "tabCreate");
    $("tabJoin").classList.toggle("active", id === "tabJoin");
    $("createTab").classList.toggle("active", id === "tabCreate");
    $("joinTab").classList.toggle("active", id === "tabJoin");
  });
});

// Course / Tee UI
$("courseSelect").addEventListener("change", () => {
  const k = $("courseSelect").value;
  if (k !== "custom" && COURSES[k]) {
    selectedTee = Object.keys(COURSES[k].tees)[0];
  }
  updateCourseUI();
});

function updateCourseUI() {
  const k = $("courseSelect").value, known = k !== "custom";
  $("customCourseGroup").classList.toggle("hidden", known);
  $("teeGroup").classList.toggle("hidden", !known);
  $("courseInfoCard").style.display = known ? "grid" : "none";
  if (known) {
    const c = COURSES[k];

    // Safety check: if the browser initialized selectedTee to something invalid for this course
    if (!c.tees[selectedTee]) {
      selectedTee = Object.keys(c.tees)[0];
    }

    const selector = $("teeSelector");
    selector.innerHTML = "";
    Object.entries(c.tees).forEach(([tKey, t]) => {
      const btn = document.createElement("button");
      btn.className = "tee-btn" + (selectedTee === tKey ? " active" : "");
      btn.textContent = t.label;
      btn.onclick = () => {
        selectedTee = tKey;
        updateCourseUI();
      };
      selector.appendChild(btn);
    });
    refreshCI(k, selectedTee);
  }
}
function refreshCI(ck, tee) {
  const c = COURSES[ck]; if (!c) return;
  const t = c.tees[tee];
  if (!t) return;
  $("ciLength").textContent = t.length + " m";
  $("ciPar").textContent = c.par;
  $("ciRating").textContent = t.rating;
  $("ciSlope").textContent = t.slope;
}

// ═══════════════════════════════════════════════════════
//  CREATE GAME
// ═══════════════════════════════════════════════════════
$("createGameBtn").addEventListener("click", async () => {
  const hcpVal = $("myHCP").value.trim();
  const hcpIdx = parseFloat(hcpVal) || 0;
  if (hcpVal) localStorage.setItem("gm_hcp", hcpVal);

  const scoring = $("scoringSystem").value;
  const ck = $("courseSelect").value;

  let courseName, pars, si, teeInfo = null;
  if (ck !== "custom" && COURSES[ck]) {
    const c = COURSES[ck], t = c.tees[selectedTee];
    courseName = `${c.name} (${selectedTee})`;
    pars = c.pars; si = c.si;
    teeInfo = { key: selectedTee, label: t.label, length: t.length, rating: t.rating, slope: t.slope, par: c.par, lengths: t.lengths };
  } else {
    courseName = $("customCourseName").value.trim() || "Golf Course";
    pars = DEF_PARS; si = DEF_SI;
  }
  const ph = teeInfo ? calcPH(hcpIdx, teeInfo.slope, teeInfo.rating, teeInfo.par) : Math.round(hcpIdx);

  gameId = genCode();
  gameRef = ref(db, `games/${gameId}`);

  const holes = {};
  for (let i = 0; i < 18; i++) holes[i] = { par: pars[i], strokeIndex: si[i], meters: (teeInfo?.lengths?.[i] || null), strokes: {}, saved: false };

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

  const hcpVal = $("myHCP").value.trim();
  const hcpIdx = parseFloat(hcpVal) || 0;
  if (hcpVal) localStorage.setItem("gm_hcp", hcpVal);

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
  const sorted = players.sort((a, b) => a[1].joinOrder - b[1].joinOrder);
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
        <img src="${p.photo || ""}" alt="" class="slot-photo" style="border-color:${PLAYER_COLORS[i]}"/>
        <div class="slot-info">
          <div class="slot-name">${p.name}${uid === d.hostUid ? " 👑" : ""}</div>
          <div class="slot-detail">HCP ${p.hcp} → PH ${p.playingHCP}</div>
        </div>`;
    } else {
      div.innerHTML = `<div class="slot-placeholder">${i + 1}</div><div class="slot-info"><div class="slot-name" style="color:var(--tx-d)">Open slot</div></div>`;
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
  return Object.entries(d.players || {}).sort((a, b) => a[1].joinOrder - b[1].joinOrder);
}
function ph(d, uid) { return d.players?.[uid]?.playingHCP ?? d.players?.[uid]?.hcp ?? 0; }
function xtra(phcp, si) { const b = Math.floor(phcp / 18), r = Math.round(phcp % 18); return b + (si <= r ? 1 : 0); }
function net(gross, phcp, si) { return gross - xtra(phcp, si); }
function stab(gross, par, phcp, si) { return gross ? Math.max(0, par + 2 - net(gross, phcp, si)) : 0; }

function totals(d, uid) {
  const h = ph(d, uid); let s = 0, n = 0, p = 0;
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
  $("roundDate").textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  // Header chips
  const chips = $("headerChips"); chips.innerHTML = "";
  getPlayers(d).forEach(([uid, p], i) => {
    chips.innerHTML += `<div class="chip" style="border-color:${PLAYER_COLORS[i]}"><img src="${p.photo || ""}" class="chip-photo"/><span>${short(p.name)}</span><span class="chip-hcp">PH ${ph(d, uid)}</span></div>`;
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
  for (let i = 1; i <= 18; i++) { const o = document.createElement("option"); o.value = i; o.textContent = i; sel.appendChild(o); }

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
  const h = d.holes[n - 1];

  $("currentHoleTitle").textContent = `Hole ${n}`;

  // Hole Map popup logic
  const isSkyrup = d.courseName.toLowerCase().includes("skyrup");
  const viewMapBtn = $("viewMapBtn");
  if (viewMapBtn) {
    if (isSkyrup) {
      viewMapBtn.style.display = "inline-block";
      if (!seenMapHoles.has(n)) {
        $("mapImage").src = `Skyrup_${n}.png`;
        $("mapPopup").classList.add("active");
        seenMapHoles.add(n);
      }
    } else {
      viewMapBtn.style.display = "none";
    }
  }

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
    div.innerHTML = `<img src="${p.photo || ""}" class="other-photo" style="border-color:${PLAYER_COLORS[i]}"/>
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
  const h = d.holes[n - 1];
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
    const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
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
  const h = gameData.holes[currentHole - 1];
  const cur = h.strokes?.[myUid] || 0;
  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}/strokes`), { [myUid]: Math.max(0, cur + delta) });
}

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
$('saveHoleBtn').addEventListener('click', async () => {
  const d = gameData;
  const h = d.holes[currentHole - 1];

  await update(ref(db, `games/${gameId}/holes/${currentHole - 1}`), { saved: true });

  // Golfkongerne: check for special rules locally when the player clicks save
  if (d.scoringSystem === 'golfkongerne') {
    checkGolfkongerneRules(d, h, currentHole);
  }

  if (currentHole < 18) { currentHole++; loadHole(currentHole); }
  else await update(gameRef, { status: 'complete' });
});

$("prevHole").addEventListener("click", () => { if (currentHole > 1) loadHole(currentHole - 1); });
$("nextHole").addEventListener("click", () => { if (currentHole < 18) loadHole(currentHole + 1); });
$("endRoundBtn").addEventListener("click", async () => { if (confirm("End round now?")) await update(gameRef, { status: "complete" }); });

function updateNav(d) {
  for (let i = 1; i <= 18; i++) {
    const btn = $(`hn${i}`); if (!btn) continue;
    btn.className = "hole-nav-btn" + (d.holes?.[i - 1]?.saved ? " saved" : "") + (i === currentHole ? " active" : "");
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
  thead.innerHTML = `<tr><th>Hole</th><th>Par</th><th>SI</th>${players.map(([, p]) => `<th>${short(p.name)}</th><th>Pts</th>`).join("")}</tr>`;

  // tbody
  const tbody = $("scorecardBody"); tbody.innerHTML = "";
  const totP = new Array(players.length).fill(0);
  const totS = new Array(players.length).fill(0);
  const totPts = new Array(players.length).fill(0);
  let parSum = 0;

  Object.values(d.holes).forEach((h, idx) => {
    let cells = `<td><strong>${idx + 1}</strong></td><td>${h.par}</td><td>${h.strokeIndex}</td>`;
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
  $("scorecardFoot").innerHTML = saved ? `<tr><td>Total</td><td>${parSum}</td><td>—</td>${players.map((_, i) => `<td>${totS[i]}</td><td><strong style="color:var(--gold)">${totPts[i]}</strong></td>`).join("")
    }</tr>` : "";
}

// ═══════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════
function showResults(d) {
  if (!d) return;
  $("resultsCourse").textContent = d.courseName;
  $("resultsDate").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const players = getPlayers(d);
  const ranked = players.map(([uid, p], i) => ({ uid, ...p, idx: i, ...totals(d, uid) }))
    .sort((a, b) => b.pts - a.pts || a.net - b.net);

  const winner = ranked[0];
  $("winnerBanner").textContent = ranked.length > 1 && ranked[0].pts > ranked[1].pts
    ? `🏆 ${winner.name} wins with ${winner.pts} points!`
    : ranked.length > 1 && ranked[0].pts === ranked[1].pts
      ? `⚖️ It's a tie at ${ranked[0].pts} points!`
      : `🏆 ${winner.name} — ${winner.pts} points`;

  const grid = $("resultsGrid"); grid.innerHTML = "";
  ranked.forEach((p, rank) => {
    const medal = rank === 0 ? "🥇 1st" : rank === 1 ? "🥈 2nd" : rank === 2 ? "🥉 3rd" : `${rank + 1}th`;
    const div = document.createElement("div");
    div.className = "result-card" + (rank === 0 ? " winner" : "");
    div.style.borderTop = `3px solid ${PLAYER_COLORS[p.idx]}`;
    div.innerHTML = `
      <div class="result-rank">${medal}</div>
      <img src="${p.photo || ""}" class="result-photo" style="border-color:${PLAYER_COLORS[p.idx]}"/>
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
function genCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(""); }
function short(n) { if (!n) return "Player"; const p = n.trim().split(" "); return p.length >= 2 ? p[0] + " " + p[1][0] + "." : p[0]; }

// ═══════════════════════════════════════════════════════
//  GOLFKONGERNE — SHOT POPUP
// ═══════════════════════════════════════════════════════
let popupQueue = [];

function processPopupQueue() {
  if ($("shotPopup").classList.contains("active")) return;
  if (popupQueue.length === 0) return;

  const next = popupQueue.shift();
  showShotPopup(next.names, next.holeNum, next.type);
}

function checkGolfkongerneRules(d, h, holeNum) {
  const players = getPlayers(d);

  const acePlayers = [];
  const birdiePlayers = [];
  const shotPlayers = [];
  const sipPlayers = [];
  const zeroPlayers = [];
  const chugPlayers = [];
  const pantsPlayers = [];

  players.forEach(([uid, p]) => {
    const g = h.strokes?.[uid] || 0;
    if (g === 1) acePlayers.push(p.name);
    else if (g > 1) {
      const pts = stab(g, h.par, ph(d, uid), h.strokeIndex);
      const nDiff = net(g, ph(d, uid), h.strokeIndex) - h.par;
      if (pts === 4) birdiePlayers.push(p.name);
      else if (pts === 3) shotPlayers.push(p.name);
      else if (pts === 1) sipPlayers.push(p.name);
      else if (pts === 0 && nDiff >= 5) pantsPlayers.push(p.name);
      else if (pts === 0 && nDiff === 4) chugPlayers.push(p.name);
      else if (pts === 0 && nDiff === 3) zeroPlayers.push(p.name);
    }
  });

  if (acePlayers.length > 0) popupQueue.push({ names: acePlayers, holeNum, type: 'ace' });
  if (birdiePlayers.length > 0) popupQueue.push({ names: birdiePlayers, holeNum, type: 'birdie' });
  if (shotPlayers.length > 0) popupQueue.push({ names: shotPlayers, holeNum, type: 'shot' });
  if (sipPlayers.length > 0) popupQueue.push({ names: sipPlayers, holeNum, type: 'sip' });
  if (pantsPlayers.length > 0) popupQueue.push({ names: pantsPlayers, holeNum, type: 'pants' });
  if (chugPlayers.length > 0) popupQueue.push({ names: chugPlayers, holeNum, type: 'chug' });
  if (zeroPlayers.length > 0) popupQueue.push({ names: zeroPlayers, holeNum, type: 'zero' });

  processPopupQueue();
}

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
  } else {
    // Default to "shot" (3 points)
    $("shotPopup").querySelector(".shot-emoji").textContent = "🍻";
    $("shotPopup").querySelector(".shot-title").textContent = "Giv et shot til en makker!";
    $("shotPlayerName").textContent = `👑 ${names}`;
    $("shotDetail").textContent = `Scorede 3 point på hul ${holeNum} — par netto!`;
    $("shotDismiss").textContent = "Skål! 🥃";
  }

  $("shotPopup").classList.add("active");
}

$("shotDismiss").addEventListener("click", () => {
  $("shotPopup").classList.remove("active");
  setTimeout(processPopupQueue, 400);
});

// Close popup on overlay click too
$("shotPopup").addEventListener("click", (e) => {
  if (e.target === $("shotPopup")) {
    $("shotPopup").classList.remove("active");
    setTimeout(processPopupQueue, 400);
  }
});

// Map listeners
$("viewMapBtn")?.addEventListener("click", () => {
  $("mapImage").src = `Skyrup_${currentHole}.png`;
  $("mapPopup").classList.add("active");
});
$("mapDismiss")?.addEventListener("click", () => {
  $("mapPopup").classList.remove("active");
});
$("mapPopup")?.addEventListener("click", (e) => {
  if (e.target === $("mapPopup")) $("mapPopup").classList.remove("active");
});

// Init
updateCourseUI();
