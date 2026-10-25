#!/usr/bin/env node
/* Pulls each watched town's multi-family for-sale and recently-sold lists from Redfin and writes rows.txt
   in the format tools/refresh-listings.js reads. Runs on Kevin's laptop (see tools/daily-check.js).

   node tools/pull-redfin.js --out rows.txt [--log pull-log.json]

   For each town in tools/towns.json with watch:true it opens the town's search page (redfin / redfinSold),
   finds the page's own "Download all" CSV link, and reads that CSV. Only 2-4 unit multi-family homes are kept,
   for-sale ones at or under $1,000,000. A town whose for-sale list cannot be read is left out of rows.txt
   entirely; if only its sold list fails, just the #SOLD section is left out. Nothing is ever invented. */
const fs=require('fs'),path=require('path');
const MAX_PRICE=1000000,CSV_CAP=350;
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?null:(process.argv[i+1]||true);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'};

/* Minimal CSV parser (quoted fields, commas and newlines inside quotes). */
function parseCsv(text){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;continue;}
    if(c==='"')q=true;else if(c===','){row.push(f);f='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';if(row.some(x=>x!==''))rows.push(row);row=[];}
    else f+=c;}
  row.push(f);if(row.some(x=>x!==''))rows.push(row);
  if(!rows.length)return [];
  const head=rows[0].map(h=>h.trim().toUpperCase());
  return rows.slice(1).map(r=>{const o={};head.forEach((h,i)=>{o[h]=(r[i]||'').trim();});return o;});
}
const col=(o,start)=>{const k=Object.keys(o).find(k=>k.startsWith(start));return k?o[k]:'';};
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
function isoDate(s){ /* Redfin writes sold dates like "September-26-2026" */
  if(!s)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=s.match(/^([A-Za-z]+)[-\s](\d{1,2}),?[-\s](\d{4})$/);if(!m)return '';
  const mo=MONTHS.findIndex(x=>x.startsWith(m[1].toLowerCase().slice(0,3)));if(mo<0)return '';
  return `${m[3]}-${String(mo+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}
const pathOf=u=>(u||'').replace(/^https?:\/\/www\.redfin\.com\//,'').replace(/^\//,'');
const clean=s=>String(s).replace(/\|/g,' ').trim();
const small=o=>/multi-family\s*\(2-4/i.test(col(o,'PROPERTY TYPE'));

/* Redfin search pages are mostly drawn in the browser, so the page's "Download all" link may not be in the HTML.
   Order of attempts: the link itself if present; otherwise build the same download from the page's region
   (region id and type read from the page, or from a /city/<id>/ address, which is Redfin region type 6). */
const decode=h=>h.replace(/\\u002F/gi,'/').replace(/\\u0026/gi,'&').replace(/&amp;/g,'&').replace(/\\"/g,'"');
function csvLink(html){
  const m=decode(html).match(/(?:https:\/\/www\.redfin\.com)?\/stingray\/api\/gis-csv\?[^"'<>\s\\]+/);
  return m?'https://www.redfin.com'+m[0].replace(/^https:\/\/www\.redfin\.com/,''):null;
}
function region(html,pageUrl){
  const h=decode(html);
  const pats=[/region_id=(\d+)&region_type=(\d+)/,/"regionId"\s*:\s*"?(\d+)"?\s*,\s*"regionType"\s*:\s*"?(\d+)/,
    /"region_id"\s*:\s*"?(\d+)"?\s*,\s*"region_type"\s*:\s*"?(\d+)/];
  for(const p of pats){const m=h.match(p);if(m)return {id:m[1],type:m[2],from:'page'};}
  const c=pageUrl.match(/\/city\/(\d+)\//);if(c)return {id:c[1],type:'6',from:'address'};
  /* Merrimack-style /minorcivildivision/<id>/ pages: Redfin's region type for these isn't documented, so try the
     likely ones; the town check in readList throws out any download that isn't for this town. */
  const d=pageUrl.match(/\/minorcivildivision\/(\d+)\//);if(d)return {id:d[1],type:'40',types:['40','7','33','12','32'],from:'address guess'};
  return null;
}
/* Last resort for a town whose page gives no usable region: a box around the town center (about 6 miles each way).
   The box takes in parts of neighbouring towns, so readList keeps only this town's homes from it. */
function polyFor(lat,lon){const dy=0.09,dx=0.12;
  return [[lon-dx,lat-dy],[lon+dx,lat-dy],[lon+dx,lat+dy],[lon-dx,lat+dy],[lon-dx,lat-dy]].map(([x,y])=>x.toFixed(4)+'%20'+y.toFixed(4)).join('%2C');}
function polyLink(lat,lon,sold){
  const q={al:1,num_homes:CSV_CAP,ord:'redfin-recommended-asc',page_number:1,poly:polyFor(lat,lon),
    sf:'1,2,3,5,6,7',status:9,uipt:4,v:8,...(sold?{sold_within_days:30}:{})};
  return 'https://www.redfin.com/stingray/api/gis-csv?'+Object.entries(q).map(([k,v])=>k+'='+v).join('&');
}
function builtLink(r,sold){
  const q={al:1,num_homes:CSV_CAP,ord:'redfin-recommended-asc',page_number:1,region_id:r.id,region_type:r.type,
    sf:'1,2,3,5,6,7',status:9,uipt:4,v:8,...(sold?{sold_within_days:30}:{})};
  return 'https://www.redfin.com/stingray/api/gis-csv?'+Object.entries(q).map(([k,v])=>k+'='+v).join('&');
}
/* What the page held, so a failed run can be diagnosed from data/last-check.json without opening anything. */
function hints(html){
  const h=decode(html);const grab=re=>{const m=h.match(re);return m?h.slice(Math.max(0,m.index-60),m.index+120).replace(/\s+/g,' '):null;};
  return {bytes:html.length,title:(h.match(/<title>([^<]*)/)||[])[1]||null,gisCsv:grab(/gis-csv/),regionType:grab(/region_?type/i)};
}

async function get(url,tries=2){
  let last;
  for(let i=0;i<tries;i++){
    try{const r=await fetch(url,{headers:HEADERS,redirect:'follow'});
      if(r.ok)return await r.text();last=new Error('HTTP '+r.status);}
    catch(e){last=e;}
    await sleep(4000+Math.random()*3000);
  }
  throw last;
}

/* The downloads to try for a town, in order. A town marked townBox in towns.json (Merrimack: no region guess has
   ever worked) goes straight to the box, without opening its search page, so it costs one request instead of seven. */
function linksFor(html,pageUrl,sold,T){
  if(T&&T.townBox&&T.lat&&T.lon)return {links:[polyLink(T.lat,T.lon,sold)],r:null,pageLink:null};
  const r=region(html,pageUrl);const pageLink=csvLink(html);
  const links=pageLink?[pageLink]:r?(r.types||[r.type]).map(type=>builtLink({...r,type},sold)):[];
  /* a guessed region can fail; then fall back to a box around the town center */
  if(!pageLink&&(!r||r.types)&&T&&T.lat&&T.lon)links.push(polyLink(T.lat,T.lon,sold));
  return {links,r,pageLink};
}
async function readList(pageUrl,town,sold,T){
  let html='';if(!(T&&T.townBox&&T.lat&&T.lon)){html=await get(pageUrl);await sleep(2500+Math.random()*2500);}
  const {links,r,pageLink}=linksFor(html,pageUrl,sold,T);
  if(!links.length){const e=new Error('no download link or region on page');e.hints=hints(html);throw e;}
  let last;const tried=[];
  for(const link of links){
    const isPoly=/[?&]poly=/.test(link);
    let csv;try{csv=await get(link);}catch(e){last=e;tried.push((isPoly?'box':'type '+(link.match(/region_type=(\d+)/)||[])[1])+': '+(e.message||e));continue;}
    await sleep(2500+Math.random()*2500);
    let rows=parseCsv(csv).filter(o=>/redfin\.com\//.test(col(o,'URL')));
    const via=pageLink?'page link':isPoly?'town box':'region '+r.from+(r.types?' type '+link.match(/region_type=(\d+)/)[1]:'');
    if(!rows.length){last=new Error('download had no homes');last.hints={...hints(html),link,start:csv.slice(0,200)};tried.push(via+': no homes');continue;}
    const inTown=rows.filter(o=>col(o,'CITY').toLowerCase()===town.toLowerCase());
    /* the box covers neighbours on purpose: keep this town's homes only (the box is read whole, so this is the full list) */
    if(isPoly){if(rows.length>=CSV_CAP){last=new Error('town box download hit the '+CSV_CAP+'-home cap');tried.push(via+': capped');continue;}
      return {rows:inTown,capped:false,via,boxRows:rows.length};} /* boxRows: homes in the whole box, so an empty town still shows the box worked */
    /* guard against a wrong region: most homes must be in this town */
    if(inTown.length<rows.length/2){last=new Error(`download is for the wrong area (${inTown.length} of ${rows.length} in ${town})`);last.hints={link};tried.push(via+': wrong area');continue;}
    return {rows,capped:rows.length>=CSV_CAP,via};
  }
  if(last&&tried.length>1)last.message+=' [tried '+tried.join('; ')+']';
  throw last;
}

function forSaleLines(rows){
  return rows.filter(small).filter(o=>!/past sale/i.test(col(o,'SALE TYPE'))).filter(o=>{const p=+col(o,'PRICE').replace(/[^0-9.]/g,'');return p>0&&p<=MAX_PRICE;})
    .map(o=>[clean(col(o,'ADDRESS')),+col(o,'PRICE').replace(/[^0-9.]/g,''),0,clean(col(o,'BEDS'))||0,clean(col(o,'BATHS'))||0,pathOf(col(o,'URL'))].join('|'));
}
/* Redfin's "include=sold-1mo" ADDS last month's sales to the homes still for sale, so the sold download holds both.
   Only rows Redfin marks as a past sale with a sold date are sales; the rest are active listings and are dropped. */
const isSale=o=>/past sale/i.test(col(o,'SALE TYPE'))&&!!isoDate(col(o,'SOLD DATE'));
function soldLines(rows){
  return rows.filter(small).filter(isSale).map(o=>[clean(col(o,'ADDRESS')),+col(o,'PRICE').replace(/[^0-9.]/g,'')||'',isoDate(col(o,'SOLD DATE')),pathOf(col(o,'URL'))].join('|'));
}

async function main(){
  const towns=JSON.parse(fs.readFileSync(path.join(__dirname,'towns.json'),'utf8')).towns;
  const out=[],log={ranAt:new Date().toISOString(),towns:[]};
  for(const [key,T] of Object.entries(towns)){
    if(!T.watch||!T.redfin)continue;const [town,st]=key.split('|');const entry={town:key,forSale:null,sold:null};
    try{const {rows,capped,via,boxRows}=await readList(T.redfin,town,false,T);const lines=forSaleLines(rows);
      if(!lines.length&&!rows.length&&!/box/.test(via))throw new Error('list came back empty');
      out.push(`#${town}|${st}|${capped?'':lines.length}`,...lines);entry.forSale={rows:rows.length,kept:lines.length,capped,via,...(boxRows!=null?{boxRows}:{})};
      if(T.redfinSold){
        try{const s=await readList(T.redfinSold,town,true,T);const sl=soldLines(s.rows);out.push(`#SOLD ${town}|${st}`,...sl);entry.sold={rows:s.rows.length,kept:sl.length,...(s.boxRows!=null?{boxRows:s.boxRows}:{})};}
        catch(e){entry.sold={error:String(e.message||e),...(e.hints?{hints:e.hints}:{})};}
      }
    }catch(e){entry.forSale={error:String(e.message||e),...(e.hints?{hints:e.hints}:{})};}
    log.towns.push(entry);console.error(key,JSON.stringify(entry));
  }
  fs.writeFileSync(arg('out')||'rows.txt',out.join('\n')+'\n');
  if(arg('log'))fs.writeFileSync(arg('log'),JSON.stringify(log,null,1)+'\n');
}
module.exports={parseCsv,isoDate,forSaleLines,soldLines,csvLink,region,builtLink,polyLink,linksFor};
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1);});
