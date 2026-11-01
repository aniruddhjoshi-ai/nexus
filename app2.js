/* ---------- translate ---------- */
const LANGS={Hindi:'hi',Bengali:'bn',Tamil:'ta',Telugu:'te',Marathi:'mr',Gujarati:'gu',Kannada:'kn',Malayalam:'ml',Punjabi:'pa',Urdu:'ur',Spanish:'es',French:'fr',German:'de',Italian:'it',Portuguese:'pt',Russian:'ru',Japanese:'ja',Korean:'ko','Chinese (Simplified)':'zh-CN',Arabic:'ar',Turkish:'tr',Dutch:'nl',Swedish:'sv',Polish:'pl',Greek:'el',Thai:'th',Vietnamese:'vi',Indonesian:'id',Swahili:'sw',Hebrew:'he'};
$('#lang').innerHTML=Object.keys(LANGS).map(l=>`<option>${l}</option>`).join('')+'<option value="__other">Other (type below)…</option>';
$('#lang').onchange=()=>{if($('#lang').value==='__other'){const l=prompt('Which language?');if(l){LANGS[l]=LANGS[l]||'';const o=new Option(l,l);$('#lang').insertBefore(o,$('#lang').lastChild);$('#lang').value=l}}};
let trText='';
$('#trgo').onclick=async()=>{
  const t=$('#trin').value.trim();if(!t)return;const lang=$('#lang').value;
  $('#trout').textContent='Translating…';
  try{
    trText=(await ask('You are a professional translator. Translate the English text into '+lang+' accurately, preserving meaning, tone and formatting. Output ONLY the translation.',[{role:'user',content:t}])).trim();
    $('#trout').textContent=trText;
  }catch(e){$('#trout').textContent='⚠️ '+e.message}
};
$('#trspeak').onclick=()=>trText&&speak(trText,LANGS[$('#lang').value]);
$('#trcopy').onclick=()=>trText&&navigator.clipboard.writeText(trText);
/* ---------- snap & solve ---------- */
let snapImg=null;
$('#snaplang').innerHTML=Object.keys(LANGS).map(l=>`<option>${l}</option>`).join('');
$('#snapmode').onchange=()=>{$('#snaplang').style.display=$('#snapmode').value==='translate'?'block':'none'};
$('#snapfile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const img=new Image();const url=URL.createObjectURL(f);
  img.onload=()=>{
    const max=1280,sc=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const u=c.toDataURL('image/jpeg',0.82);
    snapImg={mime:'image/jpeg',data:u.split(',')[1]};
    $('#snapprev').src=u;$('#snapprev').style.display='block';URL.revokeObjectURL(url);
  };
  img.onerror=()=>{$('#snapout').textContent='⚠️ Could not read that image.'};
  img.src=url;
};
$('#snapgo').onclick=async()=>{
  if(!snapImg){$('#snapout').textContent='Please take or choose a photo first.';return}
  const m=$('#snapmode').value,extra=$('#snapin').value.trim();
  const task={solve:'Look at the image. Solve the question(s) in it accurately, step by step, and state the final answer clearly.',
    explain:'Look at the image and explain clearly what it shows and anything important in it.',
    translate:'Read all the text in the image and translate it into '+$('#snaplang').value+'. Show the translation clearly.'}[m];
  $('#snapout').textContent='Looking…';
  try{
    const a=await ask(sys()+' '+task,[{role:'user',content:(extra?'Extra details from the user: '+extra:'Please go ahead.')}],{image:snapImg});
    $('#snapout').innerHTML=md(a);
  }catch(e){$('#snapout').textContent='⚠️ '+e.message}
};

/* ---------- study mode ---------- */
let cards=[],ci=0,flip=false;
function renderCards(){
  const box=$('#fcbox');if(!box)return;
  const c=cards[ci];
  box.innerHTML=`<div class="fc" id="fc">${esc(flip?c.a:c.q)}</div>
   <p class="note" style="text-align:center">Card ${ci+1} of ${cards.length} • tap card to flip</p>
   <div class="row" style="justify-content:center"><button class="btn ghost" id="fprev">◀ Prev</button><button class="btn ghost" id="fnext">Next ▶</button></div>`;
  $('#fc').onclick=()=>{flip=!flip;renderCards()};
  $('#fprev').onclick=()=>{ci=(ci-1+cards.length)%cards.length;flip=false;renderCards()};
  $('#fnext').onclick=()=>{ci=(ci+1)%cards.length;flip=false;renderCards()};
}
function renderQuiz(quiz){
  const wrap=$('#quizbox');let score=0,done=0;
  wrap.innerHTML='<h3>📝 Quick quiz</h3><div id="score" class="note">Answer all questions to see your score.</div>';
  quiz.forEach((q,i)=>{
    const d=document.createElement('div');d.className='qb';
    d.innerHTML=`<b>${i+1}. ${esc(q.q)}</b>`+q.options.map((o,j)=>`<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')+'<div class="note why" style="margin-top:8px"></div>';
    d.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      if(d.dataset.done)return;d.dataset.done=1;done++;
      const j=+b.dataset.j,ok=j===q.answer;if(ok)score++;
      b.classList.add(ok?'good':'bad');
      if(!ok)d.querySelectorAll('.opt')[q.answer].classList.add('good');
      d.querySelector('.why').textContent=(ok?'✅ Correct. ':'❌ Not quite. ')+(q.why||'');
      if(done===quiz.length)$('#score').textContent=`🏆 You scored ${score} / ${quiz.length}`;
    });
    wrap.appendChild(d);
  });
}
$('#studygo').onclick=async()=>{
  const notes=$('#studyin').value.trim();if(!notes)return;
  const n=$('#studyn').value;const out=$('#studyout');out.innerHTML='<div class="out">Making your study set…</div>';
  const prompt='Create exactly '+n+' flashcards and exactly '+n+' multiple-choice quiz questions (4 options each) from the notes or topic below. Facts must be accurate. Return ONLY JSON in this shape: {"cards":[{"q":"","a":""}],"quiz":[{"q":"","options":["","","",""],"answer":0,"why":""}]} where "answer" is the index (0-3) of the correct option.\n\nNOTES:\n'+notes;
  try{
    let t;
    try{t=await ask('You are a careful study-guide maker. Output valid JSON only.'+lvlTxt(),[{role:'user',content:prompt}],{json:true})}
    catch(e){out.innerHTML='<div class="out" style="white-space:pre-wrap">⚠️ '+esc(e.message)+'</div>';return}
    t=t.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const d=JSON.parse(t);
    cards=(d.cards||[]).filter(c=>c.q&&c.a);
    const quiz=(d.quiz||[]).filter(q=>q.q&&Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(q.answer)&&q.options[q.answer]!==undefined);
    if(!cards.length&&!quiz.length)throw new Error('empty');
    ci=0;flip=false;
    out.innerHTML='<h3 style="margin-top:16px">🃏 Flashcards</h3><div id="fcbox"></div><div id="quizbox" style="margin-top:20px"></div>';
    if(cards.length)renderCards();
    renderQuiz(quiz);
  }catch(e){out.innerHTML='<div class="out">⚠️ PROBLEM: the AI answered, but not in a format I could read. FIX: tap the button again, or use shorter notes.</div>'}
};
