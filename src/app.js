"use strict";
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,y] of Object.entries(a)){if(x==='class')e.className=y;else if(x==='text')e.textContent=y;else if(x.startsWith('on'))e.addEventListener(x.slice(2),y);else if(y!==false&&y!=null)e.setAttribute(x,y===true?'':y)}for(const c of k.flat()){if(c!=null)e.append(c.nodeType?c:document.createTextNode(c))}return e};
const nf0=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:1});
const eur=v=>'€ '+nf0.format(Math.round(v));
const uid=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,2400)}

function newProject(type='wijk',name='Nieuw project'){
  const params=Object.fromEntries(PARAMS.map(p=>[p[0],p[3]]));
  const p={id:uid(),naam:name,opdrachtgever:'',nummer:'',opsteller:'',datum:new Date().toISOString().slice(0,10),
    type,schaal:'1:250',cplx:'gemiddeld',niveau:'medior',geldig:30,params,phases:{},tasks:{},
    rates:Object.fromEntries(ROLES.map(r=>[r[0],r[2]])),people:{},actual:{},
    factors:{scherp:.75,laag:.88,markt:1,ruim:1.2},chosen:'markt',cplxAuto:true,updated:Date.now()};
  applyType(p,type);ensureStaff(p);return p;
}
function ensureStaff(p){
  if(!p.roleOn)p.roleOn={};
  for(const[id] of ROLES)if(p.roleOn[id]===undefined)p.roleOn[id]=true;
  if(!Array.isArray(p.staff)||!p.staff.length){
    p.staff=ROLES.map(([id])=>({id:uid(),role:id,on:true,naam:(p.people&&p.people[id])||'',niveau:id==='tek'?(LEVEL[p.niveau]?p.niveau:'medior'):'medior'}));
  }
  for(const[id] of ROLES)if(!p.staff.some(s=>s.role===id))p.staff.push({id:uid(),role:id,on:true,naam:'',niveau:'medior'});
  if(!p.actual)p.actual={};
  for(const[role,hrs] of Object.entries(p.actual)){
    if(!ROLES.some(r=>r[0]===role))continue;
    const first=p.staff.find(s=>s.role===role);
    if(first&&p.actual[first.id]==null&&hrs){p.actual[first.id]=hrs;delete p.actual[role]}
  }
  if(!p.risks)p.risks={};
  if(!p.exportSel)p.exportSel=Object.fromEntries(EXPORT_PARTS.map(x=>[x[0],true]));
  for(const[id] of EXPORT_PARTS)if(p.exportSel[id]===undefined)p.exportSel[id]=true;
  if(p.cplxAuto===undefined)p.cplxAuto=p.cplx!=='eenvoudig'&&p.cplx!=='complex';
}
function analyseProject(p){
  const P=p.params||{};
  let score=0;const reasons=[];
  if((+P.opp||0)>=60000||(+P.straat||0)>=4000){score+=2;reasons.push('Zeer grote omvang')}
  else if((+P.opp||0)>=20000||(+P.straat||0)>=1500){score+=1;reasons.push('Stevige omvang')}
  else reasons.push('Beperkte omvang');
  if((+P.riool||0)>=5000){score+=2;reasons.push('Uitgebreid rioolstelsel')}
  else if((+P.riool||0)>=1500){score+=1;reasons.push('Riool hoort bij het werk')}
  if((+P.fasen||0)>=4){score+=2;reasons.push('Veel uitvoeringsfasen')}
  else if((+P.fasen||0)>=3){score+=1;reasons.push('Meerdere uitvoeringsfasen')}
  if((+P.vergunningen||0)>=5){score+=1;reasons.push('Veel vergunningen')}
  if((+P.bijeen||0)>=3||(+P.derden||0)>=8){score+=1;reasons.push('Veel overleg en participatie')}
  if(p.type==='herinr'||p.type==='riool'){score+=1;reasons.push('Bestaande situatie met raakvlakken')}
  if(p.type==='klein'&&(+P.opp||0)<8000)score=Math.max(0,score-1);
  const niveau=score<=1?'eenvoudig':score>=4?'complex':'gemiddeld';
  const suggest=[];
  if((+P.riool||0)>0||p.type==='riool'||p.type==='herinr')suggest.push('klic');
  if((+P.riool||0)>500||p.type==='wijk')suggest.push('bodem');
  if((+P.vergunningen||0)>=2)suggest.push('verg');
  if((+P.bijeen||0)>=1||(+P.woningen||0)>=50)suggest.push('bewoners');
  if((+P.fasen||0)>=2)suggest.push('fasering');
  if(p.type==='herinr'||p.type==='riool')suggest.push('beheer');
  return{score,niveau,reasons,suggest};
}
function riskFactor(p){
  let pct=0;for(const[id,,pc] of RISKS)if(p.risks&&p.risks[id])pct+=pc;
  return{pct,factor:1+pct/100};
}
function activeStaff(p,role){
  if(p.roleOn&&p.roleOn[role]===false)return[];
  return (p.staff||[]).filter(s=>s.role===role&&s.on);
}
function applyType(p,type){
  p.type=type;p.phases={};p.tasks={};
  for(const[k] of PHASES)p.phases[k]=!(TYPE_PHASE_OFF[type]||[]).includes(k);
  for(const t of TASKS)p.tasks[t[0]]={on:!(TYPE_OFF[type]||[]).includes(t[0]),qty:null,corr:0};
}

