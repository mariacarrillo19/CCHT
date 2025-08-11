
// Shuffling helper
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}

// Storage (safe)
function storageAvailable(){try{const x='__t__';localStorage.setItem(x,x);localStorage.removeItem(x);return true}catch(e){return false}}
const STORAGE_OK = storageAvailable();
const store={get:(k,f)=>{if(!STORAGE_OK)return f;try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},
             set:(k,v)=>{if(!STORAGE_OK)return;try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};

const $=sel=>document.querySelector(sel), $$=sel=>Array.from(document.querySelectorAll(sel));
function secondsToMMSS(s){const m=Math.floor(s/60),ss=('0'+(s%60)).slice(-2);return `${m}:${ss}`}

const WRONG_KEY='ccht_wrong_v5', STATS_KEY='ccht_stats_v5', HIST_KEY='ccht_hist_v5', PERF_KEY='ccht_perf_v5';

let wrongSet=new Set(store.get(WRONG_KEY,[]));
let stats=store.get(STATS_KEY,{answeredToday:0});
let history=store.get(HIST_KEY,[]);
// performance by section/topic
let perf=store.get(PERF_KEY,{}); // perf[section][topic] = {right,total}

let session=null;
let answeredThis=false; // NEW: track if user answered the current question

function ensurePerf(sec,topic){
  if(!perf[sec]) perf[sec]={};
  if(!perf[sec][topic]) perf[sec][topic]={right:0,total:0};
}

function refreshKPIs(){
  $('#todayKpi').textContent=String(stats.answeredToday||0);
  $('#weakKpi').textContent=String(wrongSet.size||0);
  const last=history[history.length-1]; $('#bestKpi').textContent= last? `${Math.round((last.score||0)*100)}%` : '—';
}

function pickQuestions(mode){
  const pool = shuffle(QUESTIONS.slice()); // shuffle questions
  // Shuffle choices within each question for variety
  pool.forEach(q=>{
    const zipped = q.choices.map((c,i)=>({c,i}));
    shuffle(zipped);
    q._choices = zipped.map(z=>z.c);
    q._answer = zipped.findIndex(z=>z.i===q.answer);
  });
  if(mode==='daily') return pool.slice(0,10);
  if(mode==='practice') return pool.slice(0,30);
  if(mode==='hard') return pool.slice(0,60);
  if(mode==='exam'){ // need 150; recycle if small
    const need=150; const out=[];
    while(out.length<need){ out.push(...shuffle(pool)); }
    return out.slice(0,need);
  }
  if(mode==='booster'){
    // pick weakest section/topics
    const tuples=[];
    for(const sec in perf){
      for(const topic in perf[sec]){
        const v=perf[sec][topic]; const pct = v.total? v.right/v.total : 0;
        tuples.push({sec,topic,pct,total:v.total});
      }
    }
    if(!tuples.length){ alert('No history yet — do a session first.'); return null; }
    tuples.sort((a,b)=>a.pct-b.pct || a.total-b.total);
    const targets=tuples.slice(0,3);
    const filtered = pool.filter(q=> targets.some(t=>t.sec===q.sec && t.topic===q.topic) );
    return filtered.slice(0,30);
  }
  return pool.slice(0,10);
}

function startSession({mode, timeLimit=null, showImmediate=true}){
  const list = pickQuestions(mode);
  if(!list) return;
  session={mode,list,index:0,answers:[],start:Date.now(),timeLimit,ended:false,showImmediate};
  $('#home').classList.add('hide'); $('#results').classList.add('hide'); $('#quiz').classList.remove('hide');
  $('#modePill').textContent=mode.toUpperCase();
  $('#qTotal').textContent=String(list.length);
  $('#timer').textContent=timeLimit?secondsToMMSS(timeLimit):'—';
  $('#catPill').textContent='Mix';
  showCurrent();
  if(timeLimit){
    const tick=()=>{
      if(!session||session.ended)return;
      const left=timeLimit-Math.floor((Date.now()-session.start)/1000);
      $('#timer').textContent=secondsToMMSS(Math.max(0,left));
      if(left<=0){ finishSession(true); } else setTimeout(tick,1000);
    }; tick();
  }
}

function showCurrent(){
  answeredThis=false; // reset for new question
  const nextBtn = document.getElementById('btnNext');
  nextBtn.disabled = true;              // lock Next until answered
  nextBtn.style.opacity = 0.6;

  const q=session.list[session.index];
  $('#qNum').textContent=String(session.index+1);
  $('#bar').style.width=((session.index)/session.list.length*100)+'%';
  const area=$('#qArea'); area.innerHTML='';
  const card=document.createElement('div');
  const choicesArr = (q._choices||q.choices);
  const choicesHtml = choicesArr.map((c,i)=>`<div class="choice" data-i="${i}" role="button" tabindex="0"><div class="badge">${String.fromCharCode(65+i)}</div><div>${c}</div></div>`).join('');
  card.innerHTML=`
    <div class="q-stem">${q.stem} <span class="pill" style="margin-left:6px">${q.sec}</span> <span class="pill" style="margin-left:6px">${q.topic}</span></div>
    ${choicesHtml}
    <div class="explain small ${session.showImmediate?'hide':''}" id="explain">
      <div><b>Why:</b> ${q.why}</div>
      <div><b>Terms:</b> ${q.terms}</div>
      <div><b>Why others are wrong:</b><ul class="compact">${
        (q.wrong||[]).map(w=>`<li>${w}</li>`).join('')
      }</ul></div>
      <div><b>Memory tip:</b> ${q.tip}</div>
    </div>`;
  area.appendChild(card);
  const status=document.createElement('div'); status.id='status'; status.className='small muted'; status.style.marginTop='6px';
  status.textContent = 'Select an answer to see the explanation, then tap Next.';
  if(!session.showImmediate) status.textContent = 'Practice exam mode — answers/explanations at the end.';
  area.appendChild(status);

  // Click handler
  $$('#qArea .choice').forEach(ch=>ch.addEventListener('click',()=>{
    if(ch.classList.contains('locked')) return;
    const pick=Number(ch.dataset.i);
    const correctIndex = (q._answer!=null)? q._answer : q.answer;
    $$('#qArea .choice').forEach((n,i)=>{ n.classList.add('locked'); if(i===correctIndex) n.classList.add('correct'); if(i===pick && i!==correctIndex) n.classList.add('incorrect'); });
    const correct = pick===correctIndex;

    stats.answeredToday+=1; store.set(STATS_KEY, stats);
    if(!perf[q.sec]) perf[q.sec]={}; if(!perf[q.sec][q.topic]) perf[q.sec][q.topic]={right:0,total:0};
    perf[q.sec][q.topic].total += 1; if(correct) perf[q.sec][q.topic].right += 1; store.set(PERF_KEY, perf);
    if(!correct) wrongSet.add(q.id); else wrongSet.delete(q.id); store.set(WRONG_KEY, Array.from(wrongSet));

    // Show explanation AFTER answering (for immediate-feedback modes)
    if(session.showImmediate){
      $('#explain').classList.remove('hide');
      $('#status').innerHTML = correct ? '✅ Correct' : `❌ Incorrect · Correct is <b>${String.fromCharCode(65+correctIndex)}</b>`;
    }else{
      $('#status').textContent='Answer recorded. Move on — explanations at the end.';
    }

    session.answers.push({id:q.id,pick,correct});
    answeredThis=true;
    nextBtn.disabled = false;           // enable Next
    nextBtn.style.opacity = 1;
  }));

  // Keyboard accessibility (Enter to select)
  $$('#qArea .choice').forEach(ch=>ch.addEventListener('keydown',(e)=>{
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); ch.click(); }
  }));
}

