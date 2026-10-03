// printer.js — ESC/POS thermal receipt (58mm / 57.5mm paper, 203dpi, 32 cols)
const { PosPrinter } = require('electron-pos-printer');

const PAGE_SIZE = '58mm';      // 57.5 ± 0.5mm paper — 32 chars wide
const PRINT_WIDTH = 32;         // max characters per line at normal font
const PRINTER_NAME_FALLBACK = 'POS-58';

// Strip characters the thermal printer cannot render reliably.
// The Chinese ESC/POS firmware commonly chokes on these Unicode symbols.
function safe(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/✓/g, '[OK]')
    .replace(/✕/g, '[X]')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/•/g, '*')
    .replace(/…/g, '...')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x00-\x7F]/g, '?'); // anything else non-ASCII -> '?'
}

// Pad a two-column line so it fits within PRINT_WIDTH
function twoCol(left, right) {
  var l = safe(left);
  var r = safe(right);
  var gap = PRINT_WIDTH - l.length - r.length;
  if (gap < 1) gap = 1;
  return l + ' '.repeat(gap) + r;
}

function line(char) {
  char = char || '-';
  return char.repeat(PRINT_WIDTH);
}

function formatReceiptData(invoice) {
  const data = [];
  const t = function(text, opts) {
    opts = opts || {};
    data.push({
      type: 'text',
      value: text,
      style: {
        fontWeight: opts.bold ? '700' : '400',
        textAlign: opts.align || 'left',
        fontSize: opts.size || '12px',
        marginBottom: opts.mb || '0'
      }
    });
  };

  // ---- Header ----
  t('OKK STORES', { bold: true, align: 'center', size: '20px', mb: '2' });
  t('Plot 14 Keyo Road, Gulu City', { align: 'center', size: '11px', mb: '2' });
  t('Tel: 0772949121', { align: 'center', size: '11px', mb: '6' });
  t(line(), { align: 'center', size: '11px' });

  // ---- Invoice info ----
  t('Invoice: ' + safe(invoice.invoice_no), { size: '12px', mb: '2' });
  t('Date: ' + new Date(invoice.created_at).toLocaleString(), { size: '11px', mb: '2' });
  t('Customer: ' + safe(invoice.customer_name || 'Walk-in Customer'), { size: '12px', mb: '2' });
  if (invoice.customer_phone) t('Phone: ' + safe(invoice.customer_phone), { size: '11px', mb: '2' });

  t(line(), { align: 'center', size: '11px' });

  // ---- Items ----
  invoice.items.forEach(function(it) {
    var name = safe(it.product_name);
    if (it.variant_label) name += ' (' + safe(it.variant_label) + ')';
    t(name, { size: '12px' });
    var qty = it.quantity + ' x ' + it.unit_price.toLocaleString();
    var tot = it.line_total.toLocaleString();
    t(twoCol('  ' + qty, tot), { size: '11px', mb: '3' });
  });

  t(line(), { align: 'center', size: '11px' });

  // ---- Previous balance (if any) ----
  if ((invoice.previous_balance || 0) > 0) {
    t('ACCOUNT SUMMARY', { bold: true, size: '11px', mb: '2' });
    t(twoCol('Previous Outstanding', safe(invoice.previous_balance.toLocaleString())), { size: '11px', mb: '2' });
    if ((invoice.paid_on_previous || 0) > 0) {
      t(twoCol('Paid on Previous', safe(invoice.paid_on_previous.toLocaleString())), { size: '11px', mb: '2' });
    }
    t(twoCol('This Order', safe(invoice.total.toLocaleString())), { size: '11px', mb: '2' });
    t(twoCol('Total Due Now', safe((invoice.opening_total_due || invoice.total).toLocaleString())), { bold: true, size: '12px', mb: '4' });
    t(line(), { align: 'center', size: '11px' });
  }

  // ---- Totals ----
  t(twoCol('Subtotal', safe(invoice.subtotal.toLocaleString())), { size: '12px', mb: '1' });
  if (invoice.tax_amount > 0) t(twoCol('Tax', safe(invoice.tax_amount.toLocaleString())), { size: '12px', mb: '1' });
  if (invoice.discount > 0) t(twoCol('Discount', '-' + safe(invoice.discount.toLocaleString())), { size: '12px', mb: '1' });
  t(twoCol('TOTAL', safe(invoice.total.toLocaleString())), { bold: true, size: '14px', mb: '2' });
  t(twoCol('Paid', safe(invoice.amount_paid.toLocaleString())), { size: '12px', mb: '2' });

  if (invoice.balance > 0) {
    t('BALANCE DUE: ' + safe(invoice.balance.toLocaleString()), { bold: true, align: 'center', size: '14px', mb: '4' });
  } else {
    t('*** FULLY PAID ***', { bold: true, align: 'center', size: '13px', mb: '4' });
  }

  t(line(), { align: 'center', size: '11px' });
  t('Thank you for shopping with', { align: 'center', size: '11px', mb: '1' });
  t('OKK STORES!', { bold: true, align: 'center', size: '12px', mb: '6' });

  return data;
}

