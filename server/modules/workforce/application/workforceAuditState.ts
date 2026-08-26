import { auditStateDigest, serializeAuditState } from '../../audit';

function parsedArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function textEvidence(value: unknown) {
  const text = typeof value === 'string' ? value : '';
  return {
    present: Boolean(text),
    length: text.length,
    digest: auditStateDigest(text || null),
  };
}

/**
 * Explicit request projection for tamper-evident audit evidence. Free-text,
 * contact details, email bodies, portal tokens and storage locations are not
 * copied into AuditLog.
 */
export function workforceRequestAuditState(request: any) {
  const approvalSteps = parsedArray(request.approvalSteps);
  const broadcastVendorIds = parsedArray(request.broadcastVendorIds).map(String).sort();
  const items = Array.isArray(request.items)
    ? request.items.map((item: any) => ({
        id: item.id,
        positionId: item.positionId,
        rateUnit: item.rateUnit,
        quantity: item.quantity,
        hours: item.hours,
        vendorRateId: item.vendorRateId,
        vendorId: item.vendorId,
        unitRate: item.unitRate,
        rateCurrency: item.rateCurrency,
        estimatedCost: item.estimatedCost,
      })).sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)))
    : undefined;

  return {
    id: request.id,
    code: request.code,
    hotelName: request.hotelName,
    departmentId: request.departmentId,
    positionId: request.positionId,
    rateUnit: request.rateUnit,
    unitRate: request.unitRate,
    rateCurrency: request.rateCurrency,
    workDate: request.workDate,
    endDate: request.endDate,
    shift: request.shift,
    quantity: request.quantity,
    vendorMode: request.vendorMode,
    vendorId: request.vendorId,
    acceptedVendorId: request.acceptedVendorId,
    vendorRateId: request.vendorRateId,
    broadcastVendorIds,
    status: request.status,
    currentStepIndex: request.currentStepIndex,
    approvalStepCount: approvalSteps.length,
    approvalStepRoles: approvalSteps
      .map((step: any) => String(step?.role || ''))
      .filter(Boolean),
    approvalStepsDigest: auditStateDigest(String(request.approvalSteps || '[]')),
    needsExtraApproval: request.needsExtraApproval,
    isUrgentOverride: request.isUrgentOverride,
    estimatedCost: request.estimatedCost,
    createdById: request.createdById,
    actualQuantity: request.actualQuantity,
    actualHours: request.actualHours,
    actualCost: request.actualCost,
    hodConfirmedAt: request.hodConfirmedAt,
    hodConfirmedById: request.hodConfirmedById,
    financeConfirmedAt: request.financeConfirmedAt,
    financeConfirmedById: request.financeConfirmedById,
    comment: textEvidence(request.comment),
    items,
  };
}

export function serializeWorkforceRequestAuditState(request: any) {
  return request == null ? null : serializeAuditState(workforceRequestAuditState(request));
}

export function workforceVendorCorrectionReviewAuditState(review: any) {
  const corrections = Array.isArray(review.corrections)
    ? review.corrections.map((correction: any) => ({
        id: correction.id,
        itemId: correction.itemId,
        originalVendorId: correction.originalVendorId,
        originalRateId: correction.originalRateId,
        originalUnitRate: correction.originalUnitRate,
        originalCost: correction.originalCost,
        proposedVendorId: correction.proposedVendorId,
        proposedRateId: correction.proposedRateId,
        proposedUnitRate: correction.proposedUnitRate,
        proposedCurrency: correction.proposedCurrency,
        proposedCost: correction.proposedCost,
        comment: textEvidence(correction.comment),
      })).sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)))
    : undefined;
  return {
    id: review.id,
    requestId: review.requestId,
    status: review.status,
    submittedById: review.submittedById,
    submittedAt: review.submittedAt,
    fdApprovedById: review.fdApprovedById,
    fdApprovedAt: review.fdApprovedAt,
    gmApprovedById: review.gmApprovedById,
    gmApprovedAt: review.gmApprovedAt,
    returnedById: review.returnedById,
    returnedAt: review.returnedAt,
    appliedAt: review.appliedAt,
    returnComment: textEvidence(review.returnComment),
    fdComment: textEvidence(review.fdComment),
    gmComment: textEvidence(review.gmComment),
    corrections,
  };
}

export function serializeWorkforceVendorCorrectionReviewAuditState(review: any) {
  return review == null ? null : serializeAuditState(workforceVendorCorrectionReviewAuditState(review));
}

export function workforceInvoiceAuditState(invoice: any) {
  const invoiceNumber = typeof invoice.invoiceNumber === 'string' ? invoice.invoiceNumber : '';
  return {
    id: invoice.id,
    requestId: invoice.requestId,
    vendorId: invoice.vendorId,
    invoiceNumberPresent: Boolean(invoiceNumber),
    invoiceNumberLength: invoiceNumber.length,
    invoiceNumberDigest: auditStateDigest(invoiceNumber || null),
    invoiceHours: invoice.invoiceHours,
    invoiceAmount: invoice.invoiceAmount,
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    matchedAt: invoice.matchedAt,
    paidAt: invoice.paidAt,
    paidById: invoice.paidById,
    notes: textEvidence(invoice.notes),
  };
}

