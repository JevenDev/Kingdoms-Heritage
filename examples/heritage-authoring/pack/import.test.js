'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Flow=require('./flow.js'),Picture=require('./picture.js');
const Pack=require('./engine.js'),Zip=require('./zip.js'),Import=require('./import.js'),Project=require('./project.js');
const ids=()=>{let value=0;return ()=>'import-'+(++value);};
const png=fs.readFileSync(path.join(__dirname,'../heritage-example-resources/assets/heritage_example/textures/gui/locations/home.png'));
function initial(namespace='story'){
  const location=Pack.location('location');location.fields.title='Home';location.kitMode='selected';location.kits=['kit'];
  return {version:1,name:'Story',namespace,description:'Story starts',keepKits:false,keepLocations:false,kits:[{id:'kit',path:'tools/traveler',included:true}],locations:[location],active:location.id};
}
const kit={id:'kit',name:'Traveler',document:{title:'Traveler',tags:['story:starter'],items:[{index:0,item:{id:'minecraft:compass',components:{'example:story':{chapter:2}}}}]},error:'',warnings:[]};
function catalog(project){return {kits:project.kits.kits.map(entry=>({id:entry.id,document:entry.state.document,error:'',warnings:[]})),intros:project.intros.intros.map(entry=>({id:entry.id,document:entry.state.document,error:'',warnings:[]}))};}
function rebuilt(project){const result=Pack.build(project.pack,catalog(project));assert.deepEqual(result.errors,[]);return result;}
const content=file=>typeof file.content==='string'?Buffer.from(file.content):Buffer.from(file.content);
function compare(expected,actual){
  assert.deepEqual(actual.map(file=>file.path).sort(),expected.map(file=>file.path).sort());
  for(const file of expected){const restored=actual.find(entry=>entry.path===file.path);if(/\.(json|mcmeta)$/.test(file.path))assert.deepEqual(JSON.parse(content(restored)),JSON.parse(content(file)),file.path);else assert.deepEqual(content(restored),content(file),file.path);}
}
function bundled(output){return Zip.zip([{path:'story-data.zip',content:Zip.zip(output.files)},{path:'story-resources.zip',content:Zip.zip(output.resourceFiles)}]);}

test('a datapack export reopens as editable locations and kits without changing its files',async()=>{
  const state=initial(),output=Pack.build(state,{kits:[kit],intros:[]});assert.deepEqual(output.errors,[]);
  const project=await Import.read(Zip.zip(output.files),'story.zip',ids()),result=rebuilt(project);
  assert.equal(project.pack.name,'story');assert.equal(project.pack.namespace,'story');assert.equal(project.pack.locations[0].fields.title,'Home');
  assert.equal(project.kits.kits[0].state.document.items[0].item.components['example:story'].chapter,2);compare(output.files,result.files);
  project.pack.locations[0].fields.title='Updated home';assert.equal(JSON.parse(rebuilt(project).files.find(file=>file.path.endsWith('spawns/location_1.json')).content).title,'Updated home');
});

test('paired downloads restore pictures, pool intros, null overrides and unrelated pack files',async()=>{
  const state=initial();state.locations[0].fields={title:'Journey',type:'pool',dimension:'minecraft:overworld',order:'0'};state.locations[0].intro='intro';
  state.locations[0].destinations=[{type:'fixed',x:10,y:70,z:20,intro:'alternate'},{type:'default',intro:null},{type:'random',random_radius:100}];
  state.locations[0].picture={name:'Home.png',data:'data:image/png;base64,'+png.toString('base64')};
  const intros=[{id:'intro',name:'Arrival',document:{text:'Hello {player}',variables:{'story:chapter':2},variants:[{when:{tag:'party_size',min:2},text:'Together'}]},error:''},{id:'alternate',name:'Fixed arrival',document:{text:'A fixed place',bar_height:36,timeline:{text_start_ticks:0,bar_start_ticks:0,bar_enter_ticks:20,bar_hold_ticks:60,bar_exit_ticks:20}},error:''}];
  const output=Pack.build(state,{kits:[kit],intros});assert.deepEqual(output.errors,[]);
  output.files.push({path:'data/story/functions/welcome.mcfunction',content:'say Welcome\n'},{path:'data/story/heritage/spawns/disabled.json',content:'{"enabled":false}'});
  output.resourceFiles.push({path:'assets/story/lang/en_us.json',content:'{"story.title":"Journey"}'},{path:'pack.png',content:png});
  const project=await Import.read(bundled(output),'story-packs.zip',ids()),result=rebuilt(project);
  for(const entry of project.intros.intros)assert.deepEqual(entry.state.selection,[0,0]);
  for(const entry of project.kits.kits){assert.deepEqual(entry.state.drafts,[]);assert.deepEqual(entry.state.validDocument,entry.state.document);}
  assert.equal(project.intros.intros.length,2);assert.equal(project.pack.locations[0].destinations[1].intro,null);assert.ok(project.pack.locations[0].picture);
  compare(output.files,result.files);compare(output.resourceFiles,result.resourceFiles);
  const reopened=await Import.read(bundled(result),'story-packs.zip',ids());compare(result.files,rebuilt(reopened).files);compare(result.resourceFiles,rebuilt(reopened).resourceFiles);
});

