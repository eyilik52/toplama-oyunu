// =====================
// Hızlı Toplama (MVP+)
// - Toplama 0-10
// - Öğrenci seçimi
// - Günlük oyun (60 sn)
// - Günlük seri + çarpan
// - Sıralama: bugün / hafta / tüm zamanlar
// =====================

// ---- Storage anahtarları
const LS = {
  students: "ht_students_v1",
  active: "ht_active_student_v1",
  stats: "ht_stats_v1",
  teacher: "ht_teacher_mode_v1"
};

// ---- Varsayılan öğrenciler (ilk kurulum)
const DEFAULT_STUDENTS = ["Ali", "Ayşe", "Mehmet", "Zeynep", "Efe", "Elif"];

// ---- Oyun ayarları
const GAME_SECONDS = 60;
const ADD_MIN = 0;
const ADD_MAX = 10;

// ---- DOM
const elStudentLine = document.getElementById("studentLine");
const elDailyStreak = document.getElementById("dailyStreak");
const elMultiplier = document.getElementById("multiplier");

const elTimeLeft = document.getElementById("timeLeft");
const elStreak = document.getElementById("streak");
const elTodayScore = document.getElementById("todayScore");

const elQuestion = document.getElementById("question");
const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("msg");

const elCorrect = document.getElementById("correct");
const elWrong = document.getElementById("wrong");
const elAllTimeScore = document.getElementById("allTimeScore");

const overlay = document.getElementById("overlay");
const studentGrid = document.getElementById("studentGrid");
const newStudentName = document.getElementById("newStudentName");
const elTeacherState = document.getElementById("teacherState");
const leaderBody = document.getElementById("leaderBody");

// ---- Buttons
const startBtn = document.getElementById("startBtn");
const newBtn = document.getElementById("newBtn");
const changeStudentBtn = document.getElementById("changeStudentBtn");
const resetStudentBtn = document.getElementById("resetStudentBtn");
const teacherBtn = document.getElementById("teacherBtn");
const exportBtn = document.getElementById("exportBtn");

const addStudentBtn = document.getElementById("addStudentBtn");
const closeOverlayBtn = document.getElementById("closeOverlayBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

// ---- Tabs
const tabs = [...document.querySelectorAll(".tab")];

// ---- Runtime durum
let activeStudent = null;

let running = false;
let locked = false;
let timer = null;
let timeLeft = GAME_SECONDS;

let qA = 0, qB = 0, correctAnswer = 0;

let correct = 0, wrong = 0;
let streak = 0;
let sessionScore = 0;  // Bu oturum (60sn)
let todayScore = 0;    // Bugün (en iyi günlük skor)

// ----------------------
// Yardımcılar
// ----------------------
function todayISO(){
  // cihaz yerel tarihini kullanır; GitHub Pages için yeterli
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function toDateObj(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d);
}
function daysDiff(aISO, bISO){
  const a = toDateObj(aISO);
  const b = toDateObj(bISO);
  const ms = 24*60*60*1000;
  return Math.round((b - a)/ms);
}

function randInt(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function setMsg(text, type){
  elMsg.textContent = text || "";
  elMsg.className = "msg" + (type ? " " + type : "");
}

// ----------------------
// Storage
// ----------------------
function loadStudents(){
  const raw = localStorage.getItem(LS.students);
  if(!raw){
    localStorage.setItem(LS.students, JSON.stringify(DEFAULT_STUDENTS));
    return [...DEFAULT_STUDENTS];
  }
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length) return arr;
  }catch{}
  return [...DEFAULT_STUDENTS];
}
function saveStudents(arr){
  localStorage.setItem(LS.students, JSON.stringify(arr));
}

function loadAllStats(){
  const raw = localStorage.getItem(LS.stats);
  if(!raw) return {};
  try{ return JSON.parse(raw) || {}; }catch{ return {}; }
}
function saveAllStats(obj){
  localStorage.setItem(LS.stats, JSON.stringify(obj));
}

function getStats(name){
  const all = loadAllStats();
  const s = all[name];
  if(s) return s;
  // ilk defa
  return {
    correct: 0,
    wrong: 0,
    allTimeScore: 0,

    // günlük seri
    dailyStreak: 0,
    lastPlayDate: null, // YYYY-MM-DD

    // skor kayıtları
    dailyScores: {} // {"YYYY-MM-DD": number}
  };
}
function setStats(name, stats){
  const all = loadAllStats();
  all[name] = stats;
  saveAllStats(all);
}

