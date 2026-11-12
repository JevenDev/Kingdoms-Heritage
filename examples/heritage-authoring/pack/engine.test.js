'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Pack=require('./engine.js');
const Project=require('./project.js');
const Zip=require('./zip.js');
const png=fs.readFileSync(path.join(__dirname,'../heritage-example-resources/assets/heritage_example/textures/gui/locations/home.png'));
const picture=()=>({name:'Home.png',data:'data:image/png;base64,'+png.toString('base64')});
const catalog={kits:[],intros:[]};
function state() {
  const location=Pack.location('home');
  return {version:1,name:'My pack',namespace:'my_pack',description:'Card pictures',keepKits:true,keepLocations:false,kits:[],locations:[location],active:location.id};
}
const spawn=result=>JSON.parse(result.previewFiles.find(file=>file.path.includes('/spawns/location_1.json')).content);
function archiveFiles(bytes) {
  const entries=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset=0;
  while(view.getUint32(offset,true)===0x04034b50) {
    const length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
    const start=offset+30+nameLength+extraLength,content=bytes.slice(start,start+length);
    assert.equal(view.getUint32(offset+14,true),Zip.crc32(content));
    entries.set(new TextDecoder().decode(bytes.slice(offset+30,offset+30+nameLength)),content);
    offset=start+length;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  assert.equal(view.getUint16(bytes.length-12,true),entries.size);
  return entries;
}
test('existing projects retain player scaling without a resource pack',()=>{
  const input=state(),result=Pack.build(input,catalog);
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.resourceFiles,[]);
  assert.equal(result.pictureCount,0);
  assert.equal(spawn(result).image,undefined);
  assert.equal(JSON.parse(result.files.find(file=>file.path==='pack.mcmeta').content).pack.pack_format,48);
});
test('an uploaded picture exports a matching PNG and resource pack metadata',()=>{
  const input=state();input.locations[0].picture=picture();
  const result=Pack.build(input,catalog);
  assert.deepEqual(result.errors,[]);
  assert.equal(spawn(result).image,'my_pack:textures/gui/locations/location_1.png');
  assert.equal(result.pictureCount,1);
  assert.equal(JSON.parse(result.resourceFiles[0].content).pack.pack_format,34);
  assert.equal(JSON.parse(result.resourceFiles[0].content).pack.description,input.description);
  assert.equal(result.resourceFiles[1].path,'assets/my_pack/textures/gui/locations/location_1.png');
  assert.deepEqual(Buffer.from(result.resourceFiles[1].content),png);
});
test('renaming a pack or nested location updates both sides of the image reference',()=>{
  const input=state();input.namespace='renamed';input.locations[0].path='places/home';input.locations[0].picture=picture();
  const result=Pack.build(input,catalog);
  assert.deepEqual(result.errors,[]);
  const document=JSON.parse(result.files.find(file=>file.path==='data/renamed/heritage/spawns/places/home.json').content);
  assert.equal(document.image,'renamed:textures/gui/locations/places/home.png');
  assert.equal(result.resourceFiles[1].path,'assets/renamed/textures/gui/locations/places/home.png');
});
test('manual resource paths preserve uploaded pictures without exporting them',()=>{
  const input=state(),entry=input.locations[0];entry.picture=picture();entry.imageMode='manual';entry.fields.image='other_pack:textures/cards/camp.png';
  const result=Pack.build(input,catalog);
  assert.deepEqual(result.errors,[]);
  assert.equal(spawn(result).image,entry.fields.image);
  assert.deepEqual(result.resourceFiles,[]);
  assert.deepEqual(entry.picture,picture());
  assert.match(result.warnings.join(' '),/enabled resource pack/);
  entry.imageMode='upload';
  assert.equal(spawn(Pack.build(input,catalog)).image,'my_pack:textures/gui/locations/location_1.png');
});
test('legacy manual paths remain active and removing an upload uses the default picture',()=>{
  const input=state(),entry=input.locations[0];entry.fields.image='existing:textures/camp.png';
  assert.equal(spawn(Pack.build(input,catalog)).image,entry.fields.image);
  entry.imageMode='upload';
  assert.equal(spawn(Pack.build(input,catalog)).image,undefined);
});
test('all uploaded pictures are exported alongside locations that use manual paths',()=>{
  const input=state();input.locations[0].picture=picture();
  const second=Pack.location('forest',2);second.picture=picture();input.locations.push(second);
  const third=Pack.location('village',3);third.fields.image='existing:textures/village.png';input.locations.push(third);
  const result=Pack.build(input,catalog);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.pictureCount,2);
  assert.equal(result.resourceFiles.length,3);
  assert.equal(result.files.filter(file=>file.path.includes('/spawns/location_')).length,3);
});
test('invalid or oversized saved pictures block both pack exports with a location error',()=>{
  const wrongSize=Buffer.from(png);wrongSize.writeUInt32BE(256,16);
  for(const value of [null,{name:'url',data:'https://example.com/image.png'},{name:'bad',data:'data:image/png;base64,%%%='},{name:'bad',data:'data:image/png;base64,YWJj'}, {name:'wide',data:'data:image/png;base64,'+wrongSize.toString('base64')},{name:'large',data:'data:image/png;base64,'+'A'.repeat(150000)}]) {
    const input=state();input.locations[0].picture=value;
    const result=Pack.build(input,catalog);
    assert.ok(result.errors.length);
    assert.deepEqual(result.files,[]);
    assert.deepEqual(result.resourceFiles,[]);
    assert.equal(result.issues[0].locationId,'home');
    assert.equal(result.issues[0].field,'image');
  }
});
test('draft previews retain generated image references while another field is invalid',()=>{
  const input=state();input.locations[0].picture=picture();input.locations[0].fields.title='';
  const result=Pack.build(input,catalog);
  assert.ok(result.errors.length);
  assert.equal(spawn(result).image,'my_pack:textures/gui/locations/location_1.png');
  assert.deepEqual(result.resourceFiles,[]);
});
test('unsafe location paths cannot produce image files',()=>{
  const input=state();input.locations[0].path='../home';input.locations[0].picture=picture();
  const result=Pack.build(input,catalog);
  assert.ok(result.errors.length);
  assert.deepEqual(result.resourceFiles,[]);
});
test('project backup and browser storage preserve pictures and the selected source',()=>{
  const input=state();input.locations[0].picture=picture();input.locations[0].imageMode='manual';input.locations[0].fields.image='other:textures/home.png';
  const backup=JSON.parse(JSON.stringify(Project.backup(input,null,null)));
  const restored=Project.merge(backup,{kits:null,intros:null});
  assert.deepEqual(restored.pack,input);
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const projects=new Project.Projects(storage,input,()=>'project');projects.save();
  const reopened=new Project.Projects(storage,state());
  assert.deepEqual(reopened.state(),input);
});
test('ZIP exports preserve PNG bytes inside a resource pack and nested download',()=>{
  const input=state();input.locations[0].picture=picture();
  const result=Pack.build(input,catalog);
  const data=Zip.zip(result.files),resources=Zip.zip(result.resourceFiles);
  const bundle=archiveFiles(Zip.zip([{path:'my_pack-data.zip',content:data},{path:'my_pack-resources.zip',content:resources}]));
  const resourceFiles=archiveFiles(bundle.get('my_pack-resources.zip'));
  assert.deepEqual(Buffer.from(resourceFiles.get('assets/my_pack/textures/gui/locations/location_1.png')),png);
  assert.equal(JSON.parse(new TextDecoder().decode(resourceFiles.get('pack.mcmeta'))).pack.pack_format,34);
  const dataFiles=archiveFiles(bundle.get('my_pack-data.zip'));
  assert.equal(JSON.parse(new TextDecoder().decode(dataFiles.get('data/my_pack/heritage/spawns/location_1.json'))).image,'my_pack:textures/gui/locations/location_1.png');
});
test('ZIP validation rejects unsafe paths, duplicate names and unsupported content',()=>{
  assert.throws(()=>Zip.zip([{path:'../image.png',content:png}]),/Unsafe ZIP path/);
  assert.throws(()=>Zip.zip([{path:'image.png',content:png},{path:'image.png',content:png}]),/Duplicate ZIP path/);
  assert.throws(()=>Zip.zip([{path:'image.png',content:{}}]),/text or bytes/);
});

