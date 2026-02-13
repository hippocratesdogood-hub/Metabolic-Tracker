import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth';
import { api } from './api';
import type { MetricEntry, FoodEntry } from '@shared/schema';

export type MetricType = 'BP' | 'WAIST' | 'GLUCOSE' | 'KETONES' | 'WEIGHT';

type DataContextType = {
  user: any;
  metrics: MetricEntry[];
  foodEntries: FoodEntry[];
  getMetricsByType: (type: MetricType) => MetricEntry[];
  addMetric: (entry: any) => Promise<void>;
  addFoodEntry: (entry: any) => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshFood: () => Promise<void>;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<MetricEntry[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const refreshMetrics = async () => {
    if (!user) return;
    try {
      const data = await api.getMetricEntries();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const refreshFood = async () => {
    if (!user) return;
    try {
      const data = await api.getFoodEntries();
      setFoodEntries(data);
    } catch (error) {
      console.error('Failed to load food entries:', error);
    }
  };

  useEffect(() => {
    if (user) {
      refreshMetrics();
      refreshFood();
    }
  }, [user]);

  const getMetricsByType = (type: MetricType) => {
    return metrics
      .filter((m) => m.type === type)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const addMetric = async (entry: any) => {
    await api.createMetricEntry(entry);
    await refreshMetrics();
  };

  const addFoodEntry = async (entry: any) => {
    await api.createFoodEntry(entry);
    await refreshFood();
  };

  return (
    <DataContext.Provider
      value={{
        user: user || { name: '', email: '', role: 'participant' },
        metrics,
        foodEntries,
        getMetricsByType,
        addMetric,
        addFoodEntry,
        refreshMetrics,
        refreshFood,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};
