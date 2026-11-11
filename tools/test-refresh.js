const test=require('node:test'),assert=require('node:assert');
const {refresh}=require('./refresh-listings.js');
const towns={"Lowell|MA":{lat:42.633,lon:-71.316,rents:[1787,2050,2450,2925]}};
const base=()=>[{id:"ma-lowell-1-a-st",address:"1 A St",town:"Lowell",state:"MA",miles:3,units:2,price:500000,rent:4100,url:"https://www.redfin.com/MA/Lowell/1-A-St-01850/home/111"},
  {id:"old-style-id",address:"2 B St",town:"Lowell",state:"MA",miles:3,units:2,price:600000,rent:4100,url:"https://www.redfin.com/MA/Lowell/2-B-St-01850/home/222"}];
const NOW="2026-10-07T10:00:00Z";
test('adds new, matches by Redfin home number, records price change',()=>{
  const L=base(),S={};
  const r=refresh(L,S,towns,"#Lowell|MA\n2 B Street|550000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n9 New St|300000|3|9|3|MA/Lowell/9-New-St-01850/home/999\n",'',NOW);
  assert.equal(L.length,3);assert.equal(r.added,1);
  assert.equal(L[1].price,550000);assert.equal(L[1].priceWas,600000);assert.equal(r.priceChanges.length,1);
  assert.equal(r.newMatches.length,1);assert.equal(r.newMatches[0].address,"9 New St");
  assert.deepEqual(r.check.map(c=>c.id),["ma-lowell-1-a-st"]);
  assert.equal(L[0].sold,undefined); /* missing is never treated as sold */
});
test('sold only from a checked page; price can arrive later; nothing checked twice a day',()=>{
  const L=base(),S={};
  let r=refresh(L,S,towns,"#Lowell|MA\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n","ma-lowell-1-a-st|sold||2026-10-05\n",NOW);
  assert.deepEqual(L[0].sold,{date:"2026-10-05"});assert.equal(r.sold.length,1);assert.equal(r.check.length,0);
  r=refresh(L,S,towns,"#Lowell|MA\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n",'',"2026-10-08T10:00:00Z");
  assert.equal(r.check[0].why,'sold, price not published yet');
  r=refresh(L,S,towns,'',"ma-lowell-1-a-st|sold|$480,000|2026-10-05\n","2026-10-08T10:00:00Z");
  assert.equal(L[0].sold.price,480000);assert.equal(r.sold[0].priceJustPublished,true);
});
test('a town read with nothing listed flags nothing and is not called failed (Merrimack)',()=>{
  const L=base(),S={};const r=refresh(L,S,towns,"#Lowell|MA|0\n",'',NOW);
  assert.equal(r.check.length,0);assert.deepEqual(r.townsPulled,['Lowell, MA (0)']);assert.deepEqual(r.townsFailed,[]);
  assert.equal(L[0].gone,undefined);
});
test('a watched town missing from the pull is the one reported failed',()=>{
  const T={...towns,"Lowell|MA":{...towns["Lowell|MA"],watch:true,redfin:"x"},"Nashua|NH":{lat:42.765,lon:-71.468,rents:[1,2,3,4],watch:true,redfin:"x"},
    "Salem|NH":{lat:42.788,lon:-71.201,rents:[1,2,3,4],watch:false,redfin:"x"}};
  const L=base(),S={};const r=refresh(L,S,T,"#Lowell|MA|1\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n",'',NOW);
  assert.deepEqual(r.townsPulled,['Lowell, MA (1)']);assert.deepEqual(r.townsFailed,['Nashua, NH']);
});

