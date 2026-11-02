'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./picture.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
test('center crop fills a card without stretching landscape or portrait sources',()=>{
  const landscape=P.rect(1200,600);assert.deepEqual(landscape,{x:400,y:0,width:400,height:600});
  const portrait=P.rect(400,1200);assert.deepEqual(portrait,{x:0,y:300,width:400,height:600});
});
test('zoom and edge positions keep every crop within the source',()=>{
  for(const [w,h] of [[128,192],[1400,700],[700,1400]])for(const x of [0,50,100])for(const y of [0,50,100])for(const zoom of [1,2,8]){const r=P.rect(w,h,{x,y,zoom});near(r.width/r.height,2/3);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+1e-8&&r.y+r.height<=h+1e-8);near(r.x,(w-r.width)*x/100);near(r.y,(h-r.height)*y/100);}
});
test('dragging moves the image with the pointer and clamps at the source edges',()=>{
  const crop={x:50,y:50,zoom:2},next=P.pan(1200,600,crop,128,-192,256,384);near(next.x,40);near(next.y,100);assert.deepEqual(crop,{x:50,y:50,zoom:2});assert.deepEqual(P.pan(128,192,P.defaults(),999,-999,256,384),P.defaults());assert.equal(P.pan(1200,600,crop,9999,0,256,384).x,0);
});
test('legacy cards remain editable using their saved PNG',()=>{
  const p=P.source({data:'data:image/png;base64,AAAA'});assert.equal(p.original,false);assert.equal(p.width,128);assert.deepEqual(p.crop,P.defaults());
});
test('saved crop sources are bounded and invalid metadata is rejected',()=>{
  const source={data:'data:image/webp;base64,AAAA',width:1200,height:600},crop={x:25,y:75,zoom:3};assert.deepEqual(P.source({source,crop}),{...source,crop,original:true});
  for(const bad of [null,{x:NaN,y:50,zoom:1},{x:0,y:101,zoom:1},{x:50,y:50,zoom:9},{x:'50',y:50,zoom:1}])assert.throws(()=>P.crop(bad));
  for(const bad of [{...source,width:2000},{...source,data:'https://example.com/pic.png'},{...source,data:'data:image/webp;base64,'+'A'.repeat(450000)}])assert.throws(()=>P.source({source:bad,crop}));
  assert.throws(()=>P.rect(0,192));assert.throws(()=>P.pan(128,192,P.defaults(),0,0,0,384));
});

test('source overview letterboxes the image and maps the exact crop rectangle',()=>{
  const view=P.overview(1200,600,{x:100,y:50,zoom:1},400,320);assert.deepEqual(view.image,{x:0,y:60,width:400,height:200});near(view.window.x,800/3);near(view.window.width,400/3);near(view.window.y,60);near(view.window.height,200);
  const portrait=P.overview(400,1200,P.defaults(),400,320);near(portrait.image.x,(400-400*320/1200)/2);near(portrait.window.height,160);assert.throws(()=>P.overview(128,192,P.defaults(),0,320));
});
test('placing a crop centers on the selected source point and keeps the rectangle in bounds',()=>{
  assert.deepEqual(P.place(1200,600,P.defaults(),200,300),{x:0,y:50,zoom:1});assert.deepEqual(P.place(1200,600,P.defaults(),1000,300),{x:100,y:50,zoom:1});assert.deepEqual(P.place(128,192,P.defaults(),0,9999),P.defaults());
  const centered=P.place(1200,600,{x:0,y:0,zoom:2},600,300);near(centered.x,50);near(centered.y,50);assert.throws(()=>P.place(1200,600,P.defaults(),NaN,0));
});

test('source-resolution crops use native pixels without changing the framing',()=>{
  assert.deepEqual(P.dimensions(2400,1600,P.defaults()),{width:128,height:192});
  assert.deepEqual(P.dimensions(2400,1600,P.defaults(),true),{width:1067,height:1600});
  assert.deepEqual(P.dimensions(2400,1600,{x:80,y:20,zoom:2},true),{width:533,height:800});
  assert.deepEqual(P.dimensions(64,96,P.defaults(),true),{width:64,height:96});
  for(const [width,height] of [[9000,100],[5000,5000]])assert.throws(()=>P.dimensions(width,height,P.defaults(),true),/16 megapixels/);
});
test('preserved originals accept full-size JPEG, PNG and WebP with bounded dimensions and data',()=>{
  for(const type of ['jpeg','png','webp']){
    const source={data:'data:image/'+type+';base64,AAAA',width:2400,height:1600,preserved:true},picture={source,crop:P.defaults()};assert.equal(P.source(picture).data,source.data);
    assert.throws(()=>P.source({...picture,source:{...source,preserved:false}}));
    for(const bad of [{width:9000},{width:5000,height:5000},{data:'data:image/svg+xml;base64,AAAA'},{data:source.data+'A'.repeat(14*1024*1024)}])assert.throws(()=>P.source({...picture,source:{...source,...bad}}));
  }
});