/* ---------- rekenen ---------- */
function taskOn(p,id){
  const t=TASKS.find(x=>x[0]===id);if(!t)return false;
  const st=p.tasks[id]||{on:true};
  return !!p.phases[t[1]]&&!!st.on;
}
function reuseOf(p,id){
  const spec=REUSE[id];if(!spec)return 1;
  return taskOn(p,spec[0])?spec[1]:1;
}
function hamilton(items,target){
  target=Math.round(+target||0);
  const out={};for(const it of items)out[it.key]=0;
  if(target<=0)return out;
  const sum=items.reduce((s,it)=>s+Math.max(0,+it.exact||0),0);
  if(sum<=0)return out;
  const rows=items.map(it=>{
    const share=Math.max(0,+it.exact||0)/sum*target;
    const n=Math.floor(share+1e-9);
    return{key:it.key,exact:+it.exact||0,n,frac:share-n};
  });
  let left=target-rows.reduce((s,r)=>s+r.n,0);
  const order=[...rows].sort((a,b)=>b.frac-a.frac||b.exact-a.exact||(a.key<b.key?-1:1));
  let guard=0;
  while(left>0&&guard<1000){for(const r of order){if(left<=0)break;r.n++;left--}guard++}
  while(left<0){const r=rows.filter(x=>x.n>0).sort((a,b)=>a.frac-b.frac)[0];if(!r)break;r.n--;left++}
  for(const r of rows)out[r.key]=r.n;
  return out;
}
function derive(p){
  const P=p.params,[len,area]=SCALES[p.schaal]||SCALES['1:250'];
  const areaType=p.type==='wijk'||p.type==='groen';
  const raw=areaType?(+P.opp||0)/(area*.8):Math.max((+P.straat||0)/len,(+P.opp||0)/area);
  const auto=raw>0?Math.max(.5,Math.round(raw*2)/2):0;
  const bladen=(+P.bladenHand>0)?+P.bladenHand:auto;
  const prof=+P.profielen||0,wO=+P.wekenO||0,wU=+P.wekenU||0;
  return{bladen,bladenAuto:auto,pbladen:prof>0?Math.ceil(prof/6):0,ogo:wO>0?Math.ceil(wO/2):0,bouwv:wU>0?Math.ceil(wU/2):0};
}
function blankScen(){
  const scen={};for(const[k] of SCEN)scen[k]={f:1,hours:0,cost:0,design:0,risk:0,role:{},phase:{}};
  return scen;
}
function compute(p){
  ensureStaff(p);
  const P=Object.fromEntries(Object.entries(p.params).map(([k,v])=>[k,+v||0]));
  const d=derive(p),analyse=analyseProject(p),cplx=p.cplxAuto?analyse.niveau:(p.cplx||'gemiddeld');
  const cf=CPLX[cplx]||1,rf=riskFactor(p);
  const rows=[];
  for(const t of TASKS){
    const[id,ph,name,unit,norms,cs,u]=t;const st=p.tasks[id]||{on:true,qty:null,corr:0};
    const active=!!p.phases[ph]&&!!st.on;
    const auto=unit==='pct'?null:UNITS[unit][1](P,d);
    const qty=unit==='pct'?null:(st.qty!=null&&st.qty!==''?+st.qty:auto);
    const byRole={};let h=0;
    const reuse=unit==='pct'?1:reuseOf(p,id);
    const corr=1+(+st.corr||0)/100;
    if(unit!=='pct'){
      for(const[r,n] of Object.entries(norms)){
        const v=Math.max(0,n*(+qty||0)*reuse*(cs?cf:1)*corr*rf.factor);
        if(v)byRole[r]=v;h+=v;
      }
    }
    rows.push({id,ph,name,unit,auto,qty,byRole,h,exact:h,active,u,st,norms,cs,reuse,cf:cs?cf:1,rf:rf.factor,corr});
  }
  const cells=[];
  function applyPeople(r){
    if(!r.active){r.h=0;r.exact=0;return}
    const src=r.byRole;r.exact=0;const next={};
    for(const[role,v] of Object.entries(src)){
      const people=activeStaff(p,role);
      if(!people.length||v<=0)continue;
      for(const person of people){
        const exact=v/people.length*(LEVEL[person.niveau]||1);
        next[role]=(next[role]||0)+exact;r.exact+=exact;
        cells.push({key:r.id+'|'+role+'|'+person.id,task:r.id,role,person:person.id,ph:r.ph,exact});
      }
    }
    r.byRoleExact=src;r.byRole=next;r.h=r.exact;
  }
  for(const r of rows)if(r.unit!=='pct')applyPeople(r);
  let designTot=0;
  for(const r of rows)if(r.active&&r.unit!=='pct'&&DESIGN.includes(r.ph))designTot+=r.exact;
  const kw=rows.find(r=>r.unit==='pct');
  if(kw){
    const weights=Object.entries(kw.norms),wsum=weights.reduce((s,[,n])=>s+n,0)||1;
    const base=Math.max(0,designTot*((P.kwPct||0)/100)*kw.corr);
    kw.byRole={};kw.h=0;kw.exact=0;kw.qty=designTot;
    for(const[r,n] of weights){const v=base*(n/wsum);if(v)kw.byRole[r]=v;kw.h+=v}
    kw.exact=kw.h;
    applyPeople(kw);
  }
  const exactMid=cells.reduce((s,c)=>s+c.exact,0);
  const exactCost=cells.reduce((s,c)=>s+c.exact*(+p.rates[c.role]||0),0);
  const exactDesign=cells.filter(c=>c.ph!=='uitv').reduce((s,c)=>s+c.exact*(+p.rates[c.role]||0),0);
  const scen=blankScen();
  for(const[k] of SCEN){
    const f=+p.factors[k]||0,target=Math.round(exactMid*f),alloc=hamilton(cells,target);
    const role={},phase={},person={};let cost=0;
    for(const c of cells){const n=alloc[c.key]||0;if(!n)continue;role[c.role]=(role[c.role]||0)+n;phase[c.ph]=(phase[c.ph]||0)+n;person[c.person]=(person[c.person]||0)+n;cost+=n*(+p.rates[c.role]||0)}
    scen[k]={f,hours:target,cost,design:exactDesign*f,exactHours:exactMid*f,role,phase,person,risk:0,alloc};
  }
  for(const r of rows){
    const base=r.byRoleExact||r.byRole;r.byRole={};r.scen={};
    if(!r.active){r.h=0;continue}
    let h=0;
    for(const role of Object.keys(base)){
      let n=0;
      for(const c of cells)if(c.task===r.id&&c.role===role)n+=scen.markt.alloc[c.key]||0;
      if(n){r.byRole[role]=n;h+=n}
    }
    r.h=h;
    for(const[k] of SCEN){
      let sh=0;
      for(const c of cells)if(c.task===r.id)sh+=scen[k].alloc[c.key]||0;
      r.scen[k]=sh;
    }
  }
  const role=scen.markt.role,mid=exactMid,cost=exactCost,designCost=exactDesign;
  const act=rows.filter(r=>r.active&&r.exact>0);const N=3000;const sims=new Float64Array(N);
  let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const gauss=()=>{let u=0,v=0;while(!u)u=rnd();v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  if(act.length&&exactMid>0){
    for(let i=0;i<N;i++){const g=Math.exp(.15*gauss());let s=0;for(const r of act)s+=r.exact*Math.exp(.6*r.u*gauss());sims[i]=s*g}
    const sorted=[...sims].sort((a,b)=>a-b),median=sorted[Math.floor((N-1)/2)]||exactMid,scale=median>0?exactMid/median:1;
    for(let i=0;i<N;i++)sims[i]*=scale;
    for(const[k] of SCEN){let over=0;for(let i=0;i<N;i++)if(sims[i]>scen[k].hours)over++;scen[k].risk=over/N}
  }
  const taskSum=rows.reduce((s,r)=>s+(r.active?r.h:0),0);
  const roleSum=Object.values(role).reduce((s,v)=>s+v,0);
  const phaseSum=Object.values(scen.markt.phase).reduce((s,v)=>s+v,0);
  const audit={exact:exactMid,hours:scen.markt.hours,taskSum,roleSum,phaseSum,ok:taskSum===roleSum&&roleSum===phaseSum&&phaseSum===scen.markt.hours};
  const warns=[];
  if((p.type==='wijk'||p.type==='groen')&&!(P.opp>0)&&!(P.bladenHand>0))warns.push('Geen oppervlak ingevuld: er worden geen situatietekeningen gerekend.');
  if((p.type==='herinr'||p.type==='riool'||p.type==='klein')&&!(P.straat>0)&&!(P.opp>0)&&!(P.bladenHand>0))warns.push('Geen lengte of oppervlak: het aantal A1-bladen is 0.');
  if(P.bladenHand>0&&d.bladenAuto>0&&Math.abs(P.bladenHand-d.bladenAuto)>=1)warns.push('Handmatig aantal bladen ('+nf1.format(P.bladenHand)+') wijkt af van de schaalberekening ('+nf1.format(d.bladenAuto)+').');
  for(const[id,[pred]] of Object.entries(REUSE)){
    const task=TASKS.find(t=>t[0]===id),pre=TASKS.find(t=>t[0]===pred);
    if(task&&pre&&taskOn(p,id)&&!taskOn(p,pred))warns.push(task[2]+': geen hergebruik, omdat "'+pre[2]+'" uit staat.');
  }
  const bouwsom=P.bouwsom>0?P.bouwsom:P.opp*P.eurM2;
  const off=ROLES.filter(([id])=>p.roleOn[id]===false).map(([,name])=>name);
  if(off.length)warns.push('Niet nodig: '+off.join(', ')+'. Die uren zitten niet in de begroting.');
  return{rows,role,mid,cost,designCost,scen,d,P,bouwsom,bouwsomEst:!(P.bouwsom>0),audit,warns,analyse,cplx,riskPct:rf.pct};
}
function marktStatus(p,R){
  const issues=[];
  const f=+p.factors.markt;
  if(!Number.isFinite(f)||Math.abs(f-1)>0.001)issues.push('De factor Marktconform is '+(Number.isFinite(f)?String(f).replace('.',','):'leeg')+' in plaats van 1,00.');
  const outside=ROLES.filter(r=>{const h=R.role[r[0]]||0,v=+p.rates[r[0]];return h>0&&(v<r[3]||v>r[4])});
  if(outside.length)issues.push('Tarief buiten de marktband: '+outside.map(r=>r[1]).join(', ')+'.');
  if(!R.audit.ok)issues.push('De urenoptelling sluit niet.');
  const chosen=p.chosen==='markt';
  return{basisOk:!issues.length,chosenOk:chosen&&!issues.length,issues,marktHours:R.scen.markt.hours,marktCost:R.scen.markt.cost};
}

/* ---------- opslag ---------- */
let db=null,user=null,canWrite=true,projects=[],cur=null,unsub=null,saveT=null,saving=false,pending=false;
const LS='civinaar-uren-v1';
function lsLoad(){try{return JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){return[]}}
function lsSave(){try{localStorage.setItem(LS,JSON.stringify(projects))}catch(e){}}
function setState(m){$('#saveState').textContent=m}
function scheduleSave(){if(!cur)return;cur.updated=Date.now();setState('Wijzigingen…');clearTimeout(saveT);saveT=setTimeout(saveNow,900)}
async function saveNow(){
  if(!cur)return;
  if(!db){lsSave();setState('Opgeslagen in deze browser');return}
  if(!canWrite){setState('Alleen lezen');return}
  if(saving){pending=true;return}
  saving=true;
  try{await db.collection('projects').doc(cur.id).set(clone(cur));setState('Opgeslagen')}
  catch(e){if(e&&e.code==='invalid_argument'){canWrite=false;setState('Alleen lezen: je kunt hier niet opslaan')}else if(e&&e.code==='quota_exceeded'){setState('Opslag vol: verwijder oude projecten')}else setState('Opslaan mislukt, probeer opnieuw')}
  saving=false;if(pending){pending=false;saveNow()}
}

/* ---------- render ---------- */
function renderSelect(){
  const s=$('#projSel');s.textContent='';
  if(!projects.length){s.append(el('option',{value:''},'Nog geen projecten'));return}
  [...projects].sort((a,b)=>(b.updated||0)-(a.updated||0)).forEach(p=>s.append(el('option',{value:p.id},(p.nummer?p.nummer+' · ':'')+p.naam)));
  if(cur)s.value=cur.id;
}
function field(lbl,input,wide){return el('div',{class:'f'+(wide?' wide':'')},el('label',{for:input.id},lbl),input)}
function inp(id,val,on,type='text',extra={}){return el('input',{id,type,value:val??'',...extra,oninput:e=>on(e.target.value)})}
function sel(id,val,opts,on){const s=el('select',{id,onchange:e=>on(e.target.value)},...Object.entries(opts).map(([k,v])=>el('option',{value:k},v)));s.value=val;return s}

function renderProject(){
  const f=$('#fProj');f.textContent='';const p=cur;
  f.append(
    field('Projectnaam',inp('pNaam',p.naam,v=>{p.naam=v;$('#title').textContent=v||'Urencalculator';scheduleSave();renderSelect()})),
    field('Opdrachtgever',inp('pOg',p.opdrachtgever,v=>{p.opdrachtgever=v;scheduleSave()})),
    field('Projectnummer',inp('pNr',p.nummer,v=>{p.nummer=v;scheduleSave();renderSelect()})),
    field('Opgesteld door',inp('pOps',p.opsteller,v=>{p.opsteller=v;scheduleSave()})),
    field('Datum',inp('pDat',p.datum,v=>{p.datum=v;scheduleSave()},'date')),
    field('Type project',sel('pType',p.type,TYPES,v=>{applyType(p,v);toast('Takenpakket aangepast aan '+TYPES[v].toLowerCase());scheduleSave();renderAll()})),
    field('Tekenschaal situatie',sel('pSchaal',p.schaal,Object.fromEntries(Object.keys(SCALES).map(k=>[k,k])),v=>{p.schaal=v;scheduleSave();recalc()})),
    field('Complexiteit',sel('pCplx',p.cplxAuto?'auto':p.cplx,{auto:'Volg de analyse',eenvoudig:'Zelf: eenvoudig (−35%)',gemiddeld:'Zelf: gemiddeld',complex:'Zelf: complex (+65%)'},v=>{if(v==='auto')p.cplxAuto=true;else{p.cplxAuto=false;p.cplx=v}scheduleSave();renderAll()})),
    field('Offerte geldig (dagen)',inp('pGeld',p.geldig??30,v=>{p.geldig=v===''?30:+v;scheduleSave()},'number',{min:1,step:1})),
  );
  const g=$('#fParams');g.textContent='';
  for(const[k,l,u] of PARAMS){
    g.append(field(l+' ('+u+')',inp('par_'+k,p.params[k],v=>{p.params[k]=v===''?0:+v;scheduleSave();recalc()},'number',{min:0,step:'any',inputmode:'decimal'})));
  }
}
function renderDerived(R){
  const d=$('#derived');d.textContent='';
  const c=(l,v)=>el('span',{class:'chip'},l,el('b',{},v));
  d.append(c('A1-bladen situatie'+(+cur.params.bladenHand>0?' (handmatig)':''),nf1.format(R.d.bladen)),c('Profielbladen',R.d.pbladen),c('Overleggen opdrachtgever',R.d.ogo),c('Bouwvergaderingen',R.d.bouwv),
    c(R.bouwsomEst?'Geschatte bouwsom':'Bouwsom',eur(R.bouwsom)),c('Exacte uren',nf1.format(R.audit.exact)));
  let box=d.parentElement.querySelector('.warnlist');
  if(!box){box=el('div',{class:'warnlist'});d.insertAdjacentElement('afterend',box)}
  box.textContent='';
  for(const w of R.warns)box.append(el('p',{},w));
  box.hidden=!R.warns.length;
}
const open=new Set(['vo','do','uo']);
function renderPhases(R){
  const box=$('#phases');box.textContent='';
  for(const[ph,label] of PHASES){
    const rows=R.rows.filter(r=>r.ph===ph);const on=!!cur.phases[ph];
    const sum=rows.filter(r=>r.active).reduce((a,r)=>a+r.h,0);
    const cost=rows.filter(r=>r.active).reduce((a,r)=>a+Object.entries(r.byRole).reduce((s,[k,v])=>s+v*(+cur.rates[k]||0),0),0);
    const sw=el('label',{class:'switch',title:on?'Fase uitzetten':'Fase aanzetten'},el('input',{type:'checkbox',id:'ph_'+ph,checked:on,'aria-label':'Fase '+label,onchange:e=>{cur.phases[ph]=e.target.checked;scheduleSave();renderAll()}}),el('span'));
    const isOpen=open.has(ph);
    const tg=el('button',{class:'tg','aria-expanded':String(isOpen),onclick:()=>{isOpen?open.delete(ph):open.add(ph);renderPhases(R)}},isOpen?'Verberg taken':'Toon taken ('+rows.length+')');
    const wrap=el('div',{class:'phase'+(on?'':' off')},el('div',{class:'ph'},sw,el('h3',{},label),el('span',{class:'sum'},on?nf0.format(sum)+' u · '+eur(cost):'niet in scope'),tg));
    if(isOpen){
      const tb=el('tbody');
      for(const r of rows){
        const roleTxt=r.unit==='pct'
          ?(()=>{const w=Object.values(r.norms).reduce((s,n)=>s+n,0)||1;return Object.entries(r.norms).map(([k,v])=>RN[k]+' '+nf0.format(v/w*100)+'%').join(' · ')})()
          :Object.entries(r.norms).map(([k,v])=>RN[k]+' '+nf1.format(v)).join(' · ');
        const formula=r.unit==='pct'
          ?nf1.format(+cur.params.kwPct||0)+'% × '+nf1.format(r.qty||0)+' ontwerpuren = '+nf1.format(r.exact)+' u, begroot '+nf0.format(r.h)+' u'
          :Object.entries(r.norms).map(([k,v])=>{
              const bits=[nf1.format(v),'×',nf1.format(+r.qty||0)];
              if(r.reuse!==1)bits.push('×',nf1.format(r.reuse));
              if(r.cs&&r.cf!==1)bits.push('×',nf1.format(r.cf));
              if(r.rf&&r.rf!==1)bits.push('×',nf1.format(r.rf));
              if(r.corr!==1)bits.push('×',nf1.format(r.corr));
              const people=activeStaff(cur,k);
              if(people.length){
                const lv=people.reduce((s,x)=>s+(LEVEL[x.niveau]||1),0)/people.length;
                if(people.length!==1)bits.push('÷',String(people.length),'mensen');
                if(Math.abs(lv-1)>0.001)bits.push('×',nf1.format(lv),'niveau');
              }
              return RN[k]+' '+bits.join(' ');
            }).join(' · ')+(r.active?' = '+nf1.format(r.exact)+' u':'');
        const qtyCell=r.unit==='pct'?el('span',{class:'unit'},nf1.format(+cur.params.kwPct||0)+'% van '+nf0.format(r.qty)+' u')
          :el('span',{style:'display:inline-flex;gap:6px;align-items:center'},el('input',{class:'mini',type:'number',min:0,step:'any',id:'q_'+r.id,value:r.st.qty??'',placeholder:nf1.format(r.auto),'aria-label':'Aantal '+r.name,
              onchange:e=>{cur.tasks[r.id].qty=e.target.value===''?null:+e.target.value;scheduleSave();recalc()}}),el('span',{class:'unit'},UNITS[r.unit][0]));
        tb.append(el('tr',{class:r.active?'':'off'},
          el('td',{},el('input',{type:'checkbox',id:'t_'+r.id,checked:r.st.on,'aria-label':'Taak '+r.name,disabled:!on,onchange:e=>{cur.tasks[r.id].on=e.target.checked;scheduleSave();recalc()}})),
          el('td',{class:'nm'},el('div',{},r.name),el('div',{class:'roles'},(r.unit==='pct'?'verdeling van de controle: ':'per '+UNITS[r.unit][0]+': ')+roleTxt+(r.cs?' · complexiteit telt mee':'')),el('div',{class:'formula'},formula)),
          el('td',{},qtyCell),
          el('td',{},el('input',{class:'mini',type:'number',step:5,id:'c_'+r.id,value:r.st.corr||0,'aria-label':'Correctie % '+r.name,style:'width:58px',onchange:e=>{cur.tasks[r.id].corr=+e.target.value||0;scheduleSave();recalc()}})),
          el('td',{class:'n'},r.active?nf1.format(r.h):'–')));
      }
      wrap.append(el('div',{class:'tscroll'},el('table',{class:'tasks'},el('thead',{},el('tr',{},el('th',{},''),el('th',{},'Taak'),el('th',{},'Aantal'),el('th',{},'Corr. %'),el('th',{class:'n'},'Uren'))),tb)));
    }
    box.append(wrap);
  }
}
function riskClass(r){return r<=.35?'ok':r<=.65?'warn':'bad'}
function renderScen(R){
  const box=$('#scen');box.textContent='';
  for(const[k,l,sub] of SCEN){
    const s=R.scen[k];
    box.append(el('button',{class:'sc'+(cur.chosen===k?' on':''),'aria-pressed':String(cur.chosen===k),onclick:()=>{cur.chosen=k;scheduleSave();recalc()}},
      el('span',{class:'t'},l,el('span',{class:'num',style:'font:500 12px var(--f-mono);color:var(--muted)'},'× '+s.f.toFixed(2).replace('.',','))),
      el('span',{class:'sub'},sub),
      el('span',{class:'eur num'},eur(s.cost)),
      el('span',{class:'hrs'},nf0.format(s.hours)+' uur'),
      el('span',{class:'risk '+riskClass(s.risk)},'Kans op overschrijding '+nf0.format(s.risk*100)+'%')));
  }
  const s=R.scen[cur.chosen]||R.scen.markt,P=R.P,c=$('#checks');c.textContent='';
  const row=(l,v,cls)=>c.append(el('div',{class:'check'},el('span',{},l),el('span',{class:cls||''},v)));
  const pct=R.bouwsom>0?s.design/R.bouwsom:0;
  row('Gemiddeld uurtarief',eur(s.hours?s.cost/s.hours:0)+'/u');
  if(R.bouwsom>0)row('Ontwerp als % van '+(R.bouwsomEst?'geschatte ':'')+'bouwsom (3–6%)',nf1.format(pct*100)+'%'+(pct<.03?' · laag':pct>.06?' · hoog':' · normaal'),pct<.03||pct>.06?'flag':'flag ok');
  if(P.straat>0)row('Uren per meter straat',nf1.format(s.hours/P.straat));
  if(P.woningen>0)row('Uren per woning / adres',nf1.format(s.hours/P.woningen));
  if(P.opp>0)row('Engineering per m² plangebied','€ '+(s.cost/P.opp).toFixed(2).replace('.',','));
  const out=ROLES.filter(r=>{const v=+cur.rates[r[0]];return (R.role[r[0]]||0)>0&&(v<r[3]||v>r[4])});
  if(out.length)row('Tarief buiten marktband',out.map(r=>r[1]).join(', '),'flag bad');
  let bar=c.parentElement.querySelector('.audit');
  if(!bar){bar=el('div',{class:'audit',role:'status'});c.insertAdjacentElement('afterend',bar)}
  const a=R.audit;
  bar.className='audit'+(a.ok?'':' bad');
  bar.textContent=a.ok
    ?'Marktconforme uren sluiten op '+nf0.format(a.hours)+' uur. Taken, fasen en rollen geven hetzelfde totaal. Exact '+nf1.format(a.exact)+' uur.'
    :'De optelling sluit niet: taken '+nf0.format(a.taskSum)+', fasen '+nf0.format(a.phaseSum)+', rollen '+nf0.format(a.roleSum)+'.';
  const st=marktStatus(cur,R);
  row('Rekenbasis marktconform',st.basisOk?'ja · '+nf0.format(st.marktHours)+' u · '+eur(st.marktCost):'nee',st.basisOk?'flag ok':'flag bad');
  if(!st.chosenOk)row('Aangeboden scenario',(SCEN.find(s=>s[0]===cur.chosen)||['','Onbekend'])[1]+' · niet marktconform','flag');
  else row('Aangeboden scenario','Marktconform','flag ok');
  for(const issue of st.issues)row('Afwijking',issue,'flag bad');
}
function renderPeople(R){
  const t=$('#tPeople');t.textContent='';const ch=cur.chosen;ensureStaff(cur);
  const head=el('tr',{},el('th',{},'Medewerker'),...SCEN.map(([k,l])=>el('th',{class:'n'+(k===ch?' sel':'')},k==='markt'?'Markt':l)),el('th',{class:'n'},'Werkelijk'));
  const tb=el('tbody');let tot={},totA=0;
  for(const s of cur.staff){
    const any=SCEN.some(([k])=>((R.scen[k].person||{})[s.id]||0)>0);if(!any&&!(cur.actual[s.id]>0))continue;
    const a=+cur.actual[s.id]||0;totA+=a;
    const budget=(R.scen[ch].person||{})[s.id]||0;
    const cells=SCEN.map(([k])=>{const v=(R.scen[k].person||{})[s.id]||0;tot[k]=(tot[k]||0)+v;return el('td',{class:'n'+(k===ch?' sel':'')},nf0.format(v))});
    const dev=a>0&&budget>0?el('div',{class:'dev '+(Math.abs(a/budget-1)>.15?'flag':'flag ok')},(a>=budget?'+':'')+nf0.format((a/budget-1)*100)+'%'):null;
    const label=(RN[s.role]||s.role)+(s.naam?' · '+s.naam:'')+' · '+(LEVEL_NAME[s.niveau]||s.niveau);
    tb.append(el('tr',{},el('td',{},label),...cells,
      el('td',{class:'n'},el('input',{class:'mini',type:'number',min:0,step:'any',id:'act_'+s.id,value:cur.actual[s.id]||'',placeholder:'–','aria-label':'Werkelijke uren '+label,style:'width:58px',onchange:e=>{cur.actual[s.id]=e.target.value===''?0:+e.target.value;scheduleSave();recalc()}}),dev)));
  }
  tb.append(el('tr',{class:'tot'},el('td',{},'Totaal uren'),...SCEN.map(([s])=>el('td',{class:'n'+(s===ch?' sel':'')},nf0.format(tot[s]||0))),el('td',{class:'n'},totA?nf0.format(totA):'')));
  const actualCost=cur.staff.reduce((sum,s)=>sum+(+cur.actual[s.id]||0)*(+cur.rates[s.role]||0),0);
  tb.append(el('tr',{},el('td',{},'Totaal €'),...SCEN.map(([s])=>el('td',{class:'n'+(s===ch?' sel':'')},eur(R.scen[s].cost))),el('td',{class:'n'},totA?eur(actualCost):'')));
  t.append(el('thead',{},head),tb);
}
function renderAnalysis(R){
  const box=$('#analysis');if(!box)return;box.textContent='';ensureStaff(cur);
  const a=R.analyse,names={eenvoudig:'eenvoudig',gemiddeld:'gemiddeld',complex:'complex'};
  const used=cur.risks?RISKS.filter(r=>cur.risks[r[0]]):[];
  box.append(el('div',{class:'analysis'},
    el('strong',{},'Analyse'),
    el('p',{},'Op basis van omvang en samenstelling oogt dit project '+names[a.niveau]+' (score '+a.score+'). '+(cur.cplxAuto?'Die analyse stuurt de uren.':'Je hebt zelf '+names[R.cplx]+' gekozen.')),
    el('p',{},a.reasons.join(' · ')+'.'),
    el('p',{},'Risico’s die hier kunnen meespelen: '+(a.suggest.length?a.suggest.map(id=>RISKS.find(r=>r[0]===id)[1]).join(', '):'geen bijzondere signalen')+'. Vink aan wat in de uren meetelt'+(R.riskPct?' · nu +'+R.riskPct+'%':'')+'.')
  ));
  const grid=el('div',{class:'checks-grid'});
  for(const[id,name,pc] of RISKS){
    const suggested=a.suggest.includes(id);
    grid.append(el('label',{},el('input',{type:'checkbox',checked:!!cur.risks[id],'aria-label':name,onchange:e=>{cur.risks[id]=e.target.checked;scheduleSave();renderAll()}}),name+' (+'+pc+'%)'+(suggested?' · past bij dit project':'')));
  }
  box.append(grid);
}
function renderStaff(R){
  const box=$('#staff');if(!box)return;box.textContent='';ensureStaff(cur);
  for(const[role,name,def,lo,hi] of ROLES){
    const on=cur.roleOn[role]!==false;
    const people=cur.staff.filter(s=>s.role===role);
    const head=el('div',{class:'rolehead'},
      el('label',{class:'switch',title:on?'Rol niet nodig':'Rol nodig'},el('input',{type:'checkbox',checked:on,'aria-label':name+' nodig',onchange:e=>{cur.roleOn[role]=e.target.checked;scheduleSave();renderAll()}}),el('span')),
      el('strong',{},name),
      el('span',{class:'hint'},on?nf0.format(R.role[role]||0)+' u':'niet nodig'),
      el('span',{class:'hint','data-role-hours':role},'')
    );
    const wrap=el('div',{class:'rolebox'+(on?'':' off')},head);
    for(const s of people){
      const lvl=el('select',{'aria-label':'Niveau '+name,onchange:e=>{s.niveau=e.target.value;scheduleSave();renderAll()}},...Object.entries(LEVEL_NAME).map(([k,v])=>el('option',{value:k},v)));
      lvl.value=s.niveau||'medior';
      wrap.append(el('div',{class:'person'},
        el('input',{type:'checkbox',checked:!!s.on,disabled:!on,'aria-label':'Medewerker '+name,onchange:e=>{s.on=e.target.checked;scheduleSave();renderAll()}}),
        el('input',{type:'text',value:s.naam||'',placeholder:'naam',disabled:!on,'aria-label':'Naam '+name,onchange:e=>{s.naam=e.target.value;scheduleSave();renderAll()}}),
        lvl,
        el('span',{class:'hint'},nf0.format((R.scen.markt.person||{})[s.id]||0)+' u'),
        people.length>1?el('button',{class:'btn',type:'button',onclick:()=>{cur.staff=cur.staff.filter(x=>x.id!==s.id);scheduleSave();renderAll()}},'Weg'):null
      ));
    }
    wrap.append(el('button',{class:'btn',type:'button',style:'margin-top:6px',onclick:()=>{
      if(cur.staff.filter(s=>s.role===role).length>=6){toast('Hooguit zes mensen per rol');return}
      cur.staff.push({id:uid(),role,on:true,naam:'',niveau:'medior'});scheduleSave();renderAll();
    }},'Medewerker toevoegen'));
    box.append(wrap);
  }
}
function renderExportSel(){
  const box=$('#exportSel');if(!box)return;box.textContent='';ensureStaff(cur);
  for(const[id,label] of EXPORT_PARTS){
    box.append(el('label',{},el('input',{type:'checkbox',checked:cur.exportSel[id]!==false,'aria-label':'Export '+label,onchange:e=>{cur.exportSel[id]=e.target.checked;scheduleSave()}}),label));
  }
}
function renderRates(R){
  const t=$('#tRates');t.textContent='';
  const tb=el('tbody');
  for(const[k,name,def,lo,hi] of ROLES){
    const v=+cur.rates[k];const bad=v<lo||v>hi;
    tb.append(el('tr',{},el('td',{},name),
      el('td',{},el('input',{class:'name',id:'pp_'+k,value:cur.people[k]||'',placeholder:'naam medewerker','aria-label':'Medewerker '+name,onchange:e=>{cur.people[k]=e.target.value;scheduleSave();recalc()}})),
      el('td',{class:'n'},el('input',{class:'mini',type:'number',min:0,step:1,id:'r_'+k,value:v,'aria-label':'Tarief '+name,onchange:e=>{cur.rates[k]=+e.target.value||0;scheduleSave();renderAll()}})),
      el('td',{class:'n'+(bad?' flag bad':'')},'€ '+lo+'–'+hi),
      el('td',{class:'n'},nf0.format(R.role[k]||0))));
  }
  t.append(el('thead',{},el('tr',{},el('th',{},'Rol'),el('th',{},'Medewerker'),el('th',{class:'n'},'Tarief €/u'),el('th',{class:'n'},'Marktband'),el('th',{class:'n'},'Uren (markt)'))),tb);
  const f=$('#fFactors');f.textContent='';
  for(const[k,l] of SCEN)f.append(field(l,inp('fac_'+k,cur.factors[k],v=>{cur.factors[k]=+v||0;scheduleSave();recalc()},'number',{step:.01,min:0})));
}
let lastR=null;
function recalc(){if(!cur)return;const R=compute(cur);lastR=R;renderDerived(R);renderAnalysis(R);renderPhases(R);renderScen(R);renderPeople(R);
  const tr=$('#tRates');if(tr)[...tr.querySelectorAll('tbody tr')].forEach((row,i)=>{const c=row.lastChild;if(c&&ROLES[i])c.textContent=nf0.format(R.role[ROLES[i][0]]||0)})}
function renderAll(){
  const app=$('#app');
  if(!cur){app.hidden=true;return}
  ensureStaff(cur);
  app.hidden=false;$('#title').textContent=cur.naam||'Urencalculator';
  renderProject();const R=compute(cur);lastR=R;renderStaff(R);renderRates(R);renderExportSel();renderDerived(R);renderAnalysis(R);renderPhases(R);renderScen(R);renderPeople(R);renderSelect();
}

/* ---------- acties ---------- */
$('#projSel').addEventListener('change',e=>{const p=projects.find(x=>x.id===e.target.value);if(p){cur=p;disarm();renderAll()}});
$('#bNew').addEventListener('click',()=>{const p=newProject('wijk','Nieuw project');projects.push(p);cur=p;renderAll();saveNow();toast('Nieuw project aangemaakt');$('#pNaam').focus()});
$('#bDup').addEventListener('click',()=>{if(!cur)return;const p=clone(cur);p.id=uid();p.naam=cur.naam+' (kopie)';p.actual={};p.updated=Date.now();projects.push(p);cur=p;renderAll();saveNow();toast('Project gedupliceerd')});
let armed=false;function disarm(){armed=false;const b=$('#bDel');b.classList.remove('armed');b.textContent='Verwijderen'}
$('#bDel').addEventListener('click',async()=>{
  if(!cur)return;const b=$('#bDel');
  if(!armed){armed=true;b.classList.add('armed');b.textContent='Klik nogmaals om te verwijderen';setTimeout(disarm,4000);return}
  disarm();const id=cur.id;projects=projects.filter(p=>p.id!==id);
  if(db&&canWrite){try{await db.collection('projects').doc(id).delete()}catch(e){toast('Verwijderen mislukt')}}else lsSave();
  cur=projects[0]||null;if(!cur){cur=newProject('wijk','Nieuw project');projects.push(cur)}renderAll();toast('Project verwijderd');
});

function applyImported(data){
  if(!data||(data.v!==1&&data.v!==2)||!data.params||!data.tasks){toast('Import mislukt: bestand hoort niet bij deze calculator');return}
  const type=TYPES[data.type]?data.type:'wijk';
  const p=newProject(type,data.naam||'Geïmporteerd project');
  p.opdrachtgever=data.opdrachtgever||'';p.nummer=data.nummer||'';p.opsteller=data.opsteller||'';
  p.datum=data.datum||p.datum;p.geldig=data.geldig??30;p.schaal=SCALES[data.schaal]?data.schaal:p.schaal;
  p.cplx=CPLX[data.cplx]?data.cplx:p.cplx;p.niveau=LEVEL[data.niveau]?data.niveau:p.niveau;
  p.chosen=SCEN.some(s=>s[0]===data.chosen)?data.chosen:'markt';
  for(const[k] of PARAMS)if(data.params[k]!=null)p.params[k]=data.params[k];
  for(const[k] of PHASES)if(data.phases&&k in data.phases)p.phases[k]=!!data.phases[k];
  for(const t of TASKS){const src=data.tasks[t[0]];if(src)p.tasks[t[0]]={on:!!src.on,qty:src.qty==null||src.qty===''?null:+src.qty,corr:+src.corr||0}}
  for(const[k] of ROLES){if(data.rates&&data.rates[k]!=null)p.rates[k]=+data.rates[k]||0;if(data.people&&data.people[k])p.people[k]=data.people[k]}
  if(data.actual)for(const[k,v] of Object.entries(data.actual))p.actual[k]=+v||0;
  if(data.factors)for(const[k] of SCEN)if(data.factors[k]!=null)p.factors[k]=+data.factors[k]||0;
  if(Array.isArray(data.staff)&&data.staff.length)p.staff=data.staff;
  if(data.roleOn)p.roleOn=data.roleOn;
  if(data.risks)p.risks=data.risks;
  if(data.exportSel)p.exportSel=data.exportSel;
  if(data.cplxAuto!=null)p.cplxAuto=!!data.cplxAuto;
  else p.cplxAuto=p.cplx!=='eenvoudig'&&p.cplx!=='complex';
  ensureStaff(p);
  projects.push(p);cur=p;renderAll();saveNow();toast('Project geïmporteerd');
}
$('#bXls').addEventListener('click',()=>exportExcel().catch(()=>toast('Excel-export mislukt')));
$('#bDoc').addEventListener('click',()=>exportWord().catch(()=>toast('Word-export mislukt')));
$('#bPdf').addEventListener('click',()=>exportPdf().catch(()=>toast('PDF-export mislukt')));
$('#bXlsIn').addEventListener('click',()=>{$('#inXls').value='';$('#inXls').click()});
$('#bDocIn').addEventListener('click',()=>{$('#inDoc').value='';$('#inDoc').click()});
$('#inXls').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importExcel(f).catch(()=>toast('Excel-import mislukt'))});
$('#inDoc').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importWord(f).catch(()=>toast('Word-import mislukt'))});