test('standard compressed example packs retain kit tags and can be edited',async()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'../downloads/heritage-example-data.zip'));
  const files=await Zip.unzip(bytes),project=await Import.read(bytes,'examples.zip',ids()),result=rebuilt(project);
  assert.equal(project.pack.locations.length,4);assert.equal(project.kits.kits.length,3);
  for(const file of files){const actual=result.files.find(entry=>entry.path===file.path);assert.ok(actual,file.path);assert.deepEqual(JSON.parse(content(actual)),JSON.parse(content(file)),file.path);}
  const first=project.pack.locations[0];first.kits=[project.pack.kits[0].id];
  const document=JSON.parse(rebuilt(project).files.find(file=>file.path.endsWith('/spawns/'+first.path+'.json')).content);
  assert.deepEqual(document.kits,['heritage_example:'+project.pack.kits[0].path]);
});

test('built-in namespace exports and reordered bundled choices retain their definitions',async()=>{
  for(const namespace of ['kingdomsheritage','story']){
    const state=initial(namespace);state.locations[0].path='default';state.keepLocations=namespace!=='kingdomsheritage';state.keepKits=true;
    if(state.keepLocations)state.bundledLocations={'kingdomsheritage:plains':{title:'Plains',type:'biome',target:'minecraft:plains',order:-4}};
    state.kitOrder=['kit','bundled-empty'];
    const output=Pack.build(state,{kits:[kit],intros:[]});assert.deepEqual(output.errors,[]);
    compare(output.files,rebuilt(await Import.read(Zip.zip(output.files),'defaults.zip',ids())).files);
  }
});

test('backups and merges keep imported resources and existing saved drafts',async()=>{
  const output=Pack.build(initial(),{kits:[kit],intros:[]}),project=await Import.read(Zip.zip(output.files),'story.zip',ids());
  const existing={version:2,active:project.kits.active,kits:[{id:project.kits.active,state:{source:'{"title":"Existing","items":[]}',document:{title:'Existing',items:[]}}}]},snapshot=JSON.stringify(existing);
  const merged=Project.merge(JSON.parse(JSON.stringify(project)),{kits:existing,intros:null},()=> 'new-id');
  assert.equal(JSON.stringify(existing),snapshot);assert.equal(merged.kits.kits.length,2);assert.equal(merged.pack.kits[0].id,'new-id');assert.equal(merged.kits.kits[0].state.document.title,'Existing');rebuilt(merged);
});

test('resource-only, invalid references and unsupported namespaces fail before returning a project',async()=>{
  await assert.rejects(Import.read(Zip.zip([{path:'pack.mcmeta',content:'{"pack":{"pack_format":34,"description":"Art"}}'}])),/datapack/);
  const output=Pack.build(initial(),{kits:[kit],intros:[]});
  const missing=output.files.filter(file=>!file.path.includes('/kits/tools/'));
  await assert.rejects(Import.read(Zip.zip(missing),'bad.zip',ids()),/unavailable kit/);
  const multiple=[...output.files,{path:'data/other/heritage/spawns/home.json',content:'{"title":"Other","type":"default"}'}];
  await assert.rejects(Import.read(Zip.zip(multiple),'bad.zip',ids()),/multiple custom/);
});

test('ZIP reader checks truncated archives, checksums, duplicate names and unsafe paths',async()=>{
  const bytes=Zip.zip([{path:'aa.txt',content:'First'},{path:'bb.txt',content:'Second'}]);
  await assert.rejects(Zip.unzip(bytes.subarray(0,bytes.length-1)),/directory/);
  const corrupt=bytes.slice();corrupt[36]^=1;await assert.rejects(Zip.unzip(corrupt),/checksum/);
  const duplicate=bytes.slice(),buffer=Buffer.from(duplicate.buffer);for(let at=buffer.indexOf('bb.txt');at>=0;at=buffer.indexOf('bb.txt',at+6))buffer.write('aa.txt',at);await assert.rejects(Zip.unzip(duplicate),/Duplicate/);
  const unsafe=bytes.slice(),names=Buffer.from(unsafe.buffer);for(let at=names.indexOf('aa.txt');at>=0;at=names.indexOf('aa.txt',at+6))names.write('../bad',at);await assert.rejects(Zip.unzip(unsafe),/Unsafe/);
});

