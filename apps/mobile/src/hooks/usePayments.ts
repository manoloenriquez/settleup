import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPendingPayments, recordPayment, resolvePendingPayment, undoLastPayment, undoLastPaymentForMember } from "@/services/payments";

type RecordPaymentParams = {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

export function useRecordPayment(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: RecordPaymentParams) => recordPayment(params),
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
