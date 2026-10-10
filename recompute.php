<?php
/**
 * Pesewa — recompute.php
 *
 * Basic PHP, no database (this checkpoint only covers Lesson 12 /
 * Nixon ch.3, before MySQL is taught). The browser sends this script
 * its allowance, category targets, and the full list of logged
 * expenses as JSON; this script adds everything up again from
 * scratch and sends back what it got, so the final number on the
 * Report page isn't just whatever the browser already believed.
 */

header('Content-Type: application/json');

// Read the raw JSON body the Ajax (XHR) call sent.
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data) || !isset($data['allowance']) || !isset($data['targets']) || !isset($data['expenses'])) {
    http_response_code(400);
    echo json_encode(array('error' => 'Expected allowance, targets, and expenses.'));
    exit;
}

$allowance = (float) $data['allowance'];
$targets = $data['targets'];
$expenses = $data['expenses'];

// Start every known category at zero, then add each expense's amount
// onto its own category as we loop through the list.
$totals = array();
foreach ($targets as $categoryKey => $target) {
    $totals[$categoryKey] = 0.0;
}

foreach ($expenses as $expense) {
    if (!isset($expense['category']) || !isset($expense['amount'])) {
        continue;
    }
    $categoryKey = $expense['category'];
    $amount = (float) $expense['amount'];

    if (!isset($totals[$categoryKey])) {
        $totals[$categoryKey] = 0.0;
    }
    $totals[$categoryKey] += $amount;
}

/**
 * Same three-way status as the client: on track, watching (80-100% of
 * target), or over budget. Kept here too so the server's answer can
 * be trusted on its own, not just copied from the browser.
 */
function statusFor($spent, $target) {
    if ($target <= 0) {
        return $spent > 0 ? 'over' : 'on-track';
    }
    $ratio = $spent / $target;
    if ($ratio > 1) {
        return 'over';
    }
    if ($ratio >= 0.8) {
        return 'watching';
    }
    return 'on-track';
}

$categories = array();
$grandTotal = 0.0;

foreach ($totals as $categoryKey => $spent) {
    $target = isset($targets[$categoryKey]) ? (float) $targets[$categoryKey] : 0.0;
    $categories[] = array(
        'category' => $categoryKey,
        'spent' => round($spent, 2),
        'target' => round($target, 2),
        'status' => statusFor($spent, $target),
    );
    $grandTotal += $spent;
}

echo json_encode(array(
    'allowance' => round($allowance, 2),
    'spent' => round($grandTotal, 2),
    'remaining' => round($allowance - $grandTotal, 2),
    'overBudget' => $grandTotal > $allowance,
    'categories' => $categories,
));
