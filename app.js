'use strict';let state=null,busy=false;
const $=id=>document.getElementById(id),suits={c:'♣',d:'♦',h:'♥',s:'♠'},fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:1});
const actionShortcuts={fold:'Esc',pass:'Space',raise:'Enter'};
function text(id,value){
  const element=$(id);element.textContent=value;
  if(actionShortcuts[id]){
    const key=document.createElement('kbd');key.className='action-key';key.textContent=actionShortcuts[id];key.setAttribute('aria-hidden','true');element.append(key);
  }
}
function cards(container,items,slots=items.length){container.replaceChildren();for(let i=0;i<slots;i++){const c=document.createElement('div');c.className='card';const code=items[i];if(!code)c.classList.add('empty');else if(code==='??'){c.classList.add('back');c.setAttribute('aria-label','Hidden card')}else{if('dh'.includes(code[1]))c.classList.add('red');c.append(document.createTextNode(code[0]==='T'?'10':code[0]));const symbol=document.createElement('span');symbol.className='suit';symbol.textContent=suits[code[1]];c.append(symbol);c.setAttribute('aria-label',code)}container.append(c)}}
function highlightWinningCards(container,items,winning){
  for(let i=0;i<items.length;i++)if(winning.includes(items[i])){
    const card=container.children[i];card.classList.add('winning-card');
    card.setAttribute('aria-label',items[i]+', part of winning hand');
  }
}
function chipPile(amount,small=false){
  const pile=document.createElement('div');pile.className='chip-pile'+(small?' compact':'');
  pile.setAttribute('aria-hidden','true');
  let units=Math.round(amount*2);
  const denominations=[[50,'gold','25'],[10,'blue','5'],[2,'red','1'],[1,'ivory','½']];
  for(const [value,color,label]of denominations){
    const count=Math.floor(units/value);units%=value;if(!count)continue;
    const column=document.createElement('span');column.className='chip-column';
    const layers=Math.min(count,small?4:5);
    for(let index=0;index<layers;index++){
      const chip=document.createElement('span');chip.className='poker-chip '+color;
      chip.style.setProperty('--layer',index);chip.textContent=label;column.append(chip);
    }
    pile.append(column);
  }
  return pile;
}

function renderTableChips(data){
  const bets=$('table-bets');bets.replaceChildren();
  if(!data.done){
    for(const seat of data.seats){
      if(seat.bet<=0)continue;
      const bet=document.createElement('div');
      bet.className='table-bet b'+seat.id+(seat.all_in?' all-in':'');
      bet.dataset.seat=seat.id;
      bet.setAttribute('aria-label',seat.name+' bet '+fmt(seat.bet)+' big blinds'+(seat.all_in?', all-in':''));
      const label=document.createElement('span');label.className='bet-amount';label.textContent=fmt(seat.bet)+' BB';
      bet.append(chipPile(seat.bet,true),label);bets.append(bet);
    }
  }
  const collected=data.done?data.pot:Math.max(0,data.pot-data.seats.reduce((sum,seat)=>sum+seat.bet,0));
  const middle=$('pot-chips');middle.replaceChildren(chipPile(collected));
  middle.dataset.amount=collected;
  middle.setAttribute('aria-label',fmt(collected)+' big blinds collected in the pot');
}

function seats(data){
  const el=$('seats');el.replaceChildren();
  for(const seat of data.seats){
    const box=document.createElement('div');
    box.className='seat s'+seat.id+(seat.id===0?' hero':'')+(seat.folded?' folded':'')+(seat.acting?' acting':'')+(seat.won?' won':'');
    box.setAttribute('aria-label',seat.name+', '+seat.position+', '+fmt(seat.stack)+' big blinds'+(seat.folded?', folded':''));
    const head=document.createElement('div');head.className='seat-head';head.append(document.createTextNode(seat.name));
    const position=document.createElement('span');position.className='seat-position';position.textContent=seat.position;
    if(seat.button){const d=document.createElement('span');d.className='dealer';d.textContent='D';d.title='Dealer button';position.append(d)}
    head.append(position);
    const hand=document.createElement('div');hand.className='cards';cards(hand,seat.cards);
    highlightWinningCards(hand,seat.cards,seat.winning_cards||[]);
    const stack=document.createElement('div');stack.className='seat-stack';stack.textContent=fmt(seat.stack)+' BB';
    const status=document.createElement('div');status.className='seat-status';
    const action=/^Raise/i.test(seat.last_action)?'Raise':/^Bet/i.test(seat.last_action)?'Bet':/^Call/i.test(seat.last_action)?'Call':seat.last_action;
    status.textContent=seat.folded?'Folded':seat.all_in?'All-in':seat.acting?'Your action':seat.hand_name||(seat.won?'Won pot':action)||'In hand';
    status.title=status.textContent;box.append(head);
    if(seat.won){
      const badge=document.createElement('div');badge.className='winner-badge';badge.textContent='★ Winner';
      box.append(badge);
      box.setAttribute('aria-label',seat.name+', winner, '+(seat.hand_name||'won pot')+', '+fmt(seat.stack)+' big blinds');
      const payout=data.awards.reduce((sum,award)=>sum+(award.payouts[seat.id]||0),0);
      status.textContent=(seat.hand_name||'Won pot')+' · Won '+fmt(payout)+' BB';
      status.title=status.textContent;
    }
    box.append(hand,stack,status);el.append(box);
  }
  renderTableChips(data);
}

