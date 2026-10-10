#!/usr/bin/env node
/* Daily listing check. Folds a fresh pull of the town search pages into data/listings.js.

   node tools/refresh-listings.js --rows rows.txt [--status status.txt] [--date 2026-10-07] [--dry]

   rows.txt    One "#Town|ST|total" line per town pulled (total = the number of homes the page says it has, blank if
               not shown), then one line per for-sale listing on that town's page:
               address|price|units|beds|baths|redfin path      (units 0 = not shown; path like MA/Lowell/1-Main-St-01850/home/123)
               Then, for the town's recently-sold page, a "#SOLD Town|ST" line and one line per sold home:
               address|sold price|sold date (YYYY-MM-DD, blank if not shown)|redfin path
               Only list a town if its page was actually read. A town with a header and no rows is treated as a failed pull.
   status.txt  One line per listing whose own page was checked because it was missing from its town page:
               id|sold|price|YYYY-MM-DD     sold (price may be blank until it is published)
               id|gone||YYYY-MM-DD          off the market, not sold (withdrawn, expired, under contract)
               id|active|price|             still for sale (price optional)

   Prints a JSON report: new listings that are Buy box or Negotiate within 50 miles, price changes,
   sold and gone listings, and "check": listings missing from their town page that need their own page read.
   Rules: a listing is only ever marked sold or gone from status.txt, never just because it is missing. */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const {DEFAULTS,analyze}=require(path.join(ROOT,'calc.js'));
const HOME=[42.670,-71.302],RADIUS=50,CHECK_CAP=25;
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?null:(process.argv[i+1]||true);};
const milesTo=(a,b)=>{const R=3958.8,r=x=>x*Math.PI/180;const dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);
  const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(h)));};
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const homeId=u=>((u||'').match(/\/home\/(\d+)/)||[])[1];
const verdict=d=>analyze(d,DEFAULTS).verdict;
const hit=v=>v==='Buy box'||v==='Negotiate';

function rentTable(r){let [r1,r2,r3,r4]=r;r1=Math.max(r1,0.75*r2);r3=Math.min(Math.max(r3,r2),1.3*r2);r4=Math.min(Math.max(r4,r3),1.2*r3);return [0.85*r1,r1,r2,r3,r4];}

function build(row,town,state,T,now,day){
  const beds=+row.beds,baths=parseFloat(row.baths)||0;let units=+row.units||0,inferred=false;
  if(!units){inferred=true;const b=Math.floor(baths);units=b>=4&&beds>=8?4:b>=3&&beds>=6?3:2;}
  if(units>4||beds<units||!(row.price>0))return null;
  const R=rentTable(T.rents);const per=Array.from({length:units},(_,i)=>Math.floor(beds/units)+(i<beds%units?1:0));
  const rent=Math.round(per.reduce((s,n)=>s+R[Math.min(n,4)],0)/25)*25;
  return {id:slug(state+' '+town)+'-'+slug(row.address),address:row.address,town,state,miles:milesTo(HOME,[T.lat,T.lon]),
    type:["","Single-family","Two-family","Three-family","Four-family"][units],units,price:row.price,rent,
    url:"https://www.redfin.com/"+row.path,
    notes:`Light data: confirm on the listing before deciding. Rent is an estimate from ${town} averages, assuming ${beds} bedrooms split as ${per.map(n=>n+'BR').join(' + ')}. Taxes and insurance are estimated.`+(inferred?` Unit count (${units}) is inferred from ${beds} beds and ${baths} baths; the listing page did not show it.`:""),
    ...(inferred?{unitsInferred:true}:{}),source:"Redfin, pulled "+day,addedAt:now};
}

