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
    const name=encoder.encode(file.path),data=encoder.encode(file.content);
    if(name.length>65535||data.length>0xffffffff)throw new Error('A file exceeds ZIP size limits.');
    return {name,data,crc:crc32(data)};
  });
  const size=entries.reduce((sum,entry)=>sum+76+entry.name.length*2+entry.data.length,22);
  if(size>0xffffffff)throw new Error('The datapack exceeds ZIP size limits.');
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
if(typeof module!=='undefined')module.exports={zip,crc32};
else globalThis.HeritageZip={zip};
})();