test('GUI scaling stays optional and exports one global settings file when configured',()=>{
  const original=state();
  assert.deepEqual(JSON.parse(Pack.build(original,catalog).files.find(file=>file.path===Pack.selectionPath).content),{gui_scale:0});
  for(const guiScale of [0,1,4,16]){
    const input={...original,guiScale,namespace:'renamed_pack'},output=Pack.build(input,catalog);
    assert.deepEqual(output.errors,[]);
    assert.deepEqual(JSON.parse(output.files.find(file=>file.path===Pack.selectionPath).content),{gui_scale:guiScale});
    const files=archiveFiles(Zip.zip(output.files));
    assert.equal(JSON.parse(new TextDecoder().decode(files.get(Pack.selectionPath))).gui_scale,guiScale);
    assert.equal(output.files.filter(file=>file.path.endsWith('/heritage/selection.json')).length,1);
  }
});

test('invalid GUI scales block export and retain a marked settings preview',()=>{
  for(const guiScale of [-1,17,1.5,'4',null,true,NaN,Infinity]){
    const output=Pack.build({...state(),guiScale},catalog);
    assert.ok(output.errors.some(error=>error.startsWith('GUI scale:')));
    assert.deepEqual(output.files,[]);
    assert.ok(output.issues.some(issue=>issue.field==='guiScale'&&issue.filePath===Pack.selectionPath&&issue.path[0]==='gui_scale'));
    assert.ok(output.previewFiles.some(file=>file.path===Pack.selectionPath));
  }
});