function refresh(listings,state,towns,rowsText,statusText,now){
  const day=now.slice(0,10);
  const rep={date:day,townsPulled:[],townsFailed:[],added:0,newMatches:[],priceChanges:[],sold:[],gone:[],skipped:[],check:[],errors:[]};
  const byHome=new Map(),byId=new Map();
  for(const d of listings){byId.set(d.id,d);const h=homeId(d.url);if(h)byHome.set(h,d);}
  const seen=new Set();let town=null,st=null,soldMode=false;const pulled=new Map(),full=new Set();
  const brief=d=>{const a=analyze(d,DEFAULTS);return {id:d.id,address:d.address,town:d.town,state:d.state,miles:d.miles,units:d.units,price:d.price,rent:d.rent,verdict:a.verdict,maxOffer:Math.round(a.maxOffer),url:d.url};};
  for(const line of (rowsText||'').split('\n')){
    if(!line.trim())continue;
    if(line[0]==='#'){const h=line.slice(1).trim();soldMode=/^SOLD\s/i.test(h);const q=h.replace(/^SOLD\s+/i,'').split('|');[town,st]=q;
      if(!soldMode){pulled.set(town+'|'+st,0);if(+q[2]>0)full.add(town+'|'+st+'|'+(+q[2]));}continue;}
    if(soldMode){const p=line.split('|').map(x=>x.trim());if(p.length<4){rep.errors.push('bad sold row: '+line);continue;}
      const h=homeId(p[3]);const d=(h&&byHome.get(h));if(!d)continue; /* a sale of a home we never listed */
      const price=+String(p[1]).replace(/[^0-9.]/g,'')||0;const date=/^\d{4}-\d{2}-\d{2}$/.test(p[2])?p[2]:(d.sold&&d.sold.date)||day;
      seen.add(d.id);const first=!d.sold;const had=d.sold&&d.sold.price;
      d.sold={date,...(price?{price}:had?{price:had}:{})};delete d.gone;
      if(first||(price&&!had))rep.sold.push({...brief(d),soldPrice:d.sold.price||null,soldDate:d.sold.date,priceJustPublished:!first});
      continue;}
    const p=line.split('|');if(p.length<6||!town){rep.errors.push('bad row: '+line);continue;}
    const key=town+'|'+st,T=towns[key];if(!T){rep.errors.push('town not in towns.json: '+key);continue;}
    const row={address:p[0].trim(),price:+String(p[1]).replace(/[^0-9.]/g,''),units:p[2],beds:p[3],baths:p[4],path:p[5].trim().replace(/^https?:\/\/www\.redfin\.com\//,'').replace(/^\//,'')};
    pulled.set(key,pulled.get(key)+1);
    const h=homeId(row.path);const old=(h&&byHome.get(h))||byId.get(slug(st+' '+town)+'-'+slug(row.address));
    if(old){seen.add(old.id);
      if(old.sold||old.gone){delete old.sold;delete old.gone;old.relistedAt=now;} /* back on the market */
      if(row.price>0&&row.price!==old.price){const was=verdict(old);const from=old.price;old.priceWas=from;old.price=row.price;old.priceChangedAt=now;
        const b=brief(old);rep.priceChanges.push({...b,from,verdictWas:was,nowMatches:hit(b.verdict)&&!hit(was)&&old.miles<=RADIUS});}
      continue;}
    const d=build(row,town,st,T,now,day);
    if(!d){rep.skipped.push(row.address+', '+town);continue;}
    if(byId.has(d.id)){rep.errors.push('id clash: '+d.id);continue;}
    listings.push(d);byId.set(d.id,d);if(h)byHome.set(h,d);seen.add(d.id);rep.added++;
    const b=brief(d);if(hit(b.verdict)&&d.miles<=RADIUS)rep.newMatches.push(b);
  }
  for(const [k,n] of pulled)(n>0?rep.townsPulled:rep.townsFailed).push(k.replace('|',', ')+(n?` (${n})`:''));
  /* a listing missing for 14 days from a town page that was read in full (every home the page counts) has left the market */
  const fullTowns=new Set([...full].filter(x=>{const [t,s2,n]=x.split('|');return pulled.get(t+'|'+s2)>=+n;}).map(x=>x.split('|').slice(0,2).join('|')));
  for(const d of listings){if(d.sold||d.gone||seen.has(d.id)||!fullTowns.has(d.town+'|'+d.state))continue;
    const w=state[d.id]=state[d.id]||{};if(!w.missingSince)w.missingSince=day;
    if((new Date(day)-new Date(w.missingSince))>=14*864e5){d.gone={date:day};rep.gone.push(brief(d));}}
  for(const id of seen){const w={...(state[id]||{}),seen:day};delete w.missingSince;state[id]=w;}
  for(const line of (statusText||'').split('\n')){
    if(!line.trim()||line[0]==='#')continue;
    const [id,what,price,date]=line.split('|').map(x=>(x||'').trim());const d=byId.get(id);
    if(!d){rep.errors.push('status for unknown id: '+id);continue;}
    state[id]={...(state[id]||{}),checked:day};const p=+String(price).replace(/[^0-9.]/g,'')||0;
    if(what==='sold'){const first=!d.sold;const had=d.sold&&d.sold.price;d.sold={date:date||day,...(p?{price:p}:had?{price:had}:{})};delete d.gone;
      if(first||(p&&!had))rep.sold.push({...brief(d),soldPrice:d.sold.price||null,soldDate:d.sold.date,priceJustPublished:!first});}
    else if(what==='gone'){if(!d.gone&&!d.sold){d.gone={date:date||day};rep.gone.push(brief(d));}}
    else if(what==='active'){if(p&&p!==d.price){d.priceWas=d.price;d.price=p;d.priceChangedAt=now;}}
    else rep.errors.push('bad status: '+line);
  }
  /* missing from a town page that was read: needs its own page checked. Also sold listings still waiting on a price. */
  const cand=listings.filter(d=>!d.gone&&((d.sold&&!d.sold.price&&(Date.now()-new Date(d.sold.date))<120*864e5)||(!d.sold&&pulled.get(d.town+'|'+d.state)>0&&!seen.has(d.id))))
    .filter(d=>(state[d.id]||{}).checked!==day)
    .sort((a,b)=>((state[a.id]||{}).checked||'').localeCompare((state[b.id]||{}).checked||'')||(a.miles-b.miles));
  rep.checkTotal=cand.length;rep.check=cand.slice(0,CHECK_CAP).map(d=>({id:d.id,url:d.url,why:d.sold?'sold, price not published yet':'missing from town page'}));
  rep.total=listings.length;
  return rep;
}
module.exports={refresh,homeId};

if(require.main===module){
  const now=arg('date')?arg('date')+'T10:00:00Z':new Date().toISOString();
  global.window={};require(path.join(ROOT,'data/listings.js'));const listings=window.SEED_LISTINGS;
  const sp=path.join(ROOT,'data/watch-state.json');const state=fs.existsSync(sp)?JSON.parse(fs.readFileSync(sp,'utf8')):{};
  const towns=JSON.parse(fs.readFileSync(path.join(__dirname,'towns.json'),'utf8')).towns;
  const rd=f=>f&&f!==true?fs.readFileSync(f,'utf8'):'';
  const rep=refresh(listings,state,towns,rd(arg('rows')),rd(arg('status')),now);
  if(!arg('dry')){
    fs.writeFileSync(path.join(ROOT,'data/listings.js'),`// Listings Claude has loaded. Every device picks up new ones the next time the page opens.
// Kept current by the daily listing check (tools/refresh-listings.js). Rents are estimates, not leases.
// "miles" is the straight-line distance from Dracut, MA to the town center.
// Entries whose notes start with "Light data" came from town search pages only: unit mix,
// taxes and insurance are estimated. "sold" and "gone" mark listings that have left the market.
window.SEED_LISTINGS = ${JSON.stringify(listings,null,2)};
`);
    fs.writeFileSync(sp,JSON.stringify(state,null,1)+'\n');
  }
  console.log(JSON.stringify(rep,null,2));
}
