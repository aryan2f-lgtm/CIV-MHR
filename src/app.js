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
    factors:{scherp:.75,laag:.88,markt:1,ruim:1.2},chosen:'laag',updated:Date.now()};
  applyType(p,type);return p;
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
  const P=Object.fromEntries(Object.entries(p.params).map(([k,v])=>[k,+v||0]));
  const d=derive(p),cf=CPLX[p.cplx]||1,lv=LEVEL[p.niveau]||1;
  const rows=[];let designTot=0;
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
        const v=Math.max(0,n*(+qty||0)*reuse*(cs?cf:1)*(r==='tek'?lv:1)*corr);
        if(v)byRole[r]=v;h+=v;
      }
      if(active&&DESIGN.includes(ph))designTot+=h;
    }
    rows.push({id,ph,name,unit,auto,qty,byRole,h,exact:h,active,u,st,norms,cs,reuse,cf:cs?cf:1,lv,corr});
  }
  const kw=rows.find(r=>r.unit==='pct');
  if(kw){
    const weights=Object.entries(kw.norms),wsum=weights.reduce((s,[,n])=>s+n,0)||1;
    const base=Math.max(0,designTot*((P.kwPct||0)/100)*kw.corr);
    kw.byRole={};kw.h=0;kw.exact=0;
    for(const[r,n] of weights){const v=base*(n/wsum);if(v)kw.byRole[r]=v;kw.h+=v}
    kw.exact=kw.h;kw.qty=designTot;
  }
  const cells=[];
  for(const r of rows){if(!r.active)continue;for(const[k,v] of Object.entries(r.byRole))if(v>0)cells.push({key:r.id+'|'+k,task:r.id,role:k,ph:r.ph,exact:v})}
  const exactMid=cells.reduce((s,c)=>s+c.exact,0);
  const exactCost=cells.reduce((s,c)=>s+c.exact*(+p.rates[c.role]||0),0);
  const exactDesign=cells.filter(c=>c.ph!=='uitv').reduce((s,c)=>s+c.exact*(+p.rates[c.role]||0),0);
  const scen=blankScen();
  for(const[k] of SCEN){
    const f=+p.factors[k]||0,target=Math.round(exactMid*f),alloc=hamilton(cells,target);
    const role={},phase={};let cost=0;
    for(const c of cells){const n=alloc[c.key]||0;if(!n)continue;role[c.role]=(role[c.role]||0)+n;phase[c.ph]=(phase[c.ph]||0)+n;cost+=n*(+p.rates[c.role]||0)}
    scen[k]={f,hours:target,cost,design:exactDesign*f,exactHours:exactMid*f,role,phase,risk:0,alloc};
  }
  for(const r of rows){
    r.byRoleExact=r.byRole;r.byRole={};r.scen={};
    if(!r.active){r.h=0;r.exact=r.exact||0;continue}
    let h=0;
    for(const[k] of Object.entries(r.byRoleExact)){const n=scen.markt.alloc[r.id+'|'+k]||0;if(n){r.byRole[k]=n;h+=n}}
    r.h=h;
    for(const[k] of SCEN){let sh=0;for(const role of Object.keys(r.byRoleExact))sh+=scen[k].alloc[r.id+'|'+role]||0;r.scen[k]=sh}
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
  return{rows,role,mid,cost,designCost,scen,d,P,bouwsom,bouwsomEst:!(P.bouwsom>0),audit,warns};
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
    field('Complexiteit',sel('pCplx',p.cplx,{eenvoudig:'Eenvoudig (−35%)',gemiddeld:'Gemiddeld',complex:'Complex (+65%)'},v=>{p.cplx=v;scheduleSave();recalc()})),
    field('Niveau tekenaar',sel('pLvl',p.niveau,{junior:'Junior (+35%)',medior:'Medior',senior:'Senior (−25%)'},v=>{p.niveau=v;scheduleSave();recalc()})),
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
              if(k==='tek'&&r.lv!==1)bits.push('×',nf1.format(r.lv));
              if(r.corr!==1)bits.push('×',nf1.format(r.corr));
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
}
function renderPeople(R){
  const t=$('#tPeople');t.textContent='';const ch=cur.chosen;
  const head=el('tr',{},el('th',{},'Rol'),...SCEN.map(([k,l])=>el('th',{class:'n'+(k===ch?' sel':'')},k==='markt'?'Markt':l)),el('th',{class:'n'},'Werkelijk'));
  const tb=el('tbody');let tot={},totA=0;
  for(const[k,name] of ROLES){
    const any=SCEN.some(([s])=>(R.scen[s].role[k]||0)>0);if(!any&&!(cur.actual[k]>0))continue;
    const a=+cur.actual[k]||0;totA+=a;
    const budget=R.scen[ch].role[k]||0;
    const cells=SCEN.map(([s])=>{const v=R.scen[s].role[k]||0;tot[s]=(tot[s]||0)+v;return el('td',{class:'n'+(s===ch?' sel':'')},nf0.format(v))});
    const dev=a>0&&budget>0?el('div',{class:'dev '+(Math.abs(a/budget-1)>.15?'flag':'flag ok')},(a>=budget?'+':'')+nf0.format((a/budget-1)*100)+'%'):null;
    tb.append(el('tr',{},el('td',{},el('div',{},name),cur.people[k]?el('div',{class:'hint'},cur.people[k]):null),...cells,
      el('td',{class:'n'},el('input',{class:'mini',type:'number',min:0,step:'any',id:'act_'+k,value:cur.actual[k]||'',placeholder:'–','aria-label':'Werkelijke uren '+name,style:'width:58px',onchange:e=>{cur.actual[k]=e.target.value===''?0:+e.target.value;scheduleSave();recalc()}}),dev)));
  }
  tb.append(el('tr',{class:'tot'},el('td',{},'Totaal uren'),...SCEN.map(([s])=>el('td',{class:'n'+(s===ch?' sel':'')},nf0.format(tot[s]||0))),el('td',{class:'n'},totA?nf0.format(totA):'')));
  tb.append(el('tr',{},el('td',{},'Totaal €'),...SCEN.map(([s])=>el('td',{class:'n'+(s===ch?' sel':'')},eur(R.scen[s].cost))),el('td',{class:'n'},totA?eur(ROLES.reduce((a,[k])=>a+(+cur.actual[k]||0)*(+cur.rates[k]||0),0)):'')));
  t.append(el('thead',{},head),tb);
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
function recalc(){if(!cur)return;const R=compute(cur);lastR=R;renderDerived(R);renderPhases(R);renderScen(R);renderPeople(R);
  const tr=$('#tRates');if(tr)[...tr.querySelectorAll('tbody tr')].forEach((tr,i)=>{const c=tr.lastChild;if(c)c.textContent=nf0.format(R.role[ROLES[i][0]]||0)})}
function renderAll(){
  const app=$('#app');
  if(!cur){app.hidden=true;return}
  app.hidden=false;$('#title').textContent=cur.naam||'Urencalculator';
  renderProject();const R=compute(cur);lastR=R;renderRates(R);renderDerived(R);renderPhases(R);renderScen(R);renderPeople(R);renderSelect();
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

async function exportXlsx(){
  if(!window.XLSX||!cur){toast('Excel-export is niet beschikbaar');return}
  const R=compute(cur),p=cur,ch=p.chosen;
  const sum=[['Voorcalculatie werkduur – Civinaar'],[],['Project',p.naam],['Opdrachtgever',p.opdrachtgever],['Projectnummer',p.nummer],['Opgesteld door',p.opsteller],['Datum',p.datum],
    ['Type',TYPES[p.type]],['Schaal',p.schaal],['Complexiteit',p.cplx],['Niveau tekenaar',p.niveau],['Aangeboden scenario',SCEN.find(s=>s[0]===ch)[1]],[],
    ['Scenario','Factor','Uren','Bedrag (€ excl. btw)','Kans op overschrijding']];
  for(const[k,l] of SCEN){const s=R.scen[k];sum.push([l,s.f,s.hours,Math.round(s.cost),Math.round(s.risk*100)+'%'])}
  sum.push([],['Exacte uren',+R.audit.exact.toFixed(1)],['Begrote uren (markt)',R.audit.hours],['Optelling sluit',R.audit.ok?'ja':'nee']);
  sum.push([],['Uren per medewerker','Medewerker','Tarief',...SCEN.map(s=>s[1]+' (uur)'),'Werkelijk']);
  for(const[k,n] of ROLES){if(!SCEN.some(([s])=>(R.scen[s].role[k]||0)>0))continue;sum.push([n,p.people[k]||'',+p.rates[k],...SCEN.map(([s])=>R.scen[s].role[k]||0),+p.actual[k]||''])}
  sum.push([],['Omvang'],...PARAMS.map(([k,l,u])=>[l,+p.params[k]||0,u]),['A1-bladen situatie',R.d.bladen],['Profielbladen',R.d.pbladen]);
  const tasks=[['Fase','Taak','Eenheid','Aantal','Correctie %',...ROLES.map(r=>r[1]),'Uren (markt)',...SCEN.map(s=>s[1]+' (uur)')]];
  for(const r of R.rows){if(!r.active)continue;
    tasks.push([PHASES.find(x=>x[0]===r.ph)[1],r.name,r.unit==='pct'?'% ontwerpuren':UNITS[r.unit][0],r.unit==='pct'?+p.params.kwPct:+(+r.qty).toFixed(2),+r.st.corr||0,
      ...ROLES.map(([k])=>r.byRole[k]||''),r.h,...SCEN.map(([s])=>r.scen[s]||0)])}
  const wb=XLSX.utils.book_new();
  const ws1=XLSX.utils.aoa_to_sheet(sum);ws1['!cols']=[{wch:34},{wch:18},{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12}];
  const ws2=XLSX.utils.aoa_to_sheet(tasks);ws2['!cols']=[{wch:28},{wch:48},{wch:16},{wch:9},{wch:11},...ROLES.map(()=>({wch:12})),{wch:12},{wch:12},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws1,'Samenvatting');XLSX.utils.book_append_sheet(wb,ws2,'Taken');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  const blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='Urencalculatie '+((p.nummer?p.nummer+' ':'')+p.naam).replace(/[\\/:*?"<>|]/g,'-')+'.xlsx';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Excel gedownload')
}
$('#bXls').addEventListener('click',exportXlsx);

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
  const R=lastR||compute(cur),p=cur,s=R.scen[p.chosen]||R.scen.markt,label=SCEN.find(x=>x[0]===p.chosen)||SCEN[2];
  const box=$('#offerte');box.textContent='';
  const tb=el('tbody');
  for(const[id,name] of PHASES){const h=s.phase[id]||0;if(!h)continue;tb.append(el('tr',{},el('td',{},name),el('td',{class:'n'},nf0.format(h)+' u')))}
  tb.append(el('tr',{class:'tot'},el('td',{},'Totaal'),el('td',{class:'n'},nf0.format(s.hours)+' u')));
  const people=el('tbody');
  for(const[k,name] of ROLES){const h=s.role[k]||0;if(!h)continue;people.append(el('tr',{},el('td',{},name+(p.people[k]?' · '+p.people[k]:'')),el('td',{class:'n'},nf0.format(h)),el('td',{class:'n'},eur(h*(+p.rates[k]||0)))))}
  people.append(el('tr',{class:'tot'},el('td',{},'Totaal excl. btw'),el('td',{class:'n'},nf0.format(s.hours)+' u'),el('td',{class:'n'},eur(s.cost))));
  const btw=Math.round(s.cost*.21);
  box.append(
    el('div',{class:'actions noprint'},el('button',{class:'btn',type:'button',onclick:closeOfferte},'Sluiten'),el('button',{class:'btn primary',type:'button',onclick:()=>{$('#modal').classList.add('print');window.print();$('#modal').classList.remove('print')}},'Afdrukken')),
    el('div',{class:'offhead'},
      el('div',{},el('div',{class:'eyebrow'},'Civinaar'),el('h2',{id:'offTitle'},'Offerte werkduur'),el('p',{class:'muted'},'Voorcalculatie van ingenieursuren, exclusief btw.')),
      el('div',{},el('div',{class:'big'},eur(s.cost)),el('div',{class:'muted'},nf0.format(s.hours)+' uur · '+label[1]))),
    el('p',{},el('strong',{},p.naam||'Project')),
    el('p',{class:'muted'},[p.opdrachtgever&&('Opdrachtgever: '+p.opdrachtgever),p.nummer&&('Nummer: '+p.nummer),p.opsteller&&('Opgesteld door: '+p.opsteller),'Datum: '+fmtDateISO(p.datum),'Geldig tot: '+geldigTot(p)].filter(Boolean).join(' · ')),
    el('h3',{style:'margin-top:14px'},'Uren per fase'),
    el('table',{},el('thead',{},el('tr',{},el('th',{},'Fase'),el('th',{class:'n'},'Uren'))),tb),
    el('h3',{style:'margin-top:16px'},'Uren en bedrag per rol'),
    el('table',{},el('thead',{},el('tr',{},el('th',{},'Rol'),el('th',{class:'n'},'Uren'),el('th',{class:'n'},'Bedrag'))),people),
    el('p',{class:'muted',style:'margin-top:8px'},'Btw 21% '+eur(btw)+' · inclusief btw '+eur(s.cost+btw)+'.'),
    el('h3',{style:'margin-top:16px'},'Uitgangspunten'),
    el('p',{class:'muted'},[TYPES[p.type],'schaal '+p.schaal,'complexiteit '+p.cplx,'tekenaar '+p.niveau,nf1.format(R.d.bladen)+' A1-bladen',R.d.pbladen+' profielbladen','exact '+nf1.format(R.audit.exact)+' uur'].join(' · ')),
    el('p',{class:'muted'},R.audit.ok?'Taken, fasen en rollen sluiten op '+nf0.format(s.hours)+' uur.':'De optelling sluit niet. Controleer de berekening.')
  );
  $('#modal').hidden=false;
}
$('#bOff').addEventListener('click',openOfferte);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeOfferte()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOfferte()});

/* ---------- start ---------- */
function startLocal(msg){
  projects=lsLoad();
  if(!projects.length){const p=newProject('wijk','Voorbeeld – Woonrijp fase 1.1 Stougjeswijk');p.opdrachtgever='GEM Stougjeswijk (voorbeeld)';projects=[p];lsSave()}
  cur=projects[0];if(msg){const b=$('#banner');b.textContent=msg;b.hidden=false}renderAll();setState('Opslag in deze browser');
}
// Standalone: projecten in localStorage. Vervang door een eigen backend (bijv. Supabase/Firebase) voor delen met collega's.
(function boot(){
  startLocal();
  $('#bXls').hidden=false;
  $('#bOff').hidden=false;
})();