test('GUI scaling survives saved projects, backups and library merges without changing old projects',()=>{
  const initial=state(),input={...initial,guiScale:3};
  const backup=JSON.parse(JSON.stringify(Project.backup(input,null,null)));
  assert.equal(Project.merge(backup,{kits:null,intros:null}).pack.guiScale,3);
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const projects=new Project.Projects(storage,input,()=>'project');projects.save();
  assert.equal(new Project.Projects(storage,initial).state().guiScale,3);
  assert.deepEqual(Project.validatePack(initial),initial);
  for(const guiScale of [-1,17,1.5,'4',null])assert.throws(()=>Project.validatePack({...input,guiScale}),/GUI scale/);
});

test('custom bar thickness is included in exported intros and invalid values block export',()=>{
  const input=state(),intro={id:'arrival',name:'Arrival',document:{text:'Arrival',cinematic_bars:true,bar_height:48}},entries={kits:[],intros:[intro]};input.locations[0].intro=intro.id;
  const result=Pack.build(input,entries);assert.deepEqual(result.errors,[]);assert.equal(spawn(result).intro.bar_height,48);
  intro.document.bar_height=1.5;const invalid=Pack.build(input,entries);assert.ok(invalid.issues.some(issue=>issue.field==='intro'&&issue.message.includes('Bar thickness')));assert.deepEqual(invalid.files,[]);
});

