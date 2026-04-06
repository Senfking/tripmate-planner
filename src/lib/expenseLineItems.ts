export interface ExpenseLineItemLike {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  is_shared?: boolean;
}

export const SHARED_COST_PATTERN = /(?:^|\b)(tax|vat|service(?:\s*charge)?|tip|gratuity|surcharge)(?:\b|$)/i;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeItemKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function isSharedCostItem(name: string) {
  return SHARED_COST_PATTERN.test(name);
}

export function sumLineItemTotals<T extends ExpenseLineItemLike>(lineItems: T[]) {
  return roundMoney(lineItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0));
}

function buildSharedCostLabel(names: string[], total: number) {
  if (total < -0.005) return "Receipt adjustment";
  const hasTax = names.some((name) => /tax|vat/i.test(name));
  const hasService = names.some((name) => /service|tip|gratuity|surcharge/i.test(name));
  if (hasTax && hasService) return "Tax & service";
  if (hasTax) return "Tax";
  if (hasService) return "Service & tips";
  return "Shared receipt costs";
}

export function getEffectiveSharedTotal<T extends ExpenseLineItemLike>(lineItems: T[], totalAmount: number) {
  const claimableTotal = sumLineItemTotals(lineItems.filter((item) => !item.is_shared));
  const explicitSharedTotal = sumLineItemTotals(lineItems.filter((item) => item.is_shared));
  const fallbackTotal = roundMoney(claimableTotal + explicitSharedTotal);
  const expectedTotal = Number.isFinite(totalAmount) && totalAmount > 0
    ? roundMoney(totalAmount)
    : fallbackTotal;

  return roundMoney(expectedTotal - claimableTotal);
}

