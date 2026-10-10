/* ==========================================================================
   Pesewa — app logic
   Everything here runs client-side. The only server round trip is the
   "Recalculate on server" button on the Report view, which sends the
   current numbers to recompute.php over XHR (Ajax) so the totals get
   checked by something other than the browser that produced them.
   ========================================================================== */

var STORAGE_KEY = 'pesewa:v1';

// The four fixed categories for this checkpoint. `key` is what gets
// stored in data; `label` is what a person reads on screen.
var CATEGORIES = [
  { key: 'food', label: 'Food' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'essentials', label: 'Essentials & supplies' },
  { key: 'other', label: 'Other' }
];

var state = null;

/* ---------------------------------------------------------------------
   State: load, save, seed
   --------------------------------------------------------------------- */

function defaultState() {
  return {
    allowance: 450,
    targets: { food: 150, snacks: 100, essentials: 100, other: 100 },
    expenses: [
      { id: 1, date: daysAgoISO(0), category: 'food', description: 'Jollof, Night Market', amount: 15 },
      { id: 2, date: daysAgoISO(1), category: 'other', description: 'Data bundle', amount: 25 },
      { id: 3, date: daysAgoISO(2), category: 'snacks', description: 'Biscuits, kiosk', amount: 5 },
      { id: 4, date: daysAgoISO(4), category: 'essentials', description: 'Lecture notes printing', amount: 8 },
      { id: 5, date: daysAgoISO(7), category: 'other', description: 'Taxi to town', amount: 30 },
      { id: 6, date: daysAgoISO(0), category: 'food', description: 'Waakye, campus gate', amount: 20 },
      { id: 7, date: daysAgoISO(1), category: 'snacks', description: 'Juice and meat pie', amount: 18 },
      { id: 8, date: daysAgoISO(3), category: 'food', description: 'Rice and stew, hall', amount: 25 },
      { id: 9, date: daysAgoISO(2), category: 'snacks', description: 'Plantain chips x3', amount: 35 },
      { id: 10, date: daysAgoISO(5), category: 'essentials', description: 'Printing, assignment', amount: 12 },
      { id: 11, date: daysAgoISO(6), category: 'snacks', description: 'Ice cream run', amount: 15 },
      { id: 12, date: daysAgoISO(8), category: 'essentials', description: 'Pen and notebook', amount: 10 },
      { id: 13, date: daysAgoISO(9), category: 'other', description: 'Phone credit', amount: 20 },
      { id: 14, date: daysAgoISO(10), category: 'food', description: 'Banku and tilapia', amount: 35 }
    ],
    nextId: 15
  };
}

function daysAgoISO(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function loadState() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
  }
  return defaultState();
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save to this browser.', err);
  }
}

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */

function formatMoney(amount) {
  var n = Number(amount) || 0;
  return 'GH¢' + n.toFixed(2);
}

function labelFor(categoryKey) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].key === categoryKey) {
      return CATEGORIES[i].label;
    }
  }
  return categoryKey;
}

function currentMonthLabel() {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatShortDate(iso) {
  var d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

// Adds up every expense per category. This is the client-side version;
// the Report view can ask the server to redo this same arithmetic.
function categoryTotals(expenses) {
  var totals = {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    totals[CATEGORIES[i].key] = 0;
  }
  for (var j = 0; j < expenses.length; j++) {
    var expense = expenses[j];
    if (totals[expense.category] === undefined) {
      totals[expense.category] = 0;
    }
    totals[expense.category] += Number(expense.amount);
  }
  return totals;
}

function grandTotal(totals) {
  var sum = 0;
  for (var key in totals) {
    if (totals.hasOwnProperty(key)) {
      sum += totals[key];
    }
  }
  return sum;
}

// Three-way budget status, used both for the dashboard bars and the
// report chips. Over 100% of target = over budget. 80-100% = watching.
// Anything under that = on track.
function statusFor(spent, target) {
  if (target <= 0) {
    return spent > 0 ? 'over' : 'on-track';
  }
  var ratio = spent / target;
  if (ratio > 1) {
    return 'over';
  }
  if (ratio >= 0.8) {
    return 'watching';
  }
  return 'on-track';
}

function statusLabel(status) {
  if (status === 'over') return 'Over budget';
  if (status === 'watching') return 'Watching';
  return 'On track';
}

/* ---------------------------------------------------------------------
   Navigation
   --------------------------------------------------------------------- */

function switchView(viewName) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) {
    views[i].classList.toggle('is-active', views[i].id === 'view-' + viewName);
  }

  var links = document.querySelectorAll('.nav-link');
  for (var j = 0; j < links.length; j++) {
    links[j].classList.toggle('is-active', links[j].dataset.view === viewName);
  }

  if (viewName === 'budget') {
    fillBudgetForm();
  }
  if (viewName === 'report') {
    renderReport(null);
  }
}

function setUpNav() {
  var links = document.querySelectorAll('.nav-link');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function (event) {
      event.preventDefault();
      switchView(this.dataset.view);
    });
  }
}