test('editable crop sources survive project backups while resource exports contain only the final PNG',()=>{
  const input=state(),entry=input.locations[0];entry.picture={...picture(),source:{data:'data:image/webp;base64,AAAA',width:768,height:384},crop:{x:80,y:25,zoom:2}};
  const saved=JSON.parse(JSON.stringify(Project.backup(input,null,null))),restored=Project.merge(saved,{kits:null,intros:null});assert.deepEqual(restored.pack.locations[0].picture,entry.picture);
  const result=Pack.build(restored.pack,catalog);assert.deepEqual(result.errors,[]);assert.equal(result.resourceFiles.length,2);assert.deepEqual(Buffer.from(result.resourceFiles[1].content),png);assert.equal(Object.hasOwn(spawn(result),'picture'),false);assert.ok(!JSON.stringify(result.previewFiles).includes(entry.picture.source.data));
});

test('card text style exports as a boolean and retains the legacy outlined default',()=>{
  const input=state();assert.equal(Object.hasOwn(spawn(Pack.build(input,catalog)),'outline'),false);
  for(const value of [false,true]){input.locations[0].fields.outline=value;const result=Pack.build(input,catalog);assert.deepEqual(result.errors,[]);assert.equal(spawn(result).outline,value);const restored=Project.merge(JSON.parse(JSON.stringify(Project.backup(input,null,null))),{kits:null,intros:null});assert.equal(restored.pack.locations[0].fields.outline,value);}
});
test('card styling survives older imported documents and rejects invalid values',()=>{
  const input=state();input.locations[0].document.outline=false;assert.equal(spawn(Pack.build(input,catalog)).outline,false);input.locations[0].fields.outline=true;assert.equal(spawn(Pack.build(input,catalog)).outline,true);
  for(const value of ['false',0,null,{}]){input.locations[0].fields.outline=value;const result=Pack.build(input,catalog);assert.ok(result.issues.some(issue=>issue.field==='outline'));assert.deepEqual(result.files,[]);}
});
test('card and intro text styles remain independent in the same exported location',()=>{
  const input=state();input.locations[0].fields.outline=false;input.locations[0].intro='arrival';const entries={...catalog,intros:[{id:'arrival',name:'Arrival',document:{text:'Welcome',outline:true},error:''}]};const result=Pack.build(input,entries);assert.deepEqual(result.errors,[]);assert.equal(spawn(result).outline,false);assert.equal(spawn(result).intro.outline,true);
});

test('missing saved kits retain distinct names and repair targets in validation feedback',()=>{
  const input=state();input.kits=[{id:'missing-a',path:'explorer',included:true},{id:'missing-b',path:'builder',included:true}];const result=Pack.build(input,catalog),issues=result.issues.filter(issue=>issue.kitId);
  assert.deepEqual(issues.map(issue=>issue.label),['Kit explorer','Kit builder']);assert.deepEqual(issues.map(issue=>issue.kitId),['missing-a','missing-b']);assert.ok(issues.every(issue=>issue.message.includes('saved draft is missing')));assert.deepEqual(result.files,[]);
});


