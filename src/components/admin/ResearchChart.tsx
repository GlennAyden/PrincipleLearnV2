'use client'

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { PromptStage } from '@/types/research';

interface StageHeatmapProps {
  data: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
}

export function StageHeatmapChart({ data }: StageHeatmapProps) {
  const chartData = Object.entries(data).map(([stage, metrics]) => ({
    stage,
    sessions: metrics.sessions,
    'Avg CT': metrics.avg_ct,
    'Avg CTh': metrics.avg_cth
  }));

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="stage" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="sessions" fill="#8884d8" name="Sessions" />
          <Bar dataKey="Avg CT" fill="#82ca9d" name="Avg CT Score" />
          <Bar dataKey="Avg CTh" fill="#ffc658" name="Avg CTh Score" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ProgressionChartProps {
  progression: Array<{ user_id: string; avg_stage_score: number }>;
}

export function UserProgressionChart({ progression }: ProgressionChartProps) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={progression.slice(0, 10)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="user_id" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="avg_stage_score" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