function paragraph(parent,value,cls=''){const p=document.createElement('p');p.textContent=value;p.className=cls;parent.append(p);return p}
function reviewGrade(report){
  return report.review || (report.correct
    ? report.confidence==='close' ? {level:'close',label:'Close',explanation:'Both reasonable.'} : {level:'good',label:'Good',explanation:'Matches an accepted action.'}
    : {level:'mistake',label:'Mistake',explanation:report.reason});
}
function gradeClass(grade){return grade.level==='close'?'neutral':grade.level==='good'?'good':'bad'}
function review(report,hint=false){
  const el=$('review');el.replaceChildren();
  if(!report){text('review-title','Decision review');paragraph(el,'Your choices will appear here.');return}
  text('review-title',hint?'Coach':'Decision review');
  if(!hint){
    const grade=reviewGrade(report);
    paragraph(el,grade.label,'grade review-badge '+gradeClass(grade));
    paragraph(el,'You chose '+(report.chosen_label||report.chosen),'choice-pill '+(report.correct?'good':'bad'));
  }
  const line=document.createElement('div');line.className='recommendation';
  line.textContent=(hint?'':report.correct?'Suggested: ':'Better: ')+report.display;el.append(line);
  const metrics=document.createElement('div');metrics.className='metrics';
  for(const [label,value] of [[report.model ? 'equity vs. estimated ranges' : 'equity vs. random hands',report.equity],['pot odds',report.pot_odds]]){
    const item=document.createElement('div'),strong=document.createElement('strong');strong.textContent=value+'%';
    item.append(strong,document.createTextNode(label));metrics.append(item);
  }
  el.append(metrics);paragraph(el,report.reason);
  if(report.uncertainty_note)paragraph(el,report.uncertainty_note,'decision-note');
  if(!hint)paragraph(el,report.street+' · '+report.position,'decision-note');
}

