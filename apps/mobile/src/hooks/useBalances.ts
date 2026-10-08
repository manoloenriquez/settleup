import { useQuery } from "@tanstack/react-query";
import type { CurrencyCode } from "@template/shared";
import { getMembersWithBalances, getCreditorProfiles } from "@/services/balances";
import { getGroupCurrencies } from "@/services/currency";

/** Member balances in one currency. Key stays under ["balances", groupId] for invalidation. */
export function useMembersWithBalances(groupId: string, currency: CurrencyCode) {
  return useQuery({
    queryKey: ["balances", groupId, currency],
    queryFn: async () => {
      const res = await getMembersWithBalances(groupId, currency);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

export function useCreditorProfiles(groupId: string, currency: CurrencyCode) {
  return useQuery({
    queryKey: ["creditor-profiles", groupId, currency],
    queryFn: async () => {
      const res = await getCreditorProfiles(groupId, currency);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

/** Currencies used in a group, its default first. */
export function useGroupCurrencies(groupId: string, defaultCurrency: CurrencyCode) {
  return useQuery({
    queryKey: ["balances", groupId, "currencies", defaultCurrency],
    queryFn: async () => {
      const res = await getGroupCurrencies(groupId, defaultCurrency);
      if (res.error) throw new Error(res.error);
      return res.data ?? [defaultCurrency];
    },
    enabled: !!groupId,
    placeholderData: [defaultCurrency],
  });
}
