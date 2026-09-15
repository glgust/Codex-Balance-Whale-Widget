// Package the existing upstream PNG as a multi-size Windows icon.
const {app,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.whenReady().then(()=>{
 const image=nativeImage.createFromPath(path.join(__dirname,'../assets/DSniang1.png'));
 if(image.isEmpty())throw new Error('Whale image is missing');
 const sizes=[16,32,48,64,128,256];
 const images=sizes.map(size=>image.resize({width:size,height:size,quality:'best'}).toPNG());
 const header=Buffer.alloc(6+16*sizes.length);
 header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 images.forEach((png,i)=>{const at=6+16*i;header[at]=sizes[i]%256;header[at+1]=sizes[i]%256;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;});
 fs.writeFileSync(path.join(__dirname,'../assets/whale.ico'),Buffer.concat([header,...images]));
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
