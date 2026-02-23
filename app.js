let score = 0;
let streak = 0;
let correctAnswer = 0;

const qEl = document.getElementById("question");
const cEl = document.getElementById("choices");
const scoreEl = document.getElementById("score");
const streakEl = document.getElementById("streak");

function rand(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}

function newQuestion(){
  const a = rand(0,20);
  const b = rand(0,20);
  const type = Math.random() < 0.5 ? "+" : "-";

  let x = a;
  let y = b;

  if(type === "-" && a < b){
    x = b;
    y = a;
  }

  correctAnswer = type === "+" ? x + y : x - y;

  qEl.textContent = `${x} ${type} ${y} = ?`;

  generateChoices();
}

function generateChoices(){
  cEl.innerHTML = "";

  let answers = new Set();
  answers.add(correctAnswer);

  while(answers.size < 4){
    answers.add(correctAnswer + rand(-5,5));
  }

  answers = Array.from(answers).sort(() => Math.random()-0.5);

  answers.forEach(val=>{
    const btn = document.createElement("button");
    btn.textContent = val;
    btn.onclick = ()=>checkAnswer(val);
    cEl.appendChild(btn);
  });
}

function checkAnswer(val){
  if(val === correctAnswer){
    score += 10 + streak;
    streak++;
  }else{
    streak = 0;
    score -= 5;
    if(score < 0) score = 0;
  }

  scoreEl.textContent = score;
  streakEl.textContent = streak;

  newQuestion();
}

function saveStudent(){
  const name = document.getElementById("studentName").value;
  if(name){
    localStorage.setItem("student", name);
  }
}

function loadStudent(){
  const name = localStorage.getItem("student");
  if(name){
    document.getElementById("studentName").value = name;
  }
}

loadStudent();
newQuestion();
