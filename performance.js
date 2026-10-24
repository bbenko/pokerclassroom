/* Session performance derived from saved histories; shared by the worker and tests. */
(function(root){
'use strict';
const amount = text => {
  if(!/^\d+\.\d{2}$/.test(text))throw Error('Invalid history amount.');
  const cents=Number(text.replace('.',''));
  if(!Number.isSafeInteger(cents))throw Error('History amount is too large.');
  return cents;
};
function parseHistory(text){
  const lines=text.trim().split(/\r?\n/),header=lines[0];
  // Older Classroom saves used the PokerStars prefix for this same export format.
  const stakes=header.match(/^(?:Poker Classroom|PokerStars) Hand #\d+: Hold'em No Limit \(\$\d+\.\d{2}\/\$(\d+\.\d{2}) USD\) - .+$/);
  if(!stakes||!lines[1]?.startsWith("Table 'Poker Classroom Simulation'"))throw Error('Unsupported saved history.');
  if(!lines.includes('*** SUMMARY ***'))return null;
  if(!lines.some(line=>/^Dealt to You \[/.test(line)))return null;
  const bigBlind=amount(stakes[1]);
  if(!bigBlind)throw Error('A hand needs a positive big blind.');
  let invested=0,returned=0,won=0,streetPaid=0,preflop=true,vpip=false,pfr=false;
  for(const line of lines.slice(2)){
    let m;
    if(line==='*** SUMMARY ***')break; // Summary seat payouts repeat the awards above.
    if(/^\*\*\* (FLOP|TURN|RIVER) \*\*\*/.test(line)){preflop=false;streetPaid=0;}
    if((m=line.match(/^You: posts (small blind|big blind|the ante|ante) \$(\d+\.\d{2})(?: and is all-in)?$/))){
      const paid=amount(m[2]);invested+=paid;
      if(m[1].includes('blind'))streetPaid+=paid;
    }else if((m=line.match(/^You: (calls|bets) \$(\d+\.\d{2})(?: and is all-in)?$/))){
      const paid=amount(m[2]);invested+=paid;streetPaid+=paid;
      if(preflop&&paid>0)vpip=true;
    }else if((m=line.match(/^You: raises \$\d+\.\d{2} to \$(\d+\.\d{2})(?: and is all-in)?$/))){
      const target=amount(m[1]),paid=target-streetPaid;
      if(paid<=0)throw Error('Invalid raise in saved history.');
      invested+=paid;streetPaid=target;
      if(preflop){vpip=true;pfr=true;}
    }else if((m=line.match(/^Uncalled bet \(\$(\d+\.\d{2})\) returned to You$/))){
      const value=amount(m[1]);returned+=value;streetPaid-=value;
    }else if((m=line.match(/^You collected \$(\d+\.\d{2}) from (?:pot|main pot|side pot-\d+)$/))){
      won+=amount(m[1]);
    }else if(line.startsWith('You: ')&&!/^You: (?:folds|checks|shows \[)/.test(line)){
      throw Error('Unsupported player action in saved history.');
    }
  }
  // Payouts are already after rake. Stack resets never enter this calculation.
  const netBB=(won+returned-invested)/bigBlind;
  if(!Number.isFinite(netBB))throw Error('Invalid saved hand result.');
  return {id:header,netBB,vpip,pfr};
}
function accumulator(){return {count:0,netBB:0,vpipHands:0,pfrHands:0,unreadable:0,duplicates:0,seen:new Set()};}
function add(total,history){
  let hand;
  try{hand=parseHistory(history);}catch{total.unreadable++;return;}
  if(!hand)return;
  if(total.seen.has(hand.id)){total.duplicates++;return;}
  total.seen.add(hand.id);total.count++;total.netBB+=hand.netBB;
  total.vpipHands+=Number(hand.vpip);total.pfrHands+=Number(hand.pfr);
}
function result(total){
  const {count,vpipHands,pfrHands,unreadable,duplicates}=total;
  return {count,netBB:count?total.netBB:null,winRate:count?total.netBB*100/count:null,
    vpip:count?vpipHands*100/count:null,pfr:count?pfrHands*100/count:null,
    vpipHands,pfrHands,unreadable,duplicates};
}
function summarize(histories){const total=accumulator();for(const history of histories)add(total,history);return result(total);}
function createSessionReader(){
  let owner=null,archived=null,index=0,total=accumulator(),currentText=null,currentResult=null;
  return trainer=>{
    if(owner!==trainer||archived!==trainer.completed_histories||trainer.completed_histories.length<index){
      owner=trainer;archived=trainer.completed_histories;index=0;total=accumulator();currentText=null;
    }
    // Completed histories are append-only. Parse each archived hand once per load.
    while(index<archived.length){add(total,archived[index++]);currentText=null;}
    if(!trainer.hand?.done)return result(total);
    const history=trainer.current_history();
    if(history!==currentText){
      const withCurrent={...total,seen:new Set(total.seen)};
      add(withCurrent,history);currentResult=result(withCurrent);currentText=history;
    }
    return {...currentResult};
  };
}
const api={parseHistory,summarize,createSessionReader};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.PokerPerformance=api;
})(globalThis);