test('ZIP reader bounds expanded sizes and rejects encryption and unsupported compression',async()=>{
  const original=Zip.zip([{path:'file.json',content:'{}'}]),central=new DataView(original.buffer).getUint32(original.length-6,true);
  for(const [offset,value,method,pattern] of [[central+24,33*1024*1024,'setUint32',/size limit/],[central+8,0x801,'setUint16',/Encrypted/],[central+10,99,'setUint16',/unsupported/]]){
    const bytes=original.slice();new DataView(bytes.buffer)[method](offset,value,true);await assert.rejects(Zip.unzip(bytes),pattern);
  }
});

test('imported tags and disabled definitions remain usable in selection previews',async()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'../downloads/heritage-example-data.zip'));
  const project=await Import.read(bytes,'examples.zip',ids()),output=rebuilt(project),choices=Flow.catalog(output,{spawns:[],kits:[]});
  const session=new Flow.Session(choices);session.choose(choices.spawns[0].id);assert.equal(session.allowed().length,3);session.next();assert.equal(session.phase,'kit');
  const ordinary=await Import.read(Zip.zip(Pack.build(initial(),{kits:[kit],intros:[]}).files),'story.zip',ids());
  assert.equal(Flow.catalog(rebuilt(ordinary),{spawns:[],kits:[]}).spawns.length,1);
  project.kits.kits[0].state.document.tags=[];
  const result=rebuilt(project),updated=JSON.parse(result.files.find(file=>file.path.endsWith('/spawns/home.json')).content);
  assert.equal(updated.kits.length,3);assert.ok(updated.kits.every(id=>!id.startsWith('#')));
});

test('imported pictures retain crop dimensions and renaming moves only managed files',async()=>{
  const state=initial();state.locations[0].picture={name:'Home.png',data:'data:image/png;base64,'+png.toString('base64')};
  const output=Pack.build(state,{kits:[kit],intros:[]}),project=await Import.read(bundled(output),'story-packs.zip',ids());
  const picture=project.pack.locations[0].picture,source=Picture.source(picture);assert.equal(source.width,128);assert.equal(source.height,192);
  project.pack.locations[0].path='new/home';const result=rebuilt(project);
  assert.ok(!result.files.some(file=>file.path.endsWith('/spawns/location_1.json')));assert.ok(!result.resourceFiles.some(file=>file.path.endsWith('/locations/location_1.png')));
  assert.ok(result.resourceFiles.some(file=>file.path.endsWith('/locations/new/home.png')));
  const larger=Buffer.from(png);larger.writeUInt32BE(256,16);larger.writeUInt32BE(384,20);
  const original=Picture.source({data:'data:image/png;base64,'+larger.toString('base64'),keepResolution:true});assert.equal(original.width,256);assert.equal(original.height,384);
});

test('unrestricted kit selectors and metadata survive import and later edits',async()=>{
  const state=initial(),output=Pack.build(state,{kits:[kit],intros:[]});
  const spawn=output.files.find(file=>file.path.endsWith('/spawns/location_1.json')),document=JSON.parse(spawn.content);delete document.kits;spawn.content=JSON.stringify(document);
  const meta=output.files.find(file=>file.path==='pack.mcmeta');meta.content=JSON.stringify({pack:{pack_format:48,description:{text:'Story starts'}},filter:{block:[{namespace:'unused'}]}});
  const selection=output.files.find(file=>file.path===Pack.selectionPath);selection.content='{"gui_scale":3,"example:setting":true}';
  const project=await Import.read(Zip.zip(output.files),'story.zip',ids()),result=rebuilt(project);
  assert.deepEqual(JSON.parse(result.files.find(file=>file.path===spawn.path).content).kits,[]);
  assert.deepEqual(JSON.parse(result.files.find(file=>file.path==='pack.mcmeta').content),JSON.parse(meta.content));
  assert.deepEqual(JSON.parse(result.files.find(file=>file.path===Pack.selectionPath).content),JSON.parse(selection.content));
  const session=new Flow.Session(Flow.catalog(result,{spawns:[],kits:[]}));session.choose(session.choices.spawns[0].id);assert.equal(session.allowed().length,1);
  project.pack.description='Changed description';assert.equal(JSON.parse(rebuilt(project).files.find(file=>file.path==='pack.mcmeta').content).pack.description,'Changed description');
});