function loadActiveStudent(){
  return localStorage.getItem(LS.active);
}
function saveActiveStudent(name){
  localStorage.setItem(LS.active, name);
}

function isTeacherMode(){
  return localStorage.getItem(LS.teacher) === "1";
}
function setTeacherMode(on){
  localStorage.setItem(LS.teacher, on ? "1" : "0");
}

// ----------------------
// Günlük seri ve çarpan
// ----------------------
function multiplierForStreak(ds){
  // basit kademeler: 1-2:1.0, 3-4:1.1, 5-6:1.2, 7+:1.3
  if(ds >= 7) return 1.3;
  if(ds >= 5) return 1.2;
  if(ds >= 3) return 1.1;
  return 1.0;
}

function ensureDailyStreak(stats){
  // Günlük seri güncellenmesi:
  // - Bugün oynadıysa değiştirme
  // - Dün oynadıysa +1
  // - Daha eskiyse 0/1'e dön (bugün ilk oyun olduğunda)
  const t = todayISO();
  if(!stats.lastPlayDate) return;

  const diff = daysDiff(stats.lastPlayDate, t);
  if(diff <= 0) return;   // bugün veya gelecekte (normalde olmaz)
  if(diff === 1) return;  // dün oynamış, bugün oynayınca artıracağız
  // 2+ gün ara verdiyse seri zaten kırılacak; bugün ilk oyunda ayarlarız
}

// ----------------------
// UI güncelleme
// ----------------------
function renderHeaderAndStats(){
  if(!activeStudent){
    elStudentLine.textContent = "Öğrenci: -";
    elDailyStreak.textContent = "0";
    elMultiplier.textContent = "x1.0";
    return;
  }
  const s = getStats(activeStudent);
  ensureDailyStreak(s);

  elStudentLine.textContent = `Öğrenci: ${activeStudent}`;
  elDailyStreak.textContent = String(s.dailyStreak || 0);
  elMultiplier.textContent = `x${multiplierForStreak(s.dailyStreak || 0).toFixed(1)}`;

  elCorrect.textContent = String(s.correct || 0);
  elWrong.textContent = String(s.wrong || 0);
  elAllTimeScore.textContent = String(s.allTimeScore || 0);

  // Bugün puanı
  const t = todayISO();
  todayScore = Number((s.dailyScores && s.dailyScores[t]) || 0);
  elTodayScore.textContent = String(todayScore);
}

function renderGameHUD(){
  elTimeLeft.textContent = String(timeLeft);
  elStreak.textContent = String(streak);
}

function setRunningUI(on){
  running = on;
  startBtn.textContent = on ? "Bitir" : "Başlat";
}

// ----------------------
// Öğrenci overlay
// ----------------------
function openOverlay(){
  overlay.classList.add("show");
  renderStudentList();
  newStudentName.value = "";
  newStudentName.focus();
  elTeacherState.textContent = isTeacherMode() ? "Açık" : "Kapalı";
}
function closeOverlay(){
  overlay.classList.remove("show");
}

function renderStudentList(){
  const students = loadStudents();
  const all = loadAllStats();

  studentGrid.innerHTML = "";

  students.forEach(name => {
    const s = all[name] || getStats(name);
    const t = todayISO();
    const today = Number((s.dailyScores && s.dailyScores[t]) || 0);
    const ds = Number(s.dailyStreak || 0);

    const btn = document.createElement("button");
    btn.className = "studentBtn";
    btn.innerHTML = `${name}<small>Bugün: ${today} • Günlük seri: ${ds} • Toplam: ${s.allTimeScore || 0}</small>`;
    btn.addEventListener("click", () => {
      activeStudent = name;
      saveActiveStudent(name);
      closeOverlay();
      resetSessionSoft();
      renderHeaderAndStats();
      renderGameHUD();
      renderLeaderboard(currentTabKey());
      newQuestion();
    });

    // Öğretmen modunda sil butonu ekle
    if(isTeacherMode()){
      const del = document.createElement("button");
      del.className = "smallbtn";
      del.style.marginTop = "8px";
      del.textContent = "Sil";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteStudent(name);
      });
      const wrap = document.createElement("div");
      wrap.appendChild(btn);
      wrap.appendChild(del);
      studentGrid.appendChild(wrap);
    }else{
      studentGrid.appendChild(btn);
    }
  });
}

