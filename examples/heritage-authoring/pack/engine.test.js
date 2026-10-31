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
test('existing projects export the same datapack without a resource pack',()=>{
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
