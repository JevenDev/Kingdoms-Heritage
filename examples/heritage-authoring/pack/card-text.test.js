'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('./card-text.js'),P=require('../editor/engine.js');
const glyphs=text=>Array.from(text).map(ch=>({ch,effect:{}})),advance=g=>g.ch===' '?4:6;
test('title fit uses the native scale, line width and three-line cap',()=>{
  const short=T.title(glyphs('Camp'),advance,P.wrap);assert.equal(short.scale,2);assert.equal(short.clipped,false);assert.equal(short.lines.length,1);
  const long=T.title(glyphs('A long title that needs more than three lines to fit the card'),advance,P.wrap);assert.equal(long.scale,1.5);assert.equal(long.lines.length,3);assert.ok(long.totalLines>3);assert.equal(long.clipped,true);assert.equal(long.y,192-18-Math.round(((3-1)*9+8)*1.5));
});
test('subtitle fit includes the exact native edge and keeps Unicode characters intact',()=>{
  assert.deepEqual(T.subtitle(glyphs('a'.repeat(19)),advance),{text:'a'.repeat(19),clipped:false});assert.deepEqual(T.subtitle(glyphs('a'.repeat(20)),advance),{text:'a'.repeat(19),clipped:true});
  assert.deepEqual(T.subtitle(glyphs('😀'.repeat(20)),advance),{text:'😀'.repeat(19),clipped:true});assert.deepEqual(T.subtitle([],advance),{text:'',clipped:false});
});
