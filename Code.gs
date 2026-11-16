/**
 * Komal Dairy Farm - Wheat Grading System (KDFW-3) — Google Apps Script (FIXED VERSION)
 * 1) Auto-healing PIN & Spreadsheet binding
 * 2) Syncs Bills & Customers by id / key + updatedAt
 * 3) Creates readable tabs: Wheat_Grading_Bills, Customers, Shortage_Report
 */
const PROP_KEY_BILLS = 'KDFW3_BILLS_JSON_V2';
const PROP_KEY_CUSTS = 'KDFW3_CUSTS_JSON_V2';
const PROP_KEY_PIN = 'KDFW3_OWNER_PIN';
const PROP_KEY_SHEET_ID = 'KDFW3_BOUND_SHEET_ID';

// જો તમારી સ્ક્રિપ્ટ અલગ (Standalone) હોય, તો નીચે ડબલ કોટ્સમાં તમારી Google Sheet ની ID નાખો (નહીંતર ખાલી રહેવા દો)
const MANUAL_SPREADSHEET_ID = '';

function getTargetSpreadsheet() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) {
    try { PropertiesService.getScriptProperties().setProperty(PROP_KEY_SHEET_ID, ss.getId()); } catch (e) {}
    return ss;
  }
  var savedId = MANUAL_SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty(PROP_KEY_SHEET_ID);
  if (savedId) {
    try { return SpreadsheetApp.openById(savedId); } catch (e) {}
  }
  throw new Error('Google Sheet મળી નથી! કૃપા કરીને Google Sheet માંથી Extensions > Apps Script ખોલો અથવા MANUAL_SPREADSHEET_ID નાખો.');
}

function checkPin(pin, allowAutoSet) {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(PROP_KEY_PIN) || '';
  if (!saved && pin) {
    props.setProperty(PROP_KEY_PIN, String(pin));
    return true;
  }
  if (!pin) return true;
  if (String(pin) === saved) return true;
  if (allowAutoSet && pin) {
    props.setProperty(PROP_KEY_PIN, String(pin));
    return true;
  }
  return false;
}

// PIN રિસેટ અને શીટ કનેક્ટ કરવા માટેનું ફંક્શન (Apps Script માંથી Run કરો)
function resetAllPins() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_KEY_PIN);
  var ss = getTargetSpreadsheet();
  if (ss) syncAllTabs(ss);
}

function getBillsList() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEY_BILLS);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch (e) { return []; }
}

function getCustsList() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEY_CUSTS);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch (e) { return []; }
}

function doGet(e) {
  try {
    var pin = (e && e.parameter && e.parameter.pin) ? e.parameter.pin : '';
    checkPin(pin, true);
    var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : '';
    if (type === 'customers') {
      return ContentService.createTextOutput(JSON.stringify({ customers: getCustsList() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify(getBillsList()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var pin = (e && e.parameter && e.parameter.pin) ? e.parameter.pin : '';
    checkPin(pin, true);
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var incoming = JSON.parse(raw);
    var props = PropertiesService.getScriptProperties();

    if (incoming && incoming._type === 'customer') {
      var custs = getCustsList();
      var k = incoming.key || incoming.mobile || incoming.name;
      var cIdx = -1;
      for (var i = 0; i < custs.length; i++) {
        if ((custs[i].key || custs[i].mobile || custs[i].name) === k) { cIdx = i; break; }
      }
      if (cIdx === -1) custs.push(incoming);
      else if (Number(incoming.updatedAt || 0) >= Number(custs[cIdx].updatedAt || 0)) custs[cIdx] = incoming;
      props.setProperty(PROP_KEY_CUSTS, JSON.stringify(custs));
    } else if (incoming && incoming.id != null) {
      var bills = getBillsList();
      var bIdx = -1;
      for (var j = 0; j < bills.length; j++) {
        if (String(bills[j].id) === String(incoming.id)) { bIdx = j; break; }
      }
      if (bIdx === -1) bills.push(incoming);
      else if (Number(incoming.updatedAt || 0) >= Number(bills[bIdx].updatedAt || 0)) bills[bIdx] = incoming;
      bills.sort(function(a, b) { return Number(a.id || 0) - Number(b.id || 0); });
      props.setProperty(PROP_KEY_BILLS, JSON.stringify(bills));
    }

    var ss = getTargetSpreadsheet();
    if (ss) syncAllTabs(ss);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function syncAllTabs(ss) {
  var bills = getBillsList();
  var custs = getCustsList();

  writeTab(ss, 'Wheat_Grading_Bills',
    ['ID', 'Bill No', 'Date', 'Farmer Name', 'Business', 'Mobile', 'Village', 'Vehicle No', 'Total Received (Kg)', 'Good Wheat (Kg)', 'Thin Wheat (Kg)', 'Shortage / Ghatt (Kg)', 'Bhardo (Kg)', 'Total Bill (Rs)', 'Received (Rs)', 'Pending Due (Rs)', 'Payment Mode', 'Deleted', 'UpdatedAt'],
    bills.map(function(b) {
      var pend = Math.max(0, Number(b.totalBill || 0) - Number(b.received || 0));
      return [
        b.id || '', b.no || '', b.fDate || b.date || '', b.farmerName || '', b.businessName || '',
        b.mobileNo || '', b.village || '', b.vehicleNo || '', Number(b.totalWeight || 0),
        Number(b.goodWheat || 0), Number(b.thinWheat || 0), Number(b.shortage || 0),
        Number(b.bhardoWeight || 0), Number(b.totalBill || 0), Number(b.received || 0),
        pend, b.paymentMode || '', !!b.deleted, b.updatedAt || 0
      ];
    })
  );

  writeTab(ss, 'Customers',
    ['Key', 'Name', 'Mobile', 'Business', 'Village', 'Vehicle', 'UpdatedAt'],
    custs.map(function(c) {
      return [c.key || '', c.name || '', c.mobile || '', c.business || '', c.village || '', c.vehicle || '', c.updatedAt || 0];
    })
  );

  var activeBills = bills.filter(function(b) { return b && !b.deleted; });
  writeTab(ss, 'Shortage_Report',
    ['Bill No', 'Date', 'Farmer Name', 'Village', 'Total Received (Kg)', 'Good Wheat (Kg)', 'Thin Wheat (Kg)', 'Shortage / Ghatt (Kg)'],
    activeBills.map(function(b) {
      return [b.no || '', b.fDate || b.date || '', b.farmerName || '', b.village || '', Number(b.totalWeight || 0), Number(b.goodWheat || 0), Number(b.thinWheat || 0), Number(b.shortage || 0)];
    })
  );

  SpreadsheetApp.flush();
}

function writeTab(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}
