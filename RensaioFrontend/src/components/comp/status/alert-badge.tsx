"use client";

import React from 'react';
import { AlertTriangle, Circle, CheckCircle2 } from 'lucide-react';
import { HealthStatusLevel } from '@/lib/api/types';

interface AlertBadgeProps {
  level: HealthStatusLevel;
  className?: string;
}

export function AlertBadge({ level, className = "" }: AlertBadgeProps) {
  if (level === HealthStatusLevel.Green) {
    return <CheckCircle2 className={`h-3 w-3 text-green-500 mb-0.5 ${className}`} />;
  }
  if (level === HealthStatusLevel.Yellow) {
    return <AlertTriangle className={`h-3 w-3 text-yellow-500 mb-0.5 ${className}`} />;
  }
  return <Circle className={`h-3 w-3 text-red-500 fill-red-500 mb-0.5 ${className}`} />;
}

export function AlertBadgeWithLabel({ level }: { level: HealthStatusLevel }) {
  const colors = {
    [HealthStatusLevel.Green]: "bg-green-100 text-green-800 border-green-300",
    [HealthStatusLevel.Yellow]: "bg-yellow-100 text-yellow-800 border-yellow-300",
    [HealthStatusLevel.Red]: "bg-red-100 text-red-800 border-red-300",
  };

  const labels = {
    [HealthStatusLevel.Green]: "Healthy",
    [HealthStatusLevel.Yellow]: "Warning",
    [HealthStatusLevel.Red]: "Critical",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level]}`}>
      <AlertBadge level={level} />
      {labels[level]}
    </span>
  );
}