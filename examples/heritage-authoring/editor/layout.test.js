'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('./engine.js');
const advance=glyph=>glyph.ch===' '?4:6;
const sample=(config,width,height)=>{
  const main=P.parse(config.text),sub=P.parse(config.subtitle,{},main.length+1);
  return P.layout(config,main,sub,width,height,advance);
};
test('cinematic bars never change text anchors, wrapping or fitted scale',()=>{
  for(const [width,height] of [[320,240],[480,270],[640,360],[960,540]])for(const position of Object.keys(P.positions))for(const custom of [false,true]){
    const config={...P.defaults,text:'An arrival in the rolling Plains beyond the village',subtitle:'A new journey begins.',title:true,title_position:position,subtitle_position:position,cinematic_bars:false};
    if(custom){config.title_coordinates={x:20,y:30,width:35};config.subtitle_coordinates={x:80,y:75,width:40};}
    const expected=sample(config,width,height);
    for(const style of ['straight','random'])for(const ticks of [1,40,1200])for(const bar_height of [1,26,64,1200])assert.deepEqual(sample({...config,cinematic_bars:true,bar_style:style,bar_transition_ticks:ticks,bar_height},width,height),expected);
  }
});
test('top and bottom anchors use the screen margin independently of bars',()=>{
  for(const cinematic_bars of [false,true])for(const [position,bottom] of [['top_left',false],['bottom_right',true]]){
    const config={...P.defaults,text:'Arrival',subtitle:'',title_position:position,subtitle_position:position,cinematic_bars};
    const [block]=sample(config,640,360);
    assert.equal(block.y,bottom?360-20-block.lines.length*block.lineHeight*block.scale:20);
  }
});
