(() => {
'use strict';
function title(glyphs,advance,wrap){
  const width=glyphs.reduce((sum,glyph)=>sum+advance(glyph),0),scale=Math.fround(Math.max(1.5,Math.min(2,Math.fround(114/Math.max(1,width))))),all=wrap(glyphs,Math.trunc(Math.fround(114/scale)),advance),lines=all.slice(0,3);
  return {scale,lines,totalLines:all.length,clipped:all.length>3,y:192-18-Math.round(Math.fround(((lines.length-1)*9+8)*scale))};
}
function subtitle(glyphs,advance){
  let width=0,count=0;for(const glyph of glyphs){const next=width+advance(glyph);if(next>114)break;width=next;count++;}
  return {text:glyphs.slice(0,count).map(glyph=>glyph.ch).join(''),clipped:count<glyphs.length};
}
const api={title,subtitle};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageCardText=api;
})();
