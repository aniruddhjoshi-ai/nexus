const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};

/* ---------- navigation ---------- */
function go(v){
  $$('.view').forEach(x=>x.classList.toggle('active',x.id==='v-'+v));
  $$('.tab[data-v]').forEach(x=>x.classList.toggle('active',x.dataset.v===v));
  scrollTo(0,0);
}
$$('.tab[data-v]').forEach(t=>t.onclick=()=>go(t.dataset.v));

/* ---------- AI call (goes through the secure Netlify function) ---------- */
async function ask(system,messages,opts={}){
  let r;
  try{
    r=await fetch('/.netlify/functions/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system,messages,image:opts.image||null,json:!!opts.json})});
  }catch(e){throw new Error('PROBLEM: could not reach the server (no internet, or the page was opened as a plain file). FIX: check your connection and use the published Netlify link, not the downloaded file.')}
  let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){
    if(d&&d.error)throw new Error(d.error+(d.detail?'\n\nDetails: '+d.detail:''));
    if(r.status===404)throw new Error('PROBLEM: the backend was not found (error 404). FIX: make sure the file is at netlify/functions/chat.js in GitHub and that you are using the Netlify link, then redeploy.');
    if(r.status===504||r.status===502)throw new Error('PROBLEM: the server took too long (error '+r.status+'). FIX: try again, or use a faster model as the main model.');
    throw new Error('PROBLEM: the server returned error '+r.status+'. FIX: check Netlify → Logs → Functions for details.');
  }
  if(!d||typeof d.text!=='string')throw new Error('PROBLEM: the server sent back something unexpected. FIX: check Netlify → Logs → Functions.');
  return d.text;
}

/* ---------- tiny markdown ---------- */
const esc=s=>s.replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
function md(t){
  return esc(t).replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>'<pre><code>'+c+'</code></pre>')
    .replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
}

/* ---------- speech ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null;
$$('.mic').forEach(b=>b.onclick=()=>{
  if(!SR){alert('Mic input needs Chrome, Edge or Safari.');return}
  if(rec){rec.stop();return}
  const target=document.getElementById(b.dataset.for);
  rec=new SR();rec.lang='en-US';rec.interimResults=true;rec.continuous=false;
  const base=target.value?target.value+' ':'';
  b.classList.add('on');
  rec.onresult=e=>{target.value=base+[...e.results].map(r=>r[0].transcript).join('')};
  rec.onend=()=>{b.classList.remove('on');rec=null};
  rec.onerror=()=>{b.classList.remove('on');rec=null};
  rec.start();
});
function speak(text,lang){
  if(!('speechSynthesis' in window))return;
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.replace(/[`*#]/g,''));if(lang)u.lang=lang;speechSynthesis.speak(u);
}


/* ---------- study level (shared by Solve + Study) ---------- */
const LEVELS=['Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','College / Undergraduate','Postgraduate','Beginner','Intermediate','Advanced','Expert'];
let level=(LS('level')||'').slice(0,80);
function syncLevel(){
  $$('.lvlsel').forEach(sel=>{
    sel.innerHTML='<option value="">📊 Level: not set (normal answers)</option>'+LEVELS.map(l=>`<option>${l}</option>`).join('')+'<option value="__other">✏️ Other (type my own)…</option>';
    const custom=level&&!LEVELS.includes(level);
    sel.value=custom?'__other':level;
    sel.nextElementSibling.style.display=custom?'block':'none';
    sel.nextElementSibling.value=custom?level:'';
  });
}
$$('.lvlsel').forEach(sel=>sel.onchange=()=>{
  const inp=sel.nextElementSibling;
  if(sel.value==='__other'){level='';inp.style.display='block';inp.focus();$$('.lvlsel').forEach(o=>{o.value='__other';o.nextElementSibling.style.display='block'});return}
  level=sel.value;LS('level',level);syncLevel();
});
$$('.lvlin').forEach(inp=>inp.oninput=()=>{level=inp.value.trim().slice(0,80);LS('level',level);$$('.lvlin').forEach(o=>{if(o!==inp)o.value=inp.value})});
syncLevel();
const lvlTxt=()=>level?(' The student\'s level is: "'+level+'". Match your explanations, vocabulary, depth and difficulty to this level.'):'';

