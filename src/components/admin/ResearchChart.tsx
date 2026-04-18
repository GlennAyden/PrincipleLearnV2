'use client'

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { PromptStage } from '@/types/research';

const chartFrameStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 1,
  height: 300,
  minHeight: 300,
};

function useMeasuredChartWidth() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(element.getBoundingClientRect().width);
      setWidth(nextWidth > 0 ? nextWidth : 0);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, width };
}

interface StageHeatmapProps {
  data: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
}

export function StageHeatmapChart({ data }: StageHeatmapProps) {
  const { ref, width } = useMeasuredChartWidth();
  const chartData = Object.entries(data).map(([stage, metrics]) => ({
    stage,
    sessions: metrics.sessions,
    'Avg CT': metrics.avg_ct,
    'Avg CTh': metrics.avg_cth
  }));

  return (
    <div ref={ref} style={chartFrameStyle}>
      {width > 0 && (
        <BarChart data={chartData} width={width} height={300}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="stage" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="sessions" fill="#8884d8" name="Sesi" />
          <Bar dataKey="Avg CT" fill="#82ca9d" name="Skor CT Rata-rata" />
          <Bar dataKey="Avg CTh" fill="#ffc658" name="Skor CTh Rata-rata" />
        </BarChart>
      )}
    </div>
  );
}

interface ProgressionChartProps {
  progression: Array<{ user_id: string; avg_stage_score: number }>;
}

export function UserProgressionChart({ progression }: ProgressionChartProps) {
  const { ref, width } = useMeasuredChartWidth();

  return (
    <div ref={ref} style={chartFrameStyle}>
      {width > 0 && (
        <BarChart data={progression.slice(0, 10)} width={width} height={300}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="user_id" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="avg_stage_score" fill="#8884d8" />
        </BarChart>
      )}
    </div>
  );
}

