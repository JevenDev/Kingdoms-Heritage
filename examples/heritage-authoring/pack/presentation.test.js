'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Motion=require('./presentation.js'),Preview=require('../editor/engine.js'),native=require('./native-presentation.json');
const nativeRoot=path.resolve(__dirname,'../../../src/main/java/com/jvn/kingdomsheritage');
const near=(actual,expected,message,tolerance=.0001)=>assert.ok(Math.abs(actual-expected)<=tolerance,message+': '+actual+' != '+expected);
test('native animation fixtures track the current game implementation',()=>{
  for(const [file,expected] of Object.entries(native.nativeSources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(nativeRoot,file),'utf8').replaceAll('\r\n','\n')).digest('hex'),expected,file+' changed, capture native presentation frames again');
  for(const name of ['selection_dissolve','selection_music_toast'])assert.equal(fs.readFileSync(path.join(__dirname,'assets/'+name+'.fsh'),'utf8').replaceAll('\r\n','\n'),fs.readFileSync(path.resolve(nativeRoot,'../../../../resources/assets/kingdomsheritage/shaders/core/'+name+'.fsh'),'utf8').replaceAll('\r\n','\n'));
});
test('card hover, confirmation, reverse motion, expansion and staggered collapse match native frames',()=>{
  const cards=new Motion.Cards(['test:0','test:1','test:2','test:3'],640,360,12345);
  native.actions.forEach(([elapsed,action,x,y],index)=>{
    const now=12345+elapsed;if(action===1||action===2)cards.confirm('test:0',action===1,now);if(action===3)cards.expand('test:0',now);
    const frame=cards.frame(now,{x,y}),expected=native.frames[index];near(frame.progress,expected.progress,'confirmation at '+now);
    cards.cards.forEach((card,cardIndex)=>{const actual={...card.layout,lift:card.lift,tilt:card.tilt,hover:card.hover,selection:card.selection};for(const [key,value] of Object.entries(expected.cards[cardIndex]))near(actual[key],value,now+' card '+cardIndex+' '+key);});
  });
});
test('interrupting confirmation reverses from the current pose without jumping',()=>{
  const cards=new Motion.Cards(['a','b'],427,240,0);cards.confirm('a',true,0);cards.frame(150);const before=cards.cards[0].pose();cards.confirm('a',false,150);const after=cards.cards[0].pose();
  for(const key of ['x','y','scale','tilt'])near(after[key],before[key],key);
  assert.equal(cards.at(200,100,151),null);cards.frame(700);assert.equal(cards.progress(700),0);assert.equal(cards.cards[0].layout.x,126);
});
test('overlapping card hit strips retain neighbouring cards and keyboard focus',()=>{
  const ids=Array.from({length:10},(_,index)=>String(index)),cards=new Motion.Cards(ids,320,240,0);cards.frame(0);
  for(let index=0;index<9;index++){const x=Math.round(cards.cards[index].layout.x);assert.equal(cards.at(x+1,60,0).id,String(index));}
  assert.equal(cards.frame(50,{keyboard:true,focused:'6'}).foreground,'6');cards.expand('6',50);cards.frame(400);assert.equal(cards.cards[6].layout.width,374);assert.equal(cards.cards[0].layout.opacity,0);
});
test('screen fades wait for black, block reentry and reveal over the native 300 milliseconds',()=>{
  const transition=new Motion.Transition();let calls=0;assert.equal(transition.fade(100,()=>{calls++;transition.reveal(400);}),true);assert.equal(transition.fade(101,()=>calls++),false);
  near(transition.opacity(250),.5,'fade midpoint');transition.tick(399);assert.equal(calls,0);transition.tick(400);assert.equal(calls,1);near(transition.opacity(400),1,'black');near(transition.opacity(550),.5,'reveal midpoint');transition.tick(700);assert.equal(transition.phase,'idle');
});
test('location page animations slide and fade from the native offsets',()=>{
  const cards=new Motion.Cards(['a','b'],480,270,0);
  const {x:initial,scale}=cards.cards[0].layout,outgoing=cards.turn(['c','d'],1,100);
  near(cards.cards[0].layout.x,initial+24*scale,'entering position');assert.equal(cards.cards[0].layout.opacity,0);
  outgoing[0].sample(280);near(outgoing[0].layout.x,initial-24*scale,'leaving position');assert.equal(outgoing[0].layout.opacity,0);
  cards.frame(350);near(cards.cards[0].layout.x,initial,'settled position');assert.equal(cards.cards[1].layout.opacity,1);
});
test('kit carousel matches native sizing and retains velocity when retargeted',()=>{
  const carousel=new Motion.KitCarousel(1,100),bounds={x:152,y:52,width:176,height:166};
  const poses=carousel.poses(bounds,480,3,100);
  assert.deepEqual(poses.at(-1),{index:1,distance:0,scale:1,look:1,opacity:1,x:152,y:52});
  near(poses[0].scale,.68,'neighbor scale');near(poses[0].opacity,.32,'neighbor opacity');assert.equal(poses[0].look,0);
  near(poses[0].x,12.96,'left position');
  carousel.select(2,100);const moving=carousel.motion(180);assert.ok(moving.position>1&&moving.position<2);
  const inMotion=carousel.poses(bounds,480,3,180),old=inMotion.find(pose=>pose.index===1),next=inMotion.find(pose=>pose.index===2);
  assert.ok(old.look>0&&old.look<1&&next.look>0&&next.look<1);near(old.look+next.look,1,'cursor look transfers between kits');
  carousel.select(0,180);near(carousel.motion(180).position,moving.position,'retarget position');near(carousel.motion(180).velocity,moving.velocity,'retarget speed');
  assert.deepEqual(carousel.poses(bounds,480,3,180),inMotion);
  assert.deepEqual(carousel.motion(1180),{position:0,velocity:0});
});
test('player list uses eight native portrait slots and centers the roster with its summary',()=>{
  const measure=value=>value.length*6;
  const solo=Motion.partyLayout(480,270,97,80,90,1,0,0,measure),party=Motion.partyLayout(480,270,97,80,90,0,30,0,measure);
  assert.equal(solo.top,94);assert.equal(solo.otherCenter-solo.partyCenter,193);
  assert.deepEqual(solo.slots.map(slot=>slot.y),[114,114,114,114,150,150,150,150]);
  assert.equal(solo.slots[3].x-solo.slots[0].x,108);
  assert.equal(party.top,75);assert.equal(party.summaryY,165);
  const paged=Motion.partyLayout(480,270,97,80,90,20,30,1,measure);
  assert.equal(paged.pageCount,2);assert.equal(paged.first,12);assert.equal(paged.others.length,8);
});
test('portrait arrow navigation follows rows and stays on the same roster when vertical',()=>{
  const cells=[
    {id:'self',x:10,y:10,party:true},{id:'member',x:40,y:10,party:true},
    {id:'other',x:100,y:10,party:false},{id:'below',x:110,y:46,party:false}
  ];
  assert.equal(Motion.portraitNeighbor(cells,'self',1,false),'member');
  assert.equal(Motion.portraitNeighbor(cells,'member',1,false),'other');
  assert.equal(Motion.portraitNeighbor(cells,'member',1,true),undefined);
  assert.equal(Motion.portraitNeighbor(cells,'other',1,true),'below');
});
test('cinematic bar seed and visibility match native RandomSource and float calculations',()=>{
  for(const {token,slant} of native.bars){near(Preview.sampleSlant(token),slant,token,.000001);assert.equal(Preview.sampleSlant(token,'straight'),0);}
  for(const {ticks,visibility} of native.visibility)near(Preview.barVisibility(ticks,100,12),visibility,'visibility at '+ticks,.000001);
});
test('inventory confirmation keeps native bounds and applies the floating pose',()=>{
  assert.deepEqual(Motion.kitPose(640,360,176,166,0,12345),{x:232,y:97,scale:1,tilt:0});const pose=Motion.kitPose(640,360,176,166,1,12345);near(pose.x,124,'confirmation left');assert.ok(Math.abs(pose.y-97)<=2.5);assert.ok(Math.abs(pose.tilt)<=.35);
});

