// Pure budget-math helpers shared between Budget.jsx's live "over budget"
// warning and its save-time guard, so the two can never drift apart. This
// mirrors (but doesn't replace) the authoritative check the backend runs in
// routers/budget.py's update_budget() — see that function's docstring for
// why only a *manual* income override is ever checked against, never the
// period-derived income shown elsewhere on the page.

/**
 * Sum of monthly_target across active (non-archived) categories. Values are
 * parsed defensively (falling back to 0) since this runs against draft
 * category state while the user is still typing.
 */
export function activeTargetTotal(categories) {
  return categories
    .filter((c) => !c.archived)
    .reduce((sum, c) => sum + (parseFloat(c.monthly_target) || 0), 0);
}

/**
 * True when the given active-category total exceeds a manually entered
 * income figure. Returns false (never blocks) when income is empty, null,
 * or not a valid number — there's nothing to check against yet.
 */
export function isOverAllocated(income, activeTarget) {
  const incomeNum = income === "" || income == null ? null : parseFloat(income);
  if (incomeNum == null || Number.isNaN(incomeNum)) return false;
  return activeTarget > incomeNum;
}