test('pack kit ordering exports native positions without rewriting shared drafts',()=>{
  const input=state();input.kits=[{id:'a',path:'a',included:true},{id:'b',path:'b',included:true}];input.kitOrder=['kingdomsheritage:byo','b','bundled-empty','a'];const entries={kits:[{id:'a',name:'A',document:{title:'A',order:-10,items:[]},warnings:[]},{id:'b',name:'B',document:{title:'B',order:50,items:[]},warnings:[]}],intros:[]},original=JSON.stringify(entries),result=Pack.build(input,entries);
  assert.deepEqual(result.errors,[]);
  const Flow=require('./flow.js'),defaults=require('./assets/defaults.json'),preview=Flow.catalog(result,defaults);
  assert.deepEqual(preview.kits.map(kit=>kit.id),['kingdomsheritage:byo','my_pack:b','kingdomsheritage:default','my_pack:a','kingdomsheritage:miner','kingdomsheritage:adventurer']);
  assert.deepEqual(preview.kits[0].shop,defaults.kits.find(kit=>kit.id==='kingdomsheritage:byo').shop);
  assert.equal(JSON.stringify(entries),original);
  assert.equal(JSON.parse(result.files.find(file=>file.path==='data/kingdomsheritage/heritage/kits/default.json').content).title_key,'heritage.kingdomsheritage.kits.default.title');
});
test('unreordered kits retain their own menu positions and use the native tie break',()=>{
  const input=state();input.keepKits=false;input.kits=[{id:'b',path:'b',included:true},{id:'a',path:'a',included:true}];const entries={kits:[{id:'a',document:{title:'A',order:12,items:[]},warnings:[]},{id:'b',document:{title:'B',order:-3,items:[]},warnings:[]}],intros:[]};assert.deepEqual(Pack.orderedKitIds(input,entries),['b','a']);const result=Pack.build(input,entries);assert.deepEqual(result.errors,[]);assert.equal(JSON.parse(result.files.find(file=>file.path.endsWith('/kits/a.json')).content).order,12);assert.equal(input.kitOrder,undefined);
});
test('kit order remains visible in draft previews when another field needs repair',()=>{
  const input=state();input.kits=[{id:'a',path:'a',included:true}];input.kitOrder=['a','bundled-empty'];input.locations[0].fields.title='';const entries={kits:[{id:'a',document:{title:'A',items:[]},source:'{"title":"A","items":[]}',warnings:[]}],intros:[]},result=Pack.build(input,entries);assert.ok(result.errors.length);assert.equal(JSON.parse(result.previewFiles.find(file=>file.path.endsWith('/kits/a.json')).content).order,0);
});
test('invalid kit order is rejected in both project backups and exports',()=>{
  for(const order of ['bad',[1],['a','a']]){const input=state();input.kitOrder=order;assert.throws(()=>Project.validatePack(input),/Kit order/);const result=Pack.build(input,catalog);assert.ok(result.errors.some(error=>error.startsWith('Kit order:')));assert.deepEqual(result.files,[]);}
});

function nativePicture(width,height){
  const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(Zip.crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);},header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const bytes=Buffer.concat([png.subarray(0,8),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(Buffer.alloc((width*4+1)*height,0))),chunk('IEND',Buffer.alloc(0))]);return {name:'Native.png',data:'data:image/png;base64,'+bytes.toString('base64'),keepResolution:true};
}
test('native-resolution card PNGs export byte for byte and survive project backups',()=>{
  const input=state(),entry=input.locations[0];entry.picture=nativePicture(512,768);entry.keepImageResolution=true;const result=Pack.build(input,catalog);assert.deepEqual(result.errors,[]);assert.deepEqual(result.resourceFiles[1].content,Pack.pictureBytes(entry.picture));assert.equal(spawn(result).image,'my_pack:textures/gui/locations/location_1.png');const restored=Project.merge(Project.backup(input,null,null),{kits:null,intros:null});assert.deepEqual(restored.pack,input);
  const archive=archiveFiles(Zip.zip(result.resourceFiles));assert.deepEqual(archive.get(result.resourceFiles[1].path),Pack.pictureBytes(entry.picture));
});
test('high-resolution image opt-in retains ratio, size and format validation',()=>{
  for(const [width,height] of [[533,800],[64,96],[1,1]])assert.doesNotThrow(()=>Pack.pictureBytes(nativePicture(width,height)));
  for(const value of ['true',1,null]){const input=state();input.locations[0].keepImageResolution=value;assert.throws(()=>Project.validatePack(input),/Keep source resolution/);}
  const high=nativePicture(512,768);for(const value of [undefined,false,'true',1])assert.throws(()=>Pack.pictureBytes({...high,keepResolution:value}));
  for(const [width,height] of [[0,192],[256,192],[9000,13500],[4096,6144]]){const invalid={...high},bytes=Buffer.from(invalid.data.slice(22),'base64');bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);invalid.data='data:image/png;base64,'+bytes.toString('base64');assert.throws(()=>Pack.pictureBytes(invalid));}
  assert.throws(()=>Pack.pictureBytes({...high,data:'data:image/png;base64,'+'A'.repeat(24*1024*1024)}));
});

