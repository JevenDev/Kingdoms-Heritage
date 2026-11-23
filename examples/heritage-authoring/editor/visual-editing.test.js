'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./engine.js'),R=require('./rich-text.js'),T=require('./timeline.js'),Scenes=require('./scenes.js');
const text=source=>P.parse(source).map(glyph=>glyph.ch).join('');
test('visual text keeps resolved location placeholders as atomic source ranges',()=>{
  const source='<wave><gold><biome></gold></wave>...';const atoms=R.atoms(source,{biome:'Birch Forest'});assert.equal(atoms[0].token,'biome');assert.equal(atoms[0].text,'Birch Forest');assert.equal(source.slice(atoms[0].start,atoms[0].end),'<biome>');assert.equal(atoms[0].style.effect.wave,true);assert.equal(atoms[0].style.tint,P.colors.gold);
});
test('formatting across differently styled runs keeps tags balanced and unselected text intact',()=>{
  const source='<bold>ab</bold> cd',result=R.format(source,source.indexOf('b</'),source.lastIndexOf('d'),'<italic>','</italic>');assert.equal(text(result.source),'ab cd');const glyphs=P.parse(result.source);assert.equal(glyphs[0].effect.italic,undefined);assert.equal(glyphs[1].effect.italic,true);assert.equal(glyphs[3].effect.italic,true);assert.equal(glyphs[4].effect.italic,undefined);assert.equal(glyphs[0].effect.bold,true);assert.equal(glyphs[4].effect.bold,undefined);
});
test('replacing a visible selection preserves the surrounding formatting structure',()=>{
  const source='<bold>ab</bold> cd',result=R.replace(source,source.indexOf('b</'),source.lastIndexOf('d'),'X');assert.equal(text(result.source),'aXd');assert.equal(P.parse(result.source)[0].effect.bold,true);
});
test('partial placeholder selections expand to the whole token',()=>{
  const source='At <biome>!',result=R.replace(source,5,7,'Home');assert.equal(result.source,'At Home!');const styled=R.format(source,5,7,'<bold>','</bold>');assert.ok(styled.source.includes('<bold><biome></bold>'));assert.equal(text(styled.source),'At Plains!');
});
test('visual source mapping handles unicode, legacy colors, literal tags and line endings',()=>{
  const source='§aHi 😀\r\n<unknown>!';const atoms=R.atoms(source);assert.equal(atoms.map(atom=>atom.text).join(''),text(source));assert.equal(atoms.find(atom=>atom.text==='😀').end-atoms.find(atom=>atom.text==='😀').start,2);const result=R.format(source,0,source.length,'<italic>','</italic>');assert.equal(text(result.source),text(source));
});
test('collapsed formatting selections style the whole visible field',()=>{
  const result=R.format('Welcome <biome>',0,0,'<underline>','</underline>');assert.equal(text(result.source),'Welcome Plains');assert.ok(P.parse(result.source).every(glyph=>glyph.effect.underline));
});
test('timeline tracks use the same total duration and black-screen offset as the native preview',()=>{
  const config={...P.defaults},model=T.layout(config);assert.equal(model.total,P.duration(config));assert.equal(model.tracks[2].segments[0].from,config.black_hold_ticks);assert.equal(model.tracks[1].segments.at(-1).to,model.total);assert.equal(model.tracks[0].segments[1].to,config.black_hold_ticks+config.fade_from_black_ticks);
});
test('long world fades retain their legacy layout while keeping text boundaries editable',()=>{
  const config={...P.defaults,fade_from_black_ticks:500},model=T.layout(config);assert.equal(model.extended,true);assert.equal(model.tracks[1].segments[1].to,model.total-config.fade_out_ticks);assert.equal(model.tracks[1].segments[1].disabled,false);assert.equal(model.tracks[1].segments[2].disabled,false);
});
test('bar tracks use the native half-duration cap without rewriting configured values',()=>{
  const config={...P.defaults,bar_transition_ticks:1200},model=T.layout(config),enter=model.tracks[2].segments[0],exit=model.tracks[2].segments[2];assert.equal(enter.to-enter.from,P.presentation(config)/2);assert.equal(exit.to-exit.from,P.presentation(config)/2);assert.equal(config.bar_transition_ticks,1200);
});
test('immediate reveals and disabled bars remain visible as non-editable timing dependencies',()=>{
  const model=T.layout({...P.defaults,animation:'immediate',cinematic_bars:false});assert.equal(model.tracks[1].segments[0].to,model.start);assert.equal(model.tracks[1].segments[0].disabled,true);assert.equal(model.tracks[2].disabled,true);
});

