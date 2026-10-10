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
test('a failed town pull flags nothing',()=>{
  const L=base(),S={};const r=refresh(L,S,towns,"#Lowell|MA\n",'',NOW);
  assert.equal(r.check.length,0);assert.equal(r.townsFailed.length,1);
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
