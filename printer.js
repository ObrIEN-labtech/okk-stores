// printer.js — Thermal receipt printer integration (ESC/POS)
const { PosPrinter } = require('electron-pos-printer');

const PAGE_SIZE = '58mm';

function formatReceiptData(invoice) {
  const data = [];

  data.push({ type: 'text', value: 'OKK STORES', style: { fontWeight: '700', textAlign: 'center', fontSize: '24px', marginBottom: '4px' } });
  data.push({ type: 'text', value: 'Plot 14 Keyo Road, Gulu City', style: { textAlign: 'center', fontSize: '11px', marginBottom: '2px' } });
  data.push({ type: 'text', value: 'Tel: 0772949121', style: { textAlign: 'center', fontSize: '11px', marginBottom: '8px' } });
  data.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: '11px' } });

  data.push({ type: 'text', value: 'Invoice: ' + invoice.invoice_no, style: { fontSize: '12px', marginBottom: '2px' } });
  data.push({ type: 'text', value: 'Date: ' + new Date(invoice.created_at).toLocaleString(), style: { fontSize: '12px', marginBottom: '2px' } });
  data.push({ type: 'text', value: 'Customer: ' + (invoice.customer_name || 'Walk-in'), style: { fontSize: '12px', marginBottom: '2px' } });
  if (invoice.customer_phone) {
    data.push({ type: 'text', value: 'Phone: ' + invoice.customer_phone, style: { fontSize: '12px', marginBottom: '6px' } });
  }

  data.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: '11px' } });

  invoice.items.forEach(function(item) {
    data.push({ type: 'text', value: item.product_name, style: { fontSize: '12px' } });
    var qtyLine = '  ' + item.quantity + ' x UGX ' + item.unit_price.toLocaleString();
    var totalLine = 'UGX ' + item.line_total.toLocaleString();
    data.push({ type: 'text', value: qtyLine + ' '.repeat(Math.max(1, 30 - qtyLine.length - totalLine.length)) + totalLine, style: { fontSize: '11px', marginBottom: '4px' } });
  });

  data.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: '11px' } });

  data.push({ type: 'text', value: 'Subtotal: UGX ' + invoice.subtotal.toLocaleString(), style: { fontSize: '12px', marginBottom: '2px' } });
  if (invoice.tax_amount > 0) {
    data.push({ type: 'text', value: 'Tax: UGX ' + invoice.tax_amount.toLocaleString(), style: { fontSize: '12px', marginBottom: '2px' } });
  }
  if (invoice.discount > 0) {
    data.push({ type: 'text', value: 'Discount: -UGX ' + invoice.discount.toLocaleString(), style: { fontSize: '12px', marginBottom: '2px' } });
  }

  data.push({ type: 'text', value: 'TOTAL: UGX ' + invoice.total.toLocaleString(), style: { fontWeight: '700', fontSize: '14px', marginTop: '4px', marginBottom: '4px' } });
  data.push({ type: 'text', value: 'Paid: UGX ' + invoice.amount_paid.toLocaleString(), style: { fontSize: '12px', marginBottom: '2px' } });

  if (invoice.balance > 0) {
    data.push({ type: 'text', value: 'BALANCE DUE: UGX ' + invoice.balance.toLocaleString(), style: { fontWeight: '700', fontSize: '14px', marginBottom: '6px' } });
  } else {
    data.push({ type: 'text', value: '*** FULLY PAID ***', style: { fontWeight: '700', textAlign: 'center', fontSize: '14px', marginBottom: '6px' } });
  }

  data.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: '11px' } });
  data.push({ type: 'text', value: 'Thank you for shopping with', style: { textAlign: 'center', fontSize: '11px', marginTop: '6px' } });
  data.push({ type: 'text', value: 'OKK STORES!', style: { textAlign: 'center', fontWeight: '700', fontSize: '12px', marginBottom: '8px' } });

  return data;
}

async function printReceipt(invoice, printerName) {
  const data = formatReceiptData(invoice);
  const options = {
    preview: false,
    margin: '0 0 0 0',
    copies: 1,
    printerName: printerName || 'POS-58',
    timeOutPerLine: 400,
    pageSize: PAGE_SIZE,
    silent: true
  };
  try {
    await PosPrinter.print(data, options);
    return { success: true };
  } catch (error) {
    console.error('[printer] Print failed:', error);
    throw new Error('Print failed: ' + (error.message || error));
  }
}

async function testPrint(printerName) {
  const data = [
    { type: 'text', value: 'OKK STORES', style: { fontWeight: '700', textAlign: 'center', fontSize: '24px' } },
    { type: 'text', value: 'Test Print', style: { textAlign: 'center', fontSize: '14px', marginTop: '8px' } },
    { type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: '11px', marginTop: '8px' } },
    { type: 'text', value: 'Printer: ' + (printerName || 'Default'), style: { fontSize: '12px', marginTop: '4px' } },
    { type: 'text', value: 'Date: ' + new Date().toLocaleString(), style: { fontSize: '12px', marginTop: '4px' } },
    { type: 'text', value: 'If you see this, the printer works!', style: { textAlign: 'center', fontSize: '12px', marginTop: '8px' } }
  ];
  const options = {
    preview: false, margin: '0 0 0 0', copies: 1,
    printerName: printerName || 'POS-58', timeOutPerLine: 400,
    pageSize: PAGE_SIZE, silent: true
  };
  try {
    await PosPrinter.print(data, options);
    return { success: true };
  } catch (error) {
    throw new Error('Test print failed: ' + (error.message || error));
  }
}

module.exports = { printReceipt, testPrint, formatReceiptData };
