'use strict';
const fs=require('node:fs'),path=require('node:path');
const native=path.resolve(__dirname,'../../../src/main/resources');
const target=path.join(__dirname,'assets/defaults.json');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function definitions(kind) {
  const root=path.join(native,'data/kingdomsheritage/heritage',kind),entries=[];
  function visit(directory) {
    for(const file of fs.readdirSync(directory,{withFileTypes:true})) {
      const location=path.join(directory,file.name);
      if(file.isDirectory())visit(location);
      else if(file.name.endsWith('.json')) {
        const document=read(location);
        if(document.enabled!==false)entries.push({...document,id:'kingdomsheritage:'+path.relative(root,location).replaceAll('\\','/').slice(0,-5)});
      }
    }
  }
  visit(root);
  return entries.sort((a,b)=>(a.order??0)-(b.order??0)||(a.id<b.id?-1:a.id>b.id?1:0));
}
const output=JSON.stringify({spawns:definitions('spawns'),kits:definitions('kits'),
  translations:read(path.join(native,'assets/kingdomsheritage/lang/en_us.json')),
  selection:read(path.join(native,'data/kingdomsheritage/heritage/selection.json'))},null,2)+'\n';
if(process.argv.includes('--check')) {
  if(fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==output) {
    console.error('Bundled defaults are stale. Run node examples/heritage-authoring/pack/sync-defaults.js');
    process.exitCode=1;
  }
} else fs.writeFileSync(target,output);
