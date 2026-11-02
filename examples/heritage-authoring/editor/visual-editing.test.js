'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./engine.js'),R=require('./rich-text.js'),T=require('./timeline.js');
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
test('long world fades show the extended text hold and disable misleading boundary edits',()=>{
  const config={...P.defaults,fade_from_black_ticks:500},model=T.layout(config);assert.equal(model.extended,true);assert.equal(model.tracks[1].segments[1].to,model.total-config.fade_out_ticks);assert.equal(model.tracks[1].segments[1].disabled,true);assert.equal(model.tracks[1].segments[2].disabled,true);
});
test('bar tracks use the native half-duration cap without rewriting configured values',()=>{
  const config={...P.defaults,bar_transition_ticks:1200},model=T.layout(config),enter=model.tracks[2].segments[0],exit=model.tracks[2].segments[2];assert.equal(enter.to-enter.from,P.presentation(config)/2);assert.equal(exit.to-exit.from,P.presentation(config)/2);assert.equal(config.bar_transition_ticks,1200);
});
test('immediate reveals and disabled bars remain visible as non-editable timing dependencies',()=>{
  const model=T.layout({...P.defaults,animation:'immediate',cinematic_bars:false});assert.equal(model.tracks[1].segments[0].to,model.start);assert.equal(model.tracks[1].segments[0].disabled,true);assert.equal(model.tracks[2].disabled,true);
});