/* ---------------------------------------------------------------------
   Dashboard
   --------------------------------------------------------------------- */

function renderDashboard() {
  var totals = categoryTotals(state.expenses);
  var spent = grandTotal(totals);
  var remaining = state.allowance - spent;

  document.getElementById('dashboard-month-title').textContent = currentMonthLabel();
  document.getElementById('stat-allowance').textContent = formatMoney(state.allowance);
  document.getElementById('stat-spent').textContent = formatMoney(spent);
  document.getElementById('stat-remaining').textContent = formatMoney(remaining);

  var barsContainer = document.getElementById('budget-bars');
  barsContainer.innerHTML = '';

  for (var i = 0; i < CATEGORIES.length; i++) {
    var cat = CATEGORIES[i];
    var catSpent = totals[cat.key] || 0;
    var target = state.targets[cat.key] || 0;
    var status = statusFor(catSpent, target);
    var percent = target > 0 ? Math.min(100, (catSpent / target) * 100) : (catSpent > 0 ? 100 : 0);

    var row = document.createElement('div');
    row.className = 'budget-row';
    row.innerHTML =
      '<div class="budget-row-head">' +
        '<span>' + cat.label + '</span>' +
        '<span class="amounts">' + formatMoney(catSpent) + ' / ' + formatMoney(target) + '</span>' +
      '</div>' +
      '<div class="budget-track">' +
        '<div class="budget-fill budget-fill--' + status + '" style="width:' + percent + '%"></div>' +
      '</div>';
    barsContainer.appendChild(row);
  }

  var ledgerContainer = document.getElementById('ledger-rows');
  var emptyNotice = document.getElementById('ledger-empty');
  ledgerContainer.innerHTML = '';

  var sorted = state.expenses.slice().sort(function (a, b) {
    return b.date.localeCompare(a.date) || b.id - a.id;
  });

  if (sorted.length === 0) {
    emptyNotice.hidden = false;
  } else {
    emptyNotice.hidden = true;
    for (var j = 0; j < sorted.length; j++) {
      var expense = sorted[j];
      var row2 = document.createElement('div');
      row2.className = 'ledger-row';
      row2.innerHTML =
        '<span class="ledger-date">' + formatShortDate(expense.date) + '</span>' +
        '<span class="ledger-desc">' + escapeHtml(expense.description) + '</span>' +
        '<span class="ledger-amount">' + formatMoney(expense.amount) + '</span>';
      ledgerContainer.appendChild(row2);
    }
  }
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ---------------------------------------------------------------------
   Add expense
   --------------------------------------------------------------------- */

function setUpExpenseForm() {
  var form = document.getElementById('expense-form');
  var dateField = document.getElementById('date');
  dateField.value = new Date().toISOString().slice(0, 10);

  document.getElementById('add-expense-subtitle').textContent =
    'This will be logged under ' + currentMonthLabel() + '.';

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var amount = parseFloat(document.getElementById('amount').value);
    var category = document.getElementById('category').value;
    var description = document.getElementById('description').value.trim();
    var date = document.getElementById('date').value;
    var feedback = document.getElementById('expense-feedback');

    if (!amount || amount <= 0) {
      feedback.textContent = 'Enter an amount greater than zero.';
      feedback.className = 'feedback is-error';
      return;
    }
    if (!description) {
      feedback.textContent = 'Give it a short description.';
      feedback.className = 'feedback is-error';
      return;
    }
    if (!date) {
      feedback.textContent = 'Pick a date.';
      feedback.className = 'feedback is-error';
      return;
    }

    state.expenses.push({
      id: state.nextId++,
      date: date,
      category: category,
      description: description,
      amount: amount
    });
    saveState();
    renderDashboard();

    feedback.textContent = 'Added ' + formatMoney(amount) + ' to ' + labelFor(category) + '.';
    feedback.className = 'feedback is-success';
    form.reset();
    dateField.value = new Date().toISOString().slice(0, 10);
  });
}

/* ---------------------------------------------------------------------
   Budget
   --------------------------------------------------------------------- */

function fillBudgetForm() {
  document.getElementById('budget-subtitle').textContent =
    'Your allowance and category targets for ' + currentMonthLabel() + '.';
  document.getElementById('allowance-input').value = state.allowance;
  document.getElementById('target-food').value = state.targets.food;
  document.getElementById('target-snacks').value = state.targets.snacks;
  document.getElementById('target-essentials').value = state.targets.essentials;
  document.getElementById('target-other').value = state.targets.other;
  updateAllocatedLine();
}

function updateAllocatedLine() {
  var allowance = parseFloat(document.getElementById('allowance-input').value) || 0;
  var sum =
    (parseFloat(document.getElementById('target-food').value) || 0) +
    (parseFloat(document.getElementById('target-snacks').value) || 0) +
    (parseFloat(document.getElementById('target-essentials').value) || 0) +
    (parseFloat(document.getElementById('target-other').value) || 0);

  document.getElementById('allocated-value').textContent =
    formatMoney(sum) + ' of ' + formatMoney(allowance);
}