function addStudent(){
  const name = (newStudentName.value || "").trim();
  if(!name) return;

  const students = loadStudents();
  if(students.includes(name)){
    setMsg("Bu isim zaten var.", "bad");
    return;
  }
  students.push(name);
  saveStudents(students);

  // boş stats oluştur (ilk görünüm için)
  setStats(name, getStats(name));

  newStudentName.value = "";
  renderStudentList();
}

function deleteStudent(name){
  if(!isTeacherMode()){
    alert("Silmek için Öğretmen Modu gerekli.");
    return;
  }
  if(!confirm(`${name} silinsin mi? (Skorlar da silinir)`)) return;

  const students = loadStudents().filter(x => x !== name);
  saveStudents(students);

  const all = loadAllStats();
  delete all[name];
  saveAllStats(all);

  if(activeStudent === name){
    activeStudent = null;
    localStorage.removeItem(LS.active);
    stopGame();
    resetSessionSoft();
    renderHeaderAndStats();
  }

  renderStudentList();
  renderLeaderboard(currentTabKey());
}

function clearAllData(){
  if(!isTeacherMode()){
    alert("Tüm kayıtları silmek için Öğretmen Modu gerekli.");
    return;
  }
  if(!confirm("Tüm öğrencilerin kayıtları silinsin mi?")) return;

  localStorage.removeItem(LS.stats);
  localStorage.removeItem(LS.active);

  activeStudent = null;
  stopGame();
  resetSessionSoft();

  renderHeaderAndStats();
  renderStudentList();
  renderLeaderboard(currentTabKey());
}

// ----------------------
// Oyun mantığı
// ----------------------
function resetSessionSoft(){
  // Oturum skorları sıfırlanır, öğrencinin toplamları silinmez.
  running = false;
  locked = false;
  timeLeft = GAME_SECONDS;
  streak = 0;
  correct = 0;
  wrong = 0;
  sessionScore = 0;
  setRunningUI(false);
  setMsg("", "");
  renderGameHUD();
}

function startGame(){
  if(!activeStudent){
    openOverlay();
    return;
  }
  resetSessionSoft();
  setRunningUI(true);
  running = true;

  timer = setInterval(() => {
    timeLeft--;
    renderGameHUD();
    if(timeLeft <= 0){
      finishGame();
    }
  }, 1000);

  newQuestion();
}

function stopGame(){
  if(timer){
    clearInterval(timer);
    timer = null;
  }
  setRunningUI(false);
  running = false;
  locked = false;
}

function finishGame(){
  stopGame();
  // Günlük oyun bitti: bugün için "en iyi skor" güncellenir (çarpanlı günlük skor)
  if(!activeStudent) return;

  const s = getStats(activeStudent);
  const t = todayISO();

  // Günlük seri güncelle
  if(!s.lastPlayDate){
    s.dailyStreak = 1;
  }else{
    const diff = daysDiff(s.lastPlayDate, t);
    if(diff === 0){
      // bugün zaten oynadı: seri aynı (günlük seri sadece gün değişince artar)
    }else if(diff === 1){
      s.dailyStreak = (s.dailyStreak || 0) + 1;
    }else{
      s.dailyStreak = 1;
    }
  }
  s.lastPlayDate = t;

  const mult = multiplierForStreak(s.dailyStreak || 0);
  const finalScore = Math.round(sessionScore * mult);

  // Bugünkü skor: en iyisi kalsın
  const prev = Number((s.dailyScores && s.dailyScores[t]) || 0);
  if(!s.dailyScores) s.dailyScores = {};
  s.dailyScores[t] = Math.max(prev, finalScore);

  // Toplam puan: sadece "finalScore" kadar eklemek yerine,
  // deneme sürümünde basit kural: finalScore'u toplam puana ekle.
  // (İstersen daha adil: sadece önceki en iyi ile farkı ekleriz.)
  s.allTimeScore = Number(s.allTimeScore || 0) + finalScore;

  // doğru/yanlış toplamları
  s.correct = Number(s.correct || 0) + correct;
  s.wrong = Number(s.wrong || 0) + wrong;

  setStats(activeStudent, s);

  renderHeaderAndStats();
  renderLeaderboard(currentTabKey());

  setMsg(`Süre bitti! Oturum: ${sessionScore} • Çarpanlı: ${finalScore}`, "good");
}

