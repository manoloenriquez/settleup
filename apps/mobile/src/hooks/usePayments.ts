import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordPayment, undoLastPayment, undoLastPaymentForMember } from "@/services/payments";

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
    },
  });
}
