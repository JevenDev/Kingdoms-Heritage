'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./engine.js'),R=require('./rich-text.js');
const plain=(source,names)=>P.parse(source,names).map(glyph=>glyph.ch).join('');
const resolved=(config,names={})=>{const value=P.dialogue({...P.packDefaults,...config},names);return plain(value.text,value.names);};
test('variables use pack defaults, preserve component styles and accept extension overrides',()=>{
  const config={text:'For <var:story:faction>',variables:{'story:faction':{text:'Oak',color:'gold'}}},value=P.dialogue({...P.packDefaults,...config});
  assert.equal(resolved(config),'For Oak');
  assert.equal(P.parse(value.text,value.names).at(-1).tint,P.colors.gold);
  assert.equal(resolved(config,{variables:{'story:faction':'Birch'}}),'For Birch');
  assert.equal(resolved({text:'<var:story:count>',variables:{'story:count':0}}),'0');
});
test('variants use stable facts, first-match order and inherited subtitle',()=>{
  const config={text:'Solo',subtitle:'Welcome',variants:[{when:{all:[{tag:'party_size',min:2},{tag:'kit',equals:'story:ranger'}]},text:'Together'},{when:{tag:'party_size',min:2},text:'Party'}]};
  assert.equal(resolved(config,{party_size:'3',facts:{kit:'story:ranger'}}),'Together');
  assert.equal(resolved(config,{party_size:'3',facts:{kit:'story:mage'}}),'Party');
  assert.equal(resolved(config),'Solo');
  assert.equal(P.dialogue({...P.packDefaults,...config},{party_size:'3'}).subtitle,'Welcome');
  assert.equal(P.condition({not:{tag:'companions',present:true}},{companions:''}),true);
  assert.equal(P.condition({tag:'n',min:2},{n:'oops3'}),false);
});
test('translated fallbacks and keybinding overrides use the same resolver',()=>{
  const config={text:'<structure> <companions|alone> <key:inventory> <key:my_mod.action|unbound>',fallbacks:{structure:{text:'Home',bold:true}}};
  assert.equal(resolved(config,{structure:'',keys:{'key.inventory':'I'}}),'Home alone I unbound');
  assert.equal(resolved({text:'<key:curios.key.open_curios>'},{keys:{'curios.key.open_curios':'G'}}),'G');
});
test('dialogue validation rejects invalid conditions, IDs and oversized branch collections',()=>{
  const config=value=>JSON.stringify({text:'Hello',...value});
  for(const when of [{all:[]},{tag:'party_size',min:4,max:2},{tag:'party_size',present:'yes'},{tag:'kit',equals:[]},{tag:'kit'},{any:[{tag:'kit',equals:'x'}],extra:true}])assert.throws(()=>P.readJson(config({variants:[{when,text:'Branch'}]})));
  assert.throws(()=>P.readJson(config({variables:{faction:'Oak'}})));
  assert.throws(()=>P.readJson(config({variants:Array.from({length:33},()=>({when:{tag:'kit',present:true},text:'x'}))})));
});
test('unknown tags are diagnosed without treating valid styles or missing known tags as typos',()=>{
  assert.equal(P.diagnostics({...P.packDefaults,text:'<gold><player></gold> <companions> <oops>'}).length,1);
});
test('pacing cues keep code-point offsets and extend the reveal through trailing pauses',()=>{
  const all=P.parse('A<pause=500><speed=0.5>😀B<pause=200>'),timing=P.schedule(all,all.cues,100);
  assert.equal(all.map(glyph=>glyph.ch).join(''),'A😀B');
  assert.equal(timing.durationMillis,1200);
  assert.equal(timing.durationTicks,24);
  const thirds=P.schedule(P.parse('A'.repeat(61)),[],2000/61);assert.equal(thirds.durationTicks,40);assert.equal(thirds.visible(2000),61);
  assert.deepEqual([99,100,799,800,1000,1200].map(time=>timing.visible(time)),[0,1,1,2,3,3]);
  const atoms=R.atoms('A<pause=500>B');assert.equal(atoms[1].cue,true);assert.equal(atoms[2].style.tint,0xffffff);
});
test('pacing validation shares VR bounds and ignores cues for immediate and fade-in modes',()=>{
  for(const text of ['<pause=-1>','<pause=1.5>','<pause=60001>','<speed=0>','<speed=11>','</speed>','<pause>'])assert.throws(()=>P.readJson(JSON.stringify({text})));
  for(const animation of ['immediate','fade_in']){
    const config={...P.defaults,text:'A<pause=60000>B',animation};
    assert.equal(P.revealDuration(config),animation==='immediate'?0:config.reveal_ticks);
  }
  const config={...P.defaults,text:'A<pause=500>B',subtitle:'',animation:'letter_by_letter'};
  assert.equal(P.revealDuration(config),50);
  assert.equal(P.duration(config),config.black_hold_ticks+50+config.hold_ticks+config.fade_out_ticks);
});
test('authoring pacing matches the native overlay across modes, Unicode, variables and trailing pauses',()=>{
  for(const sample of require('./native-pacing.json')){
    const config=P.readJson(JSON.stringify(sample.intro)).config,playback=P.playback(config);
    assert.equal(playback.all.map(glyph=>glyph.ch).join(''),sample.text);
    assert.equal(P.revealDuration(config),sample.revealTicks);
    assert.equal(P.duration(config),sample.durationTicks);
    assert.deepEqual(sample.visible.map((_,tick)=>P.visible(config,playback.all,tick,playback.ends,playback.timing)),sample.visible);
  }
});
test('pacing validates the combined track and rejects invalid extension samples',()=>{
  assert.throws(()=>P.readJson(JSON.stringify({text:'A'+ '<pause=0>'.repeat(33),subtitle:'B'+ '<pause=0>'.repeat(32)})),/64 pacing cues/);
  assert.throws(()=>P.validateSamples({variables:{'story:faction':null}}));
  assert.throws(()=>P.validateSamples({keys:{'key.inventory':{text:'I'}}}));
  const config={...P.packDefaults,text:'<party_size> <party_leader>',variants:[]};
  assert.equal(resolved(config,{player:'Sam',party_leader:'Jo'}),'1 Sam');
  assert.equal(resolved(config,{facts:{party_size:3},party_leader:'Jo'}),'3 Jo');
});
test('core dialogue tags share sample values and preserve empty companions',()=>{
  const source=Object.keys(P.contextDefaults).map(key=>'<'+key+'>').join('/');
  assert.equal(plain(source),Object.values(P.contextDefaults).join('/'));
  assert.equal(plain('<party_leader> / <party_size> / <companions>'),'Alex / 1 / ');
  assert.equal(plain('<player> and <party_leader>',{player:'Sam',party_leader:'Jo'}),'Sam and Jo');
});
test('fallbacks handle missing values while unknown tags stay visible',()=>{
  assert.equal(plain('<companions|your own courage>'),'your own courage');
  assert.equal(plain('<unknown> <unknown|home>'),'<unknown> home');
  assert.equal(plain('<structure|home>',{structure:''}),'home');
});
test('context substitutions remain atomic and inherit surrounding styles',()=>{
  const source='<gold><party_leader></gold>',atoms=R.atoms(source,{party_leader:'Sam'});
  assert.equal(atoms.length,1);assert.equal(atoms[0].text,'Sam');assert.equal(atoms[0].style.tint,P.colors.gold);
  assert.equal(R.replace(source,8,10,'Jo').source,'<gold>Jo</gold>');
});

