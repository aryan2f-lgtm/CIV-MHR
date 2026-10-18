"use strict";
/* Excel, Word en PDF. Alleen aangevinkte fasen en taken komen in het zichtbare document. */

function xmlEsc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function b64ToBytes(b64){
  const bin=atob(b64),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function fileBase(p){return ((p.nummer?p.nummer+' ':'')+(p.naam||'project')).replace(/[\\/:*?"<>|]/g,'-')}
function downloadBlob(blob,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
function pdfSafe(s){
  return String(s??'').replace(/€/g,'EUR ').replace(/[–—]/g,'-').replace(/×/g,'x').replace(/[^\x09\x0a\x0d\x20-\xff]/g,'');
}
function taskMoney(R,taskId,key,rates){
  let c=0;
  for(const[k,n] of Object.entries((R.scen[key]&&R.scen[key].alloc)||{})){
    const parts=k.split('|');
    if(parts[0]!==taskId)continue;
    c+=n*(+rates[parts[1]]||0);
  }
  return c;
}
function partOn(p,id){return !p.exportSel||p.exportSel[id]!==false}
function offerView(){
  if(!cur)return null;
  const p=cur,R=compute(p);
  const key=SCEN.some(s=>s[0]===p.chosen)?p.chosen:'markt';
  const s=R.scen[key],meta=SCEN.find(x=>x[0]===key)||SCEN[2];
  const tasks=R.rows.filter(r=>r.active).map(r=>({
    phase:PHASES.find(x=>x[0]===r.ph)[1],
    name:r.name,
    qty:r.unit==='pct'?nf1.format(+p.params.kwPct||0)+'%':nf1.format(+r.qty||0)+' '+(UNITS[r.unit]?UNITS[r.unit][0]:''),
    hours:r.scen[key]||0,
    cost:taskMoney(R,r.id,key,p.rates)
  }));
  const phases=PHASES.filter(([id])=>p.phases[id]&&(s.phase[id]||0)>0).map(([id,name])=>({name,hours:s.phase[id]}));
  const roles=(p.staff||[]).filter(person=>((s.person||{})[person.id]||0)>0).map(person=>{
    const hours=(s.person||{})[person.id]||0,rate=+p.rates[person.role]||0;
    return{name:(RN[person.role]||person.role)+(person.naam?' · '+person.naam:'')+' · '+(LEVEL_NAME[person.niveau]||person.niveau),hours,rate,cost:hours*rate};
  });
  return{p,R,key,s,meta,tasks,phases,roles,status:marktStatus(p,R)};
}
function payloadOf(p){
  ensureStaff(p);
  return{v:2,naam:p.naam,opdrachtgever:p.opdrachtgever,nummer:p.nummer,opsteller:p.opsteller,datum:p.datum,
    geldig:p.geldig??30,type:p.type,schaal:p.schaal,cplx:p.cplx,cplxAuto:!!p.cplxAuto,niveau:p.niveau,chosen:p.chosen,
    params:p.params,phases:p.phases,tasks:p.tasks,rates:p.rates,people:p.people||{},actual:p.actual||{},factors:p.factors,
    staff:p.staff,roleOn:p.roleOn,risks:p.risks,exportSel:p.exportSel};
}
function dataToken(p){return 'CIVINAAR-DATA:'+btoa(unescape(encodeURIComponent(JSON.stringify(payloadOf(p)))))}
function readToken(text){
  const i=String(text||'').indexOf('CIVINAAR-DATA:');
  if(i<0)return null;
  const b64=String(text).slice(i+14).split(/[\s<"]/)[0];
  try{return JSON.parse(decodeURIComponent(escape(atob(b64))))}catch(e){return null}
}

function headerLines(v){
  const p=v.p,s=v.s,st=v.status,on=id=>partOn(p,id);
  const btw=Math.round(s.cost*.21);
  const lines=['Offerte werkduur'];
  if(on('project')){
    lines.push(p.naam||'Project');
    const meta=[p.opdrachtgever&&('Opdrachtgever: '+p.opdrachtgever),p.nummer&&('Nummer: '+p.nummer),p.opsteller&&('Opgesteld door: '+p.opsteller),'Datum: '+fmtDateISO(p.datum),'Geldig tot: '+geldigTot(p)].filter(Boolean).join(' · ');
    if(meta)lines.push(meta);
  }
  lines.push('Scenario: '+v.meta[1]+' (× '+s.f.toFixed(2).replace('.',',')+')');
  if(on('markt')){
    lines.push(st.basisOk?'Rekenbasis marktconform: ja. Factor 1,00, tarieven binnen de band, uren sluiten op '+nf0.format(st.marktHours)+' uur ('+eur(st.marktCost)+').':('Rekenbasis marktconform: nee. '+st.issues.join(' ')));
    lines.push(st.chosenOk?'Aangeboden scenario is marktconform.':'Aangeboden scenario wijkt af van marktconform.');
  }
  const tot=['Totaal '+nf0.format(s.hours)+' uur'];
  if(on('bedragen'))tot.push(eur(s.cost)+(on('btw')?' excl. btw':''));
  if(on('btw'))tot.push('btw 21% '+eur(btw),'incl. btw '+eur(s.cost+btw));
  lines.push(tot.join(' · '));
  if(on('uitgang'))lines.push([TYPES[p.type],'schaal '+p.schaal,nf1.format(v.R.d.bladen)+' A1-bladen',v.R.d.pbladen+' profielbladen'].join(' · '));
  if(on('complex')){
    const a=v.R.analyse||{reasons:[],niveau:v.R.cplx};
    lines.push('Complexiteit '+(p.cplxAuto?'volgt de analyse en is ':'is zelf gekozen als ')+(v.R.cplx||a.niveau)+'. '+(a.reasons||[]).join(', ')+'.');
    const picked=RISKS.filter(r=>p.risks&&p.risks[r[0]]);
    lines.push(picked.length?'Risico’s in de uren: '+picked.map(r=>r[1]+' (+'+r[2]+'%)').join(', ')+'.':'Geen extra risico’s aangevinkt.');
  }
  lines.push('Uitgevinkte fasen, taken en rollen staan niet in dit document.');
  return lines;
}

async function exportExcel(){
  if(!cur)return;
  if(!window.ExcelJS){toast('Excel is niet beschikbaar');return}
  const v=offerView(),p=v.p;
  const wb=new ExcelJS.Workbook();
  wb.creator='Civinaar';
  const ws=wb.addWorksheet('Offerte',{views:[{showGridLines:false}]});
  if(partOn(p,'logo')){
    const img=wb.addImage({base64:LOGO_B64,extension:'png'});
    ws.addImage(img,{tl:{col:0,row:0},ext:{width:150,height:106}});
  }
  ws.getRow(1).height=36;ws.getRow(2).height=36;ws.getRow(3).height=20;
  const lines=headerLines(v);
  ws.getCell('C2').value='Civinaar';
  ws.getCell('C2').font={bold:true,size:18,color:{argb:'FF1F3A5F'}};
  ws.getCell('C3').value='Civiele innovatie voor een levende openbare ruimte';
  ws.getCell('C3').font={size:11,color:{argb:'FF5B6B78'}};
  let row=6;
  for(const line of lines){ws.getCell(row,1).value=line;if(row===6)ws.getCell(row,1).font={bold:true,size:16,color:{argb:'FF1F3A5F'}};row++}
  row++;
  const money=partOn(p,'bedragen');
  if(partOn(p,'taken')){
    const head=row;
    const heads=money?['Fase','Taak','Aantal','Uren','Bedrag excl. btw']:['Fase','Taak','Aantal','Uren'];
    heads.forEach((h,i)=>{
      const c=ws.getCell(head,i+1);c.value=h;c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F3A5F'}};
    });
    v.tasks.forEach((t,i)=>{
      const r=ws.getRow(head+1+i);
      r.values=money?[null,t.phase,t.name,t.qty,t.hours,Math.round(t.cost)]:[null,t.phase,t.name,t.qty,t.hours];
      r.getCell(4).numFmt='#,##0';
      if(money)r.getCell(5).numFmt='"€" #,##0';
    });
    const tot=head+1+v.tasks.length;
    ws.getCell(tot,1).value='Totaal';ws.getCell(tot,1).font={bold:true};
    ws.getCell(tot,4).value=v.s.hours;ws.getCell(tot,4).font={bold:true};ws.getCell(tot,4).numFmt='#,##0';
    if(money){ws.getCell(tot,5).value=Math.round(v.s.cost);ws.getCell(tot,5).font={bold:true};ws.getCell(tot,5).numFmt='"€" #,##0'}
    row=tot+2;
  }
  if(partOn(p,'fasen')){
    ws.getCell(row,1).value='Uren per fase';ws.getCell(row,1).font={bold:true};row++;
    ['Fase','Uren'].forEach((h,i)=>{const c=ws.getCell(row,i+1);c.value=h;c.font={bold:true}});
    row++;
    for(const ph of v.phases){ws.getRow(row).values=[null,ph.name,ph.hours];ws.getCell(row,2).numFmt='#,##0';row++}
    row++;
  }
  if(partOn(p,'rollen')){
    ws.getCell(row,1).value='Medewerkers';ws.getCell(row,1).font={bold:true};row++;
    const heads=money?['Medewerker','Uren','Tarief','Bedrag']:['Medewerker','Uren'];
    heads.forEach((h,i)=>{const c=ws.getCell(row,i+1);c.value=h;c.font={bold:true}});
    row++;
    for(const role of v.roles){
      ws.getRow(row).values=money?[null,role.name,role.hours,role.rate,Math.round(role.cost)]:[null,role.name,role.hours];
      ws.getCell(row,2).numFmt='#,##0';
      if(money){ws.getCell(row,3).numFmt='"€" #,##0';ws.getCell(row,4).numFmt='"€" #,##0'}
      row++;
    }
  }
  ws.columns=[{width:32},{width:52},{width:22},{width:12},{width:20}];
  const hid=wb.addWorksheet('_gegevens');
  hid.state='veryHidden';
  hid.getCell('A1').value=dataToken(p);
  const buf=await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Urencalculatie '+fileBase(p)+'.xlsx');
  toast('Excel gedownload');
}

async function importExcel(file){
  if(!window.ExcelJS){toast('Excel is niet beschikbaar');return}
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  let token='';
  const hid=wb.getWorksheet('_gegevens');
  if(hid)token=String(hid.getCell('A1').value||'');
  if(!token.includes('CIVINAAR-DATA:')){
    wb.eachSheet(ws=>{ws.eachRow(row=>{row.eachCell(cell=>{const t=String(cell.value||'');if(t.includes('CIVINAAR-DATA:'))token=t})})});
  }
  const data=readToken(token);
  if(!data){toast('Dit Excel-bestand is geen Civinaar-export');return}
  applyImported(data);
}

function wordParagraph(text,bold){
  const pr=bold?'<w:rPr><w:b/></w:rPr>':'';
  return '<w:p><w:r>'+pr+'<w:t xml:space="preserve">'+xmlEsc(text)+'</w:t></w:r></w:p>';
}
function wordTable(headers,rows){
  const cell=(t,b)=>'<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r>'+(b?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+xmlEsc(t)+'</w:t></w:r></w:p></w:tc>';
  const tr=cells=>'<w:tr>'+cells+'</w:tr>';
  return '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D5DDE4"/><w:left w:val="single" w:sz="4" w:color="D5DDE4"/><w:bottom w:val="single" w:sz="4" w:color="D5DDE4"/><w:right w:val="single" w:sz="4" w:color="D5DDE4"/><w:insideH w:val="single" w:sz="4" w:color="D5DDE4"/><w:insideV w:val="single" w:sz="4" w:color="D5DDE4"/></w:tblBorders></w:tblPr>'
    +tr(headers.map(h=>cell(h,true)).join(''))
    +rows.map(r=>tr(r.map(c=>cell(c,false)).join(''))).join('')
    +'</w:tbl><w:p/>';
}
async function exportWord(){
  if(!cur)return;
  if(!window.JSZip){toast('Word is niet beschikbaar');return}
  const v=offerView(),p=v.p,money=partOn(p,'bedragen'),logo=partOn(p,'logo');
  const blocks=[];
  if(logo)blocks.push('<w:p><w:r><w:pict><v:shape style="width:130pt;height:92pt" stroked="f"><v:imagedata r:id="rIdLogo" o:title="Civinaar"/></v:shape></w:pict></w:r></w:p>');
  blocks.push(wordParagraph('Civinaar',true),wordParagraph('Civiele innovatie voor een levende openbare ruimte',false));
  headerLines(v).forEach((line,i)=>blocks.push(wordParagraph(line,i===0)));
  if(partOn(p,'taken')){
    blocks.push(wordParagraph('Taken',true));
    blocks.push(wordTable(money?['Fase','Taak','Aantal','Uren','Bedrag']:['Fase','Taak','Aantal','Uren'],v.tasks.map(t=>money?[t.phase,t.name,t.qty,nf0.format(t.hours),eur(t.cost)]:[t.phase,t.name,t.qty,nf0.format(t.hours)])));
    blocks.push(wordTable(money?['','','','Uren','Bedrag']:['','','','Uren'],[money?['Totaal','','',nf0.format(v.s.hours),eur(v.s.cost)]:['Totaal','','',nf0.format(v.s.hours)]]));
  }
  if(partOn(p,'fasen')){
    blocks.push(wordParagraph('Uren per fase',true));
    blocks.push(wordTable(['Fase','Uren'],v.phases.map(ph=>[ph.name,nf0.format(ph.hours)])));
  }
  if(partOn(p,'rollen')){
    blocks.push(wordParagraph('Medewerkers',true));
    blocks.push(wordTable(money?['Medewerker','Uren','Tarief','Bedrag']:['Medewerker','Uren'],v.roles.map(r=>money?[r.name,nf0.format(r.hours),eur(r.rate),eur(r.cost)]:[r.name,nf0.format(r.hours)])));
  }
  blocks.push('<w:p><w:r><w:rPr><w:vanish/><w:webHidden/></w:rPr><w:t xml:space="preserve">'+xmlEsc(dataToken(p))+'</w:t></w:r></w:p>');
  const body=blocks.join('');
  const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'
    +body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851"/></w:sectPr></w:body></w:document>';
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const word=zip.folder('word');
  word.file('document.xml',documentXml);
  if(logo){
    word.folder('_rels').file('document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>');
    word.folder('media').file('logo.png',b64ToBytes(LOGO_B64));
  }else word.folder('_rels').file('document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  downloadBlob(blob,'Offerte '+fileBase(p)+'.docx');
  toast('Word gedownload');
}
async function importWord(file){
  const buf=await file.arrayBuffer();
  const bytes=new Uint8Array(buf);
  let text='';
  if(bytes[0]===0x50&&bytes[1]===0x4b&&window.JSZip){
    const zip=await JSZip.loadAsync(buf);
    const doc=zip.file('word/document.xml');
    text=doc?await doc.async('string'):'';
  }else text=new TextDecoder('utf-8').decode(buf);
  const data=readToken(text);
  if(!data){toast('Dit Word-bestand is geen Civinaar-export');return}
  applyImported(data);
}

async function exportPdf(){
  if(!cur)return;
  if(!window.PDFLib){toast('PDF is niet beschikbaar');return}
  const v=offerView(),p=v.p;
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const fontB=await pdf.embedFont(StandardFonts.HelveticaBold);
  const showLogo=partOn(p,'logo');
  const logo=showLogo?await pdf.embedPng(b64ToBytes(LOGO_B64)):null;
  const pageW=595,pageH=842,margin=40;
  let page=pdf.addPage([pageW,pageH]);
  let y=pageH-margin;
  const ink=rgb(0.12,0.23,0.37),muted=rgb(0.36,0.42,0.47),black=rgb(0.08,0.13,0.18);
  function newPage(){page=pdf.addPage([pageW,pageH]);y=pageH-margin}
  function need(h){if(y-h<margin)newPage()}
  function text(str,x,size,f,color){page.drawText(pdfSafe(str),{x,y,size,font:f,color})}
  if(showLogo){page.drawImage(logo,{x:margin,y:y-78,width:110,height:78});text('Civinaar',margin+124,16,fontB,ink);y-=18;text('Civiele innovatie voor een levende openbare ruimte',margin+124,10,font,muted);y-=78}
  else{text('Civinaar',margin,16,fontB,ink);y-=18;text('Civiele innovatie voor een levende openbare ruimte',margin,10,font,muted);y-=24}
  for(const line of headerLines(v)){
    need(16);
    const size=line.startsWith('Offerte')?14:10;
    text(line,margin,size,line.startsWith('Offerte')||line.startsWith('Totaal')?fontB:font,black);
    y-=size+6;
  }
  y-=8;
  function table(headers,rows,widths){
    const rowH=16,total=widths.reduce((a,b)=>a+b,0);
    need(rowH*(Math.min(rows.length,1)+1)+8);
    page.drawRectangle({x:margin,y:y-4,width:total,height:rowH,color:ink});
    let x=margin+4;
    headers.forEach((h,i)=>{page.drawText(pdfSafe(h),{x,y,size:9,font:fontB,color:rgb(1,1,1)});x+=widths[i]});
    y-=rowH;
    for(const row of rows){
      need(rowH);
      x=margin+4;
      row.forEach((c,i)=>{page.drawText(pdfSafe(String(c)).slice(0,i===1?42:28),{x,y,size:9,font:font,color:black});x+=widths[i]});
      y-=rowH;
    }
    y-=8;
  }
  const money=partOn(p,'bedragen');
  if(partOn(p,'taken')){
    need(20);text('Taken',margin,12,fontB,ink);y-=18;
    if(money){
      table(['Fase','Taak','Aantal','Uren','Bedrag'],v.tasks.map(t=>[t.phase,t.name,t.qty,nf0.format(t.hours),eur(t.cost)]),[110,210,90,45,60]);
      table(['','','','Uren','Bedrag'],[['Totaal','','',nf0.format(v.s.hours),eur(v.s.cost)]],[110,210,90,45,60]);
    }else{
      table(['Fase','Taak','Aantal','Uren'],v.tasks.map(t=>[t.phase,t.name,t.qty,nf0.format(t.hours)]),[120,230,110,55]);
      table(['','','','Uren'],[['Totaal','','',nf0.format(v.s.hours)]],[120,230,110,55]);
    }
  }
  if(partOn(p,'fasen')){
    need(20);text('Uren per fase',margin,12,fontB,ink);y-=18;
    table(['Fase','Uren'],v.phases.map(ph=>[ph.name,nf0.format(ph.hours)]),[360,120]);
  }
  if(partOn(p,'rollen')){
    need(20);text('Medewerkers',margin,12,fontB,ink);y-=18;
    if(money)table(['Medewerker','Uren','Tarief','Bedrag'],v.roles.map(r=>[r.name,nf0.format(r.hours),eur(r.rate),eur(r.cost)]),[250,80,80,105]);
    else table(['Medewerker','Uren'],v.roles.map(r=>[r.name,nf0.format(r.hours)]),[360,120]);
  }
  const bytes=await pdf.save();
  downloadBlob(new Blob([bytes],{type:'application/pdf'}),'Offerte '+fileBase(p)+'.pdf');
  toast('PDF gedownload');
}
