(() => {
'use strict';
const Pack=typeof module!=='undefined'?require('./engine.js'):HeritagePack;
const Zip=typeof module!=='undefined'?require('./zip.js'):HeritageZip;
const Import=typeof module!=='undefined'?require('./import.js'):HeritagePackImport;
const templatePath='../templates/trail-scout-kit.json';
const templateUrl=typeof module==='undefined'?new URL(templatePath,document.currentScript.src):null;
async function loadTrailScout(){
  if(!templateUrl)return require(templatePath);
  const response=await fetch(templateUrl);
  if(!response.ok)throw new Error('Trail Scout kit could not load.');
  return response.json();
}
async function create(createId=()=>crypto.randomUUID()) {
  const scout=await loadTrailScout();
  const home=Pack.location('home',1),plains=Pack.location('plains',2);
  home.path='home';home.fields={title:'Home',description:'Begin at the world spawn.',type:'default',order:0};
  plains.path='open_plains';plains.fields={title:'Open Plains',description:'Find a safe starting point in the plains.',type:'biome',target:'minecraft:plains',order:1};
  for(const location of [home,plains]){location.kitMode='selected';location.kits=['traveler','trail-scout'];location.intro='arrival';}
  const state={version:1,name:'Heritage starter example',namespace:'heritage_'+createId().replaceAll('-',''),description:'Two starting locations with shared kits and an arrival intro',keepLocations:false,keepKits:false,kits:[{id:'traveler',path:'traveler',included:true},{id:'trail-scout',path:'trail_scout',included:true}],locations:[home,plains],active:home.id};
  const traveler={title:'Traveler',description:'A compass, food and torches for the journey.',items:[
    {index:0,item:{id:'minecraft:compass'}},
    {index:1,item:{id:'minecraft:bread',count:8}},
    {index:2,item:{id:'minecraft:torch',count:16}}
  ]};
  const catalog={
    kits:[
      {id:'traveler',name:traveler.title,document:traveler,error:'',warnings:[]},
      {id:'trail-scout',name:scout.title,document:scout,error:'',warnings:[]}
    ],
    intros:[{id:'arrival',name:'Arrival',document:{text:'Welcome to <gold>{spawn}</gold>, {player}.',subtitle:'Your {kit} supplies are ready.',animation:'word_by_word',cinematic_bars:true},error:''}]
  };
  const output=Pack.build(state,catalog);if(output.errors.length)throw new Error(output.errors.join(' '));
  const project=await Import.read(Zip.zip(output.files),state.name+'.zip',createId),intro=project.intros.intros[0];
  intro.state.name='Arrival';project.intros.intros=[intro];project.intros.active=intro.id;
  for(const location of project.pack.locations)location.intro=intro.id;
  return project;
}
const api={create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritagePackExample=api;
})();
