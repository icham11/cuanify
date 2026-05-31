export interface EditablePaymentTransaction {
  id: string;
  timestamp: string;
  amount: number;
  type: "DP" | "Final";
  note?: string;
  userId?: number | null;
  actorName?: string;
}

interface ReconcileEditedPaymentTransactionsParams {
  orderId: string;
  existingTransactions?: EditablePaymentTransaction[] | null;
  previousDpPaid: number;
  previousFinalPaid: number;
  nextDpPaid: number;
  nextFinalPaid: number;
  eventTimestamp: string;
  actorIdentity: {
    userId: number | null;
    name: string;
  };
}

function normalizeMoney(value: number) {
  return Math.round(Number(value) || 0);
}

function isValidTimestamp(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function buildTransaction(params: {
  id: string;
  timestamp: string;
  amount: number;
  type: "DP" | "Final";
  note: string;
  userId: number | null;
  actorName: string;
}): EditablePaymentTransaction {
  return {
    id: params.id,
    timestamp: params.timestamp,
    amount: params.amount,
    type: params.type,
    note: params.note,
    userId: params.userId,
    actorName: params.actorName,
  };
}

function buildCanonicalEditedPaymentTransactions(params: {
  orderId: string;
  existingTransactions: EditablePaymentTransaction[];
  nextDpPaid: number;
  nextFinalPaid: number;
  eventTimestamp: string;
  actorIdentity: {
    userId: number | null;
    name: string;
  };
}) {
  const canonicalTimestamp =
    params.existingTransactions
      .map((transaction) => String(transaction.timestamp || "").trim())
      .find(isValidTimestamp) || params.eventTimestamp;
  const rewrittenTransactions: EditablePaymentTransaction[] = [];

  if (params.nextDpPaid > 0) {
    rewrittenTransactions.push(
      buildTransaction({
        id: `pay-${params.orderId}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: canonicalTimestamp,
        amount: params.nextDpPaid,
        type: "DP",
        note: "Edit order - set DP",
        userId: params.actorIdentity.userId,
        actorName: params.actorIdentity.name,
      }),
    );
  }

  if (params.nextFinalPaid > 0) {
    rewrittenTransactions.push(
      buildTransaction({
        id: `pay-${params.orderId}-final-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: canonicalTimestamp,
        amount: params.nextFinalPaid,
        type: "Final",
        note: "Edit order - set pelunasan",
        userId: params.actorIdentity.userId,
        actorName: params.actorIdentity.name,
      }),
    );
  }

  return rewrittenTransactions;
}

export function reconcileEditedPaymentTransactions(
  params: ReconcileEditedPaymentTransactionsParams,
): EditablePaymentTransaction[] {
  const existingTransactions = Array.isArray(params.existingTransactions)
    ? params.existingTransactions
    : [];
  const previousDpPaid = normalizeMoney(params.previousDpPaid);
  const previousFinalPaid = normalizeMoney(params.previousFinalPaid);
  const nextDpPaid = normalizeMoney(params.nextDpPaid);
  const nextFinalPaid = normalizeMoney(params.nextFinalPaid);
  const deltaDp = normalizeMoney(nextDpPaid - previousDpPaid);
  const deltaFinal = normalizeMoney(nextFinalPaid - previousFinalPaid);

  const isPaymentTypeReclassified =
    deltaDp !== 0 &&
    deltaFinal !== 0 &&
    Math.sign(deltaDp) !== Math.sign(deltaFinal);

  if (isPaymentTypeReclassified) {
    return buildCanonicalEditedPaymentTransactions({
      orderId: params.orderId,
      existingTransactions,
      nextDpPaid,
      nextFinalPaid,
      eventTimestamp: params.eventTimestamp,
      actorIdentity: params.actorIdentity,
    });
  }

  const appendedTransactions: EditablePaymentTransaction[] = [];

  if (deltaDp !== 0) {
    appendedTransactions.push(
      buildTransaction({
        id: `pay-${params.orderId}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: params.eventTimestamp,
        amount: deltaDp,
        type: "DP",
        note: "Edit order - penyesuaian DP",
        userId: params.actorIdentity.userId,
        actorName: params.actorIdentity.name,
      }),
    );
  }

  if (deltaFinal !== 0) {
    appendedTransactions.push(
      buildTransaction({
        id: `pay-${params.orderId}-final-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: params.eventTimestamp,
        amount: deltaFinal,
        type: "Final",
        note: "Edit order - penyesuaian pelunasan",
        userId: params.actorIdentity.userId,
        actorName: params.actorIdentity.name,
      }),
    );
  }

  return [...existingTransactions, ...appendedTransactions];
}