test('cinematic bar rasterization matches native shader frame digests',()=>{
  const vm=require('node:vm'),fixture=require('./native-bars.json'),shader=fs.readFileSync(path.resolve(nativeRoot,'../../../../resources/assets/kingdomsheritage/shaders/core/dialogue_cinematic_bars.fsh'),'utf8').replaceAll('\r\n','\n');
  assert.equal(crypto.createHash('sha256').update(shader).digest('hex'),fixture.shaderSha256);
  const context=vm.createContext({HeritagePreview:Preview});vm.runInContext(fs.readFileSync(path.join(__dirname,'../editor/renderer.js'),'utf8'),context);
  for(const frame of fixture.frames){
    const pixels=new Uint8Array(frame.width*frame.height),ctx={canvas:{width:frame.width,height:frame.height},save(){},restore(){},setTransform(){},fillRect(x,y,w,h){for(let row=Math.max(0,y);row<Math.min(frame.height,y+h);row++)pixels.fill(255,row*frame.width+x,row*frame.width+x+w);}};
    const renderer=new context.HeritageCanvas(ctx),config={...Preview.defaults,animation:'immediate',hold_ticks:88,fade_out_ticks:12,fade_from_black_ticks:1,bar_transition_ticks:12,cinematic_bars:true,bar_style:'random',bar_height:frame.barHeight??26};
    renderer.bars(frame.w,frame.h,frame.ticks,config,frame.slant);assert.equal(crypto.createHash('sha256').update(pixels).digest('hex'),frame.hash,JSON.stringify(frame));
  }
});