function setUpBudgetForm() {
  var form = document.getElementById('budget-form');
  var inputs = form.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('input', updateAllocatedLine);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var allowance = parseFloat(document.getElementById('allowance-input').value);
    var food = parseFloat(document.getElementById('target-food').value) || 0;
    var snacks = parseFloat(document.getElementById('target-snacks').value) || 0;
    var essentials = parseFloat(document.getElementById('target-essentials').value) || 0;
    var other = parseFloat(document.getElementById('target-other').value) || 0;
    var feedback = document.getElementById('budget-feedback');

    if (!allowance || allowance <= 0) {
      feedback.textContent = 'Set an allowance greater than zero.';
      feedback.className = 'feedback is-error';
      return;
    }

    state.allowance = allowance;
    state.targets = { food: food, snacks: snacks, essentials: essentials, other: other };
    saveState();
    renderDashboard();

    var sum = food + snacks + essentials + other;
    if (sum > allowance) {
      feedback.textContent = 'Saved. Note: your targets add up to more than your allowance.';
      feedback.className = 'feedback is-error';
    } else {
      feedback.textContent = 'Budget saved for ' + currentMonthLabel() + '.';
      feedback.className = 'feedback is-success';
    }
  });
}

/* ---------------------------------------------------------------------
   Report (client-side render, with an optional server recalculation)
   --------------------------------------------------------------------- */

function renderReport(serverResult) {
  var statusEl = document.getElementById('report-status');

  var totals, spent, remaining, source;

  if (serverResult) {
    totals = {};
    for (var i = 0; i < serverResult.categories.length; i++) {
      totals[serverResult.categories[i].category] = serverResult.categories[i].spent;
    }
    spent = serverResult.spent;
    remaining = serverResult.remaining;
    source = 'server';
  } else {
    totals = categoryTotals(state.expenses);
    spent = grandTotal(totals);
    remaining = state.allowance - spent;
    source = 'browser';
  }

  document.getElementById('report-total').textContent = formatMoney(spent);
  document.getElementById('report-total-sub').textContent =
    'spent of ' + formatMoney(state.allowance) +
    (source === 'server' ? ' (checked on the server)' : ' (calculated in this browser)');

  var badge = document.getElementById('report-badge');
  if (spent > state.allowance) {
    badge.innerHTML = '<span class="status-chip status-chip--over">Over the monthly allowance</span>';
  } else {
    badge.innerHTML = '<span class="status-chip status-chip--on-track">On budget for ' + currentMonthLabel() + '</span>';
  }

  var body = document.getElementById('report-body');
  body.innerHTML = '';

  for (var j = 0; j < CATEGORIES.length; j++) {
    var cat = CATEGORIES[j];
    var catSpent = totals[cat.key] || 0;
    var target = state.targets[cat.key] || 0;
    var status = statusFor(catSpent, target);

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + cat.label + '</td>' +
      '<td class="num">' + formatMoney(catSpent) + '</td>' +
      '<td class="num">' + formatMoney(target) + '</td>' +
      '<td class="num"><span class="status-chip status-chip--' + status + '">' + statusLabel(status) + '</span></td>';
    body.appendChild(tr);
  }

  if (!serverResult) {
    statusEl.textContent = '';
    statusEl.className = 'feedback';
  }
}

// Sends the current numbers to recompute.php over XHR and re-renders
// the report with whatever the server calculated, rather than trusting
// the totals this page already had sitting in memory.
function recalculateOnServer() {
  var statusEl = document.getElementById('report-status');
  statusEl.textContent = 'Checking with the server…';
  statusEl.className = 'feedback';

  var payload = JSON.stringify({
    allowance: state.allowance,
    targets: state.targets,
    expenses: state.expenses
  });

  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'recompute.php', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) {
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var result = JSON.parse(xhr.responseText);
        renderReport(result);
        statusEl.textContent = 'Server confirmed these totals just now.';
        statusEl.className = 'feedback is-success';
      } catch (err) {
        statusEl.textContent = 'The server replied, but not with something readable.';
        statusEl.className = 'feedback is-error';
      }
    } else {
      statusEl.textContent =
        'Could not reach recompute.php (status ' + xhr.status + '). Showing the browser’s own numbers instead.';
      statusEl.className = 'feedback is-error';
    }
  };

  xhr.onerror = function () {
    statusEl.textContent = 'Could not reach the server. This page needs to be served over PHP (see README) for this button to work.';
    statusEl.className = 'feedback is-error';
  };

  xhr.send(payload);
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
  state = loadState();

  document.getElementById('current-month').textContent = currentMonthLabel();

  setUpNav();
  setUpExpenseForm();
  setUpBudgetForm();
  document.getElementById('recalculate-btn').addEventListener('click', recalculateOnServer);

  renderDashboard();
  switchView('dashboard');
});
