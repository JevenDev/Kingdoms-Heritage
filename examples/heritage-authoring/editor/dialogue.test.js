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
