import { track } from "@/lib/analytics";
import type { CurrencyCode } from "@template/shared";
import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { ApiResponse, NewOutboxEntry } from "@template/shared";
import type { Payment } from "@template/supabase";
import { useOutbox } from "@/context/OutboxContext";
import {
  listPendingPayments,
  recordPayment,
  resolvePendingPayment,
  undoLastPayment,
  undoLastPaymentForMember,
} from "@/services/payments";

export type RecordPaymentParams = {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  currencyCode: CurrencyCode;
};

/**
 * Records a payment online, or queues the exact RPC input offline.
 * The client UUID doubles as the record_payment idempotency key, so offline
 * replays and flaky-network retries can't double-count; pass a stable one to
 * make a user-level retry replay too.
 */
export async function recordPaymentOrQueue(
  params: RecordPaymentParams,
  enqueue: (entry: NewOutboxEntry) => Promise<unknown>,
  clientId: string = Crypto.randomUUID(),
): Promise<ApiResponse<Payment>> {
  if (!onlineManager.isOnline()) {
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    if (params.fromMemberId === params.toMemberId) {
      return { data: null, error: "Cannot pay yourself" };
    }
    await enqueue({
      id: clientId,
      kind: "payment.record",
      entityId: clientId,
      groupId: params.groupId,
      payload: {
        group_id: params.groupId,
        from_member_id: params.fromMemberId,
        to_member_id: params.toMemberId,
        currency_code: params.currencyCode,
        amount_cents: params.amountCents,
      },
      createdAt: new Date().toISOString(),
      summary: { title: "Settle up", amountCents: params.amountCents },
    });
    const nowISO = new Date().toISOString();
    return {
      data: {
        id: clientId,
        group_id: params.groupId,
        currency_code: params.currencyCode,
        amount_cents: params.amountCents,
        status: "PAID",
        from_member_id: params.fromMemberId,
        to_member_id: params.toMemberId,
        created_by_user_id: null,
        note: null,
        report_request_id: null,
        created_at: nowISO,
        updated_at: nowISO,
      },
      error: null,
    };
  }
  return recordPayment({ ...params, clientId });
}

export function useRecordPayment(groupId: string) {
  const qc = useQueryClient();
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: RecordPaymentParams & { clientId?: string }) =>
      recordPaymentOrQueue(params, enqueue, params.clientId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useUndoLastPayment(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Online-only: the server undoes "the latest payment" at execution time,
    // so a deferred replay could delete a different payment recorded meanwhile.
    mutationFn: async (currency: CurrencyCode) => {
      if (!onlineManager.isOnline()) {
        return { data: null, error: "Undoing a payment needs a connection." };
      }
      return undoLastPayment(groupId, currency);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function usePendingPayments(groupId: string) {
  return useQuery({
    queryKey: ["pending-payments", groupId],
    queryFn: () => listPendingPayments(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}

export function useResolvePendingPayment(groupId: string) {
  const qc = useQueryClient();
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: { paymentId: string; action: "confirm" | "reject" }) => {
      if (!onlineManager.isOnline()) {
        await enqueue({
          id: Crypto.randomUUID(),
          kind: params.action === "confirm" ? "payment.confirm" : "payment.reject",
          entityId: params.paymentId,
          groupId,
          payload: {},
          createdAt: new Date().toISOString(),
          summary: {
            title: params.action === "confirm" ? "Confirm payment" : "Reject payment",
            amountCents: 0,
          },
        });
        return { data: null, error: null };
      }
      return resolvePendingPayment(params.paymentId, params.action);
    },
    onSuccess: (result, params) => {
      if (!result.error && onlineManager.isOnline()) {
        track({
          name: "payment_claim_resolved",
          properties: { status: params.action === "confirm" ? "confirmed" : "rejected" },
        });
      }
      void qc.invalidateQueries({ queryKey: ["pending-payments", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useUndoLastPaymentForMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, currency }: { memberId: string; currency: CurrencyCode }) => {
      if (!onlineManager.isOnline()) {
        return { data: null, error: "Undoing a payment needs a connection." };
      }
      return undoLastPaymentForMember(memberId, currency);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