function nextQuestion(){
  if(!session) return;
  if(!answeredThis){
    alert('Please select an answer first.');
    return;
  }
  if(session.index < session.list.length-1){ session.index++; showCurrent(); }
  else { finishSession(false); }
}

function finishSession(timeUp){
  session.ended=true;
  const seconds = Math.floor((Date.now()-session.start)/1000);
  const correct = session.answers.filter(a=>a.correct).length;
  const total = session.list.length;
  const score = correct/total;
  history.push({mode:session.mode,score,time:seconds,total,when:Date.now()}); store.set(HIST_KEY, history);

  $('#quiz').classList.add('hide'); $('#results').classList.remove('hide');
  $('#scoreLine').textContent = `Score: ${Math.round(score*100)}% (${correct}/${total}) ${timeUp?'· Time up':''}`;
  $('#kCorrect').textContent = `${correct}/${total}`; $('#kTime').textContent=secondsToMMSS(seconds); $('#kMode').textContent=session.mode;

  // Section/topic breakdown
  const bySec = {}; const byTopic = {};
  session.list.forEach((q,i)=>{
    const a=session.answers[i]; if(!a) return;
    if(!bySec[q.sec]) bySec[q.sec]={r:0,t:0};
    if(!byTopic[q.topic]) byTopic[q.topic]={r:0,t:0};
    bySec[q.sec].t++; if(a.correct) bySec[q.sec].r++;
    byTopic[q.topic].t++; if(a.correct) byTopic[q.topic].r++;
  });
  const secWrap=$('#bySection'); secWrap.innerHTML='<h3 style="margin-top:12px">Section Breakdown</h3>';
  Object.keys(bySec).forEach(s=>{
    const pct = Math.round(bySec[s].r/bySec[s].t*100);
    const div=document.createElement('div'); div.className='small'; div.innerHTML=`<div class="badge">${s}</div> <b>${pct}%</b> (${bySec[s].r}/${bySec[s].t})`; secWrap.appendChild(div);
  });
  const topicWrap=$('#byTopic'); topicWrap.innerHTML='<h3 style="margin-top:12px">Topic Breakdown</h3>';
  Object.keys(byTopic).forEach(t=>{
    const pct = Math.round(byTopic[t].r/byTopic[t].t*100);
    const div=document.createElement('div'); div.className='small'; div.innerHTML=`<div class="badge">${t}</div> <b>${pct}%</b> (${byTopic[t].r}/${byTopic[t].t})`; topicWrap.appendChild(div);
  });

  renderHistory();

  // Review section with explanations (for exam mode only)
  if(!session.showImmediate){
    const review=document.createElement('div'); review.style.marginTop='14px';
    review.innerHTML = '<h3>Review & Explanations</h3>';
    session.list.forEach((q,i)=>{
      const a=session.answers[i];
      const correctIndex = (q._answer!=null)? q._answer : q.answer;
      const tag = a && a.correct ? '✅' : '❌';
      const block=document.createElement('div'); block.className='explain small';
      const choices = (q._choices||q.choices);
      block.innerHTML = `<div style="margin:6px 0"><b>${tag} Q${i+1}.</b> ${q.stem}</div>
                         <div><b>Answer:</b> ${String.fromCharCode(65+correctIndex)} — ${choices[correctIndex]}</div>
                         <div><b>Why:</b> ${q.why}</div>
                         <div><b>Terms:</b> ${q.terms}</div>
                         <div><b>Why others are wrong:</b><ul class="compact">${
                           (q.wrong||[]).map(w=>`<li>${w}</li>`).join('')
                         }</ul></div>
                         <div><b>Memory tip:</b> ${q.tip}</div>`;
      $('#results').appendChild(block);
    });
  }

  session=null; refreshKPIs();
}

