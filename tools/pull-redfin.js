#!/usr/bin/env node
/* Pulls each watched town's multi-family for-sale and recently-sold lists from Redfin and writes rows.txt
   in the format tools/refresh-listings.js reads. Runs on GitHub's servers (see .github/workflows/daily-listings.yml).

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

/* The CSV link Redfin puts on the search page; falls back to building it for /city/ pages. */
function csvLink(html,pageUrl){
  const m=html.match(/(?:https:\/\/www\.redfin\.com)?\/stingray\/api\/gis-csv\?[^"'<>\s]+/);
  if(m)return 'https://www.redfin.com'+m[0].replace(/^https:\/\/www\.redfin\.com/,'').replace(/&amp;/g,'&');
  return null;
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

async function readList(pageUrl){
  const html=await get(pageUrl);await sleep(2500+Math.random()*2500);
  const link=csvLink(html,pageUrl);if(!link)throw new Error('no download link on page');
  const csv=await get(link);await sleep(2500+Math.random()*2500);
  const rows=parseCsv(csv).filter(o=>/redfin\.com\//.test(col(o,'URL')));
  return {rows,capped:rows.length>=CSV_CAP};
}

function forSaleLines(rows){
  return rows.filter(small).filter(o=>!/past sale/i.test(col(o,'SALE TYPE'))).filter(o=>{const p=+col(o,'PRICE').replace(/[^0-9.]/g,'');return p>0&&p<=MAX_PRICE;})
    .map(o=>[clean(col(o,'ADDRESS')),+col(o,'PRICE').replace(/[^0-9.]/g,''),0,clean(col(o,'BEDS'))||0,clean(col(o,'BATHS'))||0,pathOf(col(o,'URL'))].join('|'));
}
function soldLines(rows){
  return rows.filter(small).map(o=>[clean(col(o,'ADDRESS')),+col(o,'PRICE').replace(/[^0-9.]/g,'')||'',isoDate(col(o,'SOLD DATE')),pathOf(col(o,'URL'))].join('|'));
}

async function main(){
  const towns=JSON.parse(fs.readFileSync(path.join(__dirname,'towns.json'),'utf8')).towns;
  const out=[],log={ranAt:new Date().toISOString(),towns:[]};
  for(const [key,T] of Object.entries(towns)){
    if(!T.watch||!T.redfin)continue;const [town,st]=key.split('|');const entry={town:key,forSale:null,sold:null};
    try{const {rows,capped}=await readList(T.redfin);const lines=forSaleLines(rows);
      if(!lines.length&&!rows.length)throw new Error('list came back empty');
      out.push(`#${town}|${st}|${capped?'':lines.length}`,...lines);entry.forSale={rows:rows.length,kept:lines.length,capped};
      if(T.redfinSold){
        try{const s=await readList(T.redfinSold);const sl=soldLines(s.rows);out.push(`#SOLD ${town}|${st}`,...sl);entry.sold={rows:s.rows.length,kept:sl.length};}
        catch(e){entry.sold={error:String(e.message||e)};}
      }
    }catch(e){entry.forSale={error:String(e.message||e)};}
    log.towns.push(entry);console.error(key,JSON.stringify(entry));
  }
  fs.writeFileSync(arg('out')||'rows.txt',out.join('\n')+'\n');
  if(arg('log'))fs.writeFileSync(arg('log'),JSON.stringify(log,null,1)+'\n');
}
module.exports={parseCsv,isoDate,forSaleLines,soldLines,csvLink};
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1);});
