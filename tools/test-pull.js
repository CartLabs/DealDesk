const test=require('node:test'),assert=require('node:assert');
const {parseCsv,isoDate,forSaleLines,soldLines,csvLink}=require('./pull-redfin.js');
/* Shape of Redfin's download CSV (made-up homes). */
const CSV=`SALE TYPE,SOLD DATE,PROPERTY TYPE,ADDRESS,CITY,STATE OR PROVINCE,ZIP OR POSTAL CODE,PRICE,BEDS,BATHS,LOCATION,URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING),MLS#
"In accordance with local MLS rules, some MLS listings are not included in the download"
MLS Listing,,Multi-Family (2-4 Unit),"12 Test St, Unit 1",Lowell,MA,01850,650000,6,3,Centralville,https://www.redfin.com/MA/Lowell/12-Test-St-01850/home/111,123
MLS Listing,,Multi-Family (2-4 Unit),9 Big Ave,Lowell,MA,01850,1250000,9,4,,https://www.redfin.com/MA/Lowell/9-Big-Ave-01850/home/222,124
MLS Listing,,Multi-Family (5+ Unit),3 Block St,Lowell,MA,01850,900000,12,6,,https://www.redfin.com/MA/Lowell/3-Block-St-01850/home/333,125
PAST SALE,September-26-2026,Multi-Family (2-4 Unit),4 Sold Rd,Lowell,MA,01850,580000,5,2,,https://www.redfin.com/MA/Lowell/4-Sold-Rd-01850/home/444,126
`;
test('parses the CSV and skips the disclaimer line',()=>{
  const rows=parseCsv(CSV).filter(o=>Object.values(o).some(v=>/redfin\.com\//.test(v)));
  assert.equal(rows.length,4);assert.equal(rows[0].ADDRESS,'12 Test St, Unit 1');
});
test('keeps 2-4 unit homes at or under $1M for sale, writes refresh-listings rows',()=>{
  const lines=forSaleLines(parseCsv(CSV));
  assert.deepEqual(lines,['12 Test St, Unit 1|650000|0|6|3|MA/Lowell/12-Test-St-01850/home/111']);
});
test('sold rows carry ISO dates',()=>{
  assert.equal(isoDate('September-26-2026'),'2026-09-26');assert.equal(isoDate('Oct-3-2026'),'2026-10-03');assert.equal(isoDate(''),'');
  assert.ok(soldLines(parseCsv(CSV)).includes('4 Sold Rd|580000|2026-09-26|MA/Lowell/4-Sold-Rd-01850/home/444'));
});
test('finds the download link on the search page',()=>{
  const html='<a id="download-and-save" href="/stingray/api/gis-csv?al=1&amp;region_id=9416&amp;region_type=6&amp;uipt=4">Download</a>';
  assert.equal(csvLink(html),'https://www.redfin.com/stingray/api/gis-csv?al=1&region_id=9416&region_type=6&uipt=4');
  assert.equal(csvLink('<html></html>'),null);
});
