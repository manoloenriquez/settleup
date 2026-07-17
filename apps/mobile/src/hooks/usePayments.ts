import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { ApiResponse } from "@template/shared";
import type { Payment } from "@template/supabase";
import { useOutbox } from "@/context/OutboxContext";
import { listPendingPayments, recordPayment, resolvePendingPayment, undoLastPayment, undoLastPaymentForMember } from "@/services/payments";

type RecordPaymentParams = {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

export function useRecordPayment(groupId: string) {
  const qc = useQueryClient();
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: RecordPaymentParams): Promise<ApiResponse<Payment>> => {
      // Client-generated UUID doubles as the record_payment idempotency key,
      // so offline replays and flaky-network retries can't double-count.
      const clientId = Crypto.randomUUID();
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
            amount_cents: params.amountCents,
            status: "PAID",
            from_member_id: params.fromMemberId,
            to_member_id: params.toMemberId,
            created_by_user_id: null,
            note: null,
            created_at: nowISO,
            updated_at: nowISO,
          },
          error: null,
        };
      }
      return recordPayment({ ...params, clientId });
    },
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
    mutationFn: () => undoLastPayment(groupId),
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
  return useMutation({
    mutationFn: (params: { paymentId: string; action: "confirm" | "reject" }) =>
      resolvePendingPayment(params.paymentId, params.action),
    onSuccess: () => {
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
    mutationFn: (memberId: string) => undoLastPaymentForMember(memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
