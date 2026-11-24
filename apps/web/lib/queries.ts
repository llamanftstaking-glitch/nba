"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// Query keys are shared so that the shell (date selector) and pages reuse one cache entry.
export const useCommandCenter = (date?: string) =>
  useQuery({ queryKey: ["command-center", date ?? "today"], queryFn: () => api.commandCenter(date) });

export const useGames = (date?: string) => useQuery({ queryKey: ["games", date ?? "today"], queryFn: () => api.games(date) });

export const useSelections = (date?: string) =>
  useQuery({ queryKey: ["selections", date ?? "today"], queryFn: () => api.selections({ date }) });

export const useCombos = (category: string, date?: string, enabled = true) =>
  useQuery({ queryKey: ["combos", date ?? "today", category], queryFn: () => api.combos({ date, category }), enabled });

export const useBacktests = () => useQuery({ queryKey: ["backtests"], queryFn: api.backtests });
export const useModels = () => useQuery({ queryKey: ["models"], queryFn: api.models });
export const useTeams = () => useQuery({ queryKey: ["teams"], queryFn: api.teams });
export const useDataHealth = () => useQuery({ queryKey: ["data-health"], queryFn: api.dataHealth });