let displayedRange=null,rangeKey='';
function selectRangeHand(hand){
  if(!displayedRange)return;
  const cell=displayedRange.cells.find(item=>item.hand===hand);if(!cell)return;
  for(const button of $('range-grid').querySelectorAll('button')){
    const selected=button.dataset.hand===hand;button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  const action=cell.raise?'Raise':displayedRange.position==='BB'?'Check':'Outside opening range';
  text('range-hand',hand+' · '+action+' · '+cell.combos+' combos');
}

function renderRange(data){
  const chart=data.range,available=data.range_available;
  $('range-panel').hidden=!chart&&!available;
  if(!chart&&!available){displayedRange=null;rangeKey='';return}
  text('range-title',chart?chart.title:data.hero.position+' opening range');
  $('show-range').hidden=!available||data.range_current;
  text('show-range',chart?'Current range':'View range');
  $('range-content').hidden=!chart;
  if(!chart)return;
  text('range-context',(data.range_current?'Unraised pot':'Preflop reference')+' · Raise '+chart.raise_percent+'%');
  text('outside-label',chart.position==='BB'?'Check':'Outside range');
  displayedRange=chart;
  const key=chart.position+':'+chart.current_hand;
  if(key===rangeKey)return;
  rangeKey=key;
  const grid=$('range-grid');grid.replaceChildren();
  grid.setAttribute('aria-label',chart.title+'; suited hands above the diagonal, offsuit below');
  for(const cell of chart.cells){
    const button=document.createElement('button');button.type='button';
    button.className='range-cell '+(cell.raise?'range-raise':'range-outside')+(cell.hand===chart.current_hand?' current-hand':'');
    button.dataset.hand=cell.hand;button.textContent=cell.hand;
    const action=cell.raise?'Raise':chart.position==='BB'?'Check':'Outside opening range';
    button.title=cell.hand+' · '+action+' · '+cell.combos+' combos';
    button.setAttribute('aria-label',button.title);
    if(cell.hand===chart.current_hand)button.setAttribute('aria-current','true');
    grid.append(button);
  }
  selectRangeHand(chart.current_hand);
}

function renderChoice(data){
  const container=$('result');container.replaceChildren();
  if(data.done){
    const summary=document.createElement('div');summary.className='result-summary';
    summary.textContent=data.result+' · Your hand: '+(data.profit>=0?'+':'')+fmt(data.profit)+' BB';container.append(summary);
  }
  const report=data.feedback[0];
  if(!report)return;
  const grade=reviewGrade(report),close=grade.level==='close';
  const el=document.createElement('div');el.className='choice-feedback '+gradeClass(grade);container.append(el);
  const icon=document.createElement('span');icon.className='outcome-icon';icon.textContent=close?'≈':report.correct?'✓':'✕';
  const chosen=document.createElement('span');chosen.textContent=report.street+' · You chose '+(report.chosen_label||report.chosen);
  const outcome=document.createElement('strong');outcome.textContent=grade.label;outcome.title=grade.explanation;
  el.append(icon,chosen,outcome);
}

function updateRaiseSelection(){
  if(!state||!state.legal.raise)return;
  const amount=Number($('size').value);
  const valid=$('size').value!==''&&Number.isFinite(amount)&&amount>=state.legal.min_to&&amount<=state.legal.max_to&&Number.isInteger(amount*2);
  const verb=state.current_bet===0?'Bet':'Raise to';
  text('raise',valid?verb+' '+fmt(amount)+' BB'+(amount===state.legal.max_to?' · All-in':''):verb);
  $('raise').disabled=!valid;
  for(const button of $('raise-presets').children)button.setAttribute('aria-pressed',String(valid&&Number(button.dataset.size)===amount));
}

function renderRaisePresets(data){
  const group=$('raise-presets');group.replaceChildren();
  const legal=data.legal;
  const preflop=data.street==='Preflop';
  const opening=preflop&&data.current_bet<=1;
  const options=opening?[[2,'2 BB'],[2.5,'2.5 BB'],[3,'3 BB']]:preflop?
    [2.5,3,4].map(n=>[data.current_bet*n,n+'× bet']):
    (data.street==='Flop'?[1/3,1/2,3/4,1]:data.street==='River'?[1/2,3/4,1,1.5]:[1/2,3/4,1]).map(n=>[
      data.current_bet+n*(data.pot+legal.call),Math.round(n*100)+'% pot']);
  options.push([legal.max_to,'All-in']);
  for(const [amount,label] of options){
    const target=Math.max(legal.min_to,Math.min(legal.max_to,Math.round(amount*2)/2));
    const button=document.createElement('button');button.type='button';
    button.textContent=label;button.title='Total street bet: '+fmt(target)+' BB';
    button.dataset.size=target;button.setAttribute('aria-pressed',String(Number($('size').value)===target));
    button.onclick=()=>setSize(target);group.append(button);
  }
  updateRaiseSelection();
}

function renderPerformance(performance){
  const p=performance||{count:0,netBB:null,winRate:null,vpip:null,pfr:null};
  const signed=n=>(n>0?'+':'')+fmt(n);
  for(const [id,value,isSigned] of [['profit',p.netBB,true],['win-rate',p.winRate,true],['vpip',p.vpip,false],['pfr',p.pfr,false]]){
    const el=$('performance-'+id);
    el.textContent=value===null?'—':isSigned?signed(value):fmt(value);
    el.classList.toggle('positive',isSigned&&value>0);el.classList.toggle('negative',isSigned&&value<0);
  }
  text('performance-count',fmt(p.count)+' completed '+(p.count===1?'hand':'hands'));
  text('performance-vpip-count',p.count?fmt(p.vpipHands)+' of '+fmt(p.count)+' hands':'Voluntary preflop investment');
  text('performance-pfr-count',p.count?fmt(p.pfrHands)+' of '+fmt(p.count)+' hands':'Raised or reraised preflop');
  text('performance-note',!p.count?'Finish a hand to start tracking your results.':
    (p.count<100?'Small sample: a few pots can move your win rate sharply.':'Poker results vary widely. These observations do not establish skill or predict future results.'));
  const issues=[];
  if(p.unreadable)issues.push(fmt(p.unreadable)+' saved '+(p.unreadable===1?'history could':'histories could')+' not be read and '+(p.unreadable===1?'was':'were')+' excluded.');
  if(p.duplicates)issues.push(fmt(p.duplicates)+' duplicate '+(p.duplicates===1?'history was':'histories were')+' counted only once.');
  text('performance-warning',issues.join(' '));$('performance-warning').hidden=!issues.length;
}

function render(data){
  renderPerformance(data.performance);
  state=data;text('hands',data.hand_number||0);text('decisions',data.stats.decisions);
  text('accuracy',data.stats.accuracy===null?'—':data.stats.accuracy+'%');
  $('hints').checked=data.hints;$('stack-mode').value=data.stack_mode;$('stack-mode').disabled=data.started&&!data.done;
  $('welcome').hidden=data.started;$('game').hidden=!data.started;
  $('action-area').hidden=!data.started;$('history').hidden=!data.started;
  if(!data.started){
    $('history').open=false;
    text('start',data.hand_number?'Deal next hand':'Deal your first hand');
    $('range-panel').hidden=true;$('recap-panel').hidden=true;
    return;
  }
  cards($('board'),data.board,5);
  highlightWinningCards($('board'),data.board,data.seats.flatMap(seat=>seat.winning_cards||[]));
  seats(data);text('pot',fmt(data.pot)+' BB');
  text('remaining',data.done?'Hand complete':data.remaining+' players in hand');
  text('street','Hand '+data.hand_number+' / '+data.street);
  const l=data.legal;
  $('copy-history').disabled=!data.export_history;
  text('copy-status','');
  text('history-count',data.history_count+' hand histories available'+(!data.done?' (including the current hand in progress)':'')+'.');
  for(const id of ['fold','pass','raise']){
    $(id).hidden=data.done;
    $(id).disabled=data.done;
  }
  text('pass',!data.done&&!l.check?'Call '+fmt(l.call)+' BB':'Check');
  text('raise',data.current_bet===0?'Bet':'Raise');
  $('sizing').hidden=data.done||!l.raise;$('next').hidden=!data.done;
  $('sizing').parentElement.hidden=data.done||!l.raise;
  if(!data.done){
    $('fold').disabled=!l.fold;
    $('pass').disabled=!(l.check||l.call>0);
    $('raise').disabled=!l.raise;text('raise',data.current_bet===0?'Bet':'Raise');
    text('price',data.hero.position+' · '+(l.check?'Check for free':fmt(l.call)+' BB to call'));
    if(l.raise){
      $('size').min=l.min_to;$('size').max=l.max_to;
      const unopenedFraction=data.current_bet===0?(data.street==='Flop'?0.5:['Turn','River'].includes(data.street)?0.75:null):null;
      const defaultSize=data.street==='Preflop'&&data.current_bet<=1?2.5:unopenedFraction===null?
        (data.coach&&data.coach.action==='raise'?data.coach.target:l.min_to):data.pot*unopenedFraction;
      $('size').value=Math.max(l.min_to,Math.min(l.max_to,Math.round(defaultSize*2)/2));
      $('size').setAttribute('aria-description','Minimum '+l.min_to+', maximum '+l.max_to+' big blinds');
      renderRaisePresets(data);
    }
  }else text('price','Hand complete');
  for(const [id,action]of [['fold','fold'],['pass',l.check?'check':'call'],['raise','raise']]){
    const recommended=!$(id).disabled&&!!(data.coach&&data.coach.accepted.includes(action));
    $(id).classList.toggle('coach-pick',recommended);
    if(recommended)$(id).setAttribute('aria-description','Coach accepts this action');
    else $(id).removeAttribute('aria-description');
  }
  text('log',data.export_history||'');
  renderChoice(data);review(data.coach||data.feedback[0],!!data.coach);renderRange(data);
  const previous=$('previous');previous.replaceChildren();
  for(const entry of data.feedback.slice(data.coach?0:1,4)){
    const entryGrade=reviewGrade(entry);
    const row=document.createElement('div');row.className='previous '+gradeClass(entryGrade);
    const chosen=document.createElement('span');chosen.textContent=entry.street+' · '+(entry.chosen_label||entry.chosen);
    const grade=document.createElement('strong');grade.textContent=entryGrade.label;
    row.append(chosen,grade);previous.append(row);
  }
  const awards=$('awards');awards.replaceChildren();
  for(const award of data.awards){
    const item=document.createElement('li');item.textContent=award.label+' · '+fmt(award.amount)+' BB → '+award.winners.map(id=>data.seats[id].name).join(', ');awards.append(item);
  }
  $('recap-panel').hidden=!data.awards.length&&!previous.children.length;
}

// Quiet synthesized cues need no downloads and start only after a user gesture.
const SOUND_KEY='pokerclassroom:sound';
let soundEnabled=true,audioContext=null;
const activeSoundNotes=new Set();
try{soundEnabled=localStorage.getItem(SOUND_KEY)!=='muted'}catch{}
function renderSoundToggle(){
  text('sound-toggle',soundEnabled?'Sound on':'Sound off');
  $('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));
  $('sound-toggle').setAttribute('aria-label',soundEnabled?'Mute sounds':'Enable sounds');
}
function unlockSound(){
  if(!soundEnabled)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    if(!audioContext)audioContext=new Audio();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }catch{}
}
function playSound(kind){
  if(!soundEnabled||!audioContext||audioContext.state!=='running'||document.hidden)return;
  const notes=kind==='good'?[659.25]:[392,329.63];
  try{
    notes.forEach((frequency,index)=>{
      const start=audioContext.currentTime+index*0.06;
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start);
      gain.gain.linearRampToValueAtTime(kind==='good'?0.025:0.035,start+0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+0.10);
      oscillator.connect(gain);gain.connect(audioContext.destination);
      activeSoundNotes.add(oscillator);
      oscillator.onended=()=>{activeSoundNotes.delete(oscillator);oscillator.disconnect();gain.disconnect()};
      oscillator.start(start);oscillator.stop(start+0.11);
    });
  }catch{}
}
function playResponseSounds(path,data){
  const report=path==='action'?data.feedback[0]:null;
  if(report)playSound(report.correct?'good':'review');
}
$('sound-toggle').onclick=()=>{
  soundEnabled=!soundEnabled;
  if(soundEnabled)unlockSound();
  else for(const note of activeSoundNotes){try{note.stop()}catch{}}
  try{localStorage.setItem(SOUND_KEY,soundEnabled?'on':'muted')}catch{}
  renderSoundToggle();
};
renderSoundToggle();

