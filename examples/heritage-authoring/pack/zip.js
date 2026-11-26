(() => {
'use strict';
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{
  for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);
  return n>>>0;
});
const crc32=data=>{
  let crc=0xffffffff;
  for(let index=0;index<data.length;index++)crc=(crc>>>8)^table[(crc^data[index])&255];
  return (crc^0xffffffff)>>>0;
};
function zip(files,date=new Date()) {
  if(!files.length||files.length>65535)throw new Error('A ZIP needs 1 to 65,535 files.');
  const names=new Set();
  const entries=files.map(file=>{
    if(typeof file.path!=='string'||file.path.includes('\\')||file.path.includes(':')||file.path.split('/').some(part=>!part||/^\.+$/.test(part))||/[\x00-\x1f]/.test(file.path))throw new Error('Unsafe ZIP path.');
    if(names.has(file.path))throw new Error('Duplicate ZIP path.');
    names.add(file.path);
    if(typeof file.content!=='string'&&!(file.content instanceof Uint8Array))throw new Error('ZIP content must be text or bytes.');
    const name=encoder.encode(file.path),data=typeof file.content==='string'?encoder.encode(file.content):file.content;
    if(name.length>65535||data.length>0xffffffff)throw new Error('A file exceeds ZIP size limits.');
    return {name,data,crc:crc32(data)};
  });
  const size=entries.reduce((sum,entry)=>sum+76+entry.name.length*2+entry.data.length,22);
  if(size>0xffffffff)throw new Error('The pack exceeds ZIP size limits.');
  const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  const year=Math.max(1980,Math.min(2107,date.getFullYear()));
  const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  let offset=0;
  const u16=(at,value)=>view.setUint16(at,value,true),u32=(at,value)=>view.setUint32(at,value,true);
  for(const entry of entries) {
    entry.offset=offset;
    u32(offset,0x04034b50);u16(offset+4,20);u16(offset+6,0x800);
    u16(offset+10,time);u16(offset+12,day);u32(offset+14,entry.crc);
    u32(offset+18,entry.data.length);u32(offset+22,entry.data.length);u16(offset+26,entry.name.length);
    bytes.set(entry.name,offset+30);bytes.set(entry.data,offset+30+entry.name.length);
    offset+=30+entry.name.length+entry.data.length;
  }
  const central=offset;
  for(const entry of entries) {
    u32(offset,0x02014b50);u16(offset+4,20);u16(offset+6,20);u16(offset+8,0x800);
    u16(offset+12,time);u16(offset+14,day);u32(offset+16,entry.crc);
    u32(offset+20,entry.data.length);u32(offset+24,entry.data.length);u16(offset+28,entry.name.length);u32(offset+42,entry.offset);
    bytes.set(entry.name,offset+46);offset+=46+entry.name.length;
  }
  u32(offset,0x06054b50);u16(offset+8,entries.length);u16(offset+10,entries.length);
  u32(offset+12,offset-central);u32(offset+16,central);
  return bytes;
}
function safePath(path,directory=false) {
  const name=directory?path.slice(0,-1):path;
  if(/[\\:\x00-\x1f]|(?:^|\/)\.*(?:\/|$)/.test(name))throw new Error('Unsafe ZIP path.');
}
const maxBytes=64*1024*1024;
const maxEndRecord=22+65535;
async function inflate(blob,size) {
  const reader=blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];
  let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size)throw new Error('ZIP entry exceeds its declared size.');chunks.push(value);}
  } finally {await reader.cancel();}
  const result=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  return result;
}
function findDirectory(bytes,archiveSize,maxEntries) {
  if(bytes.length<22)throw new Error('Choose a valid ZIP archive.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  let record=-1;
  for(let at=bytes.length-22;at>=0;at--)if(u32(at)===0x06054b50&&at+22+u16(at+20)===bytes.length){record=at;break;}
  if(record<0)throw new Error('ZIP directory is missing or truncated.');
  const count=u16(record+10),central=u32(record+16),length=u32(record+12),end=archiveSize-bytes.length+record;
  if(u16(record+4)||u16(record+6)||u16(record+8)!==count)throw new Error('Split ZIP archives are not supported.');
  if(count===65535||central===0xffffffff||length===0xffffffff)throw new Error('ZIP64 archives are not supported.');
  if(!count||count>maxEntries||central+length!==end)throw new Error('Invalid ZIP directory or too many files.');
  return {count,central,end};
}
function localData(header,{local,flags,method,compressed,crc,size},central) {
  if(header.length!==30)throw new Error('Invalid ZIP file header.');
  const view=new DataView(header.buffer,header.byteOffset,header.byteLength),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  if(u32(0)!==0x04034b50||u16(6)!==flags||u16(8)!==method)throw new Error('Invalid ZIP file header.');
  const nameEnd=local+30+u16(26),start=nameEnd+u16(28);
  if(start+compressed>central)throw new Error('Truncated or mismatched ZIP entry.');
  if(!(flags&8)&&(u32(14)!==crc||u32(18)!==compressed||u32(22)!==size))throw new Error('ZIP file sizes or checksum disagree.');
  return {nameEnd,start};
}
function checkLocalName(path,bytes) {
  if(decoder.decode(bytes)!==path)throw new Error('Truncated or mismatched ZIP entry.');
}
function readDirectory(bytes,count,select,maxUnpackedBytes,checkDirectory) {
  const end=bytes.length,view=new DataView(bytes.buffer,bytes.byteOffset,end),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  const names=new Set(),entries=new Map();
  let at=0,total=0;
  for(let index=0;index<count;index++){
    if(at+46>end||u32(at)!==0x02014b50)throw new Error('Invalid ZIP entry.');
    const flags=u16(at+8),method=u16(at+10),crc=u32(at+16),compressed=u32(at+20),size=u32(at+24),nameLength=u16(at+28),extra=u16(at+30),comment=u16(at+32),local=u32(at+42);
    const next=at+46+nameLength+extra+comment;
    if(next>end||u16(at+34)||flags&1||![0,8].includes(method))throw new Error('Encrypted, split or unsupported ZIP entry.');
    const path=decoder.decode(bytes.subarray(at+46,at+46+nameLength)),directory=path.endsWith('/');safePath(path,directory);
    if(names.has(path))throw new Error('Duplicate ZIP path: '+path);names.add(path);
    if(directory){
      if(size||crc||((!select||method===0)&&compressed))throw new Error('ZIP directory contains file data.');
      checkDirectory?.(path,{local,flags,method,crc,size,compressed});
    }else if(!select||select(path)){
      if(size>32*1024*1024||(total+=size)>maxUnpackedBytes)throw new Error('Unpacked ZIP contents exceed the import size limit.');
      entries.set(path,{local,flags,method,crc,size,compressed});
    }
    at=next;
  }
  if(at!==end)throw new Error('Invalid ZIP directory size.');
  return entries;
}
function archive(entries,readPacked) {
  return {paths:entries.keys(),has:path=>entries.has(path),async read(path,limit=maxBytes){
    const entry=entries.get(path);
    if(!entry)return;
    if(entry.size>limit)throw new Error('ZIP entry exceeds its import size limit: '+path);
    if(entry.method===0&&entry.compressed!==entry.size)throw new Error('ZIP file sizes disagree: '+path);
    const packed=await readPacked(path,entry);
    let content;
    if(entry.method===0)content=packed instanceof Uint8Array?packed.slice():new Uint8Array(await packed.arrayBuffer());
    else content=await inflate(packed instanceof Uint8Array?new Blob([packed]):packed,entry.size);
    if(content.length!==entry.size||crc32(content)!==entry.crc)throw new Error('ZIP entry failed its checksum: '+path);
    return content;
  }};
}
function open(bytes,{select,maxEntries=4096}={}) {
  if(!(bytes instanceof Uint8Array)||bytes.length<22)throw new Error('Choose a valid ZIP archive.');
  if(bytes.length>maxBytes)throw new Error('ZIP archives must be no larger than 64 MiB.');
  const {count,central,end}=findDirectory(bytes.subarray(-maxEndRecord),bytes.length,maxEntries);
  function dataStart(path,entry) {
    const {local}=entry,{nameEnd,start}=localData(bytes.subarray(local,Math.min(local+30,central)),entry,central);
    checkLocalName(path,bytes.subarray(local+30,nameEnd));
    return start;
  }
  const entries=readDirectory(bytes.subarray(central,end),count,select,maxBytes,select?undefined:dataStart);
  return archive(entries,(path,entry)=>{
    const start=dataStart(path,entry);
    return bytes.subarray(start,start+entry.compressed);
  });
}
async function openBlob(blob,{select,maxEntries,maxUnpackedBytes}) {
  const read=async(start,end)=>new Uint8Array(await blob.slice(start,end).arrayBuffer());
  const tailStart=Math.max(0,blob.size-maxEndRecord),tail=await read(tailStart,blob.size);
  const {count,central,end}=findDirectory(tail,blob.size,maxEntries);
  if(end-central>maxBytes)throw new Error('ZIP directory exceeds the import size limit.');
  const directory=central>=tailStart?tail.subarray(central-tailStart,end-tailStart):await read(central,end);
  const entries=readDirectory(directory,count,select,maxUnpackedBytes);
  return archive(entries,async(path,entry)=>{
    const {local}=entry,header=await read(local,Math.min(local+30,central));
    const {nameEnd,start}=localData(header,entry,central);
    checkLocalName(path,await read(local+30,nameEnd));
    return blob.slice(start,start+entry.compressed);
  });
}
async function unzip(bytes) {
  const archive=open(bytes),files=[];
  for(const path of archive.paths)files.push({path,content:await archive.read(path)});
  return files;
}
if(typeof module!=='undefined')module.exports={zip,unzip,open,openBlob,crc32};
else globalThis.HeritageZip={zip,unzip,open,openBlob};
})();
