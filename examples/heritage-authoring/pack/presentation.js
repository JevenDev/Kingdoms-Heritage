(() => {
'use strict';
const f=Math.fround,clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const lerp=(t,a,b)=>f(a+f(t*f(b-a)));
const ease=value=>{const rest=f(1-clamp(value));return f(1-f(f(rest*rest)*rest));};
const sine=angle=>f(Math.sin((Math.trunc(f(angle*f(10430.378)))&65535)*Math.PI*2/65536));
const phase=now=>f(f((now%20000)/20000)*f(Math.PI*2));
const interpolate=(from,to,t,details)=>Object.fromEntries(Object.keys(to).map(key=>[key,lerp(key==='details'?details:t,from[key],to[key])]));
class Card {
  constructor(id){this.id=id;this.lift=0;this.hover=0;this.selection=0;this.tilt=0;this.visible=true;}
  move(target,now,animate,delay,confirming){
    if(animate)this.sample(now);else this.layout=target;
    this.from=this.layout;this.target=target;this.started=now;this.delay=delay;
    this.duration=confirming?550:target.opacity===0?140:240;
    this.fromTilt=this.tilt;this.straightenDelay=target.details===1&&Math.abs(this.tilt)>.01?60:0;
    this.sample(now);
  }
  sample(now){
    let elapsed=now-this.started-this.delay;
    if(this.target.details===1)this.tilt=f(this.fromTilt*f(1-ease(f(elapsed/60))));
    elapsed-=this.straightenDelay;
    this.layout=interpolate(this.from,this.target,ease(f(elapsed/this.duration)),ease(f((elapsed-(this.target.details===1?100:0))/(this.target.details===1?140:90))));
  }
  animate(delta,active,hovered,mouseX,now,selected,expanded,confirming,confirmation){
    const response=f(1-f(Math.exp(f(-delta*12)))),layout=this.layout,p=phase(now),progress=this.id===selected?confirmation:0;
    const flat=confirming||progress>0||expanded!==null||layout.width>128;
    const targetLift=f((flat?0:active?12:this.id===selected?4:0)+f(f(sine(f(p*5))*2.5)*progress));
    this.lift=lerp(response,this.lift,targetLift);this.hover=lerp(response,this.hover,active?1:0);this.selection=lerp(response,this.selection,this.id===selected?1:0);
    const horizontal=clamp(f(f(f((mouseX-Math.round(layout.x))/f(128*layout.scale))*2)-1),-1,1);
    const tilt=f((!flat&&active&&hovered?f(horizontal*1.25):0)+f(f(sine(f(p*4))*.35)*progress));
    if(this.target.details===0)this.tilt=lerp(f(1-f(Math.exp(f(-delta*10)))),this.tilt,tilt);
  }
  pose(){return {...this.layout,y:f(this.layout.y-f(this.lift*this.layout.scale)),tilt:this.tilt,hover:this.hover,selection:this.selection};}
}
class Cards {
  constructor(ids,width,height,now){this.selected=null;this.expanded=null;this.confirming=false;this.confirmationFrom=0;this.confirmationStarted=now;this.reset(ids,width,height,now);}
  reset(ids,width,height,now){this.width=width;this.height=height;this.cards=ids.map(id=>new Card(id));this.preview=this.expanded??(ids.includes(this.selected)?this.selected:ids[0]);this.renderedAt=now;this.layout(now,false);}
  turn(ids,direction,now){
    const outgoing=this.cards;
    for(const card of outgoing){
      card.sample(now);
      card.move({...card.layout,x:card.layout.x-direction*24*card.layout.scale,opacity:0},now,true,0,false);
      card.duration=180;
    }
    this.reset(ids,this.width,this.height,now);
    this.cards.forEach((card,index)=>{
      const target=card.layout;
      card.layout=card.from=card.target={...target,x:target.x+direction*24*target.scale,opacity:0};
      card.move(target,now,true,index*10,false);
    });
    return outgoing;
  }
  progress(now){return lerp(ease(f((now-this.confirmationStarted)/550)),this.confirmationFrom,this.confirming?1:0);}
  confirm(id,value,now){this.confirmationFrom=this.progress(now);this.confirmationStarted=now;this.confirming=value;if(value){this.selected=this.preview=id;this.expanded=null;}this.layout(now,true);}
  expand(id,now){this.selected=this.preview=id;this.expanded=this.expanded===null?id:null;this.layout(now,true);}
  layout(now,animate){
    const width=this.confirming?344:this.expanded!==null?374:128;
    const scale=f(Math.max(.1,Math.min(1,f((this.width-32)/width),f((this.height-116)/192))));
    const step=this.cards.length<=1?0:Math.min(f(144*scale),f(f(this.width-32-f(128*scale))/(this.cards.length-1)));
    const group=this.confirming?f(344*scale):this.expanded!==null?f(374*scale):f(f(128*scale)+f((this.cards.length-1)*step));
    const left=Math.round(f((this.width-group)/2)),top=this.confirming?Math.round(f((this.height-f(192*scale))/2)):Math.round(f(40+f((this.height-116-f(192*scale))/2)));
    this.cards.forEach((card,index)=>{
      const open=card.id===this.expanded,visible=this.expanded===null||open;
      let target={x:open?left:left+Math.round(f(index*step)),y:top,scale,width:open?374:128,opacity:visible?1:0,details:open?1:0};
      if(this.confirming)target=card.id===this.selected?{x:left,y:top,scale,width:128,opacity:1,details:0}:card.layout??target;
      if(!this.confirming&&!visible&&card.layout)target={x:card.layout.x,y:card.layout.y+4,scale:card.layout.scale,width:128,opacity:0,details:0};
      const delay=this.expanded===null&&card.layout&&card.layout.opacity<1?index*25:0;
      card.move(target,now,animate,delay,this.confirming||this.confirmationFrom>0);card.visible=visible;
    });
  }
  at(x,y,now){
    if(this.confirming||this.progress(now)>0)return null;
    const contains=(card,right)=>x>=Math.round(card.layout.x)&&x<right&&y>=card.layout.y-12*card.layout.scale&&y<card.layout.y+192*card.layout.scale;
    const right=card=>Math.round(card.layout.x)+Math.round(card.layout.width*card.layout.scale);
    const moving=this.cards.find(card=>card.layout.width>128&&card.visible&&contains(card,right(card)));if(moving)return moving;
    for(let index=this.cards.length-1;index>=0;index--){const card=this.cards[index];if(!card.visible||card.layout.opacity<.05)continue;const edge=this.expanded===null&&index+1<this.cards.length?Math.min(right(card),Math.round(this.cards[index+1].layout.x)):right(card);if(contains(card,edge))return card;}
    return null;
  }
  frame(now,{x=-1000,y=-1000,focused=null,keyboard=false}={}){
    const progress=this.progress(now);for(const card of this.cards)card.sample(now);
    const hovered=this.at(x,y,now);let foreground=keyboard?this.cards.find(card=>card.id===focused):hovered;
    foreground=this.cards.find(card=>card.visible&&card.layout.width>128)??foreground;
    if(this.confirming||progress>0)foreground=this.cards.find(card=>card.id===this.selected);
    const active=foreground;if(foreground)this.preview=foreground.id;
    foreground??=this.cards.find(card=>card.id===this.preview);
    const delta=f(clamp(f((now-this.renderedAt)/1000),0,.05));this.renderedAt=now;
    for(const card of this.cards)card.animate(delta,card===active,card===hovered,x,now,this.selected,this.expanded,this.confirming,progress);
    return {progress,active:active?.id,hovered:hovered?.id,foreground:foreground?.id,cards:this.cards};
  }
}
class Reorder {
  constructor(duration=180){this.duration=duration;this.positions=new Map();this.active=false;}
  seed(positions){for(const [id,x] of positions)if(!this.positions.has(id))this.positions.set(id,{from:x,target:x,started:0});}
  frame(targets,now){
    const sample=entry=>lerp(this.duration?ease((now-entry.started)/this.duration):1,entry.from,entry.target),next=new Map(),positions=new Map();this.active=false;
    for(const [id,x] of targets){
      let entry=this.positions.get(id)??{from:x,target:x,started:now};
      if(entry.target!==x)entry={from:sample(entry),target:x,started:now};
      const current=sample(entry);if(Math.abs(current-x)>.01)this.active=true;next.set(id,entry);positions.set(id,current);
    }
    this.positions=next;return positions;
  }
}
class Transition {
  constructor(){this.phase='idle';this.started=0;this.from=0;this.action=null;}
  opacity(now){const t=clamp(f((now-this.started)/300)),smooth=f(f(t*t)*f(3-f(2*t)));return lerp(smooth,this.from,this.phase==='revealing'?0:1);}
  fade(now,action){if(this.phase!=='idle')return false;this.phase='fading';this.started=now;this.from=0;this.action=action;return true;}
  reveal(now){this.from=this.opacity(now);this.phase='revealing';this.started=now;this.action=null;}
  tick(now){if(this.phase==='idle'||now-this.started<300)return;if(this.phase==='revealing'){this.phase='idle';this.from=0;}else if(this.phase==='fading'){this.phase='waiting';const action=this.action;this.action=null;action();}}
  clear(){this.phase='idle';this.from=0;this.action=null;}
}
class Spring {
  constructor(value,now,positionEpsilon=.003,velocityEpsilon=.04){
    this.selected=this.from=value;this.velocity=0;this.started=now;
    this.positionEpsilon=positionEpsilon;this.velocityEpsilon=velocityEpsilon;
  }
  select(index,now){
    if(index===this.selected)return;
    const {position,velocity}=this.motion(now);
    this.from=position;this.velocity=velocity;this.selected=index;this.started=now;
  }
  motion(now){
    const elapsed=Math.max(0,(now-this.started)/1000),offset=this.from-this.selected;
    const coefficient=this.velocity+14*offset,decay=Math.exp(-14*elapsed);
    const position=this.selected+(offset+coefficient*elapsed)*decay,velocity=(this.velocity-14*coefficient*elapsed)*decay;
    if(Math.abs(position-this.selected)<this.positionEpsilon&&Math.abs(velocity)<this.velocityEpsilon)return {position:this.selected,velocity:0};
    return {position,velocity};
  }
  shiftTime(elapsed){this.started+=elapsed;}
}
class KitCarousel extends Spring {
  poses(bounds,width,count,now){
    const {position}=this.motion(now),poses=[];
    const step=Math.max(bounds.width*.58,Math.min(bounds.width*.95,(width-bounds.width*.32)/2));
    for(let index=Math.max(0,Math.floor(position)-1);index<=Math.min(count-1,Math.ceil(position)+1);index++){
      const distance=index-position,depth=Math.min(1,Math.abs(distance)),scale=1-.32*depth;
      poses.push({index,distance,scale,opacity:(1-.68*depth)*clamp(2-Math.abs(distance)),
        x:bounds.x+bounds.width/2+distance*step-bounds.width*scale/2,y:bounds.y+bounds.height*(1-scale)/2});
    }
    return poses.sort((a,b)=>Math.abs(b.distance)-Math.abs(a.distance));
  }
}
function partyLayout(width,height,partyTitle,otherTitle,emptyTitle,otherCount,summaryHeight,page,labelWidth){
  const size=24,step=36,section=Math.max(1,Math.trunc((Math.min(width-24,372)-14)/2));
  const columns=clamp(Math.trunc((section+step-size-4)/step),1,4),pageGap=summaryHeight?20:15;
  const rows=clamp(Math.trunc((height-28-20-20-2-pageGap-summaryHeight)/step),1,3);
  const capacity=columns*rows,pageCount=Math.max(1,Math.ceil(otherCount/capacity));
  page=clamp(page,0,pageCount-1);
  const first=page*capacity,last=Math.min(otherCount,first+capacity),pageY=20+rows*step+2;
  const span=count=>26+(count-1)*step,partySpan=Math.max(partyTitle,span(columns));
  const pageWidth=pageCount>1?labelWidth(pageCount+' / '+pageCount):0;
  const otherSpan=Math.max(otherTitle,otherCount?span(Math.min(columns,otherCount)):emptyTitle,pageCount>1?pageWidth+56:0);
  const gap=section+14,partyCenter=Math.trunc((width-gap+Math.trunc((partySpan-otherSpan)/2))/2),otherCenter=partyCenter+gap;
  const gridBottom=20+Math.floor((Math.max(8,Math.min(otherCount,capacity))-1)/columns)*step+size+1;
  const groupHeight=Math.max(gridBottom+(summaryHeight?9+summaryHeight:0),pageCount>1?pageY+pageGap+summaryHeight:0);
  const top=Math.max(28,Math.trunc((height-groupHeight)/2));
  const slots=(count,center)=>Array.from({length:count},(_,index)=>{
    const row=Math.floor(index/columns),rowSize=Math.min(columns,count-row*columns);
    return {x:center-(size+(rowSize-1)*step)/2+index%columns*step,y:top+20+row*step};
  });
  return {top,partyCenter,otherCenter,summaryY:top+groupHeight-summaryHeight,slots:slots(8,partyCenter),
    others:slots(last-first,otherCenter),first,page,pageCount,pageY:top+pageY,pageWidth};
}
function portraitNeighbor(cells,id,direction,vertical){
  const origin=cells.find(cell=>cell.id===id);
  if(!origin)return (direction<0?cells.at(-1):cells[0])?.id;
  let next,bestRow=Infinity,bestColumn=Infinity;
  for(const cell of cells){
    const dx=cell.x-origin.x,dy=cell.y-origin.y;
    if(vertical?(cell.party!==origin.party||dy*direction<=0):dx*direction<=0)continue;
    const row=Math.abs(dy),column=Math.abs(dx);
    if(row<bestRow||row===bestRow&&column<bestColumn){next=cell.id;bestRow=row;bestColumn=column;}
  }
  return next;
}
function kitPose(width,height,bw,bh,progress,now){
  const targetScale=f(Math.max(.1,Math.min(1,f((width-32)/(bw+216)),f((height-96)/bh)))),scale=lerp(progress,1,targetScale),p=phase(now);
  return {x:lerp(progress,Math.trunc((width-bw)/2),f((width-f((bw+216)*targetScale))/2)),y:f(lerp(progress,Math.trunc((height-bh)/2),f((height-f(bh*targetScale))/2))-f(f(f(sine(f(p*5))*2.5)*progress)*scale)),scale,tilt:f(f(sine(f(p*4))*.35)*progress)};
}
function loadingCells(centerX,centerY,now,opacity,size=5,gap=2){return [0,1,2,5,8,7,6,3].map((cell,index)=>{const head=f((now%960)/120),trail=f(.5+.5*Math.cos(f(index-head)*Math.PI*2/8));return {x:centerX+(cell%3-1)*(size+gap)-Math.floor(size/2),y:centerY+(Math.floor(cell/3)-1)*(size+gap)-Math.floor(size/2),alpha:Math.round(f(opacity*f(.2+f(.8*f(f(trail*trail)*trail)))))};});}
const api={Cards,Spring,KitCarousel,Reorder,Transition,ease,kitPose,partyLayout,portraitNeighbor,loadingCells};
if(typeof module!=='undefined')module.exports=api;else globalThis.HeritagePresentation=api;
})();