test('reorder previews slide into new slots without mutating the saved order',()=>{
  const saved=new Map([['a',40],['b',184],['c',328]]),original=[...saved],motion=new Motion.Reorder();motion.seed(saved);
  const target=new Map([['b',40],['c',184],['a',328]]),first=motion.frame(target,100);assert.equal(first.get('b'),184);assert.equal(first.get('c'),328);assert.equal(motion.active,true);
  const midway=motion.frame(target,190);assert.ok(midway.get('b')>40&&midway.get('b')<184);assert.ok(midway.get('c')>184&&midway.get('c')<328);
  assert.deepEqual([...motion.frame(target,280)], [...target]);assert.equal(motion.active,false);assert.deepEqual([...saved],original);
});

test('changing a reorder target or cancelling reverses from the current position',()=>{
  const saved=new Map([['a',40],['b',184]]),target=new Map([['b',40],['a',184]]),motion=new Motion.Reorder();motion.seed(saved);motion.frame(target,100);
  const current=motion.frame(target,160),cancelled=motion.frame(saved,160);assert.deepEqual([...cancelled], [...current].sort(([a],[b])=>a.localeCompare(b)));
  assert.deepEqual([...motion.frame(saved,340)], [...saved]);assert.equal(motion.active,false);
});

test('reorder previews retain entering and leaving page positions and support reduced motion',()=>{
  const motion=new Motion.Reorder();motion.seed(new Map([['old',100],['incoming',-128]]));const target=new Map([['old',-128],['incoming',100]]);motion.frame(target,0);assert.deepEqual([...motion.frame(target,180)], [...target]);motion.frame(new Map([['incoming',100]]),200);assert.equal(motion.positions.has('old'),false);
  const instant=new Motion.Reorder(0);instant.seed(new Map([['a',40]]));assert.equal(instant.frame(new Map([['a',328]]),10).get('a'),328);assert.equal(instant.active,false);
});
