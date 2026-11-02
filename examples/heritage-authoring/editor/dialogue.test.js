'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./engine.js'),R=require('./rich-text.js');
const plain=(source,names)=>P.parse(source,names).map(glyph=>glyph.ch).join('');
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