const SAVE_PATH=new URL('.',location.href).pathname;
const SAVE_KEY='pokerclassroom:session:v1:'+SAVE_PATH;
let engineWorker=null, sequence=0;
const waiting=new Map();
function callEngine(path,body){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{waiting.delete(id);reject(Error('The table took too long to respond. Reload to resume your saved hand.'))},30000);
    waiting.set(id,{resolve,reject,timer});
    engineWorker.postMessage({id,path,body});
  });
}
async function request(path,body){
  if(busy)return;
  if(path==='action'||path==='new')unlockSound();
  busy=true;
  document.querySelector('.layout').classList.add('pending');text('error','');
  text('working',path==='reset'?'Resetting session…':path==='state'?'Loading table…':path==='range'?'Loading range…':path==='hints'?'Updating coach…':'Opponents are playing…');
  try{
    if(!engineWorker){
      engineWorker=new Worker(new URL('./game-worker.js',document.baseURI));
      engineWorker.onmessage=event=>{
        const message=event.data,job=waiting.get(message.id);if(!job)return;
        clearTimeout(job.timer);waiting.delete(message.id);
        if(message.error)job.reject(Error(message.error));else job.resolve(message);
      };
      engineWorker.onerror=()=>{
        for(const job of waiting.values()){clearTimeout(job.timer);job.reject(Error('Unable to load the table. Reload the page to try again.'))}
        waiting.clear();engineWorker.terminate();engineWorker=null;
      };
      let saved=null;
      try{saved=JSON.parse(localStorage.getItem(SAVE_KEY))}catch{}
      const initial=await callEngine('init',{saved});
      render(initial.state);
      if(initial.warning)text('error',initial.warning);
      if(path==='state'){
        try{localStorage.setItem(SAVE_KEY,JSON.stringify(initial.saved))}catch{text('error','Your browser could not save progress. This game will last until the tab is closed.')}
        return;
      }
    }
    const message=await callEngine(path,body);
    render(message.state);
    playResponseSounds(path,message.state);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(message.saved))}catch{text('error','Your browser could not save progress. This game will last until the tab is closed.')}
  }catch(error){if(state)$('hints').checked=state.hints;text('error',error.message)}
  finally{busy=false;document.querySelector('.layout').classList.remove('pending');text('working','')}
}
$('export-all-history').onclick=async()=>{
  if(busy||!engineWorker)return;
  busy=true;$('export-all-history').disabled=true;text('copy-status','');
  try{
    const message=await callEngine('history',{});
    const url=URL.createObjectURL(new Blob([message.history],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;
    link.download='poker-classroom-session-'+new Date().toISOString().slice(0,10)+'.txt';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    text('copy-status','History exported.');
  }catch{text('copy-status','Unable to export history. Please try again.')}
  finally{busy=false;$('export-all-history').disabled=false}
};
$('reset-session').onclick=()=>{
  if(busy)return;
  if(window.confirm('Reset this session? This clears all saved hands and scores, including any hand in progress. Export your history first if you want to keep it.'))request('reset',{});
};
$('copy-history').onclick=async()=>{
  if(!state||!state.export_history)return;
  const content=$('log').textContent;
  try{
    await navigator.clipboard.writeText(content);
    if($('log').textContent===content)text('copy-status','Copied!');
  }catch{
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents($('log'));
    selection.removeAllRanges();selection.addRange(range);
    text('copy-status','Copy unavailable. Text selected—press Ctrl+C or ⌘C.');
  }
};
$('show-range').onclick=()=>request('range',{});$('range-grid').onclick=event=>{const cell=event.target.closest('button[data-hand]');if(cell)selectRangeHand(cell.dataset.hand)};
$('start').onclick=$('next').onclick=()=>request('new',{stack_mode:$('stack-mode').value});$('fold').onclick=()=>request('action',{action:'fold'});$('pass').onclick=()=>request('action',{action:state.legal.check?'check':'call'});$('raise').onclick=()=>request('action',{action:'raise',size:$('size').value});$('hints').onchange=()=>request('hints',{enabled:$('hints').checked});function setSize(n){if(state&&state.legal.raise)$('size').value=Math.max(state.legal.min_to,Math.min(state.legal.max_to,Math.round(n*2)/2));if($('size').oninput)$('size').oninput()}$('minimum').onclick=()=>setSize(state.legal.min_to);$('size').oninput=updateRaiseSelection;request('state');

document.addEventListener('keydown',event=>{
  if(event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||busy||!state||!state.started)return;
  if(event.target.closest('input,textarea,select,summary,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],dialog'))return;
  const focusedButton=event.target.closest('button');
  if(focusedButton&&!['fold','pass','raise','next'].includes(focusedButton.id))return;
  const id=state.done?([' ','Escape','Enter'].includes(event.key)?'next':null):{Escape:'fold',' ':'pass',Enter:'raise'}[event.key];
  if(!id)return;
  const button=$(id);
  if(button.disabled||button.hidden||$('action-area').hidden)return;
  event.preventDefault();button.click();
});

// Keep coaching and its opening range together above history on narrow screens.
if(window.matchMedia){
  const narrowLayout=window.matchMedia('(max-width:800px)');
  const decisionPanel=$('decision-panel'),rangePanel=$('range-panel');
  const reviewSidebar=decisionPanel.parentElement;
  function positionCoachPanels(){
    if(narrowLayout.matches)$('history').before(decisionPanel,rangePanel);
    else reviewSidebar.prepend(decisionPanel,rangePanel);
  }
  narrowLayout.addEventListener('change',positionCoachPanels);
  positionCoachPanels();
}

// Compact stat definitions also work with a keyboard and on touch screens.
const statButtons=[...document.querySelectorAll('.stats .stat')];
function closeStat(button){button.setAttribute('aria-expanded','false');$(button.getAttribute('aria-controls')).hidden=true;delete button.dataset.pinned;}
function openStat(button){for(const other of statButtons)if(other!==button)closeStat(other);button.setAttribute('aria-expanded','true');$(button.getAttribute('aria-controls')).hidden=false;}
for(const button of statButtons){
  button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')openStat(button)});
  button.addEventListener('pointerleave',()=>{if(document.activeElement!==button&&!button.dataset.pinned)closeStat(button)});
  button.addEventListener('focus',()=>openStat(button));
  button.addEventListener('blur',()=>closeStat(button));
  button.addEventListener('click',()=>{if(button.dataset.pinned)closeStat(button);else{openStat(button);button.dataset.pinned='true'}});
}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.stats .stat'))statButtons.forEach(closeStat)});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&statButtons.some(button=>button.getAttribute('aria-expanded')==='true')){
    statButtons.forEach(closeStat);event.preventDefault();event.stopImmediatePropagation();
  }
},true);