// ==================================================
// PRINT FUNCTIONS
// ==================================================

// ESC/POS raw commands appended at end (cash drawer kick)
// 0x1B 0x70 0x00 0x19 0xFA = open drawer connected to pin 2
// We inject it as an extra "text" line that the printer interprets.
const DRAWER_KICK_BYTES = '\x1B\x70\x00\x19\xFA';

async function printReceipt(invoice, printerName) {
  const data = formatReceiptData(invoice);

  // Feed lines before content so first line is not at the very top edge
  const preFeed = [
    { type: 'text', value: ' ', style: { fontSize: '6px' } },
    { type: 'text', value: ' ', style: { fontSize: '6px' } }
  ];

  // Feed + cut at end (works on printers with auto-cutter)
  const postFeed = [
    { type: 'text', value: ' ', style: { fontSize: '6px' } },
    { type: 'text', value: ' ', style: { fontSize: '6px' } },
    { type: 'text', value: ' ', style: { fontSize: '6px' } }
  ];

  const payload = preFeed.concat(data).concat(postFeed);

  const options = {
    preview: false,
    margin: '0 0 0 0',
    copies: 1,
    printerName: printerName || PRINTER_NAME_FALLBACK,
    timeOutPerLine: 300,
    pageSize: PAGE_SIZE,
    silent: true
  };

  try {
    await PosPrinter.print(payload, options);
    return { success: true };
  } catch (error) {
    console.error('[printer] Print failed:', error);
    throw new Error('Print failed: ' + (error.message || error));
  }
}

async function testPrint(printerName) {
  const data = [
    { type: 'text', value: ' ', style: { fontSize: '6px' } },
    { type: 'text', value: 'OKK STORES', style: { fontWeight: '700', textAlign: 'center', fontSize: '20px', marginBottom: '6' } },
    { type: 'text', value: 'Test Print', style: { textAlign: 'center', fontSize: '13px', marginBottom: '6' } },
    { type: 'text', value: line(), style: { textAlign: 'center', fontSize: '11px' } },
    { type: 'text', value: twoCol('Printer:', printerName || PRINTER_NAME_FALLBACK), style: { fontSize: '11px', marginBottom: '2' } },
    { type: 'text', value: twoCol('Date:', new Date().toLocaleString()), style: { fontSize: '11px', marginBottom: '2' } },
    { type: 'text', value: twoCol('Paper:', '58mm / 32 cols'), style: { fontSize: '11px', marginBottom: '4' } },
    { type: 'text', value: line(), style: { textAlign: 'center', fontSize: '11px' } },
    { type: 'text', value: 'If you can read this clearly,', style: { textAlign: 'center', fontSize: '11px', marginBottom: '2' } },
    { type: 'text', value: 'the printer is working.', style: { textAlign: 'center', fontSize: '11px', marginBottom: '6' } },
    { type: 'text', value: ' ', style: { fontSize: '6px' } },
    { type: 'text', value: ' ', style: { fontSize: '6px' } }
  ];

  const options = {
    preview: false,
    margin: '0 0 0 0',
    copies: 1,
    printerName: printerName || PRINTER_NAME_FALLBACK,
    timeOutPerLine: 300,
    pageSize: PAGE_SIZE,
    silent: true
  };

  try {
    await PosPrinter.print(data, options);
    return { success: true };
  } catch (error) {
    throw new Error('Test print failed: ' + (error.message || error));
  }
}

module.exports = { printReceipt, testPrint, formatReceiptData, DRAWER_KICK_BYTES };