export function normalizeScannedLineItems<T extends ExpenseLineItemLike>(
  rawItems: T[] | null | undefined,
  totalAmount: number,
): ExpenseLineItemLike[] {
  const cleaned = (rawItems ?? [])
    .map((item) => {
      const name = String(item.name ?? "").trim();
      const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
      let totalPrice = Number(item.total_price) || 0;
      let unitPrice = item.unit_price == null ? null : Number(item.unit_price);

      if (totalPrice <= 0 && unitPrice != null && Number.isFinite(unitPrice)) {
        totalPrice = unitPrice * quantity;
      }

      if ((unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) && totalPrice > 0) {
        unitPrice = totalPrice / quantity;
      }

      return {
        name,
        quantity,
        unit_price: unitPrice != null && Number.isFinite(unitPrice) ? roundMoney(unitPrice) : null,
        total_price: roundMoney(totalPrice),
        is_shared: Boolean(item.is_shared) || isSharedCostItem(name),
      } satisfies ExpenseLineItemLike;
    })
    .filter((item) => item.name && item.total_price > 0);

  const groups = new Map<string, ExpenseLineItemLike[]>();
  for (const item of cleaned) {
    if (item.is_shared) continue;
    const key = normalizeItemKey(item.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const canonicalUnitPrices = new Map<string, number>();
  for (const [key, items] of groups.entries()) {
    const qtyOneUnits = items
      .filter((item) => item.quantity === 1)
      .map((item) => item.total_price)
      .filter((value) => value > 0);

    const candidateUnits = qtyOneUnits.length > 0
      ? qtyOneUnits
      : items
          .map((item) => {
            const explicitUnit = item.unit_price ?? 0;
            const impliedUnit = item.total_price / Math.max(item.quantity, 1);
            return Math.max(explicitUnit, impliedUnit);
          })
          .filter((value) => value > 0);

    if (candidateUnits.length > 0) {
      canonicalUnitPrices.set(key, Math.max(...candidateUnits));
    }
  }

  const normalized = cleaned.map((item) => {
    if (item.is_shared) return item;

    const canonicalUnit = canonicalUnitPrices.get(normalizeItemKey(item.name));
    if (!canonicalUnit) return item;

    let unitPrice = item.unit_price ?? item.total_price / Math.max(item.quantity, 1);
    let totalPrice = item.total_price;
    const impliedUnit = totalPrice / Math.max(item.quantity, 1);

    if (item.quantity > 1 && impliedUnit > 0 && impliedUnit < canonicalUnit * 0.75) {
      unitPrice = canonicalUnit;
      totalPrice = canonicalUnit * item.quantity;
    } else if (!item.unit_price || Math.abs(item.unit_price - canonicalUnit) / canonicalUnit > 0.25) {
      unitPrice = canonicalUnit;
    }

    return {
      ...item,
      unit_price: roundMoney(unitPrice),
      total_price: roundMoney(totalPrice),
    } satisfies ExpenseLineItemLike;
  });

  const claimableItems = normalized.filter((item) => !item.is_shared);
  const explicitSharedItems = normalized.filter((item) => item.is_shared);
  const sharedTotal = getEffectiveSharedTotal(normalized, totalAmount);
  const sharedLabel = buildSharedCostLabel(explicitSharedItems.map((item) => item.name), sharedTotal);

  return Math.abs(sharedTotal) >= 0.01
    ? [
        ...claimableItems,
        {
          name: sharedLabel,
          quantity: 1,
          unit_price: sharedTotal,
          total_price: sharedTotal,
          is_shared: true,
        },
      ]
    : claimableItems;
}

export function calculateLineItemTotals<T extends ExpenseLineItemLike>(params: {
  lineItems: T[];
  memberIds: string[];
  totalAmount: number;
  getAssigneeIds: (item: T, index: number) => Iterable<string> | undefined;
}) {
  const { lineItems, memberIds, totalAmount, getAssigneeIds } = params;
  const totals: Record<string, number> = {};
  const claimableTotals: Record<string, number> = {};
  const memberIdSet = new Set(memberIds);

  for (const userId of memberIds) {
    totals[userId] = 0;
    claimableTotals[userId] = 0;
  }

  const claimableItems = lineItems.filter((item) => !item.is_shared);
  const sharedTotal = getEffectiveSharedTotal(lineItems, totalAmount);

  claimableItems.forEach((item, index) => {
    const assigneeIds = Array.from(getAssigneeIds(item, index) ?? []).filter((userId) => memberIdSet.has(userId));
    const recipients = assigneeIds.length > 0 ? assigneeIds : memberIds;
    if (recipients.length === 0) return;

    const perPerson = item.total_price / recipients.length;
    for (const userId of recipients) {
      totals[userId] += perPerson;
      claimableTotals[userId] += perPerson;
    }
  });

  const subtotalSum = memberIds.reduce((sum, userId) => sum + claimableTotals[userId], 0);
  if (Math.abs(sharedTotal) >= 0.005 && memberIds.length > 0) {
    if (subtotalSum > 0.005) {
      for (const userId of memberIds) {
        totals[userId] += sharedTotal * (claimableTotals[userId] / subtotalSum);
      }
    } else {
      const perPerson = sharedTotal / memberIds.length;
      for (const userId of memberIds) {
        totals[userId] += perPerson;
      }
    }
  }

  const roundedTotals: Record<string, number> = {};
  for (const userId of memberIds) {
    roundedTotals[userId] = roundMoney(totals[userId]);
  }

  const expectedTotal = Number.isFinite(totalAmount) && totalAmount > 0
    ? roundMoney(totalAmount)
    : roundMoney(memberIds.reduce((sum, userId) => sum + roundedTotals[userId], 0));
  const currentTotal = roundMoney(memberIds.reduce((sum, userId) => sum + roundedTotals[userId], 0));
  const diff = roundMoney(expectedTotal - currentTotal);

  if (Math.abs(diff) >= 0.01 && memberIds.length > 0) {
    roundedTotals[memberIds[0]] = roundMoney(roundedTotals[memberIds[0]] + diff);
  }

  return {
    totals: roundedTotals,
    claimableTotals,
    sharedTotal: roundMoney(sharedTotal),
  };
}