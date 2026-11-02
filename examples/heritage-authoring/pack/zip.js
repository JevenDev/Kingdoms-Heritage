(() => {
'use strict';
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{
  for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);
  return n>>>0;
});
const crc32=data=>{
  let crc=0xffffffff;
  for(const byte of data)crc=(crc>>>8)^table[(crc^byte)&255];
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
  if(typeof path!=='string'||!path||path.includes('\\')||path.includes(':')||/[\x00-\x1f]/.test(path))throw new Error('Unsafe ZIP path.');
  const name=directory&&path.endsWith('/')?path.slice(0,-1):path;
  if(name.split('/').some(part=>!part||/^\.+$/.test(part)))throw new Error('Unsafe ZIP path.');
  return name;
}
const maxBytes=64*1024*1024;
async function inflate(bytes,size) {
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];
  let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size)throw new Error('ZIP entry exceeds its declared size.');chunks.push(value);}
  } finally {await reader.cancel();}
  const result=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  return result;
}
async function unzip(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<22)throw new Error('Choose a valid ZIP archive.');
  if(bytes.length>maxBytes)throw new Error('ZIP archives must be no larger than 64 MiB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(u32(at)===0x06054b50&&at+22+u16(at+20)===bytes.length){end=at;break;}
  if(end<0)throw new Error('ZIP directory is missing or truncated.');
  const count=u16(end+10),central=u32(end+16),length=u32(end+12);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count)throw new Error('Split ZIP archives are not supported.');
  if(count===65535||central===0xffffffff||length===0xffffffff)throw new Error('ZIP64 archives are not supported.');
  if(!count||count>4096||central+length!==end)throw new Error('Invalid ZIP directory or too many files.');
  const decoder=new TextDecoder('utf-8',{fatal:true}),names=new Set(),entries=[];
  let at=central,total=0;
  for(let index=0;index<count;index++){
    if(at+46>end||u32(at)!==0x02014b50)throw new Error('Invalid ZIP entry.');
    const flags=u16(at+8),method=u16(at+10),crc=u32(at+16),compressed=u32(at+20),size=u32(at+24),nameLength=u16(at+28),extra=u16(at+30),comment=u16(at+32),local=u32(at+42);
    const next=at+46+nameLength+extra+comment;
    if(next>end||u16(at+34)||flags&1||![0,8].includes(method))throw new Error('Encrypted, split or unsupported ZIP entry.');
    if(size>32*1024*1024||(total+=size)>maxBytes)throw new Error('Unpacked ZIP contents exceed the import size limit.');
    const path=decoder.decode(bytes.subarray(at+46,at+46+nameLength)),directory=path.endsWith('/');safePath(path,directory);
    if(names.has(path))throw new Error('Duplicate ZIP path: '+path);names.add(path);
    if(local+30>central||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)throw new Error('Invalid ZIP file header.');
    const localName=u16(local+26),start=local+30+localName+u16(local+28);
    if(start+compressed>central||decoder.decode(bytes.subarray(local+30,local+30+localName))!==path)throw new Error('Truncated or mismatched ZIP entry.');
    if(!(flags&8)&&(u32(local+14)!==crc||u32(local+18)!==compressed||u32(local+22)!==size))throw new Error('ZIP file sizes or checksum disagree.');
    if(directory&&(size||compressed))throw new Error('ZIP directory contains file data.');
    entries.push({path,directory,method,crc,size,start,compressed});at=next;
  }
  if(at!==end)throw new Error('Invalid ZIP directory size.');
  const files=[];
  for(const entry of entries){
    if(entry.directory)continue;
    const packed=bytes.subarray(entry.start,entry.start+entry.compressed),content=entry.method===0?packed.slice():await inflate(packed,entry.size);
    if(content.length!==entry.size||crc32(content)!==entry.crc)throw new Error('ZIP entry failed its checksum: '+entry.path);
    files.push({path:entry.path,content});
  }
  return files;
}
if(typeof module!=='undefined')module.exports={zip,unzip,crc32};
else globalThis.HeritageZip={zip,unzip};
})();