function fmtDateISO(iso){
  const [y,m,d]=String(iso||'').split('-');
  return y&&m&&d?d+'-'+m+'-'+y:'';
}
function geldigTot(p){
  const [y,m,d]=String(p.datum||'').split('-').map(Number);
  if(!y||!m||!d)return '';
  const dt=new Date(y,m-1,d);dt.setDate(dt.getDate()+(+p.geldig||30));
  const z=n=>String(n).padStart(2,'0');
  return z(dt.getDate())+'-'+z(dt.getMonth()+1)+'-'+dt.getFullYear();
}
function closeOfferte(){const m=$('#modal');if(!m)return;m.hidden=true;m.classList.remove('print')}
function openOfferte(){
  if(!cur)return;
  const v=offerView();if(!v)return;
  const R=v.R,p=v.p,s=v.s,on=id=>partOn(p,id);
  const box=$('#offerte');box.textContent='';
  const btw=Math.round(s.cost*.21);
  const bits=[el('div',{class:'actions noprint'},el('button',{class:'btn',type:'button',onclick:closeOfferte},'Sluiten'),el('button',{class:'btn primary',type:'button',onclick:()=>{$('#modal').classList.add('print');window.print();$('#modal').classList.remove('print')}},'Afdrukken'))];
  const headLeft=el('div',{});
  if(on('logo'))headLeft.append(el('img',{class:'logo',src:LOGO_SRC,alt:'Civinaar'}));
  headLeft.append(el('h2',{id:'offTitle'},'Offerte werkduur'),el('p',{class:'muted'},'Voorcalculatie van ingenieursuren. Uitgevinkte taken en rollen staan hier niet in.'));
  const headRight=el('div',{});
  if(on('bedragen'))headRight.append(el('div',{class:'big'},eur(s.cost)));
  headRight.append(el('div',{class:'muted'},nf0.format(s.hours)+' uur · '+v.meta[1]));
  bits.push(el('div',{class:'offhead'},headLeft,headRight));
  if(on('project')){
    bits.push(el('p',{},el('strong',{},p.naam||'Project')));
    bits.push(el('p',{class:'muted'},[p.opdrachtgever&&('Opdrachtgever: '+p.opdrachtgever),p.nummer&&('Nummer: '+p.nummer),p.opsteller&&('Opgesteld door: '+p.opsteller),'Datum: '+fmtDateISO(p.datum),'Geldig tot: '+geldigTot(p)].filter(Boolean).join(' · ')));
  }
  if(on('markt'))bits.push(el('p',{class:'muted'},v.status.basisOk?'Rekenbasis marktconform: ja, '+nf0.format(v.status.marktHours)+' uur, '+eur(v.status.marktCost)+'.':('Rekenbasis marktconform: nee. '+v.status.issues.join(' '))));
  if(on('fasen')){
    const tb=el('tbody');
    for(const ph of v.phases)tb.append(el('tr',{},el('td',{},ph.name),el('td',{class:'n'},nf0.format(ph.hours)+' u')));
    tb.append(el('tr',{class:'tot'},el('td',{},'Totaal'),el('td',{class:'n'},nf0.format(s.hours)+' u')));
    bits.push(el('h3',{style:'margin-top:14px'},'Uren per fase'),el('table',{},el('thead',{},el('tr',{},el('th',{},'Fase'),el('th',{class:'n'},'Uren'))),tb));
  }
  if(on('rollen')){
    const people=el('tbody');
    for(const role of v.roles){
      const cells=[el('td',{},role.name),el('td',{class:'n'},nf0.format(role.hours))];
      if(on('bedragen'))cells.push(el('td',{class:'n'},eur(role.cost)));
      people.append(el('tr',{},...cells));
    }
    const tot=[el('td',{},on('bedragen')&&on('btw')?'Totaal excl. btw':'Totaal'),el('td',{class:'n'},nf0.format(s.hours)+' u')];
    if(on('bedragen'))tot.push(el('td',{class:'n'},eur(s.cost)));
    people.append(el('tr',{class:'tot'},...tot));
    const heads=[el('th',{},'Medewerker'),el('th',{class:'n'},'Uren')];
    if(on('bedragen'))heads.push(el('th',{class:'n'},'Bedrag'));
    bits.push(el('h3',{style:'margin-top:16px'},'Uren per medewerker'),el('table',{},el('thead',{},el('tr',{},...heads)),people));
  }
  if(on('btw'))bits.push(el('p',{class:'muted',style:'margin-top:8px'},'Btw 21% '+eur(btw)+' · inclusief btw '+eur(s.cost+btw)+'.'));
  if(on('uitgang'))bits.push(el('h3',{style:'margin-top:16px'},'Uitgangspunten'),el('p',{class:'muted'},[TYPES[p.type],'schaal '+p.schaal,nf1.format(R.d.bladen)+' A1-bladen',R.d.pbladen+' profielbladen','exact '+nf1.format(R.audit.exact)+' uur'].join(' · ')));
  if(on('complex')){
    const a=R.analyse,picked=RISKS.filter(r=>p.risks&&p.risks[r[0]]);
    bits.push(el('h3',{style:'margin-top:16px'},'Complexiteit en risico’s'),el('p',{class:'muted'},'Complexiteit '+(p.cplxAuto?'volgt de analyse en is ':'is zelf gekozen als ')+R.cplx+'. '+(a.reasons||[]).join(', ')+'.'),el('p',{class:'muted'},picked.length?'Risico’s in de uren: '+picked.map(r=>r[1]+' (+'+r[2]+'%)').join(', ')+'.':'Geen extra risico’s aangevinkt.'));
  }
  if(on('taken')){
    const tb=el('tbody');
    for(const t of v.tasks){
      const cells=[el('td',{},t.phase),el('td',{},t.name),el('td',{},t.qty),el('td',{class:'n'},nf0.format(t.hours))];
      if(on('bedragen'))cells.push(el('td',{class:'n'},eur(t.cost)));
      tb.append(el('tr',{},...cells));
    }
    const heads=[el('th',{},'Fase'),el('th',{},'Taak'),el('th',{},'Aantal'),el('th',{class:'n'},'Uren')];
    if(on('bedragen'))heads.push(el('th',{class:'n'},'Bedrag'));
    bits.push(el('h3',{style:'margin-top:16px'},'Taken'),el('table',{},el('thead',{},el('tr',{},...heads)),tb));
  }
  bits.push(el('p',{class:'muted'},R.audit.ok?'Taken, fasen en medewerkers sluiten op '+nf0.format(s.hours)+' uur.':'De optelling sluit niet. Controleer de berekening.'));
  box.append(...bits);
  $('#modal').hidden=false;
}
$('#bOff').addEventListener('click',openOfferte);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeOfferte()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOfferte()});

/* ---------- start ---------- */
function startLocal(msg){
  projects=lsLoad();
  if(!projects.length){const p=newProject('wijk','Voorbeeld – Woonrijp fase 1.1 Stougjeswijk');p.opdrachtgever='GEM Stougjeswijk (voorbeeld)';projects=[p];lsSave()}
  for(const p of projects)ensureStaff(p);
  cur=projects[0];if(msg){const b=$('#banner');b.textContent=msg;b.hidden=false}renderAll();setState('Opslag in deze browser');
}
// Standalone: projecten in localStorage. Vervang door een eigen backend (bijv. Supabase/Firebase) voor delen met collega's.
(function boot(){
  startLocal();
})();