test('sold page marks sold with price by Redfin home number, ignores homes we never had',()=>{
  const L=base(),S={};
  const r=refresh(L,S,towns,"#Lowell|MA|\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n#SOLD Lowell|MA\n1 A Street|$495,000||MA/Lowell/1-A-St-01850/home/111\n7 Other St|400000|2026-10-01|MA/Lowell/7-Other-St-01850/home/777\n",'',NOW);
  assert.deepEqual(L[0].sold,{date:"2026-10-07",price:495000});assert.equal(r.sold.length,1);assert.equal(L.length,2);
});
test('gone only after 14 days missing from a page read in full',()=>{
  const L=base(),S={};const rows="#Lowell|MA|1\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n";
  refresh(L,S,towns,rows,'',NOW);assert.equal(L[0].gone,undefined);
  refresh(L,S,towns,rows,'',"2026-10-20T10:00:00Z");assert.equal(L[0].gone,undefined);
  const r=refresh(L,S,towns,rows,'',"2026-10-21T10:00:00Z");assert.deepEqual(L[0].gone,{date:"2026-10-21"});assert.equal(r.gone.length,1);
  const L2=base(),S2={};const partial="#Lowell|MA|5\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n";
  refresh(L2,S2,towns,partial,'',NOW);refresh(L2,S2,towns,partial,'',"2026-10-30T10:00:00Z");assert.equal(L2[0].gone,undefined);
});
test('a home on today\'s for-sale list is never marked sold from the sold list (Oct 13 bug)',()=>{
  const L=base(),S={};
  const r=refresh(L,S,towns,"#Lowell|MA|\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n#SOLD Lowell|MA\n2 B St|600000||MA/Lowell/2-B-St-01850/home/222\n",'',NOW);
  assert.equal(L[1].sold,undefined);assert.equal(r.sold.length,0);assert.equal(r.soldButActive,1);
});

test('single-family pages: one unit, house rent, and kept apart from the multi-family page',()=>{
  const L=base(),S={};
  const rows="#Lowell|MA|2\n1 A St|500000|2|5|2|MA/Lowell/1-A-St-01850/home/111\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n"+
    "#Lowell|MA|1|house\n5 Oak St|420000|0|3|2|MA/Lowell/5-Oak-St-01850/home/555\n#SOLD Lowell|MA|house\n";
  const r=refresh(L,S,towns,rows,'',NOW);
  const h=L.find(d=>d.address==="5 Oak St");
  assert.equal(h.units,1);assert.equal(h.type,"Single-family");
  assert.equal(h.rent,Math.round(2450*1.1/25)*25);
  assert.equal(r.added,1);assert.deepEqual(r.townsPulled,["Lowell, MA (2)","Lowell, MA single-family (1)"]);
  /* the house is not "missing" from the multi-family page, and the two-families are not missing from the house page */
  for(let i=0;i<20;i++)refresh(L,S,towns,rows,'',new Date(Date.parse(NOW)+i*864e5).toISOString());
  assert.equal(L.filter(d=>d.gone).length,0);
  /* a house page read in full without the house: gone after 14 days */
  const rows2="#Lowell|MA|2\n1 A St|500000|2|5|2|MA/Lowell/1-A-St-01850/home/111\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n#Lowell|MA|0|house\n";
  refresh(L,S,towns,rows2,'',"2026-11-01T10:00:00Z");refresh(L,S,towns,rows2,'',"2026-11-16T10:00:00Z");
  assert.ok(h.gone);assert.equal(L.filter(d=>d.gone).length,1);
});
test('1.22.0: square feet stored, every sale with a size kept as a comp, flip candidates flagged',()=>{
  const L=base(),S={},comps=[];
  /* six town sales around $400/sq ft, then a cheap 1,500 sq ft house listed at $250/sq ft */
  const sold=[1,2,3,4,5,6].map(i=>`${i} Sold St|${600000+i*1000}|2026-10-0${i}|MA/Lowell/${i}-Sold-St-01850/home/80${i}|1500`).join('\n');
  const r=refresh(L,S,towns,`#Lowell|MA|1|house\n9 Cheap St|375000|0|3|2|MA/Lowell/9-Cheap-St-01850/home/901|1500|1920\n#SOLD Lowell|MA|house\n${sold}\n`,'',NOW,comps);
  const d=L.find(x=>x.address==='9 Cheap St');
  assert.equal(d.sqft,1500);assert.equal(d.yearBuilt,1920);
  assert.equal(comps.length,6);assert.equal(comps[0].kind,'house');assert.equal(r.compsTotal,6);
  assert.equal(r.flipCandidates.length,1);assert.equal(r.flipCandidates[0].address,'9 Cheap St');assert.ok(r.flipCandidates[0].maxRehab>=37500);
  /* the same sales again are not added twice; an existing listing picks up its size */
  refresh(L,S,towns,`#Lowell|MA\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222|2400|1910\n#SOLD Lowell|MA|house\n${sold}\n`,'',NOW,comps);
  assert.equal(comps.length,6);assert.equal(L.find(x=>x.id==='old-style-id').sqft,2400);
  /* sales over a year old drop off */
  refresh(L,S,towns,'','', "2027-10-20T10:00:00Z",comps);assert.equal(comps.length,0);
});