test('editing a bar exit materializes independent tracks without changing the enter or text timing',()=>{
  const config={...P.defaults,fade_from_black_ticks:500},original=JSON.stringify(config),before=T.layout(config),patch=T.changes(config,'timeline.bar_exit_ticks',15),next=P.updateJson(P.readJson(JSON.stringify(config)),patch).config,after=T.layout(next);assert.equal(next.timeline.bar_enter_ticks,before.tracks[2].segments[0].value);assert.equal(next.timeline.bar_exit_ticks,15);assert.equal(next.hold_ticks,before.tracks[1].segments[1].value);assert.deepEqual(after.tracks[1].segments.map(segment=>[segment.from,segment.to]),before.tracks[1].segments.map(segment=>[segment.from,segment.to]));assert.equal(JSON.stringify(config),original);
  const moved=P.updateJson(P.readJson(JSON.stringify(next)),T.changes(next,'timeline.bar_start_ticks',5)).config;assert.equal(P.textStart(moved),P.textStart(next));assert.equal(moved.black_hold_ticks,next.black_hold_ticks);assert.equal(moved.timeline.bar_enter_ticks,next.timeline.bar_enter_ticks);
});
test('world fade changes and text hold changes no longer resize other tracks',()=>{
  const config=P.updateJson(P.readJson(JSON.stringify(P.defaults)),T.changes(P.defaults,'fade_from_black_ticks',500)).config,model=T.layout(config);assert.equal(model.tracks[1].segments.at(-1).to,P.defaults.black_hold_ticks+P.presentation(P.defaults));assert.equal(model.tracks[0].segments.at(-1).to,560);assert.equal(model.tracks[2].segments.at(-1).to,180);
  const next=P.updateJson(P.readJson(JSON.stringify(config)),T.changes(config,'hold_ticks',10)).config;assert.equal(T.layout(next).tracks[2].segments.at(-1).to,180);assert.equal(next.fade_from_black_ticks,500);assert.equal(T.layout(next).tracks[1].segments[1].value,10);
});

test('preview waits for the overlay to end before showing early scene pauses',()=>{
  const config={...P.defaults,scene:{duration_ticks:82,smooth_camera_return:true,wait_at_ticks:[20,40]}};
  const overlay=P.overlayDuration(config),preview=Scenes.timing(config);
  assert.equal(preview.total,overlay+94);
  assert.deepEqual(preview.waits.map(wait=>[wait.tick,wait.at,wait.end]),[[20,overlay,overlay+10],[40,overlay+30,overlay+40]]);
  assert.equal(Scenes.clipTime(overlay+5,preview),20);
  assert.equal(Scenes.clipTime(overlay+35,preview),40);
  assert.equal(T.layout(config).total,preview.total);

  const short={...config,black_hold_ticks:0,fade_from_black_ticks:1,animation:'immediate',hold_ticks:1,fade_out_ticks:1};
  assert.equal(Scenes.timing(short).total,114);
  assert.deepEqual(Scenes.timing(short).waits.map(wait=>wait.at),[20,50]);
});

test('preview uses native prompt text, sample bindings and yellow bracketed keys',()=>{
  const {label,glyphs}=Scenes.prompt({});
  assert.equal(label,'E');
  assert.equal(glyphs.map(glyph=>glyph.ch).join(''),'Press [E] to continue');
  assert.equal(glyphs.filter(glyph=>glyph.tint===P.colors.yellow).map(glyph=>glyph.ch).join(''),'[E]');
  const custom=Scenes.prompt({key:'key.jump',prompt:'Press {key} to stand {key} in {biome} <bold>'},{keys:{'key.jump':'J'}});
  assert.equal(custom.label,'J');
  assert.equal(custom.glyphs.map(glyph=>glyph.ch).join(''),'Press [J] to stand [J] in {biome} <bold>');
  assert.equal(Scenes.prompt({key:'key.other'},{keys:{'key.inventory':'I'}}).label,'I');
});

test('an explicit disabled scene stays distinct from an inherited scene',()=>{
  const original=P.readJson(JSON.stringify({intro:{text:'Welcome'}}));
  const disabled=P.updateJson(original,{scene:null});
  assert.equal(disabled.document.intro.scene,null);
  assert.equal(T.layout(disabled.config).scene,null);
  assert.equal(P.updateJson(disabled,{scene:undefined}).config.scene,undefined);
});

test('cinematic pauses round-trip through the timeline, including legacy pause ticks',()=>{
  const initial=P.readJson(JSON.stringify({text:'Wake up',scene:{animation_file:'example:wake',clip:'animation.wake',duration_ticks:82,wait_at_ticks:[20],smooth_camera_return:true}}));
  const first=T.withPause(initial.config.scene,20,{tick:21,key:'key.jump',prompt:'Press {key} to stand'});
  const scene=T.withPause(first,null,{tick:12,key:'key.inventory'});
  const updated=P.updateJson(initial,{scene});
  assert.equal(updated.config.scene.wait_at_ticks,undefined);
  assert.deepEqual(P.scenePauses(updated.config.scene),[{tick:12,key:'key.inventory'},{tick:21,key:'key.jump',prompt:'Press {key} to stand'}]);
  assert.equal(T.layout(updated.config).scene.animation_file,'example:wake');
  assert.equal(P.duration({...updated.config,black_hold_ticks:0,fade_from_black_ticks:1,animation:'immediate',hold_ticks:1,fade_out_ticks:1}),94);
  assert.throws(()=>P.updateJson(updated,{scene:{...scene,duration_ticks:21}}),/inside the clip/);
  assert.throws(()=>P.updateJson(updated,{scene:T.withPause(scene,null,{tick:12})}),/in order/);
  assert.throws(()=>P.updateJson(updated,{scene:{...scene,pauses:[{tick:8,key:'Space key'}]}}),/binding name/);
  assert.equal(P.updateJson(updated,{scene:undefined}).document.scene,undefined);
});
