import React from 'react';

export default function OverviewSkeleton() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-10">
        <h2 className="text-4xl font-extrabold text-on-surface tracking-tighter mb-1">System Loading</h2>
        <p className="text-on-surface-variant text-sm font-medium tracking-tight">Preparing your workspace...</p>
      </div>

      {/* Row 1: Card Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface-container-low p-5 rounded-xl h-[140px] flex flex-col justify-between overflow-hidden border border-outline-variant/10">
            <div className={`skeleton-shimmer h-4 ${i % 2 === 0 ? 'w-1/2' : 'w-2/3'} rounded-[4px] mb-4`} />
            <div className={`skeleton-shimmer h-10 ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'} rounded-[4px] mb-2`} />
            <div className={`skeleton-shimmer h-3 ${i % 2 === 0 ? 'w-1/3' : 'w-1/2'} rounded-[4px]`} />
          </div>
        ))}
      </div>

      {/* Row 2: Chart Skeletons (2/3 and 1/3 Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8">
        <div className="lg:col-span-8 bg-surface-container-low p-6 rounded-xl h-[360px] overflow-hidden border border-outline-variant/10">
          <div className="flex justify-between items-center mb-6">
            <div className="skeleton-shimmer h-6 w-32 rounded-[4px]" />
            <div className="flex gap-2">
              <div className="skeleton-shimmer h-8 w-16 rounded-[4px]" />
              <div className="skeleton-shimmer h-8 w-16 rounded-[4px]" />
            </div>
          </div>
          <div className="skeleton-shimmer w-full h-[240px] rounded-[12px]" />
        </div>
        
        <div className="lg:col-span-4 bg-surface-container-low p-6 rounded-xl h-[360px] overflow-hidden border border-outline-variant/10">
          <div className="skeleton-shimmer h-6 w-1/2 rounded-[4px] mb-6" />
          <div className="flex justify-center items-center h-[240px]">
            <div className="skeleton-shimmer w-48 h-48 rounded-full" />
          </div>
        </div>
      </div>

      {/* Row 3: Table Skeleton */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="p-6 border-b border-outline-variant/10">
          <div className="skeleton-shimmer h-6 w-48 rounded-[4px]" />
        </div>
        <div className="p-6 space-y-6">
          {/* Table Header */}
          <div className="flex gap-4">
            <div className="skeleton-shimmer h-4 w-1/6 rounded-[4px]" />
            <div className="skeleton-shimmer h-4 w-2/6 rounded-[4px]" />
            <div className="skeleton-shimmer h-4 w-1/6 rounded-[4px]" />
            <div className="skeleton-shimmer h-4 w-1/6 rounded-[4px]" />
            <div className="skeleton-shimmer h-4 w-1/6 rounded-[4px]" />
          </div>

          {/* Table Rows */}
          <div className="space-y-6">
            {[1, 0.8, 0.6, 0.4, 0.2].map((opacity, i) => (
              <div key={i} className="flex gap-4 items-center" style={{ opacity }}>
                <div className="skeleton-shimmer h-8 w-1/6 rounded-[4px]" />
                <div className="skeleton-shimmer h-8 w-2/6 rounded-[4px]" />
                <div className="skeleton-shimmer h-8 w-1/6 rounded-[4px]" />
                <div className="skeleton-shimmer h-8 w-1/6 rounded-[4px]" />
                <div className="skeleton-shimmer h-8 w-1/6 rounded-[4px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