test('interleaved default and custom locations export the same native order as the preview',()=>{
 const Editing=require('./editing.js'),Flow=require('./flow.js'),defaults=require('./assets/defaults.json'),input=state();input.keepLocations=true;const id=input.namespace+':'+input.locations[0].path,ids=['kingdomsheritage:village',id,'kingdomsheritage:default','kingdomsheritage:plains','kingdomsheritage:random'],reordered=Editing.reorderCards(input,ids,defaults.spawns),result=Pack.build(reordered,catalog);assert.deepEqual(result.errors,[]);assert.equal(result.locationCount,5);assert.deepEqual(Flow.catalog(result,defaults).spawns.map(entry=>entry.id),ids);
 for(const spawn of defaults.spawns){const document=JSON.parse(result.files.find(file=>file.path==='data/kingdomsheritage/heritage/spawns/'+spawn.id.split(':')[1]+'.json').content),{id:ignored,order,...native}=spawn,{order:rank,...saved}=document;assert.deepEqual(saved,native);assert.equal(rank,ids.indexOf(spawn.id));}
 assert.deepEqual(Project.merge(Project.backup(reordered,null,null),{kits:null,intros:null}).pack,reordered);
 const invalid=Pack.copy(reordered);invalid.locations[0].fields.title='';const draft=Pack.build(invalid,catalog);assert.ok(draft.errors.length);assert.deepEqual(Flow.catalog({files:draft.previewFiles,errors:[]},defaults).spawns.map(entry=>entry.id),ids);
 reordered.keepLocations=false;const without=Pack.build(reordered,catalog);assert.deepEqual(without.errors,[]);assert.deepEqual(Flow.catalog(without,defaults).spawns.map(entry=>entry.id),[id]);reordered.keepLocations=true;assert.deepEqual(Flow.catalog(Pack.build(reordered,catalog),defaults).spawns.map(entry=>entry.id),ids);
});
test('invalid saved default definitions are rejected and ordinary packs do not copy defaults',()=>{
 const input=state();input.keepLocations=true;assert.equal(Pack.build(input,catalog).files.filter(file=>file.path.startsWith('data/kingdomsheritage/heritage/spawns/')).length,0);
 for(const value of [null,[],{'other:default':{order:0}},{'kingdomsheritage:default':null},{'kingdomsheritage:default':{order:'1'}}]){const invalid={...input,bundledLocations:value};assert.throws(()=>Project.validatePack(invalid));assert.ok(Pack.build(invalid,catalog).errors.length);}
 const invalid={...input,bundledLocations:{'kingdomsheritage:default':{title:'Broken',type:'fixed',order:0}}};assert.ok(Pack.build(invalid,catalog).errors.length);
});