export function serializeWorkforceInvoiceAuditState(invoice: any) {
  return invoice == null ? null : serializeAuditState(workforceInvoiceAuditState(invoice));
}

export function workforcePositionAuditState(position: any) {
  return { id: position.id, name: position.name, departmentId: position.departmentId, isActive: position.isActive };
}

export function workforceRateAuditState(rate: any) {
  return {
    id: rate.id,
    vendorId: rate.vendorId,
    positionId: rate.positionId,
    unit: rate.unit,
    price: rate.price,
    currency: rate.currency,
    uom: rate.uom,
    isActive: rate.isActive,
    requirements: textEvidence(rate.requirements),
  };
}

export function workforceVendorAuditState(vendor: any) {
  const steps = parsedArray(vendor.approvalSteps);
  return {
    id: vendor.id,
    name: vendor.name,
    isActive: vendor.isActive,
    isApproved: vendor.isApproved,
    approvalStatus: vendor.approvalStatus,
    currentStepIndex: vendor.currentStepIndex,
    approvalStepCount: steps.length,
    approvalStepRoles: steps.map((step: any) => String(step?.role || '')).filter(Boolean),
    approvalStepsDigest: auditStateDigest(String(vendor.approvalSteps || '[]')),
    submittedById: vendor.submittedById,
    submittedAt: vendor.submittedAt,
    approvedAt: vendor.approvedAt,
    replacementRequested: vendor.replacementRequested,
    contactEmail: textEvidence(vendor.contactEmail),
    phone: textEvidence(vendor.phone),
    insuranceNotes: textEvidence(vendor.insuranceNotes),
    rejectionReason: textEvidence(vendor.rejectionReason),
  };
}

export const serializeWorkforcePositionAuditState = (value: any) => value == null ? null : serializeAuditState(workforcePositionAuditState(value));
export const serializeWorkforceRateAuditState = (value: any) => value == null ? null : serializeAuditState(workforceRateAuditState(value));
export const serializeWorkforceVendorAuditState = (value: any) => value == null ? null : serializeAuditState(workforceVendorAuditState(value));

export function workforceSettingsAuditState(settings: any) {
  return {
    id: settings.id,
    hotelName: settings.hotelName,
    hotelsDigest: auditStateDigest(String(settings.hotelsJson || '[]')),
    hotelCount: parsedArray(settings.hotelsJson).length,
    minLeadHours: settings.minLeadHours,
    estimatedHourlyRate: settings.estimatedHourlyRate,
    estimatedHoursPerShift: settings.estimatedHoursPerShift,
    notifyEmail: settings.notifyEmail,
    notifyPush: settings.notifyPush,
    payrollTolerancePct: settings.payrollTolerancePct,
  };
}

export function workforceTemplateAuditState(template: any) {
  return {
    id: template.id,
    name: template.name,
    departmentId: template.departmentId,
    positionId: template.positionId,
    shift: template.shift,
    quantity: template.quantity,
    dayOfWeek: template.dayOfWeek,
    vendorMode: template.vendorMode,
    vendorId: template.vendorId,
    isActive: template.isActive,
    isRecurring: template.isRecurring,
    hotelName: template.hotelName,
    comment: textEvidence(template.comment),
  };
}

export function workforceApprovalRouteAuditState(route: any) {
  const steps = parsedArray(route.steps);
  return {
    id: route.id,
    departmentId: route.departmentId,
    name: route.name,
    stepCount: steps.length,
    steps: steps.map((step: any) => ({
      role: step?.role,
      label: step?.label,
      approverUserId: step?.approverUserId,
      approverDepartmentId: step?.approverDepartmentId,
    })),
    stepsDigest: auditStateDigest(String(route.steps || '[]')),
  };
}

export function workforceBudgetAuditState(budget: any) {
  return { id: budget.id, departmentId: budget.departmentId, year: budget.year, month: budget.month, budgetAmount: budget.budgetAmount };
}

export const serializeWorkforceSettingsAuditState = (value: any) => value == null ? null : serializeAuditState(workforceSettingsAuditState(value));
export const serializeWorkforceTemplateAuditState = (value: any) => value == null ? null : serializeAuditState(workforceTemplateAuditState(value));
export const serializeWorkforceApprovalRouteAuditState = (value: any) => value == null ? null : serializeAuditState(workforceApprovalRouteAuditState(value));
export const serializeWorkforceBudgetAuditState = (value: any) => value == null ? null : serializeAuditState(workforceBudgetAuditState(value));