function newQuestion(){
  if(!activeStudent){
    elQuestion.textContent = "-";
    elChoices.innerHTML = "";
    return;
  }

  locked = false;
  setMsg("", "");

  qA = randInt(ADD_MIN, ADD_MAX);
  qB = randInt(ADD_MIN, ADD_MAX);
  correctAnswer = qA + qB;

  elQuestion.textContent = `${qA} + ${qB} = ?`;
  renderChoices(buildChoices(correctAnswer));
}

function buildChoices(ans){
  // 4 seçenek: doğru + 3 çeldirici (yakın değerler)
  const set = new Set([ans]);
  while(set.size < 4){
    const delta = randInt(-3, 3);
    if(delta === 0) continue;
    const v = clamp(ans + delta, 0, 20);
    set.add(v);
  }
  return shuffle([...set]);
}

function renderChoices(values){
  elChoices.innerHTML = "";
  values.forEach(v => {
    const b = document.createElement("button");
    b.textContent = String(v);
    b.addEventListener("click", () => pickAnswer(v, b));
    elChoices.appendChild(b);
  });
}

function lockChoices(){
  locked = true;
  [...elChoices.querySelectorAll("button")].forEach(b => b.disabled = true);
}
function markChoices(picked){
  [...elChoices.querySelectorAll("button")].forEach(b => {
    const v = Number(b.textContent);
    if(v === correctAnswer) b.classList.add("good");
    if(v === picked && picked !== correctAnswer) b.classList.add("bad");
  });
}

function pickAnswer(v, btn){
  if(!running){
    setMsg("Önce Başlat.", "bad");
    return;
  }
  if(locked) return;

  if(v === correctAnswer){
    // puan: doğru 10 + seri bonus
    // seri bonus: 3->+1, 5->+2, 8+->+3
    streak++;
    const bonus = streak >= 8 ? 3 : (streak >= 5 ? 2 : (streak >= 3 ? 1 : 0));
    sessionScore += (10 + bonus);
    correct++;
    setMsg("Doğru!", "good");
    btn.classList.add("good");
    lockChoices();
    renderGameHUD();
    setTimeout(newQuestion, 450);
  }else{
    wrong++;
    streak = 0;
    sessionScore = Math.max(0, sessionScore - 5);
    setMsg(`Yanlış. Doğru: ${correctAnswer}`, "bad");
    lockChoices();
    markChoices(v);
    renderGameHUD();
    setTimeout(newQuestion, 850);
  }
}

// ----------------------
// Sıralama
// ----------------------
function currentTabKey(){
  const t = tabs.find(x => x.classList.contains("active"));
  return t ? t.dataset.tab : "today";
}
function setActiveTab(key){
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === key));
  renderLeaderboard(key);
}

function weekRangeISOs(){
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Pazartesi=0
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const list = [];
  for(let i=0;i<7;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    list.push(`${y}-${m}-${dd}`);
  }
  return list;
}

function scoreForTab(stats, tabKey){
  const t = todayISO();
  if(tabKey === "today"){
    return Number((stats.dailyScores && stats.dailyScores[t]) || 0);
  }
  if(tabKey === "week"){
    const days = weekRangeISOs();
    let sum = 0;
    days.forEach(d => { sum += Number((stats.dailyScores && stats.dailyScores[d]) || 0); });
    return sum;
  }
  // all
  return Number(stats.allTimeScore || 0);
}

