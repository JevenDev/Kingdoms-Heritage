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