function goHome(){ $('#results').classList.add('hide'); $('#home').classList.remove('hide'); }
function retry(){ goHome(); }

// History list
function renderHistory(){
  const wrap=document.getElementById('histList'); if(!wrap) return; wrap.innerHTML='';
  history.slice().reverse().slice(0,8).forEach(h=>{
    const div=document.createElement('div'); div.className='item';
    div.innerHTML=`<div class="badge">${h.mode}</div>
      <div style="font-weight:700;margin-top:6px">${new Date(h.when).toLocaleString()}</div>
      <div class="small">Score: <b>${Math.round((h.score||0)*100)}%</b> · Time: ${secondsToMMSS(h.time||0)} · Qs: ${h.total}</div>`;
    wrap.appendChild(div);
  });
}

// Wire buttons
document.getElementById('btnDaily').addEventListener('click',()=> startSession({mode:'daily', timeLimit:null, showImmediate:true}));
document.getElementById('btnPractice').addEventListener('click',()=> startSession({mode:'practice', timeLimit:null, showImmediate:true}));
document.getElementById('btnHard').addEventListener('click',()=> startSession({mode:'hard', timeLimit: 60*60, showImmediate:true}));
document.getElementById('btnExam').addEventListener('click',()=> startSession({mode:'exam', timeLimit: 150*60, showImmediate:false}));
document.getElementById('btnBooster').addEventListener('click',()=>{
  const list = pickQuestions('booster'); if(!list){return;}
  session={mode:'booster',list,index:0,answers:[],start:Date.now(),timeLimit:null,ended:false,showImmediate:true};
  $('#home').classList.add('hide'); $('#results').classList.add('hide'); $('#quiz').classList.remove('hide');
  $('#modePill').textContent='BOOSTER'; $('#qTotal').textContent=String(list.length); $('#timer').textContent='—'; $('#catPill').textContent='Weak Spots';
  showCurrent();
});

refreshKPIs();

// Hook Next button
document.getElementById('btnNext').addEventListener('click', nextQuestion);
