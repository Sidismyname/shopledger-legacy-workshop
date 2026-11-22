'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');

function sampleOrder(overrides) {
  return Object.assign({
    id: 1,
    date: '01/01/2026',
    customer: 'Sample Customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: '',
    items: [{
      id: 1,
      sku: 'RICE-001',
      name: 'Sample Rice',
      hsn: '1006',
      price: 1000,
      qty: 1
    }]
  }, overrides || {});
}

test('CURRENT BEHAVIOUR: order pricing uses HSN GST and taxes after the coupon discount', function () {
  const items = sampleOrder({ coupon: 'SAVE10' }).items;
  const totals = pricing.computeTotals(items, 'SAVE10');

  assert.equal(totals.subtotal, 1000);
  assert.equal(totals.discount, 100);
  assert.equal(totals.tax, 45);
  assert.equal(totals.cgst, 22.5);
  assert.equal(totals.sgst, 22.5);
  assert.equal(totals.total, 945);
  assert.deepEqual(totals.lines[0], {
    id: 1,
    name: 'Sample Rice',
    hsn: '1006',
    gstPercent: 5,
    gross: 1000,
    discount: 100,
    taxable: 900,
    tax: 45,
    net: 945
  });
});

test('invoice matches billed order totals and per-line GST', function () {
  const order = sampleOrder({ coupon: 'SAVE10' });
  const billed = pricing.computeTotals(order.items, order.coupon);
  order.total = billed.total;

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, billed.subtotal);
  assert.equal(figures.discount, billed.discount);
  assert.equal(figures.tax, billed.tax);
  assert.equal(figures.cgst, billed.cgst);
  assert.equal(figures.sgst, billed.sgst);
  assert.equal(figures.total, billed.total);
  assert.deepEqual(figures.rows.map(function (row) {
    return { gstPercent: row.gstPercent, lineTax: row.lineTax };
  }), billed.lines.map(function (line) {
    return { gstPercent: line.gstPercent, lineTax: line.tax };
  }));
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice uses the billed HSN rate when no coupon is applied', function () {
  const order = sampleOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  order.total = billed.total;

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, billed.subtotal);
  assert.equal(figures.discount, billed.discount);
  assert.equal(figures.tax, billed.tax);
  assert.equal(figures.cgst, billed.cgst);
  assert.equal(figures.sgst, billed.sgst);
  assert.equal(figures.total, billed.total);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 50);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice follows active status and discount caps used by order pricing', function () {
  const inactiveOrder = sampleOrder({ coupon: 'DIWALI20' });
  const inactiveInvoice = invoice.computeInvoiceFigures(inactiveOrder);
  const inactiveOrderPricing = pricing.computeTotals(inactiveOrder.items, inactiveOrder.coupon);

  assert.equal(inactiveOrderPricing.discount, 0);
  assert.equal(inactiveInvoice.discount, inactiveOrderPricing.discount);
  assert.equal(inactiveInvoice.tax, inactiveOrderPricing.tax);
  assert.equal(inactiveInvoice.total, inactiveOrderPricing.total);

  const cappedOrder = sampleOrder({
    coupon: 'SAVE10',
    items: [{ id: 1, name: 'Sample Rice', hsn: '1006', price: 5000, qty: 1 }]
  });
  const cappedPricing = pricing.computeTotals(cappedOrder.items, cappedOrder.coupon);
  const cappedInvoice = invoice.computeInvoiceFigures(cappedOrder);

  assert.equal(cappedPricing.discount, 150);
  assert.equal(cappedInvoice.discount, cappedPricing.discount);
  assert.equal(cappedInvoice.tax, cappedPricing.tax);
  assert.equal(cappedInvoice.total, cappedPricing.total);
});