/* ---------- personalities ---------- */
const PERSONAS={
 'Best Friend':'You are Nexus, a warm, casual best friend. Chatty, supportive and a little playful.',
 'Teacher':'You are Nexus, a patient teacher. Explain step by step with simple examples and check understanding.',
 'Coach':'You are Nexus, a high-energy motivational coach. Be direct, encouraging and push the user to take action.',
 'Strict Examiner':'You are Nexus, a strict examiner. Be formal and precise, point out mistakes bluntly and ask follow-up questions to test the user.',
 'Comedian':'You are Nexus, a witty comedian. Be funny, but still genuinely helpful and correct.'
};
let persona=LS('persona');if(!PERSONAS[persona])persona='Best Friend';
const sys=()=>PERSONAS[persona]+' Be clear and concise. Write math in plain text only: never use LaTeX, dollar signs or backslashes; use symbols like ×, ÷, ², √ and write fractions like 3/4. Do not use markdown headings (#); use short plain labels like "Step 1:" instead. You may use **bold**.';
$('#persona').innerHTML=Object.keys(PERSONAS).map(p=>`<option value="${p}">🎭 ${p}</option>`).join('');
$('#persona').value=persona;

/* ---------- chat (saved in this browser) ---------- */
const hist=[];
try{JSON.parse(LS('chat')||'[]').filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').slice(-40).forEach(m=>hist.push({role:m.role,content:m.content}))}catch(e){}
const saveChat=()=>LS('chat',JSON.stringify(hist.slice(-40)));
function addMsg(role,text){const d=document.createElement('div');d.className='msg '+role;d.innerHTML=md(text);$('#chatbox').appendChild(d);$('#chatbox').scrollTop=1e9;return d}
const greet=()=>addMsg('ai','Hey! 👋 I\'m Nexus. Ask me anything — type or tap the mic.');
if(hist.length)hist.forEach(m=>addMsg(m.role==='user'?'user':'ai',m.content));else greet();
async function sendChat(){
  const t=$('#chatin').value.trim();if(!t)return;$('#chatin').value='';
  addMsg('user',t);hist.push({role:'user',content:t});saveChat();
  const w=addMsg('ai','…');
  try{
    const h=hist.slice(-20);while(h.length&&h[0].role!=='user')h.shift();
    const a=await ask(sys(),h);hist.push({role:'assistant',content:a});saveChat();w.innerHTML=md(a)}
  catch(e){w.innerHTML=md('⚠️ '+e.message);hist.pop();saveChat()}
  $('#chatbox').scrollTop=1e9;
}
$('#persona').onchange=()=>{persona=$('#persona').value;LS('persona',persona);addMsg('ai','Switched to '+persona+' mode ✨')};
$('#newchat').onclick=()=>{if(hist.length&&!confirm('Start a new chat? This clears the current one.'))return;hist.length=0;saveChat();$('#chatbox').innerHTML='';greet()};
$('#chatsend').onclick=sendChat;
$('#chatin').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}});

/* ---------- solve ---------- */
let solveText='';
$('#solvego').onclick=async()=>{
  const q=$('#solvein').value.trim();if(!q)return;
  $('#solveout').textContent='Thinking…';
  try{solveText=await ask(sys()+lvlTxt()+' Solve the problem accurately. Show clear step-by-step working, then state the final answer on its own line. Double-check arithmetic.',[{role:'user',content:q}]);$('#solveout').innerHTML=md(solveText)}
  catch(e){$('#solveout').textContent='⚠️ '+e.message}
};
$('#solvespeak').onclick=()=>solveText&&speak(solveText);

/* ---------- code ---------- */
$('#runjs').onclick=()=>{
  const code=$('#codein').value;const con=$('#console');con.textContent='';
  const fr=$('#sandbox');
  const html='<script>const send=(t)=>parent.postMessage({nova:1,t},"*");'+
   'console.log=(...a)=>send(a.map(x=>typeof x==="object"?JSON.stringify(x):String(x)).join(" "));'+
   'console.error=(...a)=>send("Error: "+a.join(" "));'+
   'window.onerror=(m)=>send("Error: "+m);'+
   'try{'+code.replace(/<\/script>/gi,'<\\/script>')+'\n}catch(e){send("Error: "+e.message)}<\/script>';
  fr.srcdoc=html;
  setTimeout(()=>{if(!con.textContent)con.textContent='(no output — use console.log)'},800);
};
addEventListener('message',e=>{if(e.data&&e.data.nova){const c=$('#console');c.textContent+=(c.textContent?'\n':'')+e.data.t}});
async function codeAI(prompt){
  const code=$('#codein').value.trim();if(!code)return;
  const o=$('#codeout');o.style.display='block';o.textContent='Thinking…';
  try{o.innerHTML=md(await ask('You are an expert programmer and teacher. Detect the language automatically.',[{role:'user',content:prompt+'\n\n```\n'+code+'\n```'}]))}
  catch(e){o.textContent='⚠️ '+e.message}
}
$('#explain').onclick=()=>codeAI('Explain this code clearly, step by step, for a learner. Mention what it outputs.');
$('#debug').onclick=()=>codeAI('Find bugs or problems in this code and give a corrected version with a short explanation.');