function renderLeaderboard(tabKey){
  const students = loadStudents();
  const all = loadAllStats();
  const rows = students.map(name => {
    const s = all[name] || getStats(name);
    return {
      name,
      score: scoreForTab(s, tabKey),
      streak: Number(s.dailyStreak || 0)
    };
  }).sort((a,b) => (b.score - a.score) || (b.streak - a.streak) || a.name.localeCompare(b.name,"tr"));

  leaderBody.innerHTML = "";
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${i+1}</b></td>
      <td>${escapeHtml(r.name)}${activeStudent === r.name ? " <span style='opacity:.7'>(sen)</span>" : ""}</td>
      <td><b>${r.score}</b></td>
      <td><b>${r.streak}</b></td>
    `;
    leaderBody.appendChild(tr);
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ----------------------
// Öğretmen modu + rapor
// ----------------------
function toggleTeacherMode(){
  const on = isTeacherMode();
  if(on){
    setTeacherMode(false);
    elTeacherState.textContent = "Kapalı";
    alert("Öğretmen Modu kapatıldı.");
    return;
  }
  const pin = prompt("Öğretmen PIN (deneme): 1234");
  if(pin === "1234"){
    setTeacherMode(true);
    elTeacherState.textContent = "Açık";
    alert("Öğretmen Modu açıldı. (Silme/Toplu işlemler aktif)");
  }else{
    alert("PIN yanlış.");
  }
  // overlay açıksa listeyi yenile
  if(overlay.classList.contains("show")){
    renderStudentList();
  }
}

function resetActiveStudentData(){
  if(!activeStudent){
    openOverlay();
    return;
  }
  if(!confirm(`${activeStudent} için tüm kayıtlar sıfırlansın mı?`)) return;

  const all = loadAllStats();
  all[activeStudent] = {
    correct: 0,
    wrong: 0,
    allTimeScore: 0,
    dailyStreak: 0,
    lastPlayDate: null,
    dailyScores: {}
  };
  saveAllStats(all);

  stopGame();
  resetSessionSoft();
  renderHeaderAndStats();
  renderLeaderboard(currentTabKey());
  setMsg("Bu öğrenci sıfırlandı.", "good");
}

function exportReport(){
  const tabKey = currentTabKey();
  const students = loadStudents();
  const all = loadAllStats();
  const t = todayISO();
  const days = weekRangeISOs();

  const lines = [];
  lines.push(`Rapor (${tabKey}) - Tarih: ${t}`);
  lines.push(`Uygulama: Hızlı Toplama (0-10)`);
  lines.push(`Yazılımcı: Hakkı EYİLİK`);
  lines.push("");

  students.forEach(name => {
    const s = all[name] || getStats(name);
    const today = Number((s.dailyScores && s.dailyScores[t]) || 0);
    let week = 0;
    days.forEach(d => week += Number((s.dailyScores && s.dailyScores[d]) || 0));
    const alltime = Number(s.allTimeScore || 0);
    const ds = Number(s.dailyStreak || 0);
    lines.push(`${name} | Bugün:${today} | Hafta:${week} | Toplam:${alltime} | GünlükSeri:${ds} | D/Y:${s.correct||0}/${s.wrong||0}`);
  });

  const text = lines.join("\n");
  navigator.clipboard?.writeText(text)
    .then(() => alert("Rapor panoya kopyalandı."))
    .catch(() => alert("Kopyalanamadı. Tarayıcı izin vermedi."));

  // ayrıca ekrana da bas
  console.log(text);
}

// ----------------------
// Event bağlama
// ----------------------
startBtn.addEventListener("click", () => {
  if(running) finishGame();
  else startGame();
});
newBtn.addEventListener("click", () => newQuestion());
changeStudentBtn.addEventListener("click", openOverlay);
resetStudentBtn.addEventListener("click", resetActiveStudentData);

teacherBtn.addEventListener("click", toggleTeacherMode);
exportBtn.addEventListener("click", exportReport);

addStudentBtn.addEventListener("click", addStudent);
newStudentName.addEventListener("keydown", (e) => { if(e.key === "Enter") addStudent(); });
closeOverlayBtn.addEventListener("click", closeOverlay);
overlay.addEventListener("click", (e) => { if(e.target === overlay) closeOverlay(); });

clearAllBtn.addEventListener("click", clearAllData);

tabs.forEach(t => t.addEventListener("click", () => setActiveTab(t.dataset.tab)));

// ----------------------
// Init
// ----------------------
(function init(){
  // teacher default off
  if(localStorage.getItem(LS.teacher) == null) setTeacherMode(false);

  // ensure students
  const students = loadStudents();
  if(!students.length) saveStudents([...DEFAULT_STUDENTS]);

  activeStudent = loadActiveStudent();
  if(activeStudent && !loadStudents().includes(activeStudent)){
    activeStudent = null;
    localStorage.removeItem(LS.active);
  }

  renderHeaderAndStats();
  renderGameHUD();
  renderLeaderboard("today");

  if(!activeStudent){
    openOverlay();
  }else{
    newQuestion();
  }
})();