test('brace placeholders resolve beside legacy aliases and leave style braces literal',()=>{
  assert.equal(plain('{player} / <kit> / {companions|alone}'),'Alex / Traveler / alone');
  assert.equal(plain('{gold} <gold>{player}</gold> {unknown}'),'{gold} Alex {unknown}');
  assert.equal(P.parse('<gold>{player}</gold>').every(glyph=>glyph.tint===P.colors.gold),true);
  assert.equal(plain('<companions|{player}>'),'{player}');
  assert.equal(plain('{unknown|<gold>home</gold>}'),'home');
  assert.equal(P.diagnostics({...P.packDefaults,text:'{oops} <gold>{player}</gold> <pause=500>'}).length,1);
});

test('brace variables, conditions, keybindings and fallbacks match legacy playback',()=>{
  const base={...P.packDefaults,text:'{var:story:greeting}',subtitle:'{structure} {key:inventory} {key:missing|unbound}',variables:{'story:greeting':{text:'Welcome, {player}<pause=500>',bold:true}},fallbacks:{structure:{text:'Home',color:'gold'}},variants:[{when:{tag:'party_size',min:2},subtitle:'{party_leader} / {companions}'}],animation:'letter_by_letter'};
  for(const names of [{player:'Sam',structure:'',keys:{'key.inventory':'I'}},{player:'Sam',party_size:'2',party_leader:'Jo',companions:'Jo'}]){
    const legacy=JSON.parse(JSON.stringify(base).replace(/\{([a-z_][a-z0-9_:./-]*(?:\|[^{}]*)?)\}/g,'<$1>'));
    const a=P.playback(base,names),b=P.playback(legacy,names);
    assert.deepEqual(a.all,b.all);
    assert.equal(a.revealTicks,b.revealTicks);
    assert.equal(P.duration(base,names),P.duration(legacy,names));
  }
  assert.equal(resolved({text:'{var:story:message}'},{variables:{'story:message':'{player}'}}),'{player}');
});

test('visual brace placeholders preserve their spelling and source selection boundaries',()=>{
  const source='<gold>{party_leader}</gold> / <player>',atoms=R.atoms(source,{party_leader:'Jo'});
  assert.equal(atoms[0].token,'party_leader');
  assert.equal(atoms[0].source,'{party_leader}');
  assert.equal(atoms[0].text,'Jo');
  assert.equal(atoms[0].style.tint,P.colors.gold);
  assert.equal(atoms.at(-1).source,'<player>');
  assert.equal(R.replace(source,9,11,'Sam').source,'<gold>Sam</gold> / <player>');
});