test('default card overrides retain the native game definitions',()=>{
 for(const spawn of require('./assets/defaults.json').spawns){const {id,...document}=spawn;assert.deepEqual(document,JSON.parse(fs.readFileSync(path.join(__dirname,'../../../src/main/resources/data/kingdomsheritage/heritage/spawns',id.split(':')[1]+'.json'),'utf8')));}
 const input=state();input.keepLocations=true;input.bundledLocations={'kingdomsheritage:village':{...Pack.copy(require('./assets/defaults.json').spawns.find(spawn=>spawn.id==='kingdomsheritage:village')),dimension:'minecraft:missing',order:0}};assert.ok(Pack.build(input,catalog).errors.length);
});
test('mistyped vanilla dimension names identify the canonical ID without rewriting drafts',()=>{
  for(const [name,id] of [['nether','minecraft:the_nether'],['end','minecraft:the_end']])for(const value of [name,'minecraft:'+name]){
    const input=state();input.locations[0].fields.dimension=value;const result=Pack.build(input,catalog),issue=result.issues.find(issue=>issue.field==='dimension');
    assert.match(issue.message,new RegExp(id));assert.doesNotMatch(issue.message,/another datapack/);assert.deepEqual(result.files,[]);assert.equal(input.locations[0].fields.dimension,value);
    input.locations[0].fields.dimension=Pack.dimensionSuggestion(value);const corrected=Pack.build(input,catalog);assert.deepEqual(corrected.errors,[]);assert.equal(spawn(corrected).dimension,id);
  }
});
test('dimension suggestions preserve canonical IDs, custom namespaces and custom Minecraft dimensions',()=>{
  for(const value of ['minecraft:overworld','minecraft:the_nether','minecraft:the_end','the_nether','the_end','other:nether','other:end']){
    assert.equal(Pack.dimensionSuggestion(value),'');const input=state();input.locations[0].fields.dimension=value;assert.deepEqual(Pack.build(input,catalog).errors,[]);
  }
  const input=state();input.locations[0].fields.dimension='minecraft:nether';input.allowCustomTargets=true;const result=Pack.build(input,catalog);assert.deepEqual(result.errors,[]);assert.equal(spawn(result).dimension,'minecraft:nether');
  input.allowCustomTargets=false;input.locations[0].fields.dimension='minecraft:missing';assert.equal(Pack.dimensionSuggestion('minecraft:missing'),'');assert.match(Pack.build(input,catalog).issues.find(issue=>issue.field==='dimension').message,/Unknown Minecraft dimension/);
});
test('pool dimension corrections identify the destination and retain inherited dimensions',()=>{
  const input=state(),entry=input.locations[0];entry.fields.type='pool';entry.fields.dimension='minecraft:overworld';entry.destinations=[{type:'default',dimension:'minecraft:end'},{type:'default'}];
  const invalid=Pack.build(input,catalog),issue=invalid.issues.find(issue=>issue.field==='dimension');assert.equal(issue.destination,0);assert.match(issue.message,/minecraft:the_end/);assert.deepEqual(invalid.files,[]);
  entry.destinations[0].dimension=Pack.dimensionSuggestion(entry.destinations[0].dimension);const result=Pack.build(input,catalog);assert.deepEqual(result.errors,[]);assert.equal(spawn(result).dimension,'minecraft:overworld');assert.equal(spawn(result).pool[0].dimension,'minecraft:the_end');assert.equal(spawn(result).pool[1].dimension,undefined);
});

test('decoded picture reuse keeps returned bytes isolated and revalidates changed image settings',()=>{
  const image=nativePicture(512,768),original=Pack.pictureBytes(image),next=Pack.pictureBytes(image);assert.deepEqual(next,original);assert.notEqual(next,original);next.fill(0);assert.deepEqual(Pack.pictureBytes(image),original);
  image.name=null;assert.throws(()=>Pack.pictureBytes(image),/invalid/);image.name='Changed.png';assert.deepEqual(Pack.pictureBytes(image),original);image.keepResolution=false;assert.throws(()=>Pack.pictureBytes(image),/128 × 192/);image.keepResolution=true;image.data='data:image/png;base64,invalid';assert.throws(()=>Pack.pictureBytes(image));image.data=picture().data;image.keepResolution=false;assert.deepEqual(Buffer.from(Pack.pictureBytes(image)),png);
});

test('typing changes reuse decoded image bytes until the source changes',()=>{
  let decodes=0;const sandbox={module:{exports:{}},require,atob:value=>{decodes++;return atob(value);}};require('node:vm').runInNewContext(fs.readFileSync(require.resolve('./engine.js'),'utf8'),sandbox);const engine=sandbox.module.exports,input=state();input.locations[0].picture=picture();
  for(const field of ['title','subtitle','description']){input.locations[0].fields[field]='Updated '+field;assert.equal(engine.build(input,catalog).errors.length,0);}assert.equal(decodes,1);
  Object.assign(input.locations[0].picture,nativePicture(512,768));assert.equal(engine.build(input,catalog).errors.length,0);assert.equal(decodes,2);
});
